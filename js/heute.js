/* FORM — heute.js — Dashboard-Tab: Kalorien-/Makro-Übersicht, Wasser, Streak, Trainingskarte. */
import { maybeShowReviewBanner } from './review.js';
import { GLASS_ML, K, MONTH_NAMES, WATER_GOAL_ML, WEEKDAY_NAMES, addDays, clamp, dateKey, getActivePlanObj, getDay, getDays, getProfile, loadJSON, round, saveDay, todayKey } from './storage.js';
import { startWorkout } from './training.js';
import { showToast } from './ui.js';

  /* ==========================================================================
     HEUTE
     ========================================================================== */

  export function computeStreak() {
    const days = getDays();
    let streak = 0;
    let cursor = new Date();
    let key = dateKey(cursor);
    if (!days[key] || days[key].calories.length === 0) {
      cursor = addDays(cursor, -1);
      key = dateKey(cursor);
    }
    while (days[key] && days[key].calories.length > 0) {
      streak++;
      cursor = addDays(cursor, -1);
      key = dateKey(cursor);
    }
    return streak;
  }

  export function todaysWorkoutInfo() {
    const ap = getActivePlanObj();
    if (!ap) return null;
    const weekday = new Date().getDay();
    const dayIndex = ap.active.assignments ? ap.active.assignments[weekday] : undefined;
    if (dayIndex === undefined || dayIndex === null || dayIndex === '') return { plan: ap.plan, day: null };
    return { plan: ap.plan, day: ap.plan.days[dayIndex] };
  }

  export function renderHeute() {
    const profile = getProfile();
    if (!profile) return;
    const day = getDay(todayKey());
    const now = new Date();

    document.getElementById('heute-date').innerHTML =
      `${WEEKDAY_NAMES[now.getDay()]}<br><span class="fat">${now.getDate()}. ${MONTH_NAMES[now.getMonth()]}</span>`;

    maybeShowReviewBanner();

    const streak = computeStreak();
    document.getElementById('streak-bar').textContent = `${streak} ${streak === 1 ? 'TAG' : 'TAGE'} IN FOLGE`;

    const eaten = day.calories.reduce((s, i) => s + i.kcal, 0);
    const stepsBurn = round((day.steps || 0) * 0.04);
    const todaysHistory = loadJSON(K.history, []).filter((h) => h.date === todayKey());
    const strengthBonus = todaysHistory.some((h) => h.type !== 'intervall') ? 250 : 0;
    const intervalBurn = todaysHistory.filter((h) => h.type === 'intervall').reduce((s, h) => s + (h.estimatedBurn || 0), 0);
    const burned = stepsBurn + strengthBonus + intervalBurn;
    const goal = profile.calorieGoal;
    const remaining = goal + burned - eaten;

    document.getElementById('calorie-summary').innerHTML = `
      <span class="big-num">${round(eaten)}</span><span class="of">GEGESSEN</span>
    `;
    document.getElementById('calorie-legend').innerHTML = `
      <span>ZIEL ${round(goal)}</span>
      <span>VERBRANNT ${round(burned)}</span>
      <span>ÜBRIG ${round(remaining)}</span>
    `;
    const pct = clamp((eaten / goal) * 100, 0, 100);
    const fill = document.getElementById('calorie-bar-fill');
    fill.style.width = pct + '%';
    fill.classList.toggle('over', eaten > goal);

    const macros = day.calories.reduce(
      (acc, i) => {
        acc.protein += i.protein;
        acc.carbs += i.carbs;
        acc.fat += i.fat;
        return acc;
      },
      { protein: 0, carbs: 0, fat: 0 }
    );

    document.getElementById('macro-bars').innerHTML = ['protein', 'carbs', 'fat']
      .map((key) => {
        const labels = { protein: 'PROTEIN', carbs: 'KOHLENHYDRATE', fat: 'FETT' };
        const goalKeys = { protein: 'proteinGoal', carbs: 'carbGoal', fat: 'fatGoal' };
        const goalVal = profile[goalKeys[key]];
        const val = macros[key];
        const pct2 = clamp((val / goalVal) * 100, 0, 100);
        return `
          <div class="macro-row">
            <div class="macro-row-head">
              <span>${labels[key]}</span>
              <span class="val">${round(val)}G / ${round(goalVal)}G</span>
            </div>
            <div class="macro-bar-track"><div class="macro-bar-fill" style="width:${pct2}%"></div></div>
          </div>
        `;
      })
      .join('');

    renderWaterTracker(day);

    document.getElementById('steps-input').value = day.steps || '';

    const twInfo = todaysWorkoutInfo();
    const container = document.getElementById('today-workout');
    if (!twInfo) {
      container.innerHTML = `<p class="sub">Kein Trainingsplan aktiv. Wähle einen Plan unter TRAINING.</p>`;
    } else if (!twInfo.day) {
      container.innerHTML = `<p class="sub">Heute ist Ruhetag. Gönn dir die Erholung.</p>`;
    } else {
      container.innerHTML = `
        <div class="plan-name">${twInfo.day.label}</div>
        <div class="plan-subtitle">${twInfo.plan.name} · ${formatDaySummaryLine(twInfo.day)}</div>
        <button class="btn btn-primary btn-full" id="btn-start-today-workout">Training starten</button>
      `;
      document.getElementById('btn-start-today-workout').addEventListener('click', () => {
        startWorkout(twInfo.plan, twInfo.day);
      });
    }
  }

  export function formatDaySummaryLine(day) {
    if (day.type === 'intervall' && day.intervall) {
      return `${day.intervall.runden} RUNDEN × ${day.intervall.arbeitszeit}S ARBEIT / ${day.intervall.pausezeit}S PAUSE`;
    }
    return `${day.exercises.length} Übungen`;
  }

  export function renderWaterTracker(day) {
    const totalGlasses = Math.round(WATER_GOAL_ML / GLASS_ML);
    const filled = day.water || 0;
    const el = document.getElementById('water-tracker');
    let html = '';
    for (let i = 1; i <= totalGlasses; i++) {
      html += `<button class="water-glass ${i <= filled ? 'filled' : ''}" data-idx="${i}">${i * GLASS_ML >= 1000 ? (i * GLASS_ML / 1000).toFixed(2).replace(/0$/, '') + 'L' : i * GLASS_ML + 'ML'}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.water-glass').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const d = getDay(todayKey());
        d.water = d.water === idx ? idx - 1 : idx;
        saveDay(todayKey(), d);
        renderWaterTracker(d);
      });
    });
  }

  export function initHeuteHandlers() {
    document.getElementById('steps-save').addEventListener('click', () => {
      const val = parseInt(document.getElementById('steps-input').value, 10) || 0;
      const d = getDay(todayKey());
      d.steps = val;
      saveDay(todayKey(), d);
      showToast('Schritte gespeichert.');
      renderHeute();
    });
  }