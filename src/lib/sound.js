// src/lib/sound.js
//
// Small Web Audio helpers — no audio file/asset needed, works without any
// extra permissions. Extracted from TimerCard.jsx's original inline
// playChime() so the same "the timer/something finished" sound can be
// reused by the achievement-unlock popup and the subject-timer's
// between-subject transition, instead of three slightly-different copies
// drifting apart.

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return Ctx ? new Ctx() : null;
}

function playTone(ctx, startTime, freq, peakGain, duration = 0.4) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

// The Study Timer's completion chime — a 3-note rising alert. Also used
// as-is for each subject-to-subject transition in the Subject Timer, per
// the spec's "play the same completion sound used for the full timer".
export function playTimerCompleteChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return null;
    const now = ctx.currentTime;
    playTone(ctx, now, 880, 0.8);
    playTone(ctx, now + 0.22, 880, 0.8);
    playTone(ctx, now + 0.44, 1175, 0.85, 0.45);
    setTimeout(() => { try { ctx.close(); } catch { /* already closed */ } }, 900);
    return ctx;
  } catch {
    return null;
  }
}

// A brighter, shorter two-note "ding" for achievement unlocks — distinct
// from the timer chime so the two notifications don't sound identical.
export function playAchievementUnlockChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return null;
    const now = ctx.currentTime;
    playTone(ctx, now, 1046.5, 0.7, 0.25); // C6
    playTone(ctx, now + 0.13, 1318.5, 0.75, 0.35); // E6
    setTimeout(() => { try { ctx.close(); } catch { /* already closed */ } }, 700);
    return ctx;
  } catch {
    return null;
  }
}
