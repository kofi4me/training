const {chromium}=require(process.argv[2]);const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [url,selector] of [['index.html','#diagram [data-node]'],['security.html?lab=mitm','#security-root .security-settings']]){
  const page=await browser.newPage();let pending;
  await page.route('**/api/account',route=>{pending=route;});
  await page.goto('http://127.0.0.1:4317/'+url,{waitUntil:'domcontentloaded'});
  await page.locator(selector).first().waitFor({state:'attached',timeout:4000});
  assert.ok(pending,'The account request should still be pending while the lab is initialized.');
  await pending.fulfill({contentType:'application/json',body:JSON.stringify({enabled:false,account:null})});
  await page.close();
 }
 console.log('Startup checks passed: network and security labs initialize while optional account lookup is pending.');
}finally{await browser.close();}})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
