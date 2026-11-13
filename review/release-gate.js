import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export function evaluateRelease(course,requirements){
 const missing=Object.keys(requirements).filter(id=>course.statuses?.[id]!=='Implemented and tested').map(id=>'Incomplete: '+requirements[id]);
 for(const key of ['technicalReview','instructionalReview','accessibilityReview','beginnerObservation']){
  const review=course.signoffs?.[key];
  if(!review?.reviewer||!review?.evidence||!Number.isFinite(Date.parse(review.date)))missing.push('Missing human evidence: '+key);
 }
 if(!course.verification?.practicalPassRequired||!course.verification?.serverVerifiedOutcomes||!course.verification?.regressionEvidence)missing.push('Assessed practical gate and regression evidence are required.');
 return {approved:missing.length===0,missing};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const audit=JSON.parse(await readFile(new URL('course-audit.json',import.meta.url),'utf8'));
 const results=audit.courses.map(c=>({id:c.id,...evaluateRelease({...c,statuses:{...audit.baselineStatuses,...c.overrides}},audit.criteria)}));
 console.log(JSON.stringify({approved:results.every(r=>r.approved),courses:results},null,2));
 if(process.argv.includes('--require-release')&&results.some(r=>!r.approved))process.exitCode=1;
}
