import {ipv4} from './core.js';
const courses=['dhcp','dns','firewall','nat','monitoring'];
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value,keys)=>plain(value)&&Object.keys(value).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(value,k));
const integer=(value,max=10000000)=>Number.isInteger(value)&&value>=0&&value<=max;
const text=(value,max=2000)=>typeof value==='string'&&value.length<=max;
const fail=()=>{throw Error('Invalid or incompatible practice checkpoint. No current state was changed.');};
function validMetrics(m){
 return exact(m,['sent','received','loss','mean','jitter'])&&m.sent===6&&integer(m.received,6)&&m.loss===(6-m.received)/6*100&&[m.mean,m.jitter].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000)&&(m.received===0)===(m.mean===null);
}
function validEvidence(e,time){
 return e===null||exact(e,['headers','rows','outcome','observedAt'])&&integer(e.observedAt)&&e.observedAt<=time&&text(e.outcome,100)&&Array.isArray(e.headers)&&e.headers.length>0&&e.headers.length<=8&&e.headers.every(h=>text(h,100))&&Array.isArray(e.rows)&&e.rows.length<=30&&e.rows.every(row=>Array.isArray(row)&&row.length===e.headers.length&&row.every(cell=>text(cell,500)||typeof cell==='number'&&Number.isFinite(cell)));
}
export function validatePractice(record,course,fields){
 if(!courses.includes(course)||!exact(record,['version','kind','course','savedAt','settings','state','evidence','baseline','notes'])||record.version!==1||record.kind!=='kryptnet-operations-practice'||record.course!==course||!text(record.savedAt,40)||!Number.isFinite(Date.parse(record.savedAt))||!text(record.notes))fail();
 if(!exact(record.settings,fields.map(f=>f.key)))fail();
 for(const f of fields){const value=record.settings[f.key];if(f.type==='checkbox'?typeof value!=='boolean':f.type==='select'?!f.options.some(([id])=>id===value):!text(value,50))fail();}
 const s=record.state;
 if(!exact(s,['course','time','leases','cache','mappings','allowed','denied','baseline'])||s.course!==course||!integer(s.time)||!integer(s.allowed,1000000)||!integer(s.denied,1000000)||!Array.isArray(s.leases)||s.leases.length>3||!Array.isArray(s.cache)||s.cache.length>6||!Array.isArray(s.mappings)||s.mappings.length>2)fail();
 if(course!=='dhcp'&&s.leases.length||course!=='dns'&&s.cache.length||course!=='nat'&&s.mappings.length||course!=='monitoring'&&s.baseline!==null||s.baseline!==null&&!validMetrics(s.baseline))fail();
 const clients=new Set(),addresses=new Set();
 for(const l of s.leases){if(!exact(l,['client','ip','gateway','start','expires'])||!['PC-A','PC-B','PC-C'].includes(l.client)||!['192.168.10.100','192.168.10.101'].includes(l.ip)||!['192.168.10.1','192.168.20.1'].includes(l.gateway)||!integer(l.start)||l.start>s.time||l.expires!==l.start+120||clients.has(l.client)||addresses.has(l.ip))fail();clients.add(l.client);addresses.add(l.ip);}
 const cacheKeys=new Set();
 for(const r of s.cache){if(!exact(r,['key','name','type','answer','status','expires'])||!['www.training.test','app.training.test','missing.training.test'].includes(r.name)||!['A','AAAA'].includes(r.type)||r.key!==r.name+'|'+r.type||cacheKeys.has(r.key)||!integer(r.expires)||r.expires>s.time+60||!['NOERROR','NXDOMAIN'].includes(r.status)||(r.status==='NXDOMAIN'?(r.name!=='missing.training.test'||r.answer!==''):r.name==='missing.training.test'||!(r.type==='A'?['192.0.2.10','192.0.2.20'].includes(r.answer):r.answer==='2001:db8::10')))fail();cacheKeys.add(r.key);}
 const ports=new Set(),tuples=new Set();
 for(const m of s.mappings){
  if(!exact(m,['client','insidePort','remote','publicPort','expires'])||!text(m.client,20)||!['203.0.113.20','203.0.113.21'].includes(m.remote)||!integer(m.insidePort,65535)||m.insidePort===0||![40000,40001].includes(m.publicPort)||ports.has(m.publicPort)||!integer(m.expires)||m.expires>s.time+60)fail();
  let n;try{n=ipv4(m.client);}catch{fail();}
  if(n<=ipv4('192.168.10.1')||n>=ipv4('192.168.10.255'))fail();
  const tuple=m.client+':'+m.insidePort+'|'+m.remote;if(tuples.has(tuple))fail();tuples.add(tuple);ports.add(m.publicPort);
 }
 if(!validEvidence(record.evidence,s.time)||!validEvidence(record.baseline,s.time))fail();
 return structuredClone(record);
}
export function capturePractice(course,settings,state,evidence,baseline,notes,fields){
 return validatePractice({version:1,kind:'kryptnet-operations-practice',course,savedAt:new Date().toISOString(),settings,state,evidence,baseline,notes},course,fields);
}
export function parsePractice(value,course,fields){
 if(typeof value!=='string'||value.length>100000)fail();
 let record;try{record=JSON.parse(value);}catch{fail();}return validatePractice(record,course,fields);
}
export function comparePracticeEvidence(course,baseline,current){
 const key=row=>course==='nat'?String(row[0])+' → '+String(row[2]):String(row[0]);
 const index=record=>new Map((record?.rows||[]).map(row=>[key(row),row.slice(1).join(' / ')]));
 const before=index(baseline),after=index(current);
 return [...new Set([...before.keys(),...after.keys()])].map(id=>[id,before.get(id)??'Not observed',after.get(id)??'Not observed']);
}
