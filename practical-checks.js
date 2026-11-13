import { ping, validate, subnet } from './core.js';
const metric = (snapshot, label) => snapshot?.metrics.find(m => m.label === label)?.value;
export function observedFacts(snapshot) {
  if (!snapshot) return [];
  if (snapshot.lab === 'mitm') return [
    ['mapping', 'Gateway mapping redirects traffic', metric(snapshot,'Traffic redirected') === true],
    ['readable', 'Intermediary can read the message', metric(snapshot,'Content readable to intermediary') === true],
    ['protected', 'Redirected HTTPS content remains unreadable', metric(snapshot,'Traffic redirected') === true && metric(snapshot,'Application protocol') === 'HTTPS' && metric(snapshot,'Content readable to intermediary') === false],
    ['delivered', 'Destination receives the message', metric(snapshot,'Message delivered') === true],
    ['failed', 'Destination does not receive the message', metric(snapshot,'Message delivered') === false]
  ];
  return [
    ['overload','Incoming demand exceeds service capacity', metric(snapshot,'Incoming requests/s') > metric(snapshot,'Application capacity/s')],
    ['queued','Work remains queued after the step', metric(snapshot,'Queue after step') > 0.001],
    ['upstream','Legitimate requests are lost upstream', metric(snapshot,'Legitimate lost upstream in step') > 0.001],
    ['limiter','The limiter rejects legitimate requests', metric(snapshot,'Legitimate lost at limiter in step') > 0.001],
    ['noattack','Synthetic attack demand is disabled', metric(snapshot,'Synthetic attack active') === false]
  ];
}
const required = {mitm:{A:['mapping','readable','delivered'],B:['mapping','failed'],C:['mapping','protected','delivered']},ddos:{A:['overload','queued'],B:['upstream'],C:['limiter','noattack']}};
const causes = {mitm:{A:'redirect',B:'forward',C:'protected'},ddos:{A:'service',B:'upstream',C:'limiter'}};
export function checkDiagnosis(lab, id, cause, selected, evidence) {
  if (!evidence || evidence.lab !== lab) return {ok:false,message:'Run a diagnostic probe to collect incident evidence.'};
  if (!causes[lab]?.[id] || cause !== causes[lab][id]) return {ok:false,message:'The proposed cause does not match the incident. Use the hints to compare the observed mapping, delivery, loss location, and queue.'};
  const facts=observedFacts(evidence), actual=new Set(facts.filter(f=>f[2]).map(f=>f[0]));
  if (!Array.isArray(selected) || selected.some(key=>!actual.has(key))) return {ok:false,message:'At least one selected observation contradicts the diagnostic probe. Inspect the evidence table again.'};
  if (!required[lab][id].every(key=>selected.includes(key))) return {ok:false,message:'Select the observations needed to distinguish this cause. A correct label alone does not complete the practical check.'};
  return {ok:true,message:'Diagnosis and selected observations match the incident evidence. Your written explanation is retained for review, not automatically graded. Reveal controls, apply a remedy, and verify a fresh probe.'};
}
export function checkRecovery(incident, current, diagnosisChecked) {
  if (!diagnosisChecked) return {ok:false,message:'Complete the diagnosis and evidence check first.'};
  if (!incident || !current || current.lab !== incident.lab || (incident.probeId && current.probeId ? incident.probeId===current.probeId : current.observedAt<=incident.observedAt)) return {ok:false,message:'Run a new probe after investigating and applying a remedy.'};
  if(current.lab==='ddos'&&Math.abs(metric(current,'Legitimate offered in step')-metric(incident,'Legitimate offered in step'))>0.001)return{ok:false,message:'Keep legitimate offered demand unchanged when verifying recovery. Reducing user traffic does not demonstrate restored service for the original workload.'};
  const ok=current.lab==='mitm' ? metric(current,'Message delivered') === true && metric(current,'Content readable to intermediary') === false && metric(current,'Content modified') === false : metric(current,'Legitimate lost in step') < 0.001 && metric(current,'Legitimate processed in step') >= metric(current,'Legitimate offered in step') - 0.001;
  return {ok,message:ok?'Practical check passed: a new probe demonstrates protected delivery or restored legitimate service in this model. This is a local practice result, not a certificate grade.':'Recovery is not yet demonstrated. Compare the latest probe with the incident evidence; allow queued work to drain where appropriate.'};
}
export function checkNetworkActivity(state,index) {
  if(index===0||index===7)return {ok:false,message:index===0?'Conceptual understanding requires your own explanation. Read the checkpoint, then continue to the measurable configuration activities.':'Use the server-graded Assessment page for the final quiz. Local lesson markers do not issue certificates.'};
  const allPaths=()=>state.hosts.length>=2&&state.hosts.every(a=>state.hosts.every(b=>a.id===b.id||ping(state,a.id,b.id).ok));
  if(index===1){try{const nets=state.departments.map(d=>({...subnet(d.cidr),d}));const ok=nets.every(n=>n.usable>=n.d.demand&&n.network>=subnet('192.168.10.0/24').network&&n.broadcast<=subnet('192.168.10.0/24').broadcast&&n.canonical===n.d.cidr)&&nets.every((n,i)=>nets.every((m,j)=>i===j||n.broadcast<m.network||m.broadcast<n.network));return{ok,message:ok?'Address-plan check passed: aligned, non-overlapping subnets have sufficient usable capacity. Explain your calculation separately.':'Review subnet capacity, network boundaries, overlap, and the office /24 pool.'};}catch{return{ok:false,message:'Enter valid subnet/prefix values first.'};}}
  if(index===2||index===6){const ok=validate(state).length===0&&allPaths()&&(index!==6||state.mode==='challenge');return{ok,message:ok?'Configuration and all directed paths pass the model check. Your written diagnosis and explanation are not automatically assessed.':index===6?'Load Challenge, repair its faults, and recheck all paths. A normal starter network alone does not demonstrate a challenge repair.':'Use Check network to identify configuration findings, then test the affected path.'};}
  const sales=state.hosts.filter(h=>h.department==='sales'),eng=state.hosts.find(h=>h.department==='engineering');
  if(index===3){const ok=!state.routing&&sales.length>=2&&ping(state,sales[0].id,sales[1].id).ok;return{ok,message:ok?'Local-path check passed with R1 routing disabled. Restore routing before the routed activity.':'Disable R1 routing and retain valid settings for two Sales PCs; their local path should still pass.'};}
  if(index===4){const ok=!!sales[0]&&!!eng&&ping(state,sales[0].id,eng.id).ok;return{ok,message:ok?'Routed-path check passed. Use Step through and explain the MAC, VLAN, and TTL changes separately.':'Test a Sales-to-Engineering path. Check host gateways, prefixes, uplink VLAN allowances, and R1 routing.'};}
  const messages=state.messages||[],ok=messages.some(m=>m.read&&messages.some(reply=>reply.from===m.to&&reply.to===m.from));return{ok,message:ok?'Messaging check passed: a received message was opened and a reply delivered.':'Send a message, open it on the destination PC, and deliver a reply before checking this activity.'};
}
