const {chromium}=require(process.argv[2]);const fs=require('node:fs/promises');const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{
 const audit=JSON.parse(await fs.readFile(path.join(__dirname,'course-audit.json'),'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];
 try{
  const page=await browser.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await fs.mkdir('artifacts',{recursive:true});
  for(const course of audit.courses){
   for(const width of [1360,390]){
    await page.setViewportSize({width,height:900});
    const response=await page.goto('http://127.0.0.1:4317/'+course.url,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,course.id);
    await page.locator('.training-nav [data-course="'+course.id+'"][aria-current="page"]').waitFor();
    const main=page.locator('main');assert.ok((await main.innerText()).length>500,'Nonblank course content: '+course.id);
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,course.id+' width '+width);
    if(!['switching','mitm','ddos'].includes(course.id)){
     const lab=page.locator('[data-shared-replay]').first();await lab.waitFor();
     if(['dhcp','dns','firewall','nat','monitoring'].includes(course.id))await page.locator('#operation-prepare').click();
     const next=lab.locator('[data-next],[data-step],#operation-next').first();
     await next.focus();await page.keyboard.press('Enter');
     await lab.locator('[data-replay-previous]').click();
     await lab.getByRole('combobox',{name:'Playback speed',exact:true}).selectOption('2');
     await lab.locator('.replay-events summary').click();
     assert.ok(await lab.locator('.replay-timeline button').count());
    }
    if(course.id==='addressing'&&width===390)await page.screenshot({path:'artifacts/review-addressing-mobile.png',fullPage:true});
    if(course.id==='dhcp'&&width===1360)await page.screenshot({path:'artifacts/review-dhcp-desktop.png',fullPage:true});
    results.push({course:course.id,width,status:'passed',checks:['URL','initialized content','image loading','no page overflow','shared replay keyboard controls where applicable']});
   }
   console.log(course.id+' desktop/mobile smoke passed');
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(__dirname,'all-course-browser-results.json'),JSON.stringify({at:new Date().toISOString(),scope:'Functional smoke, not instructional or release approval',results,pageErrors:errors},null,2));
  console.log('All '+audit.courses.length+' course URLs passed desktop/mobile smoke checks.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
