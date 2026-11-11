import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=new URL('./results/',import.meta.url);await mkdir(results,{recursive:true});
try{
 for(const [name,width,height] of [['desktop',1440,1000],['android-portrait',412,915],['android-landscape',915,412]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const characteristic=new EventTarget();let timer;
   characteristic.startNotifications=async()=>{timer=setInterval(()=>{characteristic.value=new DataView(Uint8Array.of(0,147).buffer);characteristic.dispatchEvent(new Event('characteristicvaluechanged'));},200);};
   const device=new EventTarget();device.name='Test HR strap';
   device.gatt={connected:false,connect:async()=>{device.gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async()=>characteristic})};},disconnect:()=>{clearInterval(timer);if(device.gatt.connected){device.gatt.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}}};
   Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>device}});window.testHRDevice=device;
  });
  await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:8000');await page.waitForTimeout(700);
  await page.screenshot({path:new URL(`${name}-setup.png`,results).pathname,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(name==='desktop'){
   const pose=await page.evaluate(async()=>{
    const {TrailScene}=await import('./js/scene.js');const {Vector3}=await import('three');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;width:320px;height:240px';document.body.append(canvas);
    const scene=new TrailScene(canvas,()=>{});const snapshots=[];
    for(const phase of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
     scene.phase=phase;scene.render({speed:2.5,running:true,dt:0,grade:0});scene.scene.updateMatrixWorld(true);
     snapshots.push(scene.arms.map((arm,i)=>{const elbow=arm.children[1];const hand=elbow.children[0];return {forward:hand.getWorldPosition(new Vector3()).x-elbow.getWorldPosition(new Vector3()).x,arm:arm.rotation.z,leg:scene.legs[i].leg.rotation.z};}));
    }
    scene.renderer.dispose();canvas.remove();return snapshots;
   });
   for(const limbs of pose)for(const limb of limbs){assert.ok(limb.forward>0,'forearm bends towards the running direction');assert.ok(limb.arm*limb.leg<=0,'arm counters the same-side leg');}
  }
  assert.equal(await page.locator('#minutes').inputValue(),'45');
  assert.equal(await page.locator('#sustained-minutes').textContent(),'35');
  assert.match(await page.locator('#plan-summary').textContent(),/5 min at 0% → 35 min at 10% → 5 min at -5%/);
  await page.locator('#minutes').fill('10');assert.equal(await page.locator('#run-form').evaluate(form=>form.checkValidity()),false);
  await page.locator('#training-mode').selectOption('trail');assert.equal(await page.locator('#run-form').evaluate(form=>form.checkValidity()),true);
  await page.locator('#minutes').fill('45');await page.locator('#training-mode').selectOption('timed');
  await page.locator('#sustained-grade').fill('8');assert.match(await page.locator('#plan-summary').textContent(),/35 min at 8%/);
  await page.locator('#sustained-grade').fill('10');
  await page.getByRole('button',{name:/Explore in demo/}).click();
  assert.match(await page.locator('#phase-status').textContent(),/Warm-up · target 0%/);
  assert.equal(await page.locator('#chart-end').textContent(),'45 min');
  assert.equal(await page.locator('#grade').textContent(),'0.0');
  await page.waitForTimeout(3500);assert.equal(await page.locator('#speed').textContent(),'9.0');assert.ok(Number(await page.locator('#distance').textContent())>0);
  await page.getByRole('button',{name:/Pause run/}).click();const elapsed=await page.locator('#elapsed').textContent();await page.waitForTimeout(1100);assert.equal(await page.locator('#elapsed').textContent(),elapsed);
  await page.getByRole('button',{name:/Resume run/}).click();
  assert.equal(await page.locator('#hr').textContent(),'—');
  await page.locator('#tools-button').click();await page.locator('#reconnect-hr').click();
  await page.waitForFunction(()=>document.getElementById('hr').textContent==='147',null,{timeout:5000}).catch(async error=>{throw new Error(error.message+' '+await page.locator('#message').textContent()+' '+await page.locator('#hr-device-detail').textContent());});
  assert.equal(await page.locator('#hr').getAttribute('title'),'Bluetooth heart-rate monitor');
  await page.locator('#close-tools').click();await page.getByRole('button',{name:/Resume run/}).click();await page.waitForTimeout(1100);
  await page.screenshot({path:new URL(`${name}-run.png`,results).pathname});
  await page.locator('#tools-button').click();await page.locator('#sky').selectOption('sunset');await page.locator('#camera').click();
  assert.equal(await page.locator('#auto-incline').isDisabled(),true);
  const download=page.waitForEvent('download');await page.locator('#export').click();const activity=await download;assert.match(activity.suggestedFilename(),/sole-runner-demo.*tcx/);
  const {readFile}=await import('node:fs/promises');assert.match(await readFile(await activity.path(),'utf8'),/<HeartRateBpm><Value>147<\/Value><\/HeartRateBpm>/);
  await page.evaluate(()=>window.testHRDevice.gatt.disconnect());await page.waitForTimeout(300);assert.equal(await page.locator('#hr').textContent(),'—');
  await page.locator('#finish').click();assert.equal(await page.locator('#pause').isDisabled(),true);
  await page.locator('#tools-button').click();await page.locator('#new-run').click();assert.equal(await page.locator('#setup').isVisible(),true);
  assert.deepEqual(errors,[]);await page.close();console.log(`${name}: render, layout, demo, pause, HR pairing/disconnect/export, tools, finish passed`);
 }
}finally{await browser.close();}
