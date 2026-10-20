// Standard Bluetooth Heart Rate Service / Heart Rate Measurement.
export function parseHeartRate(value) {
  if (value.byteLength < 2) throw new Error('Incomplete heart-rate measurement.');
  const flags = value.getUint8(0), wide = !!(flags & 1);
  if (wide && value.byteLength < 3) throw new Error('Incomplete 16-bit heart-rate measurement.');
  const bpm = wide ? value.getUint16(1, true) : value.getUint8(1);
  const contactLost = !!(flags & 4) && !(flags & 2);
  return { hr: contactLost || bpm === 0 || bpm === 0xffff ? null : bpm };
}
export class HeartRateMonitor {
  constructor({ onMetrics = () => {}, onDisconnect = () => {} } = {}) {
    Object.assign(this, { onMetrics, onDisconnect });
    this.device = null;
    this.characteristic = null;
  }
  get connected() { return !!this.device?.gatt.connected; }
  async connect() {
    if (!navigator.bluetooth || !globalThis.isSecureContext)
      throw new Error('Heart rate requires HTTPS or localhost and a browser with Web Bluetooth.');
    this.disconnect();
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [0x180d] }] });
    this.device = device;
    this.onLost = () => {
      if (this.device !== device) return;
      this.disconnect();
      this.onDisconnect();
    };
    device.addEventListener('gattserverdisconnected', this.onLost);
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(0x180d);
      this.characteristic = await service.getCharacteristic(0x2a37);
      this.onValue = event => {
        if (this.device !== device) return;
        try { this.onMetrics(parseHeartRate(event.target.value)); }
        catch { this.onMetrics({ hr: null }); }
      };
      this.characteristic.addEventListener('characteristicvaluechanged', this.onValue);
      await this.characteristic.startNotifications();
      return device.name || 'Heart-rate monitor';
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }
  disconnect() {
    const device = this.device;
    this.device = null;
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onValue);
    device?.removeEventListener('gattserverdisconnected', this.onLost);
    this.characteristic = null;
    device?.gatt.disconnect();
  }
}
export function currentHeartRate(now, sensor, treadmill) {
  for (const [source, reading] of [['monitor', sensor], ['treadmill', treadmill]]) {
    if (reading && Number.isFinite(reading.hr) && reading.hr > 0 && now - reading.received < 5000)
      return { hr: reading.hr, source };
  }
  return { hr: null, source: null };
}
