/* FORM — review.js — Wochen-Review-Berechnung und -Ansicht. */
import { computeStreak } from './heute.js';
import { K, addDays, dateKey, getDay, getDays, getExerciseById, getProfile, loadJSON, round, round10, saveJSON } from './storage.js';
import { getExercisePRBaseline, isNewPR } from './training.js';

  /* ==========================================================================
     WOCHEN-REVIEW
     ========================================================================== */

  export function getISOWeekInfo(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
  }

  export function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  export function getWeekDateKeys(monday) {
    return Array.from({ length: 7 }, (_, i) => dateKey(addDays(monday, i)));
  }

  export function formatWeekRange(monday, sunday) {
    const fmt = (d) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
    return `${fmt(monday)} – ${fmt(sunday)}${sunday.getFullYear()}`;
  }

  export function listCompletedWeeks(count) {
    const thisMonday = getMondayOfWeek(new Date());
    const weeks = [];
    for (let i = 1; i <= count; i++) {
      const monday = addDays(thisMonday, -7 * i);
      const sunday = addDays(monday, 6);
      const info = getISOWeekInfo(monday);
      weeks.push({ monday, sunday, year: info.year, week: info.week });
    }
    return weeks;
  }

  export function computeWeekReview(monday, sunday) {
    const dateKeys = getWeekDateKeys(monday);
    const days = getDays();
    const profile = getProfile();
    const history = loadJSON(K.history, []);
    const weightLog = loadJSON(K.weightLog, []);
    const prevMonday = addDays(monday, -7);
    const prevDateKeys = getWeekDateKeys(prevMonday);

    const loggedDays = dateKeys
      .map((k) => ({ key: k, day: days[k] }))
      .filter((x) => x.day && x.day.calories.length > 0)
      .map((x) => ({
        key: x.key,
        kcal: x.day.calories.reduce((s, i) => s + i.kcal, 0),
        protein: x.day.calories.reduce((s, i) => s + i.protein, 0),
      }));

    const avgKcal = loggedDays.length ? loggedDays.reduce((s, d) => s + d.kcal, 0) / loggedDays.length : 0;
    const daysInGoal = loggedDays.filter((d) => Math.abs(d.kcal - profile.calorieGoal) <= 100).length;
    let bestDay = null;
    let worstDay = null;
    if (loggedDays.length) {
      bestDay = loggedDays.reduce((a, b) => (Math.abs(a.kcal - profile.calorieGoal) <= Math.abs(b.kcal - profile.calorieGoal) ? a : b));
      worstDay = loggedDays.reduce((a, b) => (Math.abs(a.kcal - profile.calorieGoal) >= Math.abs(b.kcal - profile.calorieGoal) ? a : b));
    }

    const avgProtein = loggedDays.length ? loggedDays.reduce((s, d) => s + d.protein, 0) / loggedDays.length : 0;
    const proteinQuotePct = profile.proteinGoal ? round((avgProtein / profile.proteinGoal) * 100) : 0;
    const proteinDaysHit = loggedDays.filter((d) => d.protein >= profile.proteinGoal * 0.9).length;

    const weekWorkouts = history.filter((h) => dateKeys.includes(h.date));
    const weekVolume = weekWorkouts.reduce((s, h) => s + (h.volume || 0), 0);
    const prevWeekVolume = history.filter((h) => prevDateKeys.includes(h.date)).reduce((s, h) => s + (h.volume || 0), 0);
    const volumeChangePct = prevWeekVolume > 0 ? round(((weekVolume - prevWeekVolume) / prevWeekVolume) * 100) : null;

    const newPRs = [];
    const seenExercises = new Set();
    weekWorkouts.forEach((h) => {
      h.exercises.forEach((ex) => {
        const baseline = getExercisePRBaseline(ex.exerciseId, dateKeys[0]);
        const hasPR = ex.sets.some((s) => isNewPR(s, baseline));
        if (hasPR && !seenExercises.has(ex.exerciseId)) {
          seenExercises.add(ex.exerciseId);
          const exData = getExerciseById(ex.exerciseId);
          newPRs.push(exData ? exData.name : ex.exerciseId);
        }
      });
    });

    const weekWeights = weightLog.filter((w) => dateKeys.includes(w.date)).map((w) => w.weight);
    const prevWeekWeights = weightLog.filter((w) => prevDateKeys.includes(w.date)).map((w) => w.weight);
    const avgWeight = weekWeights.length ? weekWeights.reduce((a, b) => a + b, 0) / weekWeights.length : null;
    const prevAvgWeight = prevWeekWeights.length ? prevWeekWeights.reduce((a, b) => a + b, 0) / prevWeekWeights.length : null;
    const weightDelta = avgWeight !== null && prevAvgWeight !== null ? round10(avgWeight - prevAvgWeight) : null;

    const avgWater = dateKeys.reduce((s, k) => s + (days[k]?.water || 0), 0) / 7;
    const currentStreak = computeStreak();

    let fazit;
    if (loggedDays.length === 0 && weekWorkouts.length === 0) {
      fazit = 'Keine Daten für diese Woche erfasst.';
    } else if (loggedDays.length >= 5 && proteinDaysHit >= 6) {
      fazit = `Protein-Ziel an ${proteinDaysHit} von ${loggedDays.length} geloggten Tagen erreicht — stark.`;
    } else if (volumeChangePct !== null && volumeChangePct < 0 && weightDelta !== null && ((profile.goal === 'abnehmen' && weightDelta < 0) || (profile.goal === 'aufbau' && weightDelta > 0))) {
      fazit = 'Volumen gesunken, aber Gewichtstrend passt zum Ziel.';
    } else if (newPRs.length > 0) {
      fazit = `${newPRs.length} neue${newPRs.length === 1 ? 'r' : ''} Rekord${newPRs.length === 1 ? '' : 'e'} diese Woche — die Arbeit zahlt sich aus.`;
    } else if (daysInGoal >= 5) {
      fazit = `An ${daysInGoal} von ${loggedDays.length} Tagen im Kalorienziel — solide Woche.`;
    } else {
      fazit = 'Durchwachsene Woche — nächste Woche wieder fokussieren.';
    }

    return {
      monday, sunday, dateKeys,
      avgKcal, daysInGoal, loggedDaysCount: loggedDays.length, bestDay, worstDay,
      avgProtein, proteinQuotePct, proteinDaysHit,
      workoutCount: weekWorkouts.length, weekVolume, volumeChangePct, newPRs,
      avgWeight, prevAvgWeight, weightDelta,
      avgWater, currentStreak, fazit,
    };
  }

  export function renderWeekReviewList() {
    const el = document.getElementById('week-review-list');
    const weeks = listCompletedWeeks(8);
    el.innerHTML = weeks
      .map(
        (w) => `
      <div class="week-row" data-monday="${dateKey(w.monday)}">
        <span>KW ${w.week}</span>
        <span class="week-range">${formatWeekRange(w.monday, w.sunday)}</span>
      </div>
    `
      )
      .join('');
    el.querySelectorAll('.week-row').forEach((row) => {
      row.addEventListener('click', () => {
        const monday = new Date(row.dataset.monday);
        openWeekReview(monday, addDays(monday, 6));
      });
    });
  }

  export function openWeekReview(monday, sunday) {
    const r = computeWeekReview(monday, sunday);
    const info = getISOWeekInfo(monday);
    document.getElementById('review-overlay').classList.remove('hidden');
    document.getElementById('review-detail-content').innerHTML = `
      <h1 class="headline">KW ${info.week}</h1>
      <div class="workout-ex-meta">${formatWeekRange(monday, sunday)}</div>
      <div class="review-stat-line">${r.workoutCount} WORKOUTS · Ø ${round(r.avgKcal)} KCAL${r.weightDelta !== null ? ` · ${r.weightDelta >= 0 ? '+' : ''}${r.weightDelta.toFixed(1).replace('.', ',')} KG` : ''}</div>

      <div class="review-section-title">Kalorien</div>
      <div class="review-fact-row"><span>Ø Gegessen vs. Ziel</span><span>${round(r.avgKcal)} / ${getProfile().calorieGoal} KCAL</span></div>
      <div class="review-fact-row"><span>Tage im Ziel (±100 kcal)</span><span>${r.daysInGoal} / ${r.loggedDaysCount || 7}</span></div>
      ${r.bestDay ? `<div class="review-fact-row"><span>Bester Tag</span><span>${r.bestDay.key} · ${round(r.bestDay.kcal)} KCAL</span></div>` : ''}
      ${r.worstDay ? `<div class="review-fact-row"><span>Schwächster Tag</span><span>${r.worstDay.key} · ${round(r.worstDay.kcal)} KCAL</span></div>` : ''}

      <div class="review-section-title">Protein</div>
      <div class="review-fact-row"><span>Ø g/Tag vs. Ziel</span><span>${round(r.avgProtein)} / ${getProfile().proteinGoal} G</span></div>
      <div class="review-fact-row"><span>Quote</span><span>${r.proteinQuotePct}%</span></div>

      <div class="review-section-title">Training</div>
      <div class="review-fact-row"><span>Workouts absolviert</span><span>${r.workoutCount}</span></div>
      <div class="review-fact-row"><span>Gesamtvolumen</span><span>${round(r.weekVolume)} KG</span></div>
      ${r.volumeChangePct !== null ? `<div class="review-fact-row"><span>Vs. Vorwoche</span><span>${r.volumeChangePct >= 0 ? '+' : ''}${r.volumeChangePct}%</span></div>` : ''}
      ${r.newPRs.length > 0 ? `<div class="pr-highlight">${r.newPRs.length} NEUE REKORDE<br>${r.newPRs.join(', ')}</div>` : ''}

      <div class="review-section-title">Gewicht</div>
      ${r.avgWeight !== null
        ? `<div class="review-fact-row"><span>Wochendurchschnitt</span><span>${r.avgWeight.toFixed(1).replace('.', ',')} KG</span></div>
           ${r.weightDelta !== null ? `<div class="review-fact-row"><span>Vs. Vorwoche</span><span>${r.weightDelta >= 0 ? '+' : ''}${r.weightDelta.toFixed(1).replace('.', ',')} KG ${r.weightDelta > 0 ? '↑' : r.weightDelta < 0 ? '↓' : '→'}</span></div>` : ''}`
        : `<div class="review-fact-row"><span>Keine Gewichtsdaten</span><span>–</span></div>`}

      <div class="review-section-title">Wasser & Streak</div>
      <div class="review-fact-row"><span>Ø Gläser/Tag</span><span>${r.avgWater.toFixed(1).replace('.', ',')}</span></div>
      <div class="review-fact-row"><span>Aktuelle Streak</span><span>${r.currentStreak} Tage</span></div>

      <div class="review-fazit">${r.fazit}</div>
    `;
  }

  export function closeWeekReview() {
    document.getElementById('review-overlay').classList.add('hidden');
  }

  export function maybeShowReviewBanner() {
    const banner = document.getElementById('review-banner');
    if (new Date().getDay() !== 1) {
      banner.classList.add('hidden');
      return;
    }
    const weeks = listCompletedWeeks(1);
    if (weeks.length === 0) {
      banner.classList.add('hidden');
      return;
    }
    const lastWeek = weeks[0];
    const weekKey = `${lastWeek.year}-W${lastWeek.week}`;
    if (loadJSON(K.dismissedReviewBanner, null) === weekKey) {
      banner.classList.add('hidden');
      return;
    }
    const dateKeys = getWeekDateKeys(lastWeek.monday);
    const days = getDays();
    const history = loadJSON(K.history, []);
    const hasData = dateKeys.some((k) => (days[k]?.calories?.length > 0) || history.some((h) => h.date === k));
    if (!hasData) {
      banner.classList.add('hidden');
      return;
    }
    document.getElementById('review-banner-text').textContent = `WOCHEN-REVIEW KW ${lastWeek.week} VERFÜGBAR →`;
    banner.dataset.weekKey = weekKey;
    banner.dataset.monday = dateKey(lastWeek.monday);
    banner.classList.remove('hidden');
  }

  export function initWeekReviewHandlers() {
    document.getElementById('review-back').addEventListener('click', closeWeekReview);
    document.getElementById('review-banner').addEventListener('click', (e) => {
      if (e.target.closest('#review-banner-dismiss')) return;
      const banner = document.getElementById('review-banner');
      const monday = new Date(banner.dataset.monday);
      openWeekReview(monday, addDays(monday, 6));
    });
    document.getElementById('review-banner-dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      const banner = document.getElementById('review-banner');
      saveJSON(K.dismissedReviewBanner, banner.dataset.weekKey);
      banner.classList.add('hidden');
    });
  }
