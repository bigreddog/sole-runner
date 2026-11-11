import { RunSession, createTimedWorkout, gradeAt, timeText } from './workout.js';
import { Treadmill, inclinationCommand, validateWorkoutIncline } from './ble.js';
import { TrailScene } from './scene.js';
import { ScreenWakeLock } from './wake-lock.js';
import { downloadTCX } from './tcx.js';
import { HeartRateMonitor, currentHeartRate } from './heart-rate.js';
const $=id=>document.getElementById(id);
let session=null,scene=null,available=true,busy=false,auto=false,controlBusy=false,lastTarget=null,lastControl=0,lastFrame=performance.now(),lastUI=0,previewDistance=0;
const telemetry={},received={};let noticeTimer;
let sensorHR={hr:null,received:0},hrBusy=false,hrName=null;
const heartRate=new HeartRateMonitor({onMetrics:({hr})=>{sensorHR={hr,received:performance.now()};},onDisconnect:()=>{sensorHR={hr:null,received:0};hrName=null;message('Heart-rate monitor disconnected. Treadmill HR will be used if available.');updateUI();}});
const names={ridge:'Alpine ridge',meadow:'Pine meadow',summit:'Summit approach',repeats:'Switchback repeats'};
const wake=new ScreenWakeLock({navigator,document,onStatus:text=>$('wake-status').textContent=text});
function message(text,sticky=false){clearTimeout(noticeTimer);$('message').textContent=text;$('message').hidden=false;if(!sticky)noticeTimer=setTimeout(()=>$('message').hidden=true,7000);}
function disableAuto(){auto=false;$('auto-incline').checked=false;lastTarget=null;treadmill.control?.cancelQueued();}
function pause(reason){session?.pause();disableAuto();wake.setActive(false);if(reason)message(reason,true);updateUI();}
function graphicsError(text){available=false;document.body.classList.add('scene-error');pause(text);$('live').disabled=true;}
const treadmill=new Treadmill({onMetrics:data=>{if(session?.demo&&!$('hud').hidden)return;Object.assign(telemetry,data);for(const key of Object.keys(data))received[key]=performance.now();},onDisconnect:()=>{pause('Treadmill disconnected. The app is paused. Use the console for belt control, reconnect, then resume.');connectionUI();},onDiagnostics:report=>$('diagnostics').textContent=JSON.stringify(report,null,2)});
try{scene=new TrailScene($('scene'),graphicsError);}catch{graphicsError('3D requires WebGL. Enable hardware acceleration or try another browser.');}
function metrics(now=performance.now()){
  const hr=currentHeartRate(now,sensorHR,session?.demo&&!$('hud').hidden?null:{hr:telemetry.hr,received:received.hr??-Infinity});
  if(session?.demo&&!$('hud').hidden)return {speed:$('demo-speed').valueAsNumber/3.6,grade:session.targetGrade,...hr};
  return {...Object.fromEntries(['speed','grade'].map(k=>[k,received[k]&&now-received[k]<5000?telemetry[k]:null])),...hr};
}
function connectionUI(){const connected=treadmill.connected;$('connection').textContent=connected?'● Treadmill connected':'○ Treadmill offline';$('live').disabled=!connected||!available||busy;$('connect').textContent=connected?'Reconnect treadmill':'Connect treadmill via Bluetooth';$('auto-incline').disabled=!connected||!treadmill.canIncline||!!session?.demo||session?.status!=='running';
$('setup-auto').disabled=!connected||!treadmill.canIncline||busy;
$('incline-help').textContent=connected&&treadmill.canIncline?`Treadmill supports ${treadmill.range.min}% to ${treadmill.range.max}% in ${treadmill.range.step}% steps. Automatic mode checks every timed phase before starting.`:'Connect a treadmill to enable automatic incline, or follow the targets manually.';}
async function connect(){if(busy)return;pause();busy=true;connectionUI();try{const name=await treadmill.connect();$('device-detail').textContent=`${name} · ${treadmill.canIncline?'optional incline control available':'read-only telemetry'}`;message('Connected. Start the belt on your console, then start or resume your run.');}catch(error){message(error.message,true);}finally{busy=false;connectionUI();}}
$('connect').onclick=connect;$('reconnect').onclick=connect;
async function connectHR(){
  if(hrBusy)return;
  if(session?.status==='running')pause();
  hrBusy=true;sensorHR={hr:null,received:0};hrName=null;updateUI();
  try{hrName=await heartRate.connect();message(`Connected to ${hrName}. Heart rate will appear when readings arrive.${session?.status==='paused'?' Resume your run when ready.':''}`);}
  catch(error){message(error.message,true);}finally{hrBusy=false;updateUI();}
}
$('connect-hr').onclick=connectHR;$('reconnect-hr').onclick=connectHR;
$('disconnect-hr').onclick=()=>{heartRate.disconnect();sensorHR={hr:null,received:0};hrName=null;updateUI();};
function readOptions(demo = false) {
  const minutes = $('minutes').valueAsNumber;
  const workout = $('training-mode').value === 'timed' ? createTimedWorkout({
    minutes,
    warmupMinutes: $('warmup-minutes').valueAsNumber,
    warmupGrade: $('warmup-grade').valueAsNumber,
    sustainedGrade: $('sustained-grade').valueAsNumber,
    cooldownMinutes: $('cooldown-minutes').valueAsNumber,
    cooldownGrade: $('cooldown-grade').valueAsNumber,
  }) : null;
  return { minutes, workout, profile: $('profile').value, demo };
}
function previewPlan() {
  const timed = $('training-mode').value === 'timed';
  $('timed-settings').hidden = !timed; $('timed-settings').disabled = !timed;
  $('trail-settings').hidden = timed; $('profile').disabled = timed;
  $('minutes').setCustomValidity('');
  try {
    const options = readOptions();
    $('sustained-minutes').textContent = options.workout?.phases.find(p => p.name === 'Sustained').minutes ?? '—';
    $('plan-summary').textContent = options.workout
      ? options.workout.phases.map(p => `${p.minutes} min at ${p.grade}%`).join(' → ')
      : 'Trail grade varies with distance. Choose a timed workout to hold a fixed grade.';
    $('plan-summary').classList.remove('error');
  } catch (error) {
    $('sustained-minutes').textContent = '—';
    $('plan-summary').textContent = error.message; $('plan-summary').classList.add('error');
    $('minutes').setCustomValidity(error.message);
  }
}
$('run-form').addEventListener('input', previewPlan);
$('training-mode').addEventListener('change', previewPlan);
async function begin(demo){
  if(busy)return;
  previewPlan();
  if(!$('run-form').reportValidity()||!available)return;
  if(!demo&&!treadmill.connected){message('Connect your treadmill first.');return;}
  const options = readOptions(demo), next = new RunSession(options);
  const shouldAuto = !demo && $('setup-auto').checked;
  busy=true;connectionUI();$('demo').disabled=true;
  try {
    disableAuto();
    if(shouldAuto){
      if(!treadmill.canIncline)throw new Error('This treadmill does not offer automatic incline.');
      validateWorkoutIncline(next.workout,treadmill.range);
      if(!Number.isFinite(telemetry.grade)||performance.now()-(received.grade??-Infinity)>=5000)throw new Error('Wait for a fresh treadmill incline reading before starting automatic control.');
      await treadmill.enableIncline();
      await treadmill.setIncline(next.targetGrade);
    }
    if(demo)treadmill.disconnect();
    session=next;
    auto=shouldAuto;$('auto-incline').checked=auto;
    lastControl=performance.now();
    lastTarget=auto?Array.from(inclinationCommand(session.targetGrade,treadmill.range)).join(','):null;
    document.body.classList.add('running');$('setup').hidden=true;$('hud').hidden=false;$('tools').close();$('message').hidden=true;
    session.start();lastFrame=performance.now();wake.setActive(true);chart();updateUI();
    if(!demo)message(auto?'Workout incline control active. Belt speed and stop remain on the console.':'Run started in manual incline mode. Follow the phase targets on your console or enable automatic incline in Run tools.');
  } catch(error) {
    disableAuto();
    if(shouldAuto)treadmill.disconnect();
    message(error.message,true);
  } finally { busy=false;$('demo').disabled=false;connectionUI(); }
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
  try{validateWorkoutIncline(activeSession.workout,treadmill.range);await treadmill.enableIncline();if(activeSession!==session||session.status!=='running'||!$('auto-incline').checked)return;auto=true;lastTarget=null;lastControl=-Infinity;message('Automatic incline enabled within the treadmill’s supported range.');}
  catch(error){disableAuto();message(error.message,true);}finally{controlBusy=false;connectionUI();}
};
$('sky').onchange=()=>scene?.setSky($('sky').value);
$('camera').onclick=()=>{if(!scene)return;scene.mode=scene.mode==='side'?'trail':'side';$('camera').textContent=scene.mode==='side'?'Switch to trail camera':'Switch to side camera';};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{message('Fullscreen is unavailable in this browser.');}};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.status==='running')pause('App paused while in the background. Resume when ready. The belt remains under console control.');lastFrame=performance.now();});
window.addEventListener('pagehide',()=>{pause();treadmill.disconnect();heartRate.disconnect();wake.release();});
function chart(){
  if(!session)return;
  let line='', marker, startLabel, endLabel;
  const y = grade => 70 - (grade + 6) / 21 * 65;
  if(session.workout){
    for(const [i,p] of session.workout.phases.entries()){
      line+=`${i?'L':'M'}${p.start/session.duration*600},${y(p.grade)} L${p.end/session.duration*600},${y(p.grade)} `;
    }
    marker=session.elapsed/session.duration*600;startLabel='0 min';endLabel=`${session.duration/60} min`;
    $('profile-chart').setAttribute('aria-label','Planned grade by active workout time');
  }else{
    const start=Math.floor(session.distance/3000)*3000;
    for(let i=0;i<=150;i++){
      line+=`${i?'L':'M'}${i*4},${y(gradeAt(session.profile,start+i*20))} `;
    }
    marker=(session.distance-start)/3000*600;startLabel=`${start/1000} km`;endLabel=`${start/1000+3} km`;
    $('profile-chart').setAttribute('aria-label','Planned grade over the next three kilometres');
  }
  $('chart-line').setAttribute('d',line);$('chart-area').setAttribute('d',line+'L600,75 L0,75 Z');
  $('chart-marker').setAttribute('x1',marker);$('chart-marker').setAttribute('x2',marker);
  $('chart-start').textContent=startLabel;$('chart-end').textContent=endLabel;
  $('profile-caption').textContent=session.demo?'PLANNED GRADE · DEMO':auto?'PLANNED GRADE · AUTO':'PLANNED GRADE · MANUAL';
}
function updateUI(){
  connectionUI();const data=metrics(),speed=data.speed;
  for(const id of ['connect-hr','reconnect-hr']){$(id).disabled=hrBusy;$(id).textContent=hrBusy?'Connecting heart-rate monitor…':heartRate.connected?'Reconnect heart-rate monitor':'Connect heart-rate monitor';}
  $('disconnect-hr').hidden=!heartRate.connected;
  $('hr-device-detail').textContent=heartRate.connected?`${hrName||'Heart-rate monitor'} · ${data.source==='monitor'?'receiving HR':'waiting for a fresh HR reading'}`:data.source==='treadmill'?'Receiving heart rate from treadmill.':'HR uses treadmill data or an optional Bluetooth monitor.';
  $('hr').textContent=Number.isFinite(data.hr)?Math.round(data.hr):'—';
  $('hr').title=data.source==='monitor'?'Bluetooth heart-rate monitor':data.source==='treadmill'?'Treadmill heart rate':'No fresh heart-rate reading';
  if(!session)return;
  $('run-kind').textContent=session.demo?'DEMO RUN · SIMULATED DATA':auto?'LIVE RUN · AUTO INCLINE':'LIVE RUN · FOLLOW TREADMILL';
  $('route-name').textContent=session.workout?'Sustained grade':names[session.profile];$('run-status').textContent={ready:'Ready when you are',running:'One step closer to higher ground.',paused:'Paused · resume when you’re ready.',finished:'Trail complete. Take a breath.'}[session.status];
  $('phase-status').textContent=session.phase?`${session.phase.name} · target ${session.targetGrade}% · ${timeText(Math.max(0,session.phase.end-session.elapsed))} left in phase`:'';
  $('speed').textContent=Number.isFinite(speed)?(speed*3.6).toFixed(1):'—';$('pace').textContent=speed>0?timeText(1000/speed):'—';$('grade').textContent=Number.isFinite(data.grade)?data.grade.toFixed(1):'—';
  $('distance').textContent=(session.distance/1000).toFixed(2);$('ascent').textContent=Math.round(session.ascent);$('elapsed').textContent=timeText(session.elapsed);$('duration').textContent=timeText(session.duration);
  $('pause').textContent=session.status==='running'?'Pause run Ⅱ':session.status==='finished'?'Run complete ✓':'Resume run ▷';$('pause').disabled=session.status==='finished';chart();
}
async function control(now,data){
  if(!auto||controlBusy||!session||session.status!=='running'||now-lastControl<5000)return;
  if(!Number.isFinite(data.grade)){disableAuto();message('Incline telemetry is missing. Automatic incline turned off.',true);return;}
  const target=session.targetGrade,bytes=inclinationCommand(target,treadmill.range),key=Array.from(bytes).join(',');
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
previewPlan();
requestAnimationFrame(frame);
