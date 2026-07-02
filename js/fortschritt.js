/* FORM — fortschritt.js — Fortschritt-Tab: Charts, Kalender, Körpermaße, Rekorde. */
import { renderWeekReviewList } from './review.js';
import { K, WEEKDAY_SHORT, addDays, dateKey, getDay, getDays, getExerciseById, getProfile, loadJSON, saveJSON, todayKey } from './storage.js';
import { showToast } from './ui.js';

  /* ==========================================================================
     FORTSCHRITT
     ========================================================================== */

  export function renderFortschritt() {
    renderWeightSection();
    renderCalorieChart();
    renderTrainingCalendar();
    renderMeasurements();
    renderPersonalRecords();
    renderWeekReviewList();
  }

  export function initFortschrittHandlers() {
    document.getElementById('weight-save').addEventListener('click', () => {
      const val = parseFloat(document.getElementById('weight-input').value);
      if (!val || val <= 0) {
        showToast('Bitte gültiges Gewicht eingeben.');
        return;
      }
      let log = loadJSON(K.weightLog, []);
      const key = todayKey();
      const existing = log.find((l) => l.date === key);
      if (existing) existing.weight = val;
      else log.push({ date: key, weight: val });
      saveJSON(K.weightLog, log);
      document.getElementById('weight-input').value = '';
      showToast('Gewicht gespeichert.');
      renderWeightSection();
    });
  }

  export function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.parentElement.clientWidth;
    const h = parseInt(canvas.getAttribute('height'), 10) || 160;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  export function renderWeightSection() {
    const log = loadJSON(K.weightLog, []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const canvas = document.getElementById('weight-chart');
    const emptyEl = document.getElementById('weight-empty');
    if (log.length < 2) {
      canvas.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }
    canvas.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    const recent = log.slice(-30);
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const values = recent.map((r) => r.weight);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = 20;
    const range = max - min || 1;

    ctx.beginPath();
    recent.forEach((r, i) => {
      const x = pad + (i / (recent.length - 1)) * (w - pad * 2);
      const y = h - pad - ((r.weight - min) / range) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    recent.forEach((r, i) => {
      const x = pad + (i / (recent.length - 1)) * (w - pad * 2);
      const y = h - pad - ((r.weight - min) / range) * (h - pad * 2);
      ctx.beginPath();
      ctx.arc(x, y, i === recent.length - 1 ? 3 : 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#111111';
      ctx.fill();
    });

    ctx.font = '10px "SF Mono", "Space Mono", monospace';
    ctx.fillStyle = '#555555';
    ctx.fillText(`${min.toFixed(1)} KG`, 0, h - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`${max.toFixed(1)} KG`, w, 12);
    ctx.textAlign = 'left';
  }

  export function renderCalorieChart() {
    const profile = getProfile();
    const days = getDays();
    const canvas = document.getElementById('calorie-chart');
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const points = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const key = dateKey(d);
      const kcal = (days[key]?.calories || []).reduce((s, item) => s + item.kcal, 0);
      points.push({ label: WEEKDAY_SHORT[d.getDay()], kcal });
    }
    const goal = profile.calorieGoal;
    const maxVal = Math.max(goal * 1.15, ...points.map((p) => p.kcal), 1);
    const pad = 20;
    const barW = (w - pad * 2) / points.length;

    const goalY = h - pad - (goal / maxVal) * (h - pad * 2);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad, goalY);
    ctx.lineTo(w - pad, goalY);
    ctx.strokeStyle = '#1A3C2E';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    points.forEach((p, i) => {
      const barH = (p.kcal / maxVal) * (h - pad * 2);
      const x = pad + i * barW + barW * 0.2;
      const bw = barW * 0.6;
      ctx.fillStyle = p.kcal > goal ? '#8A1F11' : '#111111';
      ctx.fillRect(x, h - pad - barH, bw, barH);
      ctx.font = '10px "SF Mono", "Space Mono", monospace';
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.fillText(p.label.toUpperCase(), x + bw / 2, h - 4);
    });
    ctx.textAlign = 'left';
  }

  export function renderTrainingCalendar() {
    const history = loadJSON(K.history, []);
    const trainedDates = new Set(history.map((h) => h.date));
    const el = document.getElementById('training-calendar');
    let html = '';
    WEEKDAY_SHORT.slice(1).concat(WEEKDAY_SHORT[0]).forEach((d) => {
      html += `<div class="cal-cell empty">${d.toUpperCase()}</div>`;
    });

    const today = new Date();
    const jsWeekday = today.getDay();
    const isoOffset = jsWeekday === 0 ? 6 : jsWeekday - 1;
    const start = addDays(today, -27 - isoOffset);
    const startWeekday = start.getDay();
    const leadBlanks = startWeekday === 0 ? 6 : startWeekday - 1;
    for (let i = 0; i < leadBlanks; i++) html += `<div class="cal-cell empty"></div>`;

    for (let i = 0; i < 35; i++) {
      const d = addDays(start, i);
      if (d > today) break;
      const key = dateKey(d);
      const trained = trainedDates.has(key);
      html += `<div class="cal-cell ${trained ? 'trained' : ''}">${d.getDate()}</div>`;
    }
    el.innerHTML = html;
  }

  export function renderMeasurements() {
    const log = loadJSON(K.measurements, []);
    const latest = log[log.length - 1] || {};
    const el = document.getElementById('body-measurements');
    const fields = [
      { key: 'chest', label: 'Brust (cm)' },
      { key: 'waist', label: 'Taille (cm)' },
      { key: 'arm', label: 'Arm (cm)' },
      { key: 'leg', label: 'Bein (cm)' },
    ];
    el.innerHTML =
      fields
        .map(
          (f) => `
      <div class="measurement-row">
        <label>${f.label}</label>
        <input type="number" step="0.1" id="ms-${f.key}" value="${latest[f.key] || ''}" inputmode="decimal">
      </div>
    `
        )
        .join('') + `<button class="btn btn-primary btn-full" id="ms-save">Maße speichern</button>`;

    el.querySelector('#ms-save').addEventListener('click', () => {
      const entry = { date: todayKey() };
      fields.forEach((f) => {
        const v = parseFloat(document.getElementById(`ms-${f.key}`).value);
        if (!isNaN(v)) entry[f.key] = v;
      });
      const logArr = loadJSON(K.measurements, []);
      const idx = logArr.findIndex((l) => l.date === entry.date);
      if (idx >= 0) logArr[idx] = entry;
      else logArr.push(entry);
      saveJSON(K.measurements, logArr);
      showToast('Körpermaße gespeichert.');
    });
  }

  export function renderPersonalRecords() {
    const history = loadJSON(K.history, []);
    const records = {};
    history.forEach((h) => {
      h.exercises.forEach((ex) => {
        if (!records[ex.exerciseId]) records[ex.exerciseId] = { maxWeight: 0, maxReps: 0 };
        ex.sets.forEach((s) => {
          if (s.weight > records[ex.exerciseId].maxWeight) records[ex.exerciseId].maxWeight = s.weight;
          if (s.reps > records[ex.exerciseId].maxReps) records[ex.exerciseId].maxReps = s.reps;
        });
      });
    });
    const el = document.getElementById('personal-records');
    const ids = Object.keys(records);
    if (ids.length === 0) {
      el.innerHTML = `<p class="empty-state">Noch keine Rekorde. Schließe ein Training ab.</p>`;
      return;
    }
    el.innerHTML = ids
      .map((id) => {
        const ex = getExerciseById(id);
        const r = records[id];
        const parts = [];
        if (r.maxWeight > 0) parts.push(`${r.maxWeight} KG`);
        if (r.maxReps > 0) parts.push(`${r.maxReps} WDH`);
        return `
        <div class="pr-row">
          <span class="pr-name">${ex ? ex.name : id}</span>
          <span class="pr-val">${parts.join(' · ') || '–'}</span>
        </div>
      `;
      })
      .join('');
  }
