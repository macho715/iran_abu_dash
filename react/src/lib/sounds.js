let sharedAudioContext = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioContext) sharedAudioContext = new Ctx();
  return sharedAudioContext;
}

export function playBeep(count = 1, freq = 880, duration = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  for (let i = 0; i < count; i += 1) {
    const startAt = ctx.currentTime + i * 0.25;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.start(startAt);
    osc.stop(startAt + duration);
  }
  return true;
}

export function alertSound() {
  return playBeep(3, 1000, 0.2);
}

export function warnSound() {
  return playBeep(1, 660, 0.15);
}
