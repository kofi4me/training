import {ipv4,subnet} from './core.js';
const step=(message,node)=>({message,node});
const result=(state,outcome,steps,headers,rows)=>({state,outcome,steps,headers,rows});
export function initialOperation(course){return {course,time:0,leases:[],cache:[],mappings:[],allowed:0,denied:0,baseline:null};}
export function advanceOperation(state,seconds){if(!Number.isInteger(seconds)||seconds<0||seconds>3600)throw Error('Advance by 0–3600 whole seconds.');return {...structuredClone(state),time:state.time+seconds};}
const ipIn=(ip,cidr)=>{const n=ipv4(ip),s=subnet(cidr);return n>=s.network&&n<=s.broadcast;};
const port=value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>65535)throw Error('Ports must be integers from 1 to 65535.');return n;};
export function dhcpOperation(previous,c){
 const state=structuredClone(previous),steps=[],client=c.client;
 if(!['PC-A','PC-B','PC-C'].includes(client))throw Error('Choose a client.');
 const old=state.leases.find(l=>l.client===client&&l.expires>state.time);
 if(old){
  const phase=state.time>=old.start+105?'REBINDING':state.time>=old.start+60?'RENEWING':'BOUND';
  steps.push(step(client+' has '+old.ip+'; current timer phase is '+phase+'.',0),step('DHCPREQUEST '+(phase==='REBINDING'?'broadcasts to available servers.':'requests renewal from the original server.'),1));
  if(c.server&&(!c.remote||c.relay)){
   old.start=state.time;old.expires=state.time+120;steps.push(step('DHCPACK renews the same lease for 120 simulated seconds.',2));
  }else steps.push(step('No ACK arrives. The existing lease remains usable only until its original expiry.',1));
 }else{
  state.leases=state.leases.filter(l=>l.expires>state.time);
  steps.push(step(client+' has no valid lease. DHCPDISCOVER begins the allocation.',0));
  if(c.remote&&!c.relay)steps.push(step('The server is on another subnet; the broadcast is not routed. A relay is required.',1));
  else if(!c.server)steps.push(step('The server is unavailable. No DHCPOFFER is received.',2));
  else{
   steps.push(step(c.remote?'The relay forwards the request to the configured server.':'The same-LAN server receives the discovery.',1));
   const ip=['192.168.10.100','192.168.10.101'].find(ip=>!state.leases.some(l=>l.ip===ip));
   if(!ip)steps.push(step('The two-address pool is exhausted. There is no free address to offer.',2));
   else{
    steps.push(step('DHCPOFFER proposes '+ip+' with /24, gateway '+c.gateway+', DNS 192.168.10.53 and a 120-second lease.',2),step(client+' sends DHCPREQUEST selecting the offer.',0),step('DHCPACK confirms the lease. The client enters BOUND.',2));
    state.leases.push({client,ip,gateway:c.gateway,start:state.time,expires:state.time+120});
   }
  }
 }
 const active=state.leases.find(l=>l.client===client&&l.expires>state.time);
 const validGateway=active&&ipIn(active.gateway,'192.168.10.0/24');
 if(active)steps.push(step(validGateway?'The address and on-link gateway are usable in this teaching network. Application reachability is not tested.':'The lease exists, but its gateway is outside the client subnet: off-link communication will fail.',3));
 return result(state,!active?'No lease':validGateway?'Lease usable':'Invalid gateway',steps,['Client','Address','Gateway','Remaining lease'],state.leases.map(l=>[l.client,l.ip,l.gateway,Math.max(0,l.expires-state.time)+'s']));
}
export function dnsOperation(previous,c){
 const state=structuredClone(previous),steps=[],name=c.name,type=c.type;
 if(!['www.training.test','app.training.test','missing.training.test'].includes(name)||!['A','AAAA'].includes(type))throw Error('Choose a modeled name and record type.');
 const key=name+'|'+type, cached=state.cache.find(r=>r.key===key&&r.expires>state.time);
 let answer='',status='';
 steps.push(step('The client asks its recursive resolver for '+name+' '+type+'.',0));
 if(!c.resolver){status='Timeout';steps.push(step('The client cannot reach the resolver. Resolver-side cache entries cannot answer an unreachable client.',1));}
 else if(cached){status=cached.status;answer=cached.answer;steps.push(step('Resolver cache hit; '+(cached.expires-state.time)+' seconds remain. A hit does not reset the TTL.',1),step(status==='NXDOMAIN'?'A cached negative answer reports that the name does not exist.':'Return cached '+type+' '+answer+'.',0));}
 else{
  steps.push(step('Cache miss or expired entry. The resolver follows the modeled root and test-zone referrals.',1));
  if(!c.authority){status='SERVFAIL';steps.push(step('The authoritative server is unavailable. No fresh answer can be obtained; this model does not serve stale data.',2));}
  else{
   status=name==='missing.training.test'?'NXDOMAIN':'NOERROR';
   if(name==='app.training.test')steps.push(step('The authoritative record is a CNAME to www.training.test. Resolve that target.',2));
   answer=status==='NXDOMAIN'?'':type==='AAAA'?'2001:db8::10':c.record;
   if(type==='A'&&status!=='NXDOMAIN')ipv4(answer);
   const ttl=status==='NXDOMAIN'?30:60;
   state.cache=state.cache.filter(r=>r.key!==key);state.cache.push({key,name,type,answer,status,expires:state.time+ttl});
   steps.push(step(status==='NXDOMAIN'?'The authoritative zone returns NXDOMAIN, cached for a modeled 30 seconds.':'Cache '+type+' '+answer+' for 60 simulated seconds.',2),step('Return '+status+' to the client. DNS success alone does not establish a web connection.',0));
  }
 }
 return result(state,status,steps,['Name / type','Answer / status','TTL remaining'],state.cache.filter(r=>r.expires>state.time).map(r=>[r.name+' '+r.type,r.answer||r.status,(r.expires-state.time)+'s']));
}
export function aclRules(c){
 let rules=c.profile==='web'?[{action:'permit',source:'10.0.0.0/24',protocol:'TCP',port:443,label:'Permit internal HTTPS'},{action:'deny',source:'0.0.0.0/0',protocol:'any',port:null,label:'Deny remaining'}]:
 [{action:'deny',source:'10.0.0.0/24',protocol:'TCP',port:22,label:'Deny internal SSH'},{action:'permit',source:'0.0.0.0/0',protocol:'any',port:null,label:'Permit remaining'}];
 return c.reverse?rules.reverse():rules;
}
export function firewallOperation(previous,c){
 const state=structuredClone(previous),rules=aclRules(c),destination=port(c.port);ipv4(c.source);
 if(!['TCP','UDP'].includes(c.protocol))throw Error('Choose TCP or UDP.');
 const steps=[step('A '+c.protocol+' packet from '+c.source+' to destination port '+destination+' reaches the ingress ACL.',0)];
 let match=-1;
 for(let i=0;i<rules.length;i++){
  const r=rules[i],yes=ipIn(c.source,r.source)&&(r.protocol==='any'||r.protocol===c.protocol)&&(r.port===null||r.port===destination);
  steps.push(step('Rule '+(i+1)+' '+r.label+': '+(yes?'matches. Stop evaluating; action = '+r.action+'.':'does not match. Continue.'),1));
  if(yes){match=i;break;}
 }
 const action=match<0?'deny':rules[match].action;state[action==='permit'?'allowed':'denied']++;
 steps.push(step(action==='permit'?'Packet permitted by this ACL. Routing, return traffic, TLS and application availability are separate checks.':'Packet denied; no forwarding through this enforcement point.',action==='permit'?2:1));
 return result(state,action,steps,['Order','Action','Source','Protocol / destination port'],rules.map((r,i)=>[String(i+1)+(i===match?' (matched)':''),r.action,r.source,r.protocol+' / '+(r.port??'any')]));
}
export function natOperation(previous,c){
 const state=structuredClone(previous),steps=[],insidePort=port(c.insidePort),publicPort=port(c.publicPort);
 if(!ipIn(c.client,'192.168.10.0/24')||['192.168.10.0','192.168.10.255','192.168.10.1'].includes(c.client))throw Error('Use a usable client address in 192.168.10.0/24, excluding the gateway .1.');
 ipv4(c.remote);state.mappings=state.mappings.filter(m=>m.expires>state.time);
 let outcome='';
 if(c.direction==='outbound'){
  steps.push(step('TCP '+c.client+':'+insidePort+' → '+c.remote+':443 arrives on the inside interface.',0));
  let mapping=state.mappings.find(m=>m.client===c.client&&m.insidePort===insidePort&&m.remote===c.remote);
  if(!mapping){
   const available=[40000,40001].find(p=>!state.mappings.some(m=>m.publicPort===p));
   if(available===undefined){outcome='Port pool exhausted';steps.push(step('Both modeled public ports are occupied. No mapping can be allocated.',1));}
   else {mapping={client:c.client,insidePort,remote:c.remote,publicPort:available,expires:state.time+60};state.mappings.push(mapping);}
  }
  if(mapping){mapping.expires=state.time+60;outcome='Translated outbound';steps.push(step('Create or reuse mapping '+c.client+':'+insidePort+' ↔ 198.51.100.10:'+mapping.publicPort+'.',1),step('Send TCP 198.51.100.10:'+mapping.publicPort+' → '+c.remote+':443. The remote destination is unchanged.',2));}
 }else{
  steps.push(step('TCP '+c.remote+':443 → 198.51.100.10:'+publicPort+' arrives from outside.',2));
  const m=state.mappings.find(m=>m.publicPort===publicPort&&m.remote===c.remote);
  if(!m){outcome='No matching mapping';steps.push(step('No active endpoint-matched mapping exists. Drop this inbound packet; there is no static port forward.',1));}
  else{outcome='Translated return';steps.push(step('Look up public port '+publicPort+' and the modeled remote endpoint.',1),step('Rewrite destination to '+m.client+':'+m.insidePort+' and hand off toward the inside client.',0));}
 }
 return result(state,outcome,steps,['Inside TCP endpoint','Public TCP endpoint','Remote endpoint','Expires in'],state.mappings.map(m=>[m.client+':'+m.insidePort,'198.51.100.10:'+m.publicPort,m.remote+':443',(m.expires-state.time)+'s']));
}
export function probeMetrics(samples){
 const answered=samples.filter(x=>x!==null),differences=[];
 samples.forEach((x,i)=>{if(i&&x!==null&&samples[i-1]!==null)differences.push(Math.abs(x-samples[i-1]));});
 return {sent:samples.length,received:answered.length,loss:(samples.length-answered.length)/samples.length*100,mean:answered.length?answered.reduce((a,b)=>a+b,0)/answered.length:null,jitter:differences.length?differences.reduce((a,b)=>a+b,0)/differences.length:null};
}
export function monitoringOperation(previous,c){
 const state=structuredClone(previous),sets={healthy:[12,14,13,15,12,14],congestion:[25,80,null,140,160,180],intermittent:[12,null,13,null,14,15],linkdown:[null,null,null,null,null,null],dns:[12,14,13,15,12,14]};
 if(!sets[c.scenario])throw Error('Choose a modeled fault.');
 if(c.byName&&c.scenario==='dns')return result(state,'Name resolution failed',[step('The application tries to resolve service.training.test before sending probes.',0),step('DNS resolution fails. No probes are sent. This is not a measured 100% packet-loss result.',1)],['Metric','Result'],[['Probes sent','0'],['Network loss','Not measured']]);
 const samples=sets[c.scenario],metrics=probeMetrics(samples),steps=samples.map((rtt,i)=>step('Probe '+(i+1)+': '+(rtt===null?'no reply before the modeled deadline.':rtt+' ms RTT.'),rtt===null?1:2));
 if(c.baseline)state.baseline=metrics;
 const rows=[['Sent / received',metrics.sent+' / '+metrics.received],['Loss',metrics.loss.toFixed(1)+'%'],['Mean successful RTT',metrics.mean===null?'Not measurable':metrics.mean.toFixed(1)+' ms'],['Mean adjacent RTT variation',metrics.jitter===null?'Not measurable':metrics.jitter.toFixed(1)+' ms']];
 if(state.baseline)rows.push(['Saved baseline loss / mean',state.baseline.loss.toFixed(1)+'% / '+(state.baseline.mean===null?'N/A':state.baseline.mean.toFixed(1)+' ms')]);
 steps.push(step(c.baseline?'Save this controlled run as the baseline.':'Compare probe evidence with the saved baseline; a symptom alone does not prove a root cause.',3));
 return result(state,'Probe run complete',steps,['Metric','Result'],rows);
}
export const operations={dhcp:dhcpOperation,dns:dnsOperation,firewall:firewallOperation,nat:natOperation,monitoring:monitoringOperation};
