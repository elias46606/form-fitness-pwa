/* FORM — ui.js — UI-Schicht: Navigation, Modal, Onboarding, Bootstrap/Init. */
import { initFortschrittHandlers, renderFortschritt } from './fortschritt.js';
import { initHeuteHandlers, renderHeute } from './heute.js';
import { initKalorienHandlers, renderKalorien } from './kalorien.js';
import { initProfilHandlers, renderProfil } from './profil.js';
import { initWeekReviewHandlers } from './review.js';
import { initRecipeHandlers } from './rezepte.js';
import { initScannerHandlers } from './scanner.js';
import { K, calcGoals, getProfile, loadJSON, migrateLegacyStorageKeys, saveJSON, todayKey } from './storage.js';
import { initIntervalHandlers } from './timer.js';
import { initTrainingHandlers, initWorkoutModeHandlers, renderExerciseBrowser, renderTrainingPlaene, renderWorkoutHistory } from './training.js';

  export let toastTimer = null;
  export function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  /* ==========================================================================
     Onboarding
     ========================================================================== */

  export let obState = { gender: null, activity: null, goal: null, step: 1 };

  export function initOnboarding() {
    const genderGroup = document.getElementById('ob-gender');
    const activityGroup = document.getElementById('ob-activity');
    const goalGroup = document.getElementById('ob-goal');

    genderGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...genderGroup.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      obState.gender = btn.dataset.value;
    });

    activityGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...activityGroup.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      obState.activity = btn.dataset.value;
    });

    goalGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...goalGroup.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      obState.goal = btn.dataset.value;
    });

    document.getElementById('ob-next').addEventListener('click', () => {
      const age = document.getElementById('ob-age').value;
      const height = document.getElementById('ob-height').value;
      const weight = document.getElementById('ob-weight').value;
      if (!age || !height || !weight || !obState.gender) {
        showToast('Bitte alle Felder ausfüllen.');
        return;
      }
      document.querySelector('.ob-step[data-step="1"]').classList.add('hidden');
      document.querySelector('.ob-step[data-step="2"]').classList.remove('hidden');
      document.getElementById('ob-back').classList.remove('hidden');
      document.getElementById('ob-next').classList.add('hidden');
      document.getElementById('ob-submit').classList.remove('hidden');
    });

    document.getElementById('ob-back').addEventListener('click', () => {
      document.querySelector('.ob-step[data-step="2"]').classList.add('hidden');
      document.querySelector('.ob-step[data-step="1"]').classList.remove('hidden');
      document.getElementById('ob-back').classList.add('hidden');
      document.getElementById('ob-next').classList.remove('hidden');
      document.getElementById('ob-submit').classList.add('hidden');
    });

    document.getElementById('onboarding-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!obState.activity || !obState.goal) {
        showToast('Bitte Aktivitätslevel und Ziel wählen.');
        return;
      }
      const profile = {
        age: parseInt(document.getElementById('ob-age').value, 10),
        gender: obState.gender,
        height: parseFloat(document.getElementById('ob-height').value),
        weight: parseFloat(document.getElementById('ob-weight').value),
        activity: obState.activity,
        goal: obState.goal,
        createdAt: Date.now(),
      };
      const goals = calcGoals(profile);
      Object.assign(profile, goals);
      saveJSON(K.profile, profile);

      const weightLog = loadJSON(K.weightLog, []);
      weightLog.push({ date: todayKey(), weight: profile.weight });
      saveJSON(K.weightLog, weightLog);

      document.getElementById('onboarding').classList.add('hidden');
      bootstrapApp();
    });
  }

  /* ==========================================================================
     Navigation
     ========================================================================== */

  export function initNav() {
    document.getElementById('bottom-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      switchView(btn.dataset.view);
    });

    document.getElementById('training-subtabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.subtab');
      if (!btn) return;
      switchTrainingSubtab(btn.dataset.subtab);
    });
  }

  export function switchView(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    renderView(view);
  }

  export function switchTrainingSubtab(tab) {
    document.querySelectorAll('#training-subtabs .subtab').forEach((s) => s.classList.toggle('active', s.dataset.subtab === tab));
    document.querySelectorAll('#view-training .training-panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'training-' + tab));
    if (tab === 'plaene') renderTrainingPlaene();
    if (tab === 'uebungen') renderExerciseBrowser();
    if (tab === 'verlauf') renderWorkoutHistory();
  }

  export function renderView(view) {
    if (view === 'heute') renderHeute();
    if (view === 'kalorien') renderKalorien();
    if (view === 'training') switchTrainingSubtab(document.querySelector('#training-subtabs .subtab.active').dataset.subtab);
    if (view === 'fortschritt') renderFortschritt();
    if (view === 'profil') renderProfil();
  }
  /* ==========================================================================
     Modal (generisch)
     ========================================================================== */

  export function openModal(titleHtml, bodyHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-sheet" id="modal-sheet">
          <div class="modal-head">
            <div class="modal-title">${titleHtml}</div>
            <button class="btn-close" id="modal-close">✕</button>
          </div>
          <div id="modal-body">${bodyHtml}</div>
        </div>
      </div>
    `;
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
    return document.getElementById('modal-body');
  }

  export function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }
  /* ==========================================================================
     Mitternachts-Check
     ========================================================================== */

  export let lastKnownDateKey = todayKey();
  export function startMidnightWatcher() {
    setInterval(() => {
      const key = todayKey();
      if (key !== lastKnownDateKey) {
        lastKnownDateKey = key;
        const activeView = document.querySelector('.view.active')?.dataset.view;
        if (activeView) renderView(activeView);
      }
    }, 30000);
  }

  /* ==========================================================================
     Bootstrap
     ========================================================================== */

  export function bootstrapApp() {
    renderHeute();
    renderProfil();
    startMidnightWatcher();
  }

  document.addEventListener('DOMContentLoaded', () => {
    migrateLegacyStorageKeys();
    initOnboarding();
    initNav();
    initHeuteHandlers();
    initKalorienHandlers();
    initScannerHandlers();
    initRecipeHandlers();
    initTrainingHandlers();
    initIntervalHandlers();
    initWorkoutModeHandlers();
    initFortschrittHandlers();
    initWeekReviewHandlers();
    initProfilHandlers();

    const profile = getProfile();
    if (!profile) {
      document.getElementById('onboarding').classList.remove('hidden');
    } else {
      bootstrapApp();
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  });