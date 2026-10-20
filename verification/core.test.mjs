import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTreadmill,parseInclineRange,inclinationCommand,Treadmill} from '../js/ble.js';
import {FTMSControl} from '../js/ftms-control.js';
import {RunSession,gradeAt} from '../js/workout.js';
import {toTCX} from '../js/tcx.js';
function view(bytes){return new DataView(Uint8Array.from(bytes).buffer);}
test('FTMS parses speed, average speed, 24-bit distance, signed incline and optional heart rate',()=>{
 const data=parseTreadmill(view([0x0e,1,0x84,3,0x20,3,0x56,0x34,0x12,0xe7,0xff,0,0,142]));
 assert.equal(data.speed,2.5);assert.equal(data.totalDistance,0x123456);assert.equal(data.grade,-2.5);assert.equal(data.hr,142);
});
test('FTMS more-data packet does not invent a speed reading',()=>assert.deepEqual(parseTreadmill(view([9,0,50,0,0,0])),{grade:5}));
test('FTMS rejects truncated optional fields without publishing partial measurements',()=>assert.throws(()=>parseTreadmill(view([8,0,0x84,3,30])),/Truncated/));
test('incline uses treadmill opcode and supported range and step',()=>{
 const range=parseInclineRange(view([0,0,150,0,5,0]));
 assert.deepEqual([...inclinationCommand(3.3,range)],[3,35,0]);
 assert.deepEqual([...inclinationCommand(30,range)],[3,100,0]);assert.deepEqual([...inclinationCommand(-10,range)],[3,0,0]);
 assert.throws(()=>parseInclineRange(view([0,0,100,0,0,0])),/Invalid/);
 assert.deepEqual([...inclinationCommand(10,{min:-.3,max:12,step:.5})],[3,97,0]);
});
class Characteristic extends EventTarget {
 constructor(result=1){super();this.result=result;this.writes=[];}
 async writeValueWithResponse(bytes){this.writes.push([...bytes]);if(this.result===null)return;queueMicrotask(()=>{const e=new Event('characteristicvaluechanged');this.value=view([0x80,bytes[0],this.result]);this.dispatchEvent(e);});}
}
test('FTMS waits for control-point acknowledgement and serializes writes',async()=>{
 const c=new Characteristic(),control=new FTMSControl(c,100);await Promise.all([control.send(Uint8Array.of(0)),control.send(Uint8Array.of(3,20,0))]);assert.deepEqual(c.writes,[[0],[3,20,0]]);control.dispose();
});
test('FTMS negative acknowledgements and timeouts fail visibly',async()=>{
 const denied=new FTMSControl(new Characteristic(5),50);await assert.rejects(denied.send(Uint8Array.of(0)),/lost/);denied.dispose();
 const timeout=new FTMSControl(new Characteristic(null),10);await assert.rejects(timeout.send(Uint8Array.of(3,0,0)),/timed out/);await assert.rejects(timeout.send(Uint8Array.of(0)),/reconnection/);timeout.dispose();
});
test('disabling queued incline cancels unsent commands',async()=>{const c=new Characteristic(),control=new FTMSControl(c,100);const pending=control.send(Uint8Array.of(3,10,0));control.cancelQueued();await assert.rejects(pending,/cancelled/);assert.equal(c.writes.length,0);control.dispose();});
test('session integrates actual belt speed and grade, pauses and finishes exactly',()=>{
 const s=new RunSession({minutes:1});s.start();s.tick(10,{speed:2,grade:5});assert.equal(s.distance,20);assert.equal(s.ascent,1);s.pause();s.tick(20,{speed:10,grade:10});assert.equal(s.elapsed,10);s.start();s.tick(100,{speed:2,grade:0});assert.equal(s.elapsed,60);assert.equal(s.distance,120);assert.equal(s.status,'finished');
});
test('missing speed creates no invented distance or records',()=>{const s=new RunSession();s.start();s.tick(3,{speed:null,grade:null});assert.equal(s.distance,0);assert.equal(s.records.length,0);});
test('profiles stay within incline envelope and TCX labels demo data',()=>{
 for(const profile of ['ridge','summit','meadow','repeats'])for(let d=0;d<30000;d+=13)assert.ok(gradeAt(profile,d)>=0&&gradeAt(profile,d)<=10);
 const s=new RunSession({demo:true});s.start();s.tick(1,{speed:2.5,grade:5});const xml=toTCX(s);assert.match(xml,/Sport="Running"/);assert.match(xml,/DEMO: simulated/);assert.doesNotMatch(xml,/<Position>|<AltitudeMeters>/);
});
