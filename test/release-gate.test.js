import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateRelease} from '../review/release-gate.js';
test('all 16 modules fail closed against the mandatory release standard',()=>{
 const audit=JSON.parse(readFileSync(new URL('../review/course-audit.json',import.meta.url),'utf8'));
 assert.equal(audit.courses.length,16);
 for(const c of audit.courses){const result=evaluateRelease({...c,statuses:{...audit.baselineStatuses,...c.overrides}},audit.criteria);assert.equal(result.approved,false,c.id);assert.ok(result.missing.length);}
});
test('UI completion claims do not bypass missing practical verification or human review',()=>{
 const requirements={content:'Content',grading:'Grading'};
 const c={statuses:{content:'Implemented and tested',grading:'Implemented and tested'},productionReady:true};
 assert.equal(evaluateRelease(c,requirements).approved,false);
 c.signoffs=Object.fromEntries(['technicalReview','instructionalReview','accessibilityReview','beginnerObservation'].map(key=>[key,{reviewer:'Test reviewer',date:'2026-11-05',evidence:'fixture only'}]));
 c.verification={practicalPassRequired:true,serverVerifiedOutcomes:true,regressionEvidence:'fixture only'};
 assert.equal(evaluateRelease(c,requirements).approved,true);
 c.statuses.content='Partially implemented';assert.equal(evaluateRelease(c,requirements).approved,false);
});
