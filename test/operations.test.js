import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initialOperation,advanceOperation,dhcpOperation,dnsOperation,firewallOperation,natOperation,monitoringOperation,probeMetrics} from '../operations-core.js';
const context={window:{}};vm.runInNewContext(readFileSync(new URL('../vendor/ipaddr.min.js',import.meta.url),'utf8'),context);globalThis.ipaddr=context.ipaddr;
const dhcp={client:'PC-A',server:true,remote:false,relay:true,gateway:'192.168.10.1'};
const dns={name:'www.training.test',type:'A',resolver:true,authority:true,record:'192.0.2.10'};
const nat={direction:'outbound',client:'192.168.10.10',insidePort:'53000',remote:'203.0.113.20',publicPort:'40000'};
test('DHCP allocates unique addresses and exposes pool exhaustion without mutating input',()=>{
 const initial=initialOperation('dhcp'),a=dhcpOperation(initial,dhcp);assert.equal(initial.leases.length,0);assert.equal(a.outcome,'Lease usable');
 const b=dhcpOperation(a.state,{...dhcp,client:'PC-B'}),c=dhcpOperation(b.state,{...dhcp,client:'PC-C'});
 assert.equal(new Set(b.state.leases.map(l=>l.ip)).size,2);assert.equal(c.outcome,'No lease');assert.match(c.steps.at(-1).message,/exhausted/);
});
test('DHCP relay and bad gateway are separate from lease allocation',()=>{
 assert.equal(dhcpOperation(initialOperation('dhcp'),{...dhcp,remote:true,relay:false}).outcome,'No lease');
 const bad=dhcpOperation(initialOperation('dhcp'),{...dhcp,gateway:'192.168.20.1'});assert.equal(bad.outcome,'Invalid gateway');assert.equal(bad.state.leases.length,1);
});
test('DHCP failed renewal retains unexpired lease but does not extend expiry; expiry allows reuse',()=>{
 const leased=dhcpOperation(initialOperation('dhcp'),dhcp).state;
 const failed=dhcpOperation(advanceOperation(leased,60),{...dhcp,server:false});
 assert.equal(failed.state.leases[0].expires,120);assert.match(failed.steps[0].message,/RENEWING/);
 const rebind=dhcpOperation(advanceOperation(leased,105),{...dhcp,server:false});assert.match(rebind.steps[0].message,/REBINDING/);
 assert.equal(dhcpOperation(advanceOperation(leased,120),{...dhcp,server:false}).outcome,'No lease');
 assert.equal(dhcpOperation(advanceOperation(leased,120),{...dhcp,client:'PC-C'}).state.leases[0].ip,'192.168.10.100');
});
test('DNS uses unexpired cache without resetting TTL and refreshes changed authoritative data after expiry',()=>{
 const a=dnsOperation(initialOperation('dns'),dns),b=dnsOperation(advanceOperation(a.state,10),{...dns,record:'192.0.2.20'});
 assert.equal(b.state.cache[0].answer,'192.0.2.10');assert.equal(b.state.cache[0].expires,60);
 const c=dnsOperation(advanceOperation(b.state,50),{...dns,record:'192.0.2.20'});assert.equal(c.state.cache[0].answer,'192.0.2.20');
});
test('DNS distinguishes negative caching, unreachable resolver, and authority failure',()=>{
 const cached=dnsOperation(initialOperation('dns'),dns).state;
 assert.equal(dnsOperation(cached,{...dns,authority:false}).outcome,'NOERROR');
 assert.equal(dnsOperation(cached,{...dns,resolver:false}).outcome,'Timeout');
 assert.equal(dnsOperation(advanceOperation(cached,60),{...dns,authority:false}).outcome,'SERVFAIL');
 const missing=dnsOperation(initialOperation('dns'),{...dns,name:'missing.training.test'});assert.equal(missing.outcome,'NXDOMAIN');assert.equal(missing.state.cache[0].expires,30);
 assert.equal(dnsOperation(initialOperation('dns'),{...dns,type:'AAAA'}).state.cache[0].answer,'2001:db8::10');
});
test('ACL applies source/protocol/port and first-match ordering',()=>{
 const base={source:'10.0.0.10',protocol:'TCP',port:'443',profile:'web',reverse:false},state=initialOperation('firewall');
 assert.equal(firewallOperation(state,base).outcome,'permit');
 for(const patch of [{source:'10.0.1.10'},{protocol:'UDP'},{port:'22'},{reverse:true}])assert.equal(firewallOperation(state,{...base,...patch}).outcome,'deny');
 assert.equal(firewallOperation(state,{...base,profile:'ssh',port:'22'}).outcome,'deny');
 assert.equal(firewallOperation(state,{...base,profile:'ssh',port:'22',reverse:true}).outcome,'permit');
});
test('PAT allocates distinct ports, reuses tuples, and detects bounded pool exhaustion',()=>{
 let state=natOperation(initialOperation('nat'),nat).state;assert.equal(state.mappings[0].publicPort,40000);
 state=natOperation(state,nat).state;assert.equal(state.mappings.length,1);
 state=natOperation(state,{...nat,client:'192.168.10.11'}).state;assert.equal(state.mappings[1].publicPort,40001);
 assert.equal(natOperation(state,{...nat,client:'192.168.10.12'}).outcome,'Port pool exhausted');
 assert.equal(natOperation(advanceOperation(state,60),{...nat,client:'192.168.10.12'}).outcome,'Translated outbound');
});
test('PAT return traffic needs the public tuple and modeled remote endpoint',()=>{
 const state=natOperation(initialOperation('nat'),nat).state;
 assert.equal(natOperation(state,{...nat,direction:'return'}).outcome,'Translated return');
 assert.equal(natOperation(state,{...nat,direction:'return',remote:'203.0.113.21'}).outcome,'No matching mapping');
 assert.equal(natOperation(state,{...nat,direction:'return',publicPort:'40001'}).outcome,'No matching mapping');
 assert.equal(natOperation(advanceOperation(state,60),{...nat,direction:'return'}).outcome,'No matching mapping');
});
test('monitoring does not confuse DNS failure with measured packet loss',()=>{
 const state=initialOperation('monitoring'),c={scenario:'dns',byName:true,baseline:false};
 const r=monitoringOperation(state,c);assert.equal(r.outcome,'Name resolution failed');assert.deepEqual(r.rows,[['Probes sent','0'],['Network loss','Not measured']]);
 const ip=monitoringOperation(state,{...c,byName:false});assert.equal(ip.rows[1][1],'0.0%');
 const down=monitoringOperation(state,{scenario:'linkdown',byName:false,baseline:false});assert.equal(down.rows[2][1],'Not measurable');
});
test('probe summary excludes timeouts from RTT and adjacent variation, and preserves baseline',()=>{
 assert.deepEqual(probeMetrics([10,14,12]),{sent:3,received:3,loss:0,mean:12,jitter:3});
 assert.equal(probeMetrics([10,null,20]).jitter,null);assert.equal(probeMetrics([null,null]).mean,null);
 const baseline=monitoringOperation(initialOperation('monitoring'),{scenario:'healthy',byName:false,baseline:true}).state;
 const fault=monitoringOperation(baseline,{scenario:'intermittent',byName:false,baseline:false});
 assert.equal(fault.state.baseline.loss,0);assert.equal(fault.rows[1][1],'33.3%');assert.equal(baseline.baseline.loss,0);
 assert.throws(()=>advanceOperation(baseline,-1));
});
