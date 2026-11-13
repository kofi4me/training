const {spawnSync,spawn}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const playwright=process.argv[2];if(!playwright)throw Error('Pass the configured Playwright module path.');
const root=path.resolve(__dirname,'..'),results=[];
const scripts=[
 ['unit regression',['--test','--test-reporter=junit','--test-reporter-destination=review/after-tests.xml','test/core.test.js','test/assessment.test.js','test/security.test.js','test/production.test.js','test/accounts.test.js','test/switching.test.js','test/operations.test.js','test/replay.test.js','test/practice-records.test.js','test/release-gate.test.js','test/record-store.test.js','test/ip-teaching.test.js','test/course-practice.test.js','test/course-assessments.test.js','test/payments.test.js','test/systems.test.js']],
 ['nonblocking account lookup',['test/startup-browser.cjs',playwright]],
 ['all-course desktop/mobile smoke',['review/all-course-browser.cjs',playwright]],
 ['practice checkpoints and replay',['test/practice-browser.cjs',playwright]],
 ['operations failure/repair',['test/operations-browser.cjs',playwright]],
 ['IP and routing calculations',['test/ip-routing-browser.cjs',playwright]],
 ['beginner IP and classless calculations',['test/ip-beginner-browser.cjs',playwright]],
 ['applied labs across the catalogue',['test/applied-labs-browser.cjs',playwright]],
 ['systems administration labs',['test/systems-browser.cjs',playwright]],
 ['learner registration and assessment instructions',['test/learner-access-browser.cjs',playwright]],
 ['switching fault/aging/replay',['test/switching-browser.cjs',playwright]],
 ['security investigations',['test/security-browser.cjs',playwright]],
 ['security study evidence',['test/study-browser.cjs',playwright]],
 ['security motion and reduced motion',['test/motion-browser.cjs',playwright]],
 ['advanced topology workshop',['test/browser-check.cjs',playwright]],
 ['network practical readiness',['test/readiness-browser.cjs',playwright]],
 ['network messaging',['test/mail-browser.cjs',playwright]],
 ['guided lesson navigation',['test/lessons-browser.cjs',playwright]],
 ['assessment and certificate UI',['test/assessment-browser.cjs',playwright]],
 ['account and issuer UI',['test/account-browser.cjs',playwright]],
 ['issuer PDF/fingerprint API',['--test','test/server-api.test.js']]
];
function execute(args){
 return new Promise(resolve=>{
  const started=Date.now(),child=spawn(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',error=null,timedOut=false;
  child.stdout.on('data',chunk=>stdout=(stdout+chunk).slice(-100000));child.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-100000));
  const timeoutMs=args.includes('--test')?900000:300000;
  const timeout=setTimeout(()=>{timedOut=true;error='Test process timed out; its process tree was terminated.';if(process.platform==='win32'&&child.pid)spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true});else child.kill('SIGTERM');},timeoutMs);
  child.on('error',err=>{error=err.message;});
  child.on('close',code=>{clearTimeout(timeout);resolve({passed:code===0&&!timedOut,exitCode:code,seconds:(Date.now()-started)/1000,output:(stdout+'\n'+stderr).trim().slice(-6000),error});});
 });
}
(async()=>{
 let previous=[];
 if(process.argv.includes('--retry')){
  const target=path.join(__dirname,'qa-results.json');const existing=JSON.parse(fs.readFileSync(target,'utf8'));previous=existing.results;
  const archive=path.join(__dirname,'qa-first-run-results.json');if(!fs.existsSync(archive))fs.copyFileSync(target,archive);
 }
 for(const [name,args] of scripts){
  const old=previous.find(result=>result.name===name);
  if(old?.passed&&!process.argv.includes('--all')&&!process.argv.includes('--force='+name)){results.push(old);console.log('RETAIN PASS '+name);continue;}
  const run=await execute(args);const attempts=old?[...(old.attempts||[]),{passed:old.passed,exitCode:old.exitCode,seconds:old.seconds,output:old.output,error:old.error}]:[];
  results.push({name,command:['node',...args].join(' '),...run,attempts});
  console.log((run.passed?'PASS ':'FAIL ')+name);
  fs.writeFileSync(path.join(__dirname,'qa-results.json'),JSON.stringify({at:new Date().toISOString(),expectedCount:scripts.length,scope:'Automated functional/regression evidence only; not human learning, production approval, or full standard compliance',results},null,2));
 }
 fs.writeFileSync(path.join(__dirname,'qa-results.json'),JSON.stringify({at:new Date().toISOString(),expectedCount:scripts.length,scope:'Automated functional/regression evidence only; not human learning, production approval, or full standard compliance',results},null,2));
 const report=spawnSync(process.execPath,['review/build-report.js'],{cwd:root,windowsHide:true,encoding:'utf8'});console.log(report.stdout);if(report.status!==0)console.error(report.stderr);
 if(results.some(result=>!result.passed)||report.status!==0)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
