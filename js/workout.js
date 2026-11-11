export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function gradeAt(profile, distance) {
  const wave = (period) => (1 - Math.cos(distance / period * Math.PI * 2)) / 2;
  switch (profile) {
    case 'ridge': return 2 + 6 * wave(1400);
    case 'summit': return Math.min(10, 1 + distance / 300);
    case 'repeats': return 1 + 8 * wave(600) ** 2;
    default: return 1 + 2 * wave(1000);
  }
}
export function profileElevation(profile, distance) {
  let elevation = 0;
  for (let x = 0; x < distance; x += 10) elevation += gradeAt(profile, x + Math.min(10, distance - x) / 2) / 100 * Math.min(10, distance - x);
  return elevation;
}
export const timeText = (s) => `${Math.floor(s / 60).toString().padStart(2,'0')}:${Math.floor(s % 60).toString().padStart(2,'0')}`;
export function createTimedWorkout({ minutes = 45, warmupMinutes = 5, warmupGrade = 0, sustainedGrade = 10, cooldownMinutes = 5, cooldownGrade = -5 } = {}) {
  if (![minutes, warmupMinutes, cooldownMinutes].every(Number.isFinite) ||
      minutes < 5 || minutes > 180 || warmupMinutes < 0 || cooldownMinutes < 0 ||
      ![minutes, warmupMinutes, cooldownMinutes].every(Number.isInteger))
    throw new Error('Use whole minutes: total 5–180; warm-up and cool-down zero or more.');
  if (![warmupGrade, sustainedGrade, cooldownGrade].every(g => Number.isFinite(g) && g >= -6 && g <= 15))
    throw new Error('Choose grades between −6% and 15%.');
  const sustainedMinutes = minutes - warmupMinutes - cooldownMinutes;
  if (sustainedMinutes <= 0) throw new Error('Warm-up and cool-down must leave at least one minute for the sustained phase.');
  let start = 0;
  const phases = [
    { name: 'Warm-up', minutes: warmupMinutes, grade: warmupGrade },
    { name: 'Sustained', minutes: sustainedMinutes, grade: sustainedGrade },
    { name: 'Cool-down', minutes: cooldownMinutes, grade: cooldownGrade },
  ].filter(p => p.minutes > 0).map(p => {
    const phase = { ...p, start, end: start + p.minutes * 60 };
    start = phase.end;
    return Object.freeze(phase);
  });
  return Object.freeze({ duration: minutes * 60, phases: Object.freeze(phases) });
}
export function phaseAt(workout, elapsed) {
  const seconds = clamp(elapsed, 0, workout.duration);
  return workout.phases.find(p => seconds < p.end) ?? workout.phases.at(-1);
}
export class RunSession {
  constructor({ minutes = 30, profile = 'ridge', demo = false, workout = null } = {}) {
    this.workout = workout; this.duration = workout?.duration ?? minutes * 60; this.profile = profile; this.demo = demo;
    this.elapsed = 0; this.distance = 0; this.elevation = 0; this.ascent = 0;
    this.status = 'ready'; this.records = []; this.lastRecord = -1; this.started = new Date();
  }
  get phase() { return this.workout ? phaseAt(this.workout, this.elapsed) : null; }
  get targetGrade() { return this.phase?.grade ?? gradeAt(this.profile, this.distance); }
  start() { if (this.status !== 'finished') this.status = 'running'; }
  pause() { if (this.status === 'running') this.status = 'paused'; }
  finish() { this.status = 'finished'; }
  tick(dt, { speed, grade, hr } = {}) {
    if (this.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, this.duration - this.elapsed);
    this.elapsed += dt;
    if (Number.isFinite(speed) && speed >= 0) {
      const metres = speed * dt; this.distance += metres;
      if (Number.isFinite(grade)) {
        const up = metres * grade / 100; this.elevation += up; this.ascent += Math.max(0,up);
      }
      if (Math.floor(this.elapsed) !== this.lastRecord) {
        this.records.push({seconds:this.elapsed, distance:this.distance, speed, grade, hr, elevation:this.elevation});
        this.lastRecord = Math.floor(this.elapsed);
      }
    }
    if (this.elapsed >= this.duration) this.finish();
  }
}
