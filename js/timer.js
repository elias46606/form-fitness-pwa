/* FORM — timer.js — HIIT-Intervall-Timer. */
import { renderHeute } from './heute.js';
import { K, clamp, getExerciseById, getProfile, loadJSON, round, saveJSON, todayKey, uid } from './storage.js';
import { renderWorkoutHistory } from './training.js';

  /* ==========================================================================
     HIIT-INTERVALL-TIMER
     ========================================================================== */

  export const MET_HIIT = 8;
  export let intervalState = null;
  export let wakeLockObj = null;
  export let audioCtx = null;

  export function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audioCtx = null;
      }
    }
    return audioCtx;
  }

  export function beep(freq, durationMs, volume) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = volume || 0.2;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  }

  export async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockObj = await navigator.wakeLock.request('screen');
    } catch (e) {
      wakeLockObj = null;
    }
  }

  export function releaseWakeLock() {
    if (wakeLockObj) {
      wakeLockObj.release().catch(() => {});
      wakeLockObj = null;
    }
  }

  export function onIntervalVisibilityChange() {
    if (!intervalState) return;
    if (document.visibilityState === 'visible') {
      if (!intervalState.paused) requestWakeLock();
      intervalTick();
    }
  }

  export function currentExerciseForRound(round) {
    const list = intervalState.cfg.uebungen;
    return list[(round - 1) % list.length];
  }

  export function startIntervalWorkout(plan, day) {
    const cfg = day.intervall;
    intervalState = {
      planId: plan.id,
      planName: plan.name,
      dayLabel: day.label,
      cfg,
      phase: 'prep',
      round: 1,
      phaseDurationSec: cfg.vorbereitungszeit,
      phaseEndTime: Date.now() + cfg.vorbereitungszeit * 1000,
      paused: false,
      pausedRemainingMs: 0,
      beeped: new Set(),
      startedAt: Date.now(),
    };
    document.getElementById('interval-timer').classList.remove('hidden');
    document.getElementById('interval-actions').innerHTML = `
      <button class="btn btn-ghost" id="interval-pause">Pause</button>
      <button class="btn btn-ghost" id="interval-cancel-btn">Abbrechen</button>
    `;
    document.getElementById('interval-pause').addEventListener('click', toggleIntervalPause);
    document.getElementById('interval-cancel-btn').addEventListener('click', cancelIntervalWorkout);
    document.addEventListener('visibilitychange', onIntervalVisibilityChange);
    requestWakeLock();
    intervalTick();
    intervalState.tickHandle = setInterval(intervalTick, 200);
  }

  export function toggleIntervalPause() {
    if (!intervalState) return;
    const btn = document.getElementById('interval-pause');
    if (intervalState.paused) {
      intervalState.phaseEndTime = Date.now() + intervalState.pausedRemainingMs;
      intervalState.paused = false;
      btn.textContent = 'Pause';
      requestWakeLock();
    } else {
      intervalState.pausedRemainingMs = Math.max(0, intervalState.phaseEndTime - Date.now());
      intervalState.paused = true;
      btn.textContent = 'Weiter';
    }
  }

  export function cancelIntervalWorkout() {
    if (!confirm('Intervall-Training abbrechen?')) return;
    stopIntervalTimerResources();
    document.getElementById('interval-timer').classList.add('hidden');
    intervalState = null;
  }

  export function stopIntervalTimerResources() {
    if (intervalState && intervalState.tickHandle) clearInterval(intervalState.tickHandle);
    document.removeEventListener('visibilitychange', onIntervalVisibilityChange);
    releaseWakeLock();
  }

  export function intervalTick() {
    if (!intervalState || intervalState.paused) return;
    let remainingMs = intervalState.phaseEndTime - Date.now();
    while (remainingMs <= 0 && intervalState && intervalState.phase !== 'done') {
      advanceIntervalPhase();
      if (!intervalState) return;
      remainingMs = intervalState.phaseEndTime - Date.now();
    }
    if (!intervalState || intervalState.phase === 'done') return;
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    updateIntervalDisplay(remainingSec);
    handleIntervalBeeps(remainingSec);
  }

  export function advanceIntervalPhase() {
    const cfg = intervalState.cfg;
    const prevEndTime = intervalState.phaseEndTime;
    intervalState.beeped = new Set();
    beep(440, 300, 0.25);
    if (navigator.vibrate) navigator.vibrate(200);

    if (intervalState.phase === 'prep') {
      intervalState.phase = 'work';
      intervalState.phaseDurationSec = cfg.arbeitszeit;
    } else if (intervalState.phase === 'work') {
      if (intervalState.round >= cfg.runden) {
        intervalState.phase = 'done';
        finishIntervalWorkout();
        return;
      }
      intervalState.phase = 'rest';
      intervalState.phaseDurationSec = cfg.pausezeit;
    } else if (intervalState.phase === 'rest') {
      intervalState.round++;
      intervalState.phase = 'work';
      intervalState.phaseDurationSec = cfg.arbeitszeit;
    }
    intervalState.phaseEndTime = prevEndTime + intervalState.phaseDurationSec * 1000;
  }

  export function handleIntervalBeeps(remainingSec) {
    if (remainingSec > 3 || remainingSec < 1) return;
    const key = `${intervalState.phase}-${intervalState.round}-${remainingSec}`;
    if (intervalState.beeped.has(key)) return;
    intervalState.beeped.add(key);
    beep(880, 100, 0.15);
    if (navigator.vibrate) navigator.vibrate(40);
  }

  export function updateIntervalDisplay(remainingSec) {
    const el = document.getElementById('interval-timer');
    el.classList.remove('phase-work', 'phase-rest', 'phase-prep');
    el.classList.add('phase-' + intervalState.phase);

    const phaseLabels = { prep: 'BEREIT', work: 'ARBEIT', rest: 'PAUSE' };
    document.getElementById('interval-phase-label').textContent = phaseLabels[intervalState.phase] || '';
    document.getElementById('interval-countdown').textContent = remainingSec;
    document.getElementById('interval-round-label').textContent = `RUNDE ${intervalState.round}/${intervalState.cfg.runden}`;

    const totalRounds = intervalState.cfg.runden;
    const completedFraction = (intervalState.round - 1 + (intervalState.phase === 'rest' ? 0.5 : 0)) / totalRounds;
    document.getElementById('interval-progress-fill').style.width = `${clamp(completedFraction * 100, 0, 100)}%`;

    let currentLabel = '';
    let nextExId = null;
    if (intervalState.phase === 'prep') {
      currentLabel = 'Gleich geht\'s los';
      nextExId = currentExerciseForRound(1);
    } else if (intervalState.phase === 'work') {
      const currentEx = getExerciseById(currentExerciseForRound(intervalState.round));
      currentLabel = currentEx ? currentEx.name : '';
      nextExId = intervalState.round < totalRounds ? currentExerciseForRound(intervalState.round + 1) : null;
    } else if (intervalState.phase === 'rest') {
      currentLabel = '';
      nextExId = currentExerciseForRound(intervalState.round + 1);
    }
    document.getElementById('interval-exercise-current').textContent = currentLabel;
    const nextEx = nextExId ? getExerciseById(nextExId) : null;
    document.getElementById('interval-exercise-next').textContent = nextEx ? `ALS NÄCHSTES: ${nextEx.name.toUpperCase()}` : '';
  }

  export function finishIntervalWorkout() {
    const cfg = intervalState.cfg;
    const durationSec = cfg.vorbereitungszeit + cfg.runden * cfg.arbeitszeit + (cfg.runden - 1) * cfg.pausezeit;
    const profile = getProfile();
    const weightKg = profile ? profile.weight : 75;
    const estimatedBurn = round(MET_HIIT * weightKg * (durationSec / 3600));

    const entry = {
      id: uid(),
      date: todayKey(),
      planId: intervalState.planId,
      planName: intervalState.planName,
      dayLabel: intervalState.dayLabel,
      type: 'intervall',
      exercises: [],
      volume: 0,
      estimatedBurn,
      durationSec,
    };
    const history = loadJSON(K.history, []);
    history.push(entry);
    saveJSON(K.history, history);

    stopIntervalTimerResources();
    showIntervalCompletion(estimatedBurn);
  }

  export function showIntervalCompletion(estimatedBurn) {
    const el = document.getElementById('interval-timer');
    el.classList.remove('phase-work', 'phase-rest', 'phase-prep');
    document.getElementById('interval-phase-label').textContent = 'GESCHAFFT';
    document.getElementById('interval-countdown').textContent = '✓';
    document.getElementById('interval-progress-fill').style.width = '100%';
    document.getElementById('interval-exercise-current').textContent = `≈ ${estimatedBurn} KCAL VERBRANNT`;
    document.getElementById('interval-exercise-next').textContent = '';
    document.getElementById('interval-actions').innerHTML = `<button class="btn btn-primary" id="interval-done" style="flex:1;">Fertig</button>`;
    document.getElementById('interval-done').addEventListener('click', () => {
      el.classList.add('hidden');
      intervalState = null;
      renderHeute();
      if (document.querySelector('.subtab.active')?.dataset.subtab === 'verlauf') renderWorkoutHistory();
    });
  }

  export function initIntervalHandlers() {
    document.getElementById('interval-close').addEventListener('click', () => {
      if (!intervalState) {
        document.getElementById('interval-timer').classList.add('hidden');
        return;
      }
      cancelIntervalWorkout();
    });
  }
