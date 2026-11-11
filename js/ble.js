import { FTMSControl } from './ftms-control.js';
export function parseTreadmill(value) {
  if (value.byteLength < 2) throw new Error('Incomplete treadmill flags.');
  const flags = value.getUint16(0,true); let at = 2; const result = {};
  const take = (n) => { if (at + n > value.byteLength) throw new Error('Truncated treadmill data.'); const start = at; at += n; return start; };
  if (!(flags & 1)) result.speed = value.getUint16(take(2),true) / 360;
  if (flags & 2) take(2);
  if (flags & 4) { const p = take(3); result.totalDistance = value.getUint8(p) | value.getUint8(p+1)<<8 | value.getUint8(p+2)<<16; }
  if (flags & 8) { const p = take(4); result.grade = value.getInt16(p,true) / 10; }
  if (flags & 16) take(4);
  if (flags & 32) take(1);
  if (flags & 64) take(1);
  if (flags & 128) take(5);
  if (flags & 256) result.hr = value.getUint8(take(1));
  if (flags & 512) take(1);
  if (flags & 1024) take(2);
  if (flags & 2048) take(2);
  if (flags & 4096) take(4);
  return result;
}
export function parseInclineRange(value) {
  if (value.byteLength < 6) throw new Error('Incomplete incline range.');
  const range = {min:value.getInt16(0,true)/10, max:value.getInt16(2,true)/10, step:value.getUint16(4,true)/10};
  if (range.step <= 0 || range.min > range.max || range.min < -100 || range.max > 100) throw new Error('Invalid incline range.');
  return range;
}
export function inclinationCommand(grade, range) {
  if (!Number.isFinite(grade) || !range || ![range.min, range.max, range.step].every(Number.isFinite) || range.step <= 0 || range.min > range.max) throw new Error('Invalid incline target.');
  // F85 envelope, further bounded by the connected machine's advertised range.
  const lower = Math.max(-6,range.min), upper = Math.min(15,range.max);
  const first = Math.ceil((lower-range.min)/range.step - 1e-8), last = Math.floor((upper-range.min)/range.step + 1e-8);
  if (first > last) throw new Error('No supported incline in the app range.');
  const step = Math.max(first,Math.min(last,Math.round((grade-range.min)/range.step)));
  const bytes = new Uint8Array(3); bytes[0] = 3;
  new DataView(bytes.buffer).setInt16(1,Math.round((range.min + step*range.step)*10),true);
  return bytes;
}
export function validateWorkoutIncline(workout, range) {
  if (!workout) return;
  for (const phase of workout.phases) {
    const bytes = inclinationCommand(phase.grade, range);
    const applied = new DataView(bytes.buffer).getInt16(1, true) / 10;
    if (Math.abs(applied - phase.grade) > 0.051)
      throw new Error(`${phase.name} grade ${phase.grade}% is not supported by this treadmill (range ${range.min}% to ${range.max}%, step ${range.step}%). Edit the workout or follow it manually.`);
  }
}
export class Treadmill {
  constructor({onMetrics=()=>{}, onDisconnect=()=>{}, onDiagnostics=()=>{}}={}) {
    Object.assign(this,{onMetrics,onDisconnect,onDiagnostics}); this.device=null; this.control=null; this.canIncline=false;
  }
  get connected() { return !!this.device?.gatt.connected; }
  async connect() {
    if (!navigator.bluetooth || !globalThis.isSecureContext) throw new Error('Use HTTPS or localhost in Chrome / Edge with Web Bluetooth. iOS Safari is not supported.');
    this.disconnect();
    const device = await navigator.bluetooth.requestDevice({filters:[{services:[0x1826]},{namePrefix:'SOLE'},{namePrefix:'Sole'},{namePrefix:'F85'}],optionalServices:[0x1826]});
    this.device=device;
    device.addEventListener('gattserverdisconnected',()=>{if(this.device!==device)return;this.control?.dispose();this.control=null;this.canIncline=false;this.onDisconnect();});
    try {
      const server=await device.gatt.connect(), service=await server.getPrimaryService(0x1826);
      const features=await (await service.getCharacteristic(0x2acc)).readValue();
      if(features.byteLength<8)throw new Error('Incomplete FTMS capabilities.');
      const targets=features.getUint32(4,true); this.canIncline=false;
      const report={device:device.name || 'FTMS treadmill',protocol:'Bluetooth FTMS',machineFeatures:'0x'+features.getUint32(0,true).toString(16),targetFeatures:'0x'+targets.toString(16),inclineControl:'Not advertised',firmware:'User supplied: Sole F85 2.1 (not verified by device)'};
      if(targets & 2) {
        try {
          this.range=parseInclineRange(await (await service.getCharacteristic(0x2ad5)).readValue());
          const characteristic=await service.getCharacteristic(0x2ad9);
          this.control=new FTMSControl(characteristic); await characteristic.startNotifications();
          this.canIncline=true; report.inclineControl='Available; opt in to request control';report.range=this.range;
        } catch(error) { this.control?.dispose();this.control=null; report.inclineControl='Unavailable: '+error.message; }
      }
      const data=await service.getCharacteristic(0x2acd);
      data.addEventListener('characteristicvaluechanged',event=>{try{this.onMetrics(parseTreadmill(event.target.value));}catch(error){this.onDiagnostics({...report,dataError:error.message});}});
      await data.startNotifications(); this.onDiagnostics(report);return device.name || 'FTMS treadmill';
    } catch(error) {
      this.disconnect();throw new Error(`Could not read FTMS treadmill data: ${error.message} Some F85 revisions use a proprietary Sole protocol; a compatible FTMS bridge may be needed.`);
    }
  }
  async enableIncline() {
    if(!this.connected || !this.canIncline)throw new Error('This connection does not offer FTMS incline control.');
    await this.control.send(new Uint8Array([0]));
  }
  async setIncline(grade) {
    if(!this.connected || !this.canIncline)throw new Error('Incline control disconnected.');
    await this.control.send(inclinationCommand(grade,this.range));
  }
  disconnect() { this.control?.dispose();this.control=null;this.canIncline=false;const d=this.device;this.device=null;d?.gatt.disconnect(); }
}
