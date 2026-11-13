import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialSwitch,transmit,ageSwitch,configurePort} from '../switching-core.js';
test('unknown unicast learns only source and floods operational same-VLAN ports',()=>{
 const start=initialSwitch(), result=transmit(start,'A','B');
 assert.equal(start.table.length,0);assert.equal(result.decision,'unknown');assert.deepEqual(result.egress,['B','C']);assert.deepEqual(result.accepted,['B']);
 assert.equal(result.state.table.length,1);assert.equal(result.state.table[0].mac,start.ports[0].mac);
});
test('reply learns destination and later traffic uses known-unicast forwarding',()=>{
 const a=transmit(initialSwitch(),'A','B'),b=transmit(a.state,'B','A'),c=transmit(b.state,'A','B');
 assert.equal(b.decision,'known');assert.deepEqual(b.egress,['A']);assert.equal(c.decision,'known');assert.deepEqual(c.egress,['B']);
});
test('broadcast respects VLAN and disconnected links; ingress is never an egress',()=>{
 let state=configurePort(initialSwitch(),3,{up:false});let r=transmit(state,'A','broadcast');
 assert.deepEqual(r.egress,['B']);assert.deepEqual(r.accepted,['B']);
 state=configurePort(state,4,{vlan:10});r=transmit(state,'A','broadcast');assert.deepEqual(r.egress,['B','D']);
 assert.deepEqual(transmit(state,'A','A').egress,[]);
});
test('entries expire on the simulated boundary and destination-only traffic does not refresh them',()=>{
 let state=transmit(initialSwitch(),'B','A').state;
 const stamp=state.table[0].seen;state=transmit(state,'A','B').state;
 assert.equal(state.table.find(r=>r.port===2).seen,stamp);
 assert.equal(ageSwitch(state,28).table.some(r=>r.port===2),true);
 assert.equal(ageSwitch(state,29).table.some(r=>r.port===2),false);
 assert.equal(transmit(ageSwitch(state,30),'A','B').decision,'unknown');
});
test('link-down or VLAN change flushes that port, and a disconnected source is not learned',()=>{
 let state=transmit(initialSwitch(),'B','A').state;state=configurePort(state,2,{up:false});
 assert.equal(state.table.length,0);const r=transmit(state,'B','A');assert.equal(r.decision,'drop');assert.equal(r.state.table.length,0);
 state=configurePort(transmit(initialSwitch(),'A','B').state,1,{vlan:20});assert.equal(state.table.length,0);
 assert.deepEqual(transmit(state,'A','B').accepted,[]);
 assert.throws(()=>configurePort(state,1,{vlan:4095}));assert.throws(()=>ageSwitch(state,-1));
});
