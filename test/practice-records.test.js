import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {operationCourses} from '../operations-courses.js';
import {initialOperation,operations,advanceOperation} from '../operations-core.js';
import {capturePractice,parsePractice,comparePracticeEvidence} from '../practice-records.js';
const context={window:{}};vm.runInNewContext(readFileSync(new URL('../vendor/ipaddr.min.js',import.meta.url),'utf8'),context);globalThis.ipaddr=context.ipaddr;
function sample(course){
 const fields=operationCourses[course].fields,settings=Object.fromEntries(fields.map(f=>[f.key,f.type==='select'?f.options[0][0]:f.value]));
 const result=operations[course](initialOperation(course),settings),evidence={headers:result.headers,rows:result.rows,outcome:result.outcome,observedAt:result.state.time};
 return {fields,record:capturePractice(course,settings,result.state,evidence,null,'My explanation',fields)};
}
test('checkpoints roundtrip each domain without sharing or mutating records',()=>{
 for(const course of Object.keys(operationCourses)){const {record,fields}=sample(course);const loaded=parsePractice(JSON.stringify(record),course,fields);assert.deepEqual(loaded,record);loaded.notes='changed';assert.equal(record.notes,'My explanation');}
});
test('checkpoints reject cross-course, version, unknown fields, malicious rows and invalid timer states',()=>{
 const {record,fields}=sample('dhcp');
 assert.throws(()=>parsePractice(JSON.stringify(record),'dns',operationCourses.dns.fields));
 for(const change of [
  r=>{r.version=2;},r=>{r.state.leases[0].expires=99999;},r=>{r.settings.server='true';},
  r=>{r.state.table=[];},r=>{r.evidence.rows=[['wrong width']];},r=>{r.notes='x'.repeat(2001);}
 ]){const copy=structuredClone(record);change(copy);assert.throws(()=>parsePractice(JSON.stringify(copy),'dhcp',fields));}
 assert.throws(()=>parsePractice('x'.repeat(100001),'dhcp',fields));assert.throws(()=>parsePractice('null','dhcp',fields));
});
test('practice saves may contain expired cache state, but not forged active tuples or invalid metrics',()=>{
 const nat=sample('nat');nat.record.state.mappings[0].publicPort=22;assert.throws(()=>parsePractice(JSON.stringify(nat.record),'nat',nat.fields));
 const dns=sample('dns');dns.record.state=advanceOperation(dns.record.state,120);assert.doesNotThrow(()=>parsePractice(JSON.stringify(dns.record),'dns',dns.fields));
 const monitoring=sample('monitoring');monitoring.record.state.baseline={sent:6,received:0,loss:100,mean:0,jitter:0};assert.throws(()=>parsePractice(JSON.stringify(monitoring.record),'monitoring',monitoring.fields));
});
test('comparison distinguishes PAT flows sharing an inside endpoint and detects mapping changes',()=>{
 const before={rows:[['192.168.10.10:53000','198.51.100.10:40000','203.0.113.20:443','60s']]};
 const after={rows:[['192.168.10.10:53000','198.51.100.10:40001','203.0.113.20:443','60s'],['192.168.10.10:53000','198.51.100.10:40000','203.0.113.21:443','60s']]};
 const rows=comparePracticeEvidence('nat',before,after);
 assert.equal(rows.length,2);assert.match(rows[0][1],/40000/);assert.match(rows[0][2],/40001/);assert.equal(rows[1][1],'Not observed');assert.match(rows[1][0],/203.0.113.21/);
});
