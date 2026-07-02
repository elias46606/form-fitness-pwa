/* FORM — training.js — Training-Tab: Übungsbrowser, Pläne, Workout-Modus, Progressive Overload. */
import { BODYWEIGHT_PROGRESSIONS, EXERCISES, MUSCLE_GROUPS, WORKOUT_PLANS } from '../data.js';
import { formatDaySummaryLine, renderHeute } from './heute.js';
import { K, WEEKDAY_NAMES, WEEKDAY_SHORT, getActivePlanObj, getDay, getExerciseById, getPlanById, loadJSON, round, round10, saveJSON, todayKey, uid } from './storage.js';
import { startIntervalWorkout } from './timer.js';
import { closeModal, openModal, showToast } from './ui.js';

  /* ==========================================================================
     TRAINING — Übungsbrowser
     ========================================================================== */

  export let exerciseFilter = 'Alle';

  export function renderExerciseBrowser() {
    const filterEl = document.getElementById('muscle-filter');
    if (!filterEl.dataset.built) {
      filterEl.innerHTML = ['Alle', ...MUSCLE_GROUPS]
        .map((g) => `<button class="chip ${g === exerciseFilter ? 'active' : ''}" data-group="${g}">${g}</button>`)
        .join('');
      filterEl.dataset.built = '1';
      filterEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        exerciseFilter = btn.dataset.group;
        [...filterEl.children].forEach((c) => c.classList.toggle('active', c === btn));
        renderExerciseList();
      });
    }
    renderExerciseList();

    const searchEl = document.getElementById('exercise-search');
    if (!searchEl.dataset.bound) {
      searchEl.addEventListener('input', renderExerciseList);
      searchEl.dataset.bound = '1';
    }
  }

  export function renderExerciseList() {
    const q = document.getElementById('exercise-search').value.trim().toLowerCase();
    let list = EXERCISES.filter((e) => (exerciseFilter === 'Alle' || e.group === exerciseFilter) && e.name.toLowerCase().includes(q));

    const groups = exerciseFilter === 'Alle' ? MUSCLE_GROUPS : [exerciseFilter];
    let html = '';
    groups.forEach((g) => {
      const inGroup = list.filter((e) => e.group === g);
      if (inGroup.length === 0) return;
      html += `<div class="exercise-group-title">${g}</div>`;
      html += inGroup
        .map(
          (e) => `
        <div class="exercise-card" data-id="${e.id}">
          <div class="exercise-card-head">
            <div>
              <div class="exercise-name">${e.name}</div>
              <div class="exercise-tags">${e.level} · ${e.equipment}</div>
            </div>
            <button class="exercise-toggle" data-id="${e.id}">＋</button>
          </div>
          <div class="exercise-desc">${e.desc}</div>
        </div>
      `
        )
        .join('');
    });
    const listEl = document.getElementById('exercise-list');
    listEl.innerHTML = html || `<p class="sub">Keine Übungen gefunden.</p>`;
    listEl.querySelectorAll('.exercise-card-head').forEach((head) => {
      head.addEventListener('click', () => {
        head.closest('.exercise-card').classList.toggle('open');
      });
    });
  }

  /* ==========================================================================
     TRAINING — Pläne
     ========================================================================== */

  export function defaultAssignments(daysPerWeek) {
    const patterns = {
      1: [1],
      2: [1, 4],
      3: [1, 3, 5],
      4: [1, 2, 4, 5],
      5: [1, 2, 3, 4, 5],
      6: [1, 2, 3, 4, 5, 6],
      7: [1, 2, 3, 4, 5, 6, 0],
    };
    const weekdays = patterns[daysPerWeek] || patterns[3];
    const assignments = {};
    weekdays.forEach((wd, i) => {
      assignments[wd] = i;
    });
    return assignments;
  }

  export function renderTrainingPlaene() {
    const activeEl = document.getElementById('active-plan');
    const ap = getActivePlanObj();
    if (!ap) {
      activeEl.innerHTML = `<p class="sub">Noch kein Plan aktiv. Wähle unten einen Plan.</p>`;
    } else {
      const weekday = new Date().getDay();
      activeEl.innerHTML = `
        <div class="plan-card">
          <div class="plan-card-head">
            <div class="plan-name">${ap.plan.name}</div>
            <div class="plan-level">${ap.plan.level}</div>
          </div>
          <div class="plan-subtitle">${ap.plan.subtitle || ''}</div>
          ${ap.plan.days
            .map((d, i) => {
              const wd = Object.keys(ap.active.assignments).find((k) => ap.active.assignments[k] === i);
              const wdLabel = wd !== undefined ? WEEKDAY_SHORT[wd] : '–';
              const isToday = wd !== undefined && parseInt(wd, 10) === weekday;
              return `
              <div class="day-block">
                <div class="day-block-title">${wdLabel} · ${d.label}${isToday ? ' · HEUTE' : ''}</div>
                ${d.type === 'intervall'
                  ? `<div class="day-ex-row"><span>Intervall</span><span class="reps">${formatDaySummaryLine(d)}</span></div>`
                  : d.exercises.map((ex) => `<div class="day-ex-row"><span>${getExerciseById(ex.exerciseId)?.name || ex.exerciseId}</span><span class="reps">${ex.sets}×${ex.reps}</span></div>`).join('')}
                <button class="btn btn-ghost btn-full btn-small" data-start-day="${i}">Training starten</button>
              </div>
            `;
            })
            .join('')}
          <button class="btn btn-ghost btn-full" id="btn-deactivate-plan">Plan deaktivieren</button>
        </div>
      `;
      activeEl.querySelectorAll('[data-start-day]').forEach((btn) => {
        btn.addEventListener('click', () => startWorkout(ap.plan, ap.plan.days[parseInt(btn.dataset.startDay, 10)]));
      });
      activeEl.querySelector('#btn-deactivate-plan').addEventListener('click', () => {
        localStorage.removeItem(K.activePlan);
        renderTrainingPlaene();
        showToast('Plan deaktiviert.');
      });
    }

    const customPlans = loadJSON(K.customPlans, []);
    const list = [...WORKOUT_PLANS, ...customPlans.map((p) => ({ ...p, isCustom: true }))];
    document.getElementById('plan-list').innerHTML = list
      .map(
        (p) => `
      <div class="plan-card">
        <div class="plan-card-head">
          <div class="plan-name">${p.name}</div>
          <div class="plan-level">${p.level}</div>
        </div>
        <div class="plan-subtitle">${p.subtitle || ''}</div>
        <div class="plan-days-count">${p.daysPerWeek}× PRO WOCHE</div>
        <button class="btn btn-ghost btn-full" data-view-plan="${p.id}" data-custom="${p.isCustom ? '1' : '0'}">Anzeigen & aktivieren</button>
      </div>
    `
      )
      .join('');

    document.getElementById('plan-list').querySelectorAll('[data-view-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const plan = getPlanById(btn.dataset.viewPlan, btn.dataset.custom === '1' ? 'custom' : 'predefined');
        openPlanActivationModal(plan, btn.dataset.custom === '1');
      });
    });
  }

  export function openPlanActivationModal(plan, isCustom) {
    const defaults = defaultAssignments(plan.daysPerWeek);
    const body = openModal(plan.name, `
      <p class="sub">${plan.subtitle || ''}</p>
      ${plan.days
        .map((d, i) => {
          const wd = Object.keys(defaults).find((k) => defaults[k] === i);
          return `
          <div class="day-block">
            <div class="day-block-title">${d.label}</div>
            ${d.type === 'intervall'
              ? `<div class="day-ex-row"><span>Intervall</span><span class="reps">${formatDaySummaryLine(d)}</span></div>`
              : d.exercises.map((ex) => `<div class="day-ex-row"><span>${getExerciseById(ex.exerciseId)?.name || ex.exerciseId}</span><span class="reps">${ex.sets}×${ex.reps}</span></div>`).join('')}
            <div class="field-label">Wochentag</div>
            <select data-day-idx="${i}" class="plan-weekday-select">
              <option value="">Kein Tag</option>
              ${WEEKDAY_NAMES.map((name, wdIdx) => `<option value="${wdIdx}" ${String(wdIdx) === wd ? 'selected' : ''}>${name}</option>`).join('')}
            </select>
          </div>
        `;
        })
        .join('')}
      <button class="btn btn-primary btn-full" id="activate-plan-btn">Plan aktivieren</button>
    `);
    body.querySelector('#activate-plan-btn').addEventListener('click', () => {
      const assignments = {};
      body.querySelectorAll('.plan-weekday-select').forEach((sel) => {
        if (sel.value !== '') assignments[sel.value] = parseInt(sel.dataset.dayIdx, 10);
      });
      saveJSON(K.activePlan, { planId: plan.id, source: isCustom ? 'custom' : 'predefined', assignments });
      closeModal();
      showToast('Plan aktiviert.');
      renderTrainingPlaene();
      renderHeute();
    });
  }

  /* ==========================================================================
     TRAINING — Eigenen Plan erstellen
     ========================================================================== */

  export let planBuilder = { name: '', level: 'Anfänger', days: [] };

  export function initTrainingHandlers() {
    document.getElementById('btn-custom-plan').addEventListener('click', () => {
      planBuilder = { name: '', level: 'Anfänger', days: [] };
      openPlanBuilderModal();
    });
  }

  export function openPlanBuilderModal() {
    const body = openModal('Eigener Plan', `
      <div class="field-label">Name des Plans</div>
      <input type="text" id="pb-name" value="${planBuilder.name}" placeholder="z. B. MEIN SPLIT">
      <div class="field-label">Level</div>
      <div class="chip-group" id="pb-level">
        ${['Anfänger', 'Mittel', 'Fortgeschritten'].map((l) => `<button type="button" class="chip ${l === planBuilder.level ? 'active' : ''}" data-value="${l}">${l}</button>`).join('')}
      </div>
      <div class="hr"></div>
      <div class="field-label">Trainingstage</div>
      <div id="pb-days"></div>
      <button class="btn btn-ghost btn-full" id="pb-add-day">+ Tag hinzufügen</button>
      <div class="hr"></div>
      <button class="btn btn-primary btn-full" id="pb-save">Plan speichern & aktivieren</button>
    `);

    body.querySelector('#pb-name').addEventListener('input', (e) => (planBuilder.name = e.target.value));
    const levelGroup = body.querySelector('#pb-level');
    levelGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...levelGroup.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      planBuilder.level = btn.dataset.value;
    });

    body.querySelector('#pb-add-day').addEventListener('click', () => {
      planBuilder.days.push({
        weekday: '',
        label: `Tag ${planBuilder.days.length + 1}`,
        type: 'kraft',
        exercises: [],
        intervall: { arbeitszeit: 40, pausezeit: 20, runden: 8, vorbereitungszeit: 10, uebungen: [] },
      });
      renderPlanBuilderDays(body);
    });

    body.querySelector('#pb-save').addEventListener('click', () => {
      if (!planBuilder.name.trim()) {
        showToast('Bitte einen Namen für den Plan angeben.');
        return;
      }
      const invalid = planBuilder.days.some((d) =>
        d.type === 'intervall' ? d.intervall.uebungen.length === 0 : d.exercises.length === 0
      );
      if (planBuilder.days.length === 0 || invalid) {
        showToast('Jeder Tag braucht mindestens eine Übung.');
        return;
      }
      const planId = 'custom_' + uid();
      const assignments = {};
      planBuilder.days.forEach((d, i) => {
        if (d.weekday !== '') assignments[d.weekday] = i;
      });
      const plan = {
        id: planId,
        name: planBuilder.name.trim().toUpperCase(),
        subtitle: 'Eigener Plan',
        level: planBuilder.level,
        daysPerWeek: planBuilder.days.length,
        days: planBuilder.days.map((d) =>
          d.type === 'intervall'
            ? { day: d.label, label: d.label, type: 'intervall', exercises: [], intervall: d.intervall }
            : { day: d.label, label: d.label, exercises: d.exercises }
        ),
      };
      const customPlans = loadJSON(K.customPlans, []);
      customPlans.push(plan);
      saveJSON(K.customPlans, customPlans);
      saveJSON(K.activePlan, { planId, source: 'custom', assignments });
      closeModal();
      showToast('Plan gespeichert und aktiviert.');
      renderTrainingPlaene();
      renderHeute();
    });

    renderPlanBuilderDays(body);
  }

  export function renderPlanBuilderDays(body) {
    const el = body.querySelector('#pb-days');
    el.innerHTML = planBuilder.days
      .map(
        (d, dIdx) => `
      <div class="day-block">
        <div class="field-label">Tag-Bezeichnung</div>
        <input type="text" class="pb-day-label" data-idx="${dIdx}" value="${d.label}">
        <div class="field-label">Wochentag</div>
        <select class="pb-day-weekday" data-idx="${dIdx}">
          <option value="">Kein Tag</option>
          ${WEEKDAY_NAMES.map((name, wdIdx) => `<option value="${wdIdx}" ${String(wdIdx) === String(d.weekday) ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
        <div class="field-label">Typ</div>
        <div class="chip-group pb-day-type" data-idx="${dIdx}">
          <button type="button" class="chip ${d.type === 'kraft' ? 'active' : ''}" data-value="kraft">Kraft</button>
          <button type="button" class="chip ${d.type === 'intervall' ? 'active' : ''}" data-value="intervall">Intervall</button>
        </div>
        ${d.type === 'intervall' ? renderIntervallDayFields(d, dIdx) : renderKraftDayFields(d, dIdx)}
        <button class="btn btn-ghost btn-full btn-small" data-remove-day="${dIdx}" style="margin-top:6px;">Tag entfernen</button>
      </div>
    `
      )
      .join('');

    el.querySelectorAll('.pb-day-label').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        planBuilder.days[parseInt(e.target.dataset.idx, 10)].label = e.target.value;
      });
    });
    el.querySelectorAll('.pb-day-weekday').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        planBuilder.days[parseInt(e.target.dataset.idx, 10)].weekday = e.target.value;
      });
    });
    el.querySelectorAll('.pb-day-type').forEach((group) => {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        planBuilder.days[parseInt(group.dataset.idx, 10)].type = btn.dataset.value;
        renderPlanBuilderDays(body);
      });
    });
    el.querySelectorAll('[data-add-ex]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dIdx = parseInt(btn.dataset.addEx, 10);
        const select = el.querySelector(`.pb-ex-select[data-idx="${dIdx}"]`);
        const setsInp = el.querySelector(`.pb-ex-sets[data-idx="${dIdx}"]`);
        const repsInp = el.querySelector(`.pb-ex-reps[data-idx="${dIdx}"]`);
        planBuilder.days[dIdx].exercises.push({
          exerciseId: select.value,
          sets: parseInt(setsInp.value, 10) || 3,
          reps: repsInp.value || '12',
        });
        renderPlanBuilderDays(body);
      });
    });
    el.querySelectorAll('[data-remove-ex]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [dIdx, exIdx] = btn.dataset.removeEx.split(':').map(Number);
        planBuilder.days[dIdx].exercises.splice(exIdx, 1);
        renderPlanBuilderDays(body);
      });
    });
    el.querySelectorAll('.pb-intervall-field').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const dIdx = parseInt(e.target.dataset.idx, 10);
        const field = e.target.dataset.field;
        planBuilder.days[dIdx].intervall[field] = parseInt(e.target.value, 10) || 0;
      });
    });
    el.querySelectorAll('[data-add-interval-ex]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dIdx = parseInt(btn.dataset.addIntervalEx, 10);
        const select = el.querySelector(`.pb-interval-ex-select[data-idx="${dIdx}"]`);
        planBuilder.days[dIdx].intervall.uebungen.push(select.value);
        renderPlanBuilderDays(body);
      });
    });
    el.querySelectorAll('[data-remove-interval-ex]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [dIdx, exIdx] = btn.dataset.removeIntervalEx.split(':').map(Number);
        planBuilder.days[dIdx].intervall.uebungen.splice(exIdx, 1);
        renderPlanBuilderDays(body);
      });
    });
    el.querySelectorAll('[data-remove-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        planBuilder.days.splice(parseInt(btn.dataset.removeDay, 10), 1);
        renderPlanBuilderDays(body);
      });
    });
  }

  export function renderKraftDayFields(d, dIdx) {
    return `
      <div class="field-label">Übungen</div>
      ${d.exercises
        .map(
          (ex, exIdx) => `
        <div class="day-ex-row">
          <span>${getExerciseById(ex.exerciseId)?.name || ex.exerciseId} — ${ex.sets}×${ex.reps}</span>
          <button class="meal-item-del" data-remove-ex="${dIdx}:${exIdx}">✕</button>
        </div>
      `
        )
        .join('')}
      <div class="steps-row" style="margin-top:8px;">
        <select class="pb-ex-select" data-idx="${dIdx}" style="flex:2;">
          ${EXERCISES.map((e) => `<option value="${e.id}">${e.name}</option>`).join('')}
        </select>
        <input type="text" class="pb-ex-sets" data-idx="${dIdx}" placeholder="Sätze" value="3" style="flex:1;">
        <input type="text" class="pb-ex-reps" data-idx="${dIdx}" placeholder="Wdh" value="12" style="flex:1;">
      </div>
      <button class="btn btn-ghost btn-full btn-small" data-add-ex="${dIdx}">+ Übung hinzufügen</button>
    `;
  }

  export function renderIntervallDayFields(d, dIdx) {
    const cfg = d.intervall;
    return `
      <div class="steps-row">
        <div style="flex:1;">
          <div class="field-label">Arbeit (S)</div>
          <input type="number" class="pb-intervall-field" data-idx="${dIdx}" data-field="arbeitszeit" value="${cfg.arbeitszeit}">
        </div>
        <div style="flex:1;">
          <div class="field-label">Pause (S)</div>
          <input type="number" class="pb-intervall-field" data-idx="${dIdx}" data-field="pausezeit" value="${cfg.pausezeit}">
        </div>
      </div>
      <div class="steps-row">
        <div style="flex:1;">
          <div class="field-label">Runden</div>
          <input type="number" class="pb-intervall-field" data-idx="${dIdx}" data-field="runden" value="${cfg.runden}">
        </div>
        <div style="flex:1;">
          <div class="field-label">Vorbereitung (S)</div>
          <input type="number" class="pb-intervall-field" data-idx="${dIdx}" data-field="vorbereitungszeit" value="${cfg.vorbereitungszeit}">
        </div>
      </div>
      <div class="field-label">Übungsreihenfolge</div>
      ${cfg.uebungen
        .map(
          (exId, exIdx) => `
        <div class="day-ex-row">
          <span>${exIdx + 1}. ${getExerciseById(exId)?.name || exId}</span>
          <button class="meal-item-del" data-remove-interval-ex="${dIdx}:${exIdx}">✕</button>
        </div>
      `
        )
        .join('')}
      <div class="steps-row" style="margin-top:8px;">
        <select class="pb-interval-ex-select" data-idx="${dIdx}" style="flex:1;">
          ${EXERCISES.filter((e) => e.group === 'Cardio' || e.group === 'Core').map((e) => `<option value="${e.id}">${e.name}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-ghost btn-full btn-small" data-add-interval-ex="${dIdx}">+ Übung hinzufügen</button>
    `;
  }

  /* ==========================================================================
     TRAINING — Verlauf
     ========================================================================== */

  export function renderWorkoutHistory() {
    const history = loadJSON(K.history, []).slice().sort((a, b) => b.date.localeCompare(a.date));
    const el = document.getElementById('workout-history');
    if (history.length === 0) {
      el.innerHTML = `<p class="empty-state">Noch keine Workouts abgeschlossen.</p>`;
      return;
    }
    el.innerHTML = history
      .map(
        (h) => `
      <div class="history-row">
        <div>
          <div class="history-date">${h.date}</div>
          <div class="history-plan">${h.planName} · ${h.dayLabel}</div>
        </div>
        <div class="history-volume">${h.type === 'intervall' ? `${h.estimatedBurn || 0} KCAL<br>VERBRANNT` : `${round(h.volume)} KG<br>VOLUMEN`}</div>
      </div>
    `
      )
      .join('');
  }

  /* ==========================================================================
     WORKOUT-MODUS
     ========================================================================== */

  export let workoutState = null;
  export let restTimer = null;
  export let restSeconds = 90;

  /* ---------- Progressive Overload ---------- */

  export function getExerciseHistoryEntries(exerciseId, beforeDate) {
    const history = loadJSON(K.history, []);
    return history
      .filter((h) => h.exercises.some((e) => e.exerciseId === exerciseId) && (!beforeDate || h.date < beforeDate))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  export function getLastExercisePerformance(exerciseId) {
    const entries = getExerciseHistoryEntries(exerciseId);
    if (entries.length === 0) return null;
    const exData = entries[0].exercises.find((e) => e.exerciseId === exerciseId);
    if (!exData || !exData.sets || exData.sets.length === 0) return null;
    return { date: entries[0].date, sets: exData.sets, targetReps: exData.targetReps || null };
  }

  export function parseRepRange(repsStr) {
    if (!repsStr) return null;
    const str = String(repsStr).trim();
    if (/s$/i.test(str)) return null;
    const range = str.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) return { min: parseInt(range[1], 10), max: parseInt(range[2], 10) };
    const n = parseInt(str, 10);
    if (!isNaN(n)) return { min: n, max: n };
    return null;
  }

  export function formatLastPerformance(last) {
    if (!last) return null;
    const first = last.sets[0];
    return `${last.sets.length}×${first.reps}${first.weight ? ' · ' + first.weight + 'KG' : ''}`;
  }

  export function computeSuggestion(exerciseId, planTargetReps) {
    const last = getLastExercisePerformance(exerciseId);
    if (!last) return null;
    const isBodyweight = (getExerciseById(exerciseId) || {}).equipment === 'Körpergewicht';
    const first = last.sets[0];

    if (isBodyweight && BODYWEIGHT_PROGRESSIONS[exerciseId] && last.sets.length >= 3 && last.sets.every((s) => s.reps >= 15)) {
      const nextId = BODYWEIGHT_PROGRESSIONS[exerciseId];
      const nextEx = getExerciseById(nextId);
      const range = parseRepRange(planTargetReps);
      return { type: 'progression', message: `Nächste Stufe: ${nextEx ? nextEx.name : nextId}`, nextExerciseId: nextId, suggestedReps: range ? range.min : 8, suggestedWeight: 0 };
    }

    const range = parseRepRange(last.targetReps || planTargetReps);
    if (!range) {
      return { type: 'repeat', message: 'Gleiche Werte wie letztes Mal', suggestedReps: first.reps, suggestedWeight: first.weight };
    }

    const allHitTarget = last.sets.every((s) => s.reps >= range.max);
    if (allHitTarget) {
      if (range.max > range.min) {
        if (!isBodyweight) {
          const lastWeight = first.weight || 0;
          return { type: 'weight', message: `Gewicht +2,5KG · ${range.min} Wdh`, suggestedReps: range.min, suggestedWeight: lastWeight > 0 ? round10(lastWeight + 2.5) : 2.5 };
        }
        return { type: 'weight', message: `Schwerere Variante · ${range.min} Wdh`, suggestedReps: range.min, suggestedWeight: first.weight || 0 };
      }
      return { type: 'reps', message: '+1 Wdh pro Satz', suggestedReps: (first.reps || 0) + 1, suggestedWeight: first.weight || 0 };
    }
    return { type: 'repeat', message: 'Gleiche Werte wie letztes Mal', suggestedReps: first.reps, suggestedWeight: first.weight };
  }

  export function getExercisePRBaseline(exerciseId, beforeDate) {
    const entries = getExerciseHistoryEntries(exerciseId, beforeDate);
    let maxWeight = 0;
    const repsAtWeight = {};
    entries.forEach((h) => {
      h.exercises
        .filter((e) => e.exerciseId === exerciseId)
        .forEach((e) =>
          e.sets.forEach((s) => {
            if (s.weight > maxWeight) maxWeight = s.weight;
            if (!repsAtWeight[s.weight] || s.reps > repsAtWeight[s.weight]) repsAtWeight[s.weight] = s.reps;
          })
        );
    });
    return { maxWeight, repsAtWeight, hasHistory: entries.length > 0 };
  }

  export function isNewPR(set, baseline) {
    if (!baseline.hasHistory) return false;
    if (set.weight > baseline.maxWeight) return true;
    const priorReps = baseline.repsAtWeight[set.weight] || 0;
    return set.reps > priorReps;
  }

  /* ---------- Workout-Modus ---------- */

  export function startWorkout(plan, day) {
    if (day.type === 'intervall') {
      startIntervalWorkout(plan, day);
      return;
    }
    workoutState = {
      planId: plan.id,
      planName: plan.name,
      dayLabel: day.label,
      exercises: day.exercises.map((ex) => {
        const setCount = ex.sets;
        const suggestion = computeSuggestion(ex.exerciseId, ex.reps);
        return {
          exerciseId: ex.exerciseId,
          targetReps: ex.reps,
          suggestion,
          sets: Array.from({ length: setCount }, () => ({
            reps: suggestion ? String(suggestion.suggestedReps) : '',
            weight: suggestion && suggestion.suggestedWeight ? String(suggestion.suggestedWeight) : '',
            done: false,
          })),
        };
      }),
      currentIndex: 0,
    };
    document.getElementById('workout-mode').classList.remove('hidden');
    document.getElementById('workout-rest').classList.add('hidden');
    document.getElementById('workout-summary').classList.add('hidden');
    document.getElementById('workout-exercise-view').classList.remove('hidden');
    renderWorkoutExercise();
  }

  export function renderWorkoutExercise() {
    const ex = workoutState.exercises[workoutState.currentIndex];
    const exData = getExerciseById(ex.exerciseId);
    document.getElementById('workout-progress').textContent = `ÜBUNG ${workoutState.currentIndex + 1} / ${workoutState.exercises.length}`;

    const last = getLastExercisePerformance(ex.exerciseId);
    const lastLine = last ? `<div class="last-performance">LETZTES MAL: ${formatLastPerformance(last)}</div>` : '';
    let suggestionLine = '';
    if (ex.suggestion) {
      const swapBtn = ex.suggestion.type === 'progression'
        ? `<button class="suggestion-swap" id="wo-swap-exercise">Übernehmen</button>`
        : '';
      suggestionLine = `<div class="suggestion-label">→ VORSCHLAG: ${ex.suggestion.message}${swapBtn}</div>`;
    }

    const view = document.getElementById('workout-exercise-view');
    view.innerHTML = `
      <div class="workout-ex-name">${exData ? exData.name : ex.exerciseId}</div>
      <div class="workout-ex-meta">${exData ? `${exData.group} · ${exData.level} · ${exData.equipment}` : ''} · ZIEL ${ex.targetReps} WDH</div>
      ${lastLine}
      ${suggestionLine}
      <div class="workout-ex-desc">${exData ? exData.desc : ''}</div>
      ${ex.sets
        .map(
          (s, i) => `
        <div class="set-row">
          <span class="set-num">${i + 1}</span>
          <input type="number" class="set-weight" data-idx="${i}" placeholder="KG" value="${s.weight}" inputmode="decimal">
          <input type="number" class="set-reps" data-idx="${i}" placeholder="WDH" value="${s.reps}" inputmode="numeric">
          <button class="set-check ${s.done ? 'done' : ''}" data-idx="${i}">✓</button>
        </div>
      `
        )
        .join('')}
      <div class="workout-actions">
        ${workoutState.currentIndex > 0 ? '<button class="btn btn-ghost" id="wo-prev">Zurück</button>' : ''}
        <button class="btn btn-primary" id="wo-next">${workoutState.currentIndex === workoutState.exercises.length - 1 ? 'Training beenden' : 'Nächste Übung'}</button>
      </div>
    `;

    view.querySelectorAll('.set-weight').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        ex.sets[parseInt(e.target.dataset.idx, 10)].weight = e.target.value;
      });
    });
    view.querySelectorAll('.set-reps').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        ex.sets[parseInt(e.target.dataset.idx, 10)].reps = e.target.value;
      });
    });
    view.querySelectorAll('.set-check').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.idx, 10);
        ex.sets[i].done = !ex.sets[i].done;
        btn.classList.toggle('done', ex.sets[i].done);
      });
    });

    const swapBtn = view.querySelector('#wo-swap-exercise');
    if (swapBtn) {
      swapBtn.addEventListener('click', () => {
        const nextId = ex.suggestion.nextExerciseId;
        ex.exerciseId = nextId;
        ex.suggestion = null;
        ex.sets = ex.sets.map(() => ({ reps: '', weight: '', done: false }));
        renderWorkoutExercise();
      });
    }

    const prevBtn = view.querySelector('#wo-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      workoutState.currentIndex--;
      renderWorkoutExercise();
    });

    view.querySelector('#wo-next').addEventListener('click', () => {
      if (workoutState.currentIndex === workoutState.exercises.length - 1) {
        finishWorkout();
      } else {
        showRestTimer();
      }
    });
  }

  export function showRestTimer() {
    document.getElementById('workout-exercise-view').classList.add('hidden');
    const restEl = document.getElementById('workout-rest');
    restEl.classList.remove('hidden');
    document.querySelectorAll('#rest-options .chip').forEach((c) => c.classList.toggle('active', parseInt(c.dataset.sec, 10) === restSeconds));
    runRestCountdown(restSeconds);
  }

  export function runRestCountdown(seconds) {
    clearInterval(restTimer);
    let remaining = seconds;
    document.getElementById('rest-countdown').textContent = remaining;
    restTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(restTimer);
        advanceToNextExercise();
        return;
      }
      document.getElementById('rest-countdown').textContent = remaining;
    }, 1000);
  }

  export function advanceToNextExercise() {
    workoutState.currentIndex++;
    document.getElementById('workout-rest').classList.add('hidden');
    document.getElementById('workout-exercise-view').classList.remove('hidden');
    renderWorkoutExercise();
  }

  export function initWorkoutModeHandlers() {
    document.getElementById('rest-options').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      restSeconds = parseInt(chip.dataset.sec, 10);
      document.querySelectorAll('#rest-options .chip').forEach((c) => c.classList.toggle('active', c === chip));
      runRestCountdown(restSeconds);
    });
    document.getElementById('rest-skip').addEventListener('click', () => {
      clearInterval(restTimer);
      advanceToNextExercise();
    });
    document.getElementById('workout-close').addEventListener('click', () => {
      if (!workoutState) {
        document.getElementById('workout-mode').classList.add('hidden');
        return;
      }
      if (confirm('Training abbrechen? Der Fortschritt geht verloren.')) {
        clearInterval(restTimer);
        workoutState = null;
        document.getElementById('workout-mode').classList.add('hidden');
      }
    });
  }

  export function finishWorkout() {
    const prBaselines = {};
    workoutState.exercises.forEach((ex) => {
      if (!prBaselines[ex.exerciseId]) prBaselines[ex.exerciseId] = getExercisePRBaseline(ex.exerciseId);
    });

    let volume = 0;
    const newPRExerciseNames = [];
    const finalExercises = workoutState.exercises.map((ex) => {
      const sets = ex.sets
        .filter((s) => s.reps !== '' || s.weight !== '')
        .map((s) => ({ reps: parseFloat(s.reps) || 0, weight: parseFloat(s.weight) || 0 }));
      let hasPR = false;
      sets.forEach((s) => {
        volume += s.weight * s.reps;
        if (isNewPR(s, prBaselines[ex.exerciseId])) hasPR = true;
      });
      if (hasPR) {
        const exData = getExerciseById(ex.exerciseId);
        newPRExerciseNames.push(exData ? exData.name : ex.exerciseId);
      }
      return { exerciseId: ex.exerciseId, targetReps: ex.targetReps, sets };
    });

    const previousSession = loadJSON(K.history, [])
      .filter((h) => h.planId === workoutState.planId && h.dayLabel === workoutState.dayLabel)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const volumeChangePct = previousSession && previousSession.volume > 0
      ? round(((volume - previousSession.volume) / previousSession.volume) * 100)
      : null;

    const entry = {
      id: uid(),
      date: todayKey(),
      planId: workoutState.planId,
      planName: workoutState.planName,
      dayLabel: workoutState.dayLabel,
      exercises: finalExercises,
      volume,
    };
    const history = loadJSON(K.history, []);
    history.push(entry);
    saveJSON(K.history, history);

    renderWorkoutSummary(volume, volumeChangePct, newPRExerciseNames);
    workoutState = null;
    renderHeute();
    if (document.querySelector('.subtab.active')?.dataset.subtab === 'verlauf') renderWorkoutHistory();
  }

  export function renderWorkoutSummary(volume, volumeChangePct, newPRExerciseNames) {
    document.getElementById('workout-exercise-view').classList.add('hidden');
    document.getElementById('workout-rest').classList.add('hidden');
    document.getElementById('workout-progress').textContent = 'ZUSAMMENFASSUNG';
    const el = document.getElementById('workout-summary');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="workout-summary-inner">
        <h1 class="headline" style="font-size:28px;">Training<br><span class="fat">abgeschlossen.</span></h1>
        <div class="summary-stat-row"><span>Volumen</span><span class="val">${round(volume)} KG</span></div>
        ${volumeChangePct !== null ? `<div class="summary-stat-row"><span>Vs. letztes Mal</span><span class="val ${volumeChangePct >= 0 ? 'positive' : ''}">${volumeChangePct >= 0 ? '+' : ''}${volumeChangePct}%</span></div>` : ''}
        ${newPRExerciseNames.length > 0 ? `<div class="pr-highlight">${newPRExerciseNames.length} NEUE${newPRExerciseNames.length === 1 ? 'R' : ''} REKORD${newPRExerciseNames.length === 1 ? '' : 'E'}<br>${newPRExerciseNames.join(', ')}</div>` : ''}
        <button class="btn btn-primary btn-full" id="workout-summary-close" style="margin-top:24px;">Fertig</button>
      </div>
    `;
    el.querySelector('#workout-summary-close').addEventListener('click', () => {
      document.getElementById('workout-mode').classList.add('hidden');
      el.classList.add('hidden');
      document.getElementById('workout-exercise-view').classList.remove('hidden');
    });
    showToast('Training gespeichert. Gut gemacht.');
  }
