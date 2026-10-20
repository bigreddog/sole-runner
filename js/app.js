import { RunSession, gradeAt, timeText } from './workout.js';
import { Treadmill, inclinationCommand } from './ble.js';
import { TrailScene } from './scene.js';
import { ScreenWakeLock } from './wake-lock.js';
import { downloadTCX } from './tcx.js';
const $=id=>document.getElementById(id);
let session=null,scene=null,available=true,busy=false,auto=false,controlBusy=false,lastTarget=null,lastControl=0,lastFrame=performance.now(),lastUI=0,previewDistance=0;
const telemetry={},received={};let noticeTimer;
const names={ridge:'Alpine ridge',meadow:'Pine meadow',summit:'Summit approach',repeats:'Switchback repeats'};
const wake=new ScreenWakeLock({navigator,document,onStatus:text=>$('wake-status').textContent=text});
function message(text,sticky=false){clearTimeout(noticeTimer);$('message').textContent=text;$('message').hidden=false;if(!sticky)noticeTimer=setTimeout(()=>$('message').hidden=true,7000);}
function disableAuto(){auto=false;$('auto-incline').checked=false;lastTarget=null;treadmill.control?.cancelQueued();}
function pause(reason){session?.pause();disableAuto();wake.setActive(false);if(reason)message(reason,true);updateUI();}
function graphicsError(text){available=false;document.body.classList.add('scene-error');pause(text);$('live').disabled=true;}
const treadmill=new Treadmill({onMetrics:data=>{if(session?.demo)return;Object.assign(telemetry,data);for(const key of Object.keys(data))received[key]=performance.now();},onDisconnect:()=>{pause('Treadmill disconnected. The app is paused. Use the console for belt control, reconnect, then resume.');connectionUI();},onDiagnostics:report=>$('diagnostics').textContent=JSON.stringify(report,null,2)});
try{scene=new TrailScene($('scene'),graphicsError);}catch{graphicsError('3D requires WebGL. Enable hardware acceleration or try another browser.');}
function metrics(now=performance.now()){
  if(session?.demo)return {speed:$('demo-speed').valueAsNumber/3.6,grade:gradeAt(session.profile,session.distance)};
  return Object.fromEntries(['speed','grade','hr'].map(k=>[k,received[k]&&now-received[k]<5000?telemetry[k]:null]));
}
function connectionUI(){const connected=treadmill.connected;$('connection').textContent=connected?'● Treadmill connected':'○ Treadmill offline';$('live').disabled=!connected||!available||busy;$('connect').textContent=connected?'Reconnect treadmill':'Connect treadmill via Bluetooth';$('auto-incline').disabled=!connected||!treadmill.canIncline||!!session?.demo||session?.status!=='running';}
async function connect(){if(busy)return;pause();busy=true;connectionUI();try{const name=await treadmill.connect();$('device-detail').textContent=`${name} · ${treadmill.canIncline?'optional incline control available':'read-only telemetry'}`;message('Connected. Start the belt on your console, then start or resume your run.');}catch(error){message(error.message,true);}finally{busy=false;connectionUI();}}
$('connect').onclick=connect;$('reconnect').onclick=connect;
function begin(demo){
  if(!$('run-form').reportValidity()||!available)return;
  if(!demo&&!treadmill.connected){message('Connect your treadmill first.');return;}
  if(demo)treadmill.disconnect();disableAuto();
  session=new RunSession({minutes:$('minutes').valueAsNumber,profile:$('profile').value,demo});
  document.body.classList.add('running');$('setup').hidden=true;$('hud').hidden=false;$('tools').close();$('message').hidden=true;
  session.start();lastFrame=performance.now();wake.setActive(true);connectionUI();chart();updateUI();
  if(!demo)message('Run started. App pause and finish do not stop the belt; use your treadmill console.');
}
$('run-form').onsubmit=e=>{e.preventDefault();begin(true);};$('live').onclick=()=>begin(false);
$('pause').onclick=()=>{
  if(!session||session.status==='finished')return;
  if(session.status==='running'){pause('App paused. The treadmill belt is controlled on its console.');return;}
  if(!session.demo&&(!treadmill.connected||metrics().speed===null)){message('Reconnect and wait for fresh belt-speed data before resuming.',true);return;}
  session.start();lastFrame=performance.now();wake.setActive(true);$('message').hidden=true;connectionUI();updateUI();
};
$('tools-button').onclick=()=>{$('tools').showModal();connectionUI();};$('close-tools').onclick=()=>$('tools').close();
$('tools').addEventListener('click',e=>{if(e.target===$('tools')){const b=$('tools').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)$('tools').close();}});
$('finish').onclick=()=>{session?.finish();disableAuto();wake.setActive(false);$('tools').close();updateUI();message('Run complete. Download your activity from Run tools. Stop the belt on your console.',true);};
$('new-run').onclick=()=>{pause();$('tools').close();document.body.classList.remove('running');$('setup').hidden=false;$('hud').hidden=true;connectionUI();};
$('export').onclick=()=>{if(!session?.records.length){message('No activity data to export yet.');return;}downloadTCX(session);};
$('auto-incline').onchange=async()=>{
  if(!$('auto-incline').checked){disableAuto();message('Automatic incline off. The treadmill keeps its current incline; adjust on the console.');return;}
  if(controlBusy){$('auto-incline').checked=false;return;}
  const activeSession=session;controlBusy=true;$('auto-incline').disabled=true;
  try{await treadmill.enableIncline();if(activeSession!==session||session.status!=='running'||!$('auto-incline').checked)return;auto=true;lastTarget=null;lastControl=0;message('Automatic incline enabled, limited to supported steps between 0% and 10%.');}
  catch(error){disableAuto();message(error.message,true);}finally{controlBusy=false;connectionUI();}
};
$('sky').onchange=()=>scene?.setSky($('sky').value);
$('camera').onclick=()=>{if(!scene)return;scene.mode=scene.mode==='side'?'trail':'side';$('camera').textContent=scene.mode==='side'?'Switch to trail camera':'Switch to side camera';};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{message('Fullscreen is unavailable in this browser.');}};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.status==='running')pause('App paused while in the background. Resume when ready. The belt remains under console control.');lastFrame=performance.now();});
window.addEventListener('pagehide',()=>{pause();treadmill.disconnect();wake.release();});
function chart(){
  if(!session)return;const start=Math.floor(session.distance/3000)*3000;let line='';
  for(let i=0;i<=150;i++){const grade=gradeAt(session.profile,start+i*20);line+=`${i?'L':'M'}${i*4},${70-grade*5.5} `;}
  $('chart-line').setAttribute('d',line);$('chart-area').setAttribute('d',line+'L600,75 L0,75 Z');
  const marker=(session.distance-start)/3000*600;$('chart-marker').setAttribute('x1',marker);$('chart-marker').setAttribute('x2',marker);
  $('chart-start').textContent=`${start/1000} km`;$('chart-end').textContent=`${start/1000+3} km`;
  $('profile-caption').textContent=session.demo?'PLANNED GRADE · DEMO':auto?'PLANNED GRADE · AUTO':'PLANNED GRADE · REFERENCE';
}
function updateUI(){
  connectionUI();if(!session)return;const data=metrics(),speed=data.speed;
  $('run-kind').textContent=session.demo?'DEMO RUN · SIMULATED DATA':auto?'LIVE RUN · AUTO INCLINE':'LIVE RUN · FOLLOW TREADMILL';
  $('route-name').textContent=names[session.profile];$('run-status').textContent={ready:'Ready when you are',running:'One step closer to higher ground.',paused:'Paused · resume when you’re ready.',finished:'Trail complete. Take a breath.'}[session.status];
  $('speed').textContent=Number.isFinite(speed)?(speed*3.6).toFixed(1):'—';$('pace').textContent=speed>0?timeText(1000/speed):'—';$('grade').textContent=Number.isFinite(data.grade)?data.grade.toFixed(1):'—';
  $('distance').textContent=(session.distance/1000).toFixed(2);$('ascent').textContent=Math.round(session.ascent);$('elapsed').textContent=timeText(session.elapsed);$('duration').textContent=timeText(session.duration);
  $('pause').textContent=session.status==='running'?'Pause run Ⅱ':session.status==='finished'?'Run complete ✓':'Resume run ▷';$('pause').disabled=session.status==='finished';chart();
}
async function control(now,data){
  if(!auto||controlBusy||!session||session.status!=='running'||now-lastControl<5000)return;
  if(!Number.isFinite(data.grade)){disableAuto();message('Incline telemetry is missing. Automatic incline turned off.',true);return;}
  const target=gradeAt(session.profile,session.distance),bytes=inclinationCommand(target,treadmill.range),key=Array.from(bytes).join(',');
  if(lastTarget===key)return;
  controlBusy=true;lastControl=now;
  try{await treadmill.setIncline(target);if(auto)lastTarget=key;}catch(error){pause('Incline control failed: '+error.message+' Check the console before resuming.');treadmill.disconnect();connectionUI();}finally{controlBusy=false;}
}
function frame(now){
  const gap=(now-lastFrame)/1000;lastFrame=now;const visible=!$('hud').hidden;
  if(visible&&session?.status==='running'&&gap>2)pause('App paused after an interruption. Resume when ready.');
  let data=metrics(now);
  if(visible&&session?.status==='running'){
    if(!session.demo&&(!received.speed?session.elapsed>5:now-received.speed>5000))pause('Belt-speed data is stale. App paused; check the console and connection.');
    else{session.tick(gap,data);if(session.status==='finished'){disableAuto();wake.setActive(false);message('Trail complete. Stop the belt on your console and export from Run tools.',true);}else control(now,data);}
  }
  if(!visible)previewDistance+=Math.min(gap,.05)*.7;
  if(available)scene?.render({distance:visible?session.distance:previewDistance,grade:visible?(data.grade??0):4,speed:visible?(data.speed??0):0,dt:Math.min(gap,.1),running:visible&&session.status==='running',preview:!visible});
  if(now-lastUI>200){updateUI();lastUI=now;}requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
