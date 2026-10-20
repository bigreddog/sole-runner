import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=new URL('./results/',import.meta.url);await mkdir(results,{recursive:true});
try{
 for(const [name,width,height] of [['desktop',1440,1000],['android-portrait',412,915],['android-landscape',915,412]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:8000');await page.waitForTimeout(700);
  await page.screenshot({path:new URL(`${name}-setup.png`,results).pathname,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:/Explore in demo/}).click();
  await page.waitForTimeout(3500);assert.equal(await page.locator('#speed').textContent(),'9.0');assert.ok(Number(await page.locator('#distance').textContent())>0);
  await page.getByRole('button',{name:/Pause run/}).click();const elapsed=await page.locator('#elapsed').textContent();await page.waitForTimeout(1100);assert.equal(await page.locator('#elapsed').textContent(),elapsed);
  await page.getByRole('button',{name:/Resume run/}).click();
  await page.screenshot({path:new URL(`${name}-run.png`,results).pathname});
  await page.locator('#tools-button').click();await page.locator('#sky').selectOption('sunset');await page.locator('#camera').click();
  assert.equal(await page.locator('#auto-incline').isDisabled(),true);
  const download=page.waitForEvent('download');await page.locator('#export').click();assert.match((await download).suggestedFilename(),/sole-runner-demo.*tcx/);
  await page.locator('#finish').click();assert.equal(await page.locator('#pause').isDisabled(),true);
  await page.locator('#tools-button').click();await page.locator('#new-run').click();assert.equal(await page.locator('#setup').isVisible(),true);
  assert.deepEqual(errors,[]);await page.close();console.log(`${name}: render, layout, demo, pause, tools, export, finish passed`);
 }
}finally{await browser.close();}
