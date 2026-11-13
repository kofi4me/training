import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialMitm, poisonCache, inspectSession, gatewayMAC, attackerMAC, initialLoad, loadStep } from '../security-core.js';
import { validSnapshot } from '../security-class.js';
import { observedFacts, checkDiagnosis, checkRecovery } from '../practical-checks.js';
const base = { legitimate:40,sources:10,rate:20,capacity:100,link:1000,limit:5,attack:false,limiting:false };
test('ARP redirection exposes HTTP but not authenticated HTTPS application contents', () => {
  let state = initialMitm(); assert.equal(inspectSession(state,'Private note').gatewayMAC, gatewayMAC);
  state = poisonCache(state); assert.equal(inspectSession(state,'Private note').gatewayMAC, attackerMAC);
  assert.equal(inspectSession(state,'Private note').readable, false);
  state.protocol='http'; state.tamper=true;
  assert.equal(inspectSession(state,'Private note').readable, true);
  assert.equal(inspectSession(state,'Private note').changed, true);
  state.protocol='https'; assert.equal(inspectSession(state,'Private note').changed, false);
});
test('trusted gateway binding blocks poisoning; dropping traffic still disrupts TLS', () => {
  const protectedState = poisonCache({ ...initialMitm(), binding:true }); assert.equal(protectedState.poisoned,false);
  const result = inspectSession({ ...poisonCache(initialMitm()), forwarding:false },'Data');
  assert.equal(result.delivered,false); assert.equal(result.recipient,null); assert.equal(result.readable,false);
});
test('baseline services legitimate demand without loss; overload competes for capacity', () => {
  const normal = loadStep(initialLoad(),base); assert.equal(normal.processed,40); assert.equal(normal.losses,0);
  let overloaded=initialLoad();for(let i=0;i<10;i++) overloaded=loadStep(overloaded,{...base,attack:true});
  assert.ok(overloaded.losses>0); assert.ok(overloaded.qLegit+overloaded.qAttack<=200);
  assert.ok(Math.abs(overloaded.arrivals-overloaded.processed-overloaded.losses-overloaded.qLegit)<1e-6);
});
test('per-source limit distinguishes equal aggregate single and distributed load', () => {
  const single=loadStep(initialLoad(),{...base,attack:true,limiting:true,sources:1,rate:100});
  const distributed=loadStep(initialLoad(),{...base,attack:true,limiting:true,sources:20,rate:5});
  assert.ok(single.processed>distributed.processed);
});
test('rate limiting can reject legitimate demand and cannot recover upstream losses', () => {
  assert.equal(loadStep(initialLoad(),{...base,limiting:true,limit:1}).losses,20);
  const result=loadStep(initialLoad(),{...base,attack:true,limiting:true,link:50});
  assert.ok(result.history[0].upstreamLostL>0); assert.ok(result.losses>0);
  assert.throws(()=>loadStep(initialLoad(),{...base,sources:100000}));
});
test('saved comparison evidence is bounded and isolated by course',()=>{
 const value={modelVersion:2,lab:'mitm',observedAt:'2026-11-01T12:00:00Z',metrics:[{label:'Message delivered',value:true}]};
 assert.equal(validSnapshot(value,'mitm'),true);assert.equal(validSnapshot(value,'ddos'),false);
 assert.equal(validSnapshot({...value,metrics:[{label:'Bad data',value:{}}]},'mitm'),false);
 assert.equal(validSnapshot({...value,observedAt:'invalid'},'mitm'),false);
});
test('spare service capacity does not cause artificial buffer losses',()=>{
 for(const legitimate of[0,40,150,200]){const s=loadStep(initialLoad(),{...base,legitimate,sources:1,rate:40,attack:true,capacity:300});assert.equal(s.losses,0);assert.equal(s.processed,legitimate);assert.equal(s.qLegit+s.qAttack,0);}
});
test('fluid queue conserves legitimate work through overload and recovery',()=>{
 let s=initialLoad();for(let i=0;i<60;i++){s=loadStep(s,{...base,attack:i<25,capacity:i<30?100:200});assert.ok(s.qLegit+s.qAttack<=200.000001);assert.ok(Math.abs(s.arrivals-s.processed-s.losses-s.qLegit)<0.000001);}
 assert.ok(s.losses>0);assert.equal(s.qLegit+s.qAttack,0);assert.equal(s.history.at(-1).lostL,0);
});
test('a selected label or irrelevant evidence does not pass practical diagnosis',()=>{
 const evidence={lab:'mitm',probeId:'original',observedAt:'2026-11-01T12:00:00Z',metrics:[{label:'Application protocol',value:'HTTP'},{label:'Traffic redirected',value:true},{label:'Message delivered',value:true},{label:'Content readable to intermediary',value:true},{label:'Content modified',value:false}]};
 assert.equal(observedFacts(evidence).find(f=>f[0]==='readable')[2],true);
 assert.equal(checkDiagnosis('mitm','A','redirect',[],evidence).ok,false);
 assert.equal(checkDiagnosis('mitm','A','redirect',['mapping','protected','delivered'],evidence).ok,false);
 assert.equal(checkDiagnosis('mitm','A','redirect',['mapping','readable','delivered'],evidence).ok,true);
 assert.equal(checkRecovery(evidence,evidence,true).ok,false);
 const repaired={...evidence,probeId:'new',metrics:evidence.metrics.map(m=>({...m,value:m.label==='Content readable to intermediary'?false:m.value}))};
 assert.equal(checkRecovery(evidence,repaired,false).ok,false);assert.equal(checkRecovery(evidence,repaired,true).ok,true);
});
test('recovery cannot pass by removing legitimate users from the workload',()=>{
 const incident={lab:'ddos',probeId:'incident',metrics:[{label:'Legitimate offered in step',value:40}]};
 const current={lab:'ddos',probeId:'probe',metrics:[{label:'Legitimate offered in step',value:0},{label:'Legitimate lost in step',value:0},{label:'Legitimate processed in step',value:0}]};
 assert.equal(checkRecovery(incident,current,true).ok,false);
});
