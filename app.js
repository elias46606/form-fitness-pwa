/* FORM — App-Logik. Vanilla JS, alles in localStorage. */
(function () {
  'use strict';

  /* ==========================================================================
     Konstanten & Helfer
     ========================================================================== */

  const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MEALS = ['Frühstück', 'Mittag', 'Abend', 'Snacks'];
  const WATER_GOAL_ML = 2500;
  const GLASS_ML = 250;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function addDays(d, n) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  }

  function round(n) {
    return Math.round(n);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ==========================================================================
     Storage-Schlüssel
     ========================================================================== */

  const K = {
    profile: 'form_profile',
    days: 'form_days',
    weightLog: 'form_weight_log',
    measurements: 'form_measurements',
    favorites: 'form_favorites',
    customFoods: 'form_custom_foods',
    recentFoods: 'form_recent_foods',
    activePlan: 'form_active_plan',
    customPlans: 'form_custom_plans',
    history: 'form_workout_history',
    session: 'form_workout_session',
    scannedProducts: 'form_scanned_products',
    customRecipes: 'form_custom_recipes',
    recipeFavorites: 'form_recipe_favorites',
  };

  const ALL_KEYS = Object.values(K);

  /* ==========================================================================
     Daten-Zugriff
     ========================================================================== */

  function getProfile() {
    return loadJSON(K.profile, null);
  }

  function getDays() {
    return loadJSON(K.days, {});
  }

  function getDay(key) {
    const days = getDays();
    if (!days[key]) {
      days[key] = { calories: [], water: 0, steps: 0 };
      saveJSON(K.days, days);
    }
    return days[key];
  }

  function saveDay(key, dayObj) {
    const days = getDays();
    days[key] = dayObj;
    saveJSON(K.days, days);
  }

  function allFoods() {
    const custom = loadJSON(K.customFoods, []);
    return FOOD_DB.concat(custom);
  }

  function findFood(id) {
    return allFoods().find((f) => f.id === id);
  }

  function getActivePlanObj() {
    const active = loadJSON(K.activePlan, null);
    if (!active) return null;
    const plan = getPlanById(active.planId, active.source);
    if (!plan) return null;
    return { active, plan };
  }

  function getPlanById(id, source) {
    if (source === 'custom') {
      return loadJSON(K.customPlans, []).find((p) => p.id === id) || null;
    }
    return WORKOUT_PLANS.find((p) => p.id === id) || null;
  }

  function getExerciseById(id) {
    return EXERCISES.find((e) => e.id === id);
  }

  /* ==========================================================================
     Ziel-Berechnung (Mifflin-St-Jeor)
     ========================================================================== */

  function calcGoals(profile) {
    const { age, gender, height, weight, activity, goal } = profile;
    let bmr;
    if (gender === 'm') {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }
    const tdee = bmr * parseFloat(activity);
    let calorieGoal;
    if (goal === 'abnehmen') calorieGoal = tdee - 400;
    else if (goal === 'aufbau') calorieGoal = tdee + 300;
    else calorieGoal = tdee;
    calorieGoal = Math.max(1200, round(calorieGoal));

    const proteinGoal = round(2 * weight);
    const fatGoal = round((calorieGoal * 0.25) / 9);
    const carbGoal = Math.max(0, round((calorieGoal - proteinGoal * 4 - fatGoal * 9) / 4));

    return { calorieGoal, proteinGoal, carbGoal, fatGoal };
  }

  /* ==========================================================================
     Onboarding
     ========================================================================== */

  let obState = { gender: null, activity: null, goal: null, step: 1 };

  function initOnboarding() {
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

  function initNav() {
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

  function switchView(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    renderView(view);
  }

  function switchTrainingSubtab(tab) {
    document.querySelectorAll('.subtab').forEach((s) => s.classList.toggle('active', s.dataset.subtab === tab));
    document.querySelectorAll('.training-panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'training-' + tab));
    if (tab === 'plaene') renderTrainingPlaene();
    if (tab === 'uebungen') renderExerciseBrowser();
    if (tab === 'verlauf') renderWorkoutHistory();
  }

  function renderView(view) {
    if (view === 'heute') renderHeute();
    if (view === 'kalorien') renderKalorien();
    if (view === 'training') switchTrainingSubtab(document.querySelector('.subtab.active').dataset.subtab);
    if (view === 'fortschritt') renderFortschritt();
    if (view === 'profil') renderProfil();
  }

  /* ==========================================================================
     Modal (generisch)
     ========================================================================== */

  function openModal(titleHtml, bodyHtml) {
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

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  /* ==========================================================================
     HEUTE
     ========================================================================== */

  function computeStreak() {
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

  function todaysWorkoutInfo() {
    const ap = getActivePlanObj();
    if (!ap) return null;
    const weekday = new Date().getDay();
    const dayIndex = ap.active.assignments ? ap.active.assignments[weekday] : undefined;
    if (dayIndex === undefined || dayIndex === null || dayIndex === '') return { plan: ap.plan, day: null };
    return { plan: ap.plan, day: ap.plan.days[dayIndex] };
  }

  function renderHeute() {
    const profile = getProfile();
    if (!profile) return;
    const day = getDay(todayKey());
    const now = new Date();

    document.getElementById('heute-date').innerHTML =
      `${WEEKDAY_NAMES[now.getDay()]}<br><span class="fat">${now.getDate()}. ${MONTH_NAMES[now.getMonth()]}</span>`;

    const streak = computeStreak();
    document.getElementById('streak-bar').textContent = `${streak} ${streak === 1 ? 'TAG' : 'TAGE'} IN FOLGE`;

    const eaten = day.calories.reduce((s, i) => s + i.kcal, 0);
    const stepsBurn = round((day.steps || 0) * 0.04);
    const workoutBurn = hasWorkoutToday() ? 250 : 0;
    const burned = stepsBurn + workoutBurn;
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
        <div class="plan-subtitle">${twInfo.plan.name} · ${twInfo.day.exercises.length} Übungen</div>
        <button class="btn btn-primary btn-full" id="btn-start-today-workout">Training starten</button>
      `;
      document.getElementById('btn-start-today-workout').addEventListener('click', () => {
        startWorkout(twInfo.plan, twInfo.day);
      });
    }
  }

  function hasWorkoutToday() {
    const history = loadJSON(K.history, []);
    return history.some((h) => h.date === todayKey());
  }

  function renderWaterTracker(day) {
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

  function initHeuteHandlers() {
    document.getElementById('steps-save').addEventListener('click', () => {
      const val = parseInt(document.getElementById('steps-input').value, 10) || 0;
      const d = getDay(todayKey());
      d.steps = val;
      saveDay(todayKey(), d);
      showToast('Schritte gespeichert.');
      renderHeute();
    });
  }

  /* ==========================================================================
     KALORIEN
     ========================================================================== */

  function renderKalorien() {
    renderQuickChips();
    document.getElementById('food-search-results').innerHTML = '';
    renderMeals();
    if (document.getElementById('kalorien-rezepte').dataset.built) renderRecipeList();
  }

  function switchKalorienSubtab(tab) {
    document.querySelectorAll('#kalorien-subtabs .subtab').forEach((s) => s.classList.toggle('active', s.dataset.subtab === tab));
    document.getElementById('kalorien-tagebuch').classList.toggle('hidden', tab !== 'tagebuch');
    document.getElementById('kalorien-rezepte').classList.toggle('hidden', tab !== 'rezepte');
    if (tab === 'rezepte') renderRecipesPanel();
  }

  function renderQuickChips() {
    const recentIds = loadJSON(K.recentFoods, []);
    const favIds = loadJSON(K.favorites, []);
    const ids = [...new Set([...favIds, ...recentIds])].slice(0, 14);
    const el = document.getElementById('quick-recent');
    if (ids.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = ids
      .map((id) => {
        const f = findFood(id);
        if (!f) return '';
        const isFav = favIds.includes(id);
        return `<button class="chip ${isFav ? 'accent active' : ''}" data-food-id="${f.id}">${f.name}</button>`;
      })
      .join('');
    el.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => openAddFoodModal(chip.dataset.foodId));
    });
  }

  function initKalorienHandlers() {
    document.getElementById('food-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const resultsEl = document.getElementById('food-search-results');
      if (q.length < 1) {
        resultsEl.innerHTML = '';
        return;
      }
      const matches = allFoods()
        .filter((f) => f.name.toLowerCase().includes(q))
        .slice(0, 25);
      if (matches.length === 0) {
        resultsEl.innerHTML = `<p class="sub">Keine Treffer.</p>`;
        return;
      }
      resultsEl.innerHTML = matches
        .map(
          (f) => `
        <div class="food-row">
          <div class="food-row-main">
            <div class="food-name">${f.name}</div>
            <div class="food-meta">${f.kcal} KCAL · ${f.protein}P ${f.carbs}K ${f.fat}F / 100G</div>
          </div>
          <div class="food-row-action">
            <button class="btn btn-primary btn-small" data-food-id="${f.id}">+</button>
          </div>
        </div>
      `
        )
        .join('');
      resultsEl.querySelectorAll('[data-food-id]').forEach((btn) => {
        btn.addEventListener('click', () => openAddFoodModal(btn.dataset.foodId));
      });
    });

    document.getElementById('btn-custom-food').addEventListener('click', () => openCustomFoodModal());
    document.getElementById('btn-scan').addEventListener('click', openScanner);

    document.getElementById('kalorien-subtabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.subtab');
      if (!btn) return;
      switchKalorienSubtab(btn.dataset.subtab);
    });
  }

  function openCustomFoodModal(barcode) {
    const body = openModal('Eigenes Lebensmittel', `
      ${barcode ? `<div class="card-label">BARCODE ${barcode}</div>` : ''}
      <div class="field-label">Name</div>
      <input type="text" id="cf-name" placeholder="z. B. Protein-Shake">
      <div class="field-label">Kalorien (kcal / 100g)</div>
      <input type="number" id="cf-kcal" inputmode="decimal">
      <div class="field-label">Protein (g / 100g)</div>
      <input type="number" id="cf-protein" inputmode="decimal">
      <div class="field-label">Kohlenhydrate (g / 100g)</div>
      <input type="number" id="cf-carbs" inputmode="decimal">
      <div class="field-label">Fett (g / 100g)</div>
      <input type="number" id="cf-fat" inputmode="decimal">
      <button class="btn btn-primary btn-full" id="cf-save">Speichern</button>
    `);
    body.querySelector('#cf-save').addEventListener('click', () => {
      const name = body.querySelector('#cf-name').value.trim();
      const kcal = parseFloat(body.querySelector('#cf-kcal').value);
      if (!name || isNaN(kcal)) {
        showToast('Bitte Name und Kalorien angeben.');
        return;
      }
      const food = {
        id: barcode ? 'off_' + barcode : 'custom_' + uid(),
        name,
        kcal,
        protein: parseFloat(body.querySelector('#cf-protein').value) || 0,
        carbs: parseFloat(body.querySelector('#cf-carbs').value) || 0,
        fat: parseFloat(body.querySelector('#cf-fat').value) || 0,
      };
      if (barcode) food.barcode = barcode;
      const customs = loadJSON(K.customFoods, []);
      const existingIdx = customs.findIndex((f) => f.id === food.id);
      if (existingIdx >= 0) customs[existingIdx] = food;
      else customs.push(food);
      saveJSON(K.customFoods, customs);
      closeModal();
      showToast('Lebensmittel gespeichert.');
      openAddFoodModal(food.id);
    });
  }

  function openAddFoodModal(foodId, editEntry) {
    const food = findFood(foodId);
    if (!food) return;
    const defaultAmount = editEntry ? editEntry.amount : 100;
    const defaultMeal = editEntry ? editEntry.meal : 'Frühstück';
    const isFav = loadJSON(K.favorites, []).includes(foodId);

    const body = openModal(food.name, `
      <div class="field-label">Menge (g)</div>
      <input type="number" id="af-amount" value="${defaultAmount}" inputmode="decimal">
      <div class="field-label">Mahlzeit</div>
      <div class="chip-group" id="af-meal">
        ${MEALS.map((m) => `<button type="button" class="chip ${m === defaultMeal ? 'active' : ''}" data-value="${m}">${m}</button>`).join('')}
      </div>
      <div class="field-label">Nährwerte</div>
      <div id="af-preview" class="sub"></div>
      <button class="btn btn-ghost btn-full" id="af-fav">${isFav ? '★ Favorit entfernen' : '☆ Als Favorit speichern'}</button>
      <button class="btn btn-primary btn-full" id="af-save">${editEntry ? 'Aktualisieren' : 'Hinzufügen'}</button>
    `);

    let selectedMeal = defaultMeal;
    const mealGroup = body.querySelector('#af-meal');
    mealGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...mealGroup.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      selectedMeal = btn.dataset.value;
    });

    const amountInput = body.querySelector('#af-amount');
    function updatePreview() {
      const amt = parseFloat(amountInput.value) || 0;
      const factor = amt / 100;
      body.querySelector('#af-preview').textContent =
        `${round(food.kcal * factor)} KCAL · ${round(food.protein * factor)}G PROTEIN · ${round(food.carbs * factor)}G KOHLENHYDRATE · ${round(food.fat * factor)}G FETT`;
    }
    amountInput.addEventListener('input', updatePreview);
    updatePreview();

    body.querySelector('#af-fav').addEventListener('click', () => {
      let favs = loadJSON(K.favorites, []);
      if (favs.includes(foodId)) {
        favs = favs.filter((id) => id !== foodId);
      } else {
        favs.unshift(foodId);
      }
      saveJSON(K.favorites, favs);
      closeModal();
      openAddFoodModal(foodId, editEntry);
    });

    body.querySelector('#af-save').addEventListener('click', () => {
      const amt = parseFloat(amountInput.value);
      if (!amt || amt <= 0) {
        showToast('Bitte gültige Menge eingeben.');
        return;
      }
      const factor = amt / 100;
      const entry = {
        id: editEntry ? editEntry.id : uid(),
        foodId: food.id,
        name: food.name,
        amount: amt,
        meal: selectedMeal,
        kcal: food.kcal * factor,
        protein: food.protein * factor,
        carbs: food.carbs * factor,
        fat: food.fat * factor,
        time: editEntry ? editEntry.time : Date.now(),
      };
      const day = getDay(todayKey());
      if (editEntry) {
        day.calories = day.calories.map((i) => (i.id === editEntry.id ? entry : i));
      } else {
        day.calories.push(entry);
      }
      saveDay(todayKey(), day);

      let recent = loadJSON(K.recentFoods, []);
      recent = [foodId, ...recent.filter((id) => id !== foodId)].slice(0, 12);
      saveJSON(K.recentFoods, recent);

      closeModal();
      showToast(editEntry ? 'Eintrag aktualisiert.' : 'Hinzugefügt.');
      renderKalorien();
      renderHeute();
    });
  }

  function renderMeals() {
    const day = getDay(todayKey());
    const container = document.getElementById('meals-container');
    container.innerHTML = MEALS.map((meal) => {
      const items = day.calories.filter((i) => i.meal === meal);
      const kcalSum = items.reduce((s, i) => s + i.kcal, 0);
      return `
        <div class="meal-block">
          <div class="meal-head">
            <span class="meal-title">${meal}</span>
            <span class="meal-kcal">${round(kcalSum)} KCAL</span>
          </div>
          <div class="meal-items">
            ${
              items.length === 0
                ? `<div class="meal-empty">Noch nichts eingetragen.</div>`
                : items
                    .map(
                      (i) => `
              <div class="meal-item" data-id="${i.id}">
                <div class="meal-item-info">
                  <div class="meal-item-name">${i.name}</div>
                  <div class="meal-item-meta">${round(i.amount)}G · ${round(i.kcal)} KCAL</div>
                </div>
                <button class="meal-item-del" data-action="del" data-id="${i.id}">✕</button>
              </div>
            `
                    )
                    .join('')
            }
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.meal-item-info').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.closest('.meal-item').dataset.id;
        const entry = getDay(todayKey()).calories.find((i) => i.id === id);
        if (entry) openAddFoodModal(entry.foodId, entry);
      });
    });

    container.querySelectorAll('[data-action="del"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = getDay(todayKey());
        d.calories = d.calories.filter((i) => i.id !== btn.dataset.id);
        saveDay(todayKey(), d);
        renderMeals();
        renderHeute();
      });
    });
  }

  /* ==========================================================================
     BARCODE-SCANNER
     ========================================================================== */

  const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product/';
  const OFF_FIELDS = 'product_name,product_name_de,brands,nutriments,nutriscore_grade,serving_size,image_small_url';
  const HTML5_QRCODE_SRC = 'https://unpkg.com/html5-qrcode';

  const scannerState = {
    stream: null,
    detecting: false,
    rafId: null,
    html5QrCode: null,
    detector: null,
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Skript konnte nicht geladen werden.'));
      document.head.appendChild(s);
    });
  }

  function initScannerHandlers() {
    document.getElementById('scanner-close').addEventListener('click', closeScannerOverlay);
    document.getElementById('scanner-cancel').addEventListener('click', closeScannerOverlay);
    document.getElementById('scanner-manual-submit').addEventListener('click', () => {
      const val = document.getElementById('scanner-manual-input').value.trim();
      if (!val) return;
      showScannerState('status', 'SUCHE PRODUKT …');
      lookupProduct(val)
        .then((product) => {
          closeScannerOverlay();
          openProductDetailModal(product);
        })
        .catch((err) => showLookupError(err, val));
    });
  }

  function openScanner() {
    document.getElementById('scanner-overlay').classList.remove('hidden');
    document.getElementById('scanner-manual-input').value = '';
    showScannerState('status', 'Kamera wird aktiviert…');
    startScanner();
  }

  function closeScannerOverlay() {
    stopScanner();
    document.getElementById('scanner-overlay').classList.add('hidden');
  }

  function showScannerState(which, text) {
    ['camera', 'status', 'error', 'manual'].forEach((s) => {
      document.getElementById(`scanner-${s}-state`).classList.toggle('hidden', s !== which);
    });
    if (which === 'status') document.getElementById('scanner-status-text').textContent = text || '';
  }

  function stopScanner() {
    scannerState.detecting = false;
    if (scannerState.rafId) {
      cancelAnimationFrame(scannerState.rafId);
      scannerState.rafId = null;
    }
    if (scannerState.stream) {
      scannerState.stream.getTracks().forEach((t) => t.stop());
      scannerState.stream = null;
    }
    const video = document.getElementById('scanner-video');
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (scannerState.html5QrCode) {
      const inst = scannerState.html5QrCode;
      scannerState.html5QrCode = null;
      inst.stop().then(() => inst.clear()).catch(() => {});
    }
  }

  function startScanner() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError();
      return;
    }
    if ('BarcodeDetector' in window) {
      startNativeScanner();
    } else {
      startFallbackScanner();
    }
  }

  function startNativeScanner() {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        scannerState.stream = stream;
        const video = document.getElementById('scanner-video');
        video.classList.remove('hidden');
        document.getElementById('scanner-fallback-target').classList.add('hidden');
        video.srcObject = stream;
        video.play();
        showScannerState('camera');

        scannerState.detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] });
        scannerState.detecting = true;
        const loop = () => {
          if (!scannerState.detecting) return;
          scannerState.detector
            .detect(video)
            .then((codes) => {
              if (codes && codes.length > 0) {
                handleBarcodeResult(codes[0].rawValue);
              } else if (scannerState.detecting) {
                scannerState.rafId = requestAnimationFrame(loop);
              }
            })
            .catch(() => {
              if (scannerState.detecting) scannerState.rafId = requestAnimationFrame(loop);
            });
        };
        loop();
      })
      .catch(() => showCameraError());
  }

  function startFallbackScanner() {
    loadScript(HTML5_QRCODE_SRC)
      .then(() => {
        const video = document.getElementById('scanner-video');
        video.classList.add('hidden');
        const target = document.getElementById('scanner-fallback-target');
        target.innerHTML = '';
        target.classList.remove('hidden');

        const html5QrCode = new window.Html5Qrcode('scanner-fallback-target');
        scannerState.html5QrCode = html5QrCode;

        let formats;
        try {
          const F = window.Html5QrcodeSupportedFormats;
          formats = [F.EAN_13, F.EAN_8, F.UPC_A];
        } catch (e) {
          formats = undefined;
        }

        html5QrCode
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 260, height: 150 }, formatsToSupport: formats },
            (decodedText) => handleBarcodeResult(decodedText),
            () => {}
          )
          .then(() => showScannerState('camera'))
          .catch(() => showCameraError());
      })
      .catch(() => showCameraError());
  }

  function showCameraError() {
    showScannerState('error');
    document.getElementById('scanner-error-text').textContent =
      'Kein Zugriff auf die Kamera. Bitte erlaube den Kamera-Zugriff in den Browser- bzw. Systemeinstellungen.';
    const btn = document.getElementById('scanner-manual-btn');
    btn.textContent = 'Barcode manuell eingeben';
    btn.onclick = () => showScannerState('manual');
  }

  function handleBarcodeResult(code) {
    if (!code) return;
    scannerState.detecting = false;
    if (navigator.vibrate) navigator.vibrate(80);
    stopScanner();
    showScannerState('status', 'SUCHE PRODUKT …');
    lookupProduct(code)
      .then((product) => {
        closeScannerOverlay();
        openProductDetailModal(product);
      })
      .catch((err) => showLookupError(err, code));
  }

  function showLookupError(err, barcode) {
    showScannerState('error');
    const el = document.getElementById('scanner-error-text');
    const btn = document.getElementById('scanner-manual-btn');
    if (err && err.type === 'not_found') {
      el.textContent = 'PRODUKT NICHT IN DER DATENBANK';
      btn.textContent = 'Manuell eintragen';
      btn.onclick = () => {
        closeScannerOverlay();
        openCustomFoodModal(barcode);
      };
    } else if (err && err.type === 'offline') {
      el.textContent = 'Keine Internetverbindung. Zum Scannen wird eine Verbindung benötigt — außer das Produkt ist bereits offline gespeichert.';
      btn.textContent = 'Manuell eintragen';
      btn.onclick = () => {
        closeScannerOverlay();
        openCustomFoodModal(barcode);
      };
    } else {
      el.textContent = 'Produkt konnte nicht geladen werden. Bitte versuche es erneut.';
      btn.textContent = 'Manuell eintragen';
      btn.onclick = () => {
        closeScannerOverlay();
        openCustomFoodModal(barcode);
      };
    }
  }

  /* ==========================================================================
     OPENFOODFACTS
     ========================================================================== */

  function lookupProduct(barcode) {
    const cache = loadJSON(K.scannedProducts, {});
    if (cache[barcode]) return Promise.resolve(cache[barcode]);

    if (!navigator.onLine) return Promise.reject({ type: 'offline' });

    return fetch(`${OFF_API_BASE}${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`)
      .then((res) => {
        if (!res.ok) throw { type: 'network' };
        return res.json();
      })
      .then((data) => {
        if (!data || data.status !== 1 || !data.product) throw { type: 'not_found' };
        return mapOFFProduct(data.product, barcode);
      })
      .then((product) => {
        const c = loadJSON(K.scannedProducts, {});
        c[barcode] = product;
        saveJSON(K.scannedProducts, c);
        return product;
      })
      .catch((err) => {
        if (err && err.type) throw err;
        throw { type: 'network' };
      });
  }

  function mapOFFProduct(p, barcode) {
    const n = p.nutriments || {};
    const num = (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim() !== '' && !isNaN(parseFloat(v))) return parseFloat(v);
      return undefined;
    };
    return {
      id: 'off_' + barcode,
      barcode,
      name: p.product_name_de || p.product_name || 'Unbekanntes Produkt',
      brand: p.brands ? p.brands.split(',')[0].trim() : '',
      kcal: num(n['energy-kcal_100g']),
      protein: num(n['proteins_100g']),
      carbs: num(n['carbohydrates_100g']),
      sugars: num(n['sugars_100g']),
      fat: num(n['fat_100g']),
      satFat: num(n['saturated-fat_100g']),
      fiber: num(n['fiber_100g']),
      salt: num(n['salt_100g']),
      nutriscore: (p.nutriscore_grade || '').toUpperCase(),
      image: p.image_small_url || null,
    };
  }

  function computeFitnessTags(p) {
    const tags = [];
    if (typeof p.protein === 'number' && p.protein >= 20) tags.push('PROTEINREICH');
    if (typeof p.sugars === 'number' && p.sugars >= 15) tags.push('VIEL ZUCKER');
    if (typeof p.fiber === 'number' && p.fiber >= 6) tags.push('BALLASTSTOFFREICH');
    if (typeof p.kcal === 'number' && p.kcal >= 400) tags.push('KALORIENDICHT');
    if (typeof p.kcal === 'number' && p.kcal <= 120 && typeof p.protein === 'number' && p.protein >= 8) tags.push('GUT FÜRS DEFIZIT');
    return tags;
  }

  function round10(v) {
    return Math.round(v * 10) / 10;
  }

  function fmtNutrient(v, unit) {
    return typeof v === 'number' ? `${round10(v)} ${unit}` : '–';
  }

  function persistScannedProduct(product) {
    const customs = loadJSON(K.customFoods, []);
    if (!customs.find((f) => f.id === product.id)) {
      customs.push({
        id: product.id,
        name: product.name,
        kcal: product.kcal || 0,
        protein: product.protein || 0,
        carbs: product.carbs || 0,
        fat: product.fat || 0,
        barcode: product.barcode,
      });
      saveJSON(K.customFoods, customs);
    }
    let favs = loadJSON(K.favorites, []);
    if (!favs.includes(product.id)) {
      favs.unshift(product.id);
      saveJSON(K.favorites, favs);
    }
  }

  function openProductDetailModal(product) {
    persistScannedProduct(product);
    const tags = computeFitnessTags(product);
    const titleHtml = `<span style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-soft);">${product.brand || 'MARKE UNBEKANNT'}</span>`;

    const body = openModal(
      titleHtml,
      `
      <h2 class="headline" style="font-size:26px;margin-bottom:16px;">${product.name}</h2>
      ${/^[A-E]$/.test(product.nutriscore) ? `<div class="nutri-score-box">${product.nutriscore}</div>` : ''}
      ${tags.length ? `<div class="chip-group" style="margin-bottom:16px;">${tags.map((t) => `<span class="chip">${t}</span>`).join('')}</div>` : ''}
      <div class="card-label">NÄHRWERTE PRO 100G</div>
      <div class="nutrient-row"><span>Energie</span><span>${fmtNutrient(product.kcal, 'KCAL')}</span></div>
      <div class="nutrient-row"><span>Protein</span><span>${fmtNutrient(product.protein, 'G')}</span></div>
      <div class="nutrient-row"><span>Kohlenhydrate</span><span>${fmtNutrient(product.carbs, 'G')}</span></div>
      <div class="nutrient-row sub-row"><span>davon Zucker</span><span>${fmtNutrient(product.sugars, 'G')}</span></div>
      <div class="nutrient-row"><span>Fett</span><span>${fmtNutrient(product.fat, 'G')}</span></div>
      <div class="nutrient-row sub-row"><span>davon gesättigt</span><span>${fmtNutrient(product.satFat, 'G')}</span></div>
      <div class="nutrient-row"><span>Ballaststoffe</span><span>${fmtNutrient(product.fiber, 'G')}</span></div>
      <div class="nutrient-row"><span>Salz</span><span>${fmtNutrient(product.salt, 'G')}</span></div>

      <div class="hr"></div>
      <div class="field-label">Menge (g)</div>
      <input type="number" id="pd-amount" value="100" inputmode="decimal">
      <div class="field-label">Mahlzeit</div>
      <div class="chip-group" id="pd-meal">
        ${MEALS.map((m) => `<button type="button" class="chip ${m === 'Frühstück' ? 'active' : ''}" data-value="${m}">${m}</button>`).join('')}
      </div>
      <div class="field-label">Für diese Menge</div>
      <div id="pd-preview" class="sub"></div>
      <button class="btn btn-primary btn-full" id="pd-add">Hinzufügen</button>
    `
    );

    let selectedMeal = 'Frühstück';
    const mealGroup = body.querySelector('#pd-meal');
    mealGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...mealGroup.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      selectedMeal = btn.dataset.value;
    });

    const amountInput = body.querySelector('#pd-amount');
    function updatePreview() {
      const amt = parseFloat(amountInput.value) || 0;
      const factor = amt / 100;
      body.querySelector('#pd-preview').textContent =
        `${round((product.kcal || 0) * factor)} KCAL · ${round((product.protein || 0) * factor)}G PROTEIN · ${round((product.carbs || 0) * factor)}G KOHLENHYDRATE · ${round((product.fat || 0) * factor)}G FETT`;
    }
    amountInput.addEventListener('input', updatePreview);
    updatePreview();

    body.querySelector('#pd-add').addEventListener('click', () => {
      const amt = parseFloat(amountInput.value);
      if (!amt || amt <= 0) {
        showToast('Bitte gültige Menge eingeben.');
        return;
      }
      const factor = amt / 100;
      const entry = {
        id: uid(),
        foodId: product.id,
        name: product.name,
        amount: amt,
        meal: selectedMeal,
        kcal: (product.kcal || 0) * factor,
        protein: (product.protein || 0) * factor,
        carbs: (product.carbs || 0) * factor,
        fat: (product.fat || 0) * factor,
        time: Date.now(),
      };
      const day = getDay(todayKey());
      day.calories.push(entry);
      saveDay(todayKey(), day);

      let recent = loadJSON(K.recentFoods, []);
      recent = [product.id, ...recent.filter((id) => id !== product.id)].slice(0, 12);
      saveJSON(K.recentFoods, recent);

      closeModal();
      showToast('Hinzugefügt.');
      renderKalorien();
      renderHeute();
    });
  }

  /* ==========================================================================
     REZEPTE
     ========================================================================== */

  const RECIPE_TAG_LABELS = {
    proteinreich: 'PROTEINREICH',
    'low-cal': 'UNTER 400 KCAL',
    schnell: 'SCHNELL',
    vegetarisch: 'VEGETARISCH',
    vegan: 'VEGAN',
    EIGENES: 'EIGENES',
  };

  const recipeFilterState = { kategorie: 'Alle', tag: null };
  let openRecipeId = null;
  const recipePortionState = { factor: 1, excluded: new Set() };

  function allRecipes() {
    return RECIPES.concat(loadJSON(K.customRecipes, []));
  }

  function findRecipe(id) {
    return allRecipes().find((r) => r.id === id);
  }

  function renderRecipesPanel() {
    const kategorieEl = document.getElementById('recipe-filter-kategorie');
    if (!kategorieEl.dataset.built) {
      const cats = [
        { value: 'Alle', label: 'ALLE' },
        { value: 'Frühstück', label: 'FRÜHSTÜCK' },
        { value: 'Mittag', label: 'MITTAG' },
        { value: 'Abend', label: 'ABEND' },
        { value: 'Snacks', label: 'SNACK' },
      ];
      kategorieEl.innerHTML = cats
        .map((c) => `<button class="chip ${c.value === recipeFilterState.kategorie ? 'active' : ''}" data-value="${c.value}">${c.label}</button>`)
        .join('');
      kategorieEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        recipeFilterState.kategorie = btn.dataset.value;
        [...kategorieEl.children].forEach((c) => c.classList.toggle('active', c === btn));
        renderRecipeList();
      });
      kategorieEl.dataset.built = '1';
    }

    const tagEl = document.getElementById('recipe-filter-tags');
    if (!tagEl.dataset.built) {
      const tags = [
        { value: 'proteinreich', label: 'PROTEINREICH' },
        { value: 'low-cal', label: 'UNTER 400 KCAL' },
        { value: 'schnell', label: 'SCHNELL' },
        { value: 'vegetarisch', label: 'VEGETARISCH' },
        { value: 'favoriten', label: 'FAVORITEN' },
      ];
      tagEl.innerHTML = tags.map((t) => `<button class="chip" data-value="${t.value}">${t.label}</button>`).join('');
      tagEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        const val = btn.dataset.value;
        recipeFilterState.tag = recipeFilterState.tag === val ? null : val;
        [...tagEl.children].forEach((c) => c.classList.toggle('active', c.dataset.value === recipeFilterState.tag));
        renderRecipeList();
      });
      tagEl.dataset.built = '1';
    }

    document.getElementById('kalorien-rezepte').dataset.built = '1';
    renderRecipeList();
  }

  function renderRecipeList() {
    const favs = loadJSON(K.recipeFavorites, []);
    let list = allRecipes();
    if (recipeFilterState.kategorie !== 'Alle') list = list.filter((r) => r.kategorie === recipeFilterState.kategorie);
    if (recipeFilterState.tag === 'favoriten') list = list.filter((r) => favs.includes(r.id));
    else if (recipeFilterState.tag) list = list.filter((r) => r.tags.includes(recipeFilterState.tag));

    const el = document.getElementById('recipe-list');
    if (list.length === 0) {
      el.innerHTML = `<p class="empty-state">Keine Rezepte gefunden.</p>`;
      return;
    }
    el.innerHTML = list
      .map((r) => {
        const isFav = favs.includes(r.id);
        return `
        <div class="recipe-card" data-id="${r.id}">
          <div class="exercise-card-head">
            <div>
              <div class="recipe-card-name">${r.name}</div>
              <div class="recipe-card-meta">${r.gesamtNaehrwerte.kcal} KCAL · ${r.gesamtNaehrwerte.protein}G PROTEIN · ${r.zubereitungszeit} MIN</div>
            </div>
            <button class="recipe-fav-star" data-fav-id="${r.id}">${isFav ? '★' : '☆'}</button>
          </div>
          <div class="recipe-card-tags">
            ${r.tags.map((t) => `<span class="chip">${RECIPE_TAG_LABELS[t] || t.toUpperCase()}</span>`).join('')}
          </div>
        </div>
      `;
      })
      .join('');

    el.querySelectorAll('.recipe-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.recipe-fav-star')) return;
        openRecipeDetail(card.dataset.id);
      });
    });
    el.querySelectorAll('.recipe-fav-star').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleRecipeFavorite(btn.dataset.favId);
        renderRecipeList();
      });
    });
  }

  function toggleRecipeFavorite(id) {
    let favs = loadJSON(K.recipeFavorites, []);
    if (favs.includes(id)) favs = favs.filter((f) => f !== id);
    else favs.unshift(id);
    saveJSON(K.recipeFavorites, favs);
  }

  function fmtRecipeAmount(menge, einheit, factor) {
    const scaled = menge * factor;
    const rounded = einheit === 'g' || einheit === 'ml' ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    return `${rounded} ${einheit}`;
  }

  function computeScaledTotals(recipe, factor, excluded) {
    return recipe.zutaten.reduce(
      (acc, z, i) => {
        if (excluded.has(i)) return acc;
        acc.kcal += z.kcal * factor;
        acc.protein += z.protein * factor;
        acc.kh += z.kh * factor;
        acc.fett += z.fett * factor;
        return acc;
      },
      { kcal: 0, protein: 0, kh: 0, fett: 0 }
    );
  }

  function openRecipeDetail(id) {
    const recipe = findRecipe(id);
    if (!recipe) return;
    openRecipeId = id;
    recipePortionState.factor = 1;
    recipePortionState.excluded = new Set();
    document.getElementById('recipe-overlay').classList.remove('hidden');
    renderRecipeDetailContent();
  }

  function closeRecipeDetail() {
    document.getElementById('recipe-overlay').classList.add('hidden');
    openRecipeId = null;
  }

  let recipeSelectedMeal = null;

  function renderRecipeDetailContent() {
    const recipe = findRecipe(openRecipeId);
    if (!recipe) return;
    const favs = loadJSON(K.recipeFavorites, []);
    document.getElementById('recipe-fav-btn').textContent = favs.includes(recipe.id) ? '★' : '☆';

    if (!recipeSelectedMeal || !MEALS.includes(recipeSelectedMeal)) {
      recipeSelectedMeal = MEALS.includes(recipe.kategorie) ? recipe.kategorie : 'Frühstück';
    }

    const el = document.getElementById('recipe-detail-content');
    el.innerHTML = `
      <h1 class="headline" style="font-size:30px;">${recipe.name}</h1>
      <div class="workout-ex-meta" id="recipe-meta-line"></div>

      <div class="portion-selector" id="recipe-portions">
        ${[0.5, 1, 1.5, 2].map((p) => `<button type="button" class="chip ${p === recipePortionState.factor ? 'active' : ''}" data-factor="${p}">${p.toString().replace('.', ',')}×</button>`).join('')}
      </div>

      <div class="card-label">ZUTATEN</div>
      <div id="recipe-ingredients"></div>

      <button class="btn btn-ghost btn-full" id="recipe-copy-list">Liste kopieren</button>

      <div class="hr"></div>

      <div class="card-label">ZUBEREITUNG</div>
      <div id="recipe-steps">
        ${recipe.zubereitung.map((step, i) => `<div class="prep-step"><span class="prep-step-num">${String(i + 1).padStart(2, '0')}</span><span class="prep-step-text">${step}</span></div>`).join('')}
      </div>

      <div class="hr"></div>

      <div class="field-label">Mahlzeit</div>
      <div class="chip-group" id="recipe-meal-select">
        ${MEALS.map((m) => `<button type="button" class="chip ${m === recipeSelectedMeal ? 'active' : ''}" data-value="${m}">${m}</button>`).join('')}
      </div>
      <button class="btn btn-primary btn-full" id="recipe-add-log">Zum Tagebuch hinzufügen</button>
    `;

    renderRecipeIngredients(recipe);
    updateRecipeMetaLine(recipe);

    document.getElementById('recipe-portions').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      recipePortionState.factor = parseFloat(btn.dataset.factor);
      [...document.getElementById('recipe-portions').children].forEach((c) => c.classList.toggle('active', c === btn));
      renderRecipeIngredients(recipe);
      updateRecipeMetaLine(recipe);
    });

    document.getElementById('recipe-meal-select').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      recipeSelectedMeal = btn.dataset.value;
      [...document.getElementById('recipe-meal-select').children].forEach((c) => c.classList.toggle('active', c === btn));
    });

    document.getElementById('recipe-copy-list').addEventListener('click', () => {
      const lines = recipe.zutaten
        .map((z, i) => ({ z, i }))
        .filter(({ i }) => !recipePortionState.excluded.has(i))
        .map(({ z }) => `${z.name} — ${fmtRecipeAmount(z.menge, z.einheit, recipePortionState.factor)}`);
      const text = lines.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('Liste kopiert.')).catch(() => showToast('Kopieren fehlgeschlagen.'));
      } else {
        showToast('Kopieren wird nicht unterstützt.');
      }
    });

    document.getElementById('recipe-add-log').addEventListener('click', () => {
      const totals = computeScaledTotals(recipe, recipePortionState.factor, recipePortionState.excluded);
      const entry = {
        id: uid(),
        foodId: null,
        name: `${recipe.name} (${recipePortionState.factor.toString().replace('.', ',')}×)`,
        amount: null,
        meal: recipeSelectedMeal,
        kcal: totals.kcal,
        protein: totals.protein,
        carbs: totals.kh,
        fat: totals.fett,
        time: Date.now(),
      };
      const day = getDay(todayKey());
      day.calories.push(entry);
      saveDay(todayKey(), day);
      closeRecipeDetail();
      showToast('Zum Tagebuch hinzugefügt.');
      renderKalorien();
      renderHeute();
    });
  }

  function renderRecipeIngredients(recipe) {
    const el = document.getElementById('recipe-ingredients');
    el.innerHTML = recipe.zutaten
      .map((z, i) => {
        const excluded = recipePortionState.excluded.has(i);
        return `
        <div class="ingredient-row ${excluded ? 'excluded' : ''}" data-idx="${i}">
          <input type="checkbox" ${excluded ? '' : 'checked'} data-idx="${i}">
          <span class="ingredient-row-name">${z.name}</span>
          <span class="ingredient-row-amount">${fmtRecipeAmount(z.menge, z.einheit, recipePortionState.factor)}</span>
        </div>
      `;
      })
      .join('');
    el.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (e.target.checked) recipePortionState.excluded.delete(idx);
        else recipePortionState.excluded.add(idx);
        e.target.closest('.ingredient-row').classList.toggle('excluded', !e.target.checked);
        updateRecipeMetaLine(recipe);
      });
    });
  }

  function updateRecipeMetaLine(recipe) {
    const totals = computeScaledTotals(recipe, recipePortionState.factor, recipePortionState.excluded);
    document.getElementById('recipe-meta-line').textContent =
      `${round(totals.kcal)} KCAL · ${round(totals.protein)}G PROTEIN · ${recipe.zubereitungszeit} MIN · ${recipe.kategorie.toUpperCase()}`;
  }

  function initRecipeHandlers() {
    document.getElementById('recipe-back').addEventListener('click', closeRecipeDetail);
    document.getElementById('recipe-fav-btn').addEventListener('click', () => {
      if (!openRecipeId) return;
      toggleRecipeFavorite(openRecipeId);
      renderRecipeDetailContent();
    });
    document.getElementById('btn-custom-recipe').addEventListener('click', openCustomRecipeModal);
    document.getElementById('btn-meal-suggest').addEventListener('click', renderMealSuggestions);
  }

  /* ---------- Eigenes Rezept erstellen ---------- */

  let recipeBuilder = null;

  function openCustomRecipeModal() {
    recipeBuilder = { name: '', kategorie: 'Frühstück', zubereitungszeit: 15, schwierigkeit: 'leicht', zutaten: [], schritte: '' };
    const body = openModal('Eigenes Rezept', `
      <div class="field-label">Name</div>
      <input type="text" id="rb-name" placeholder="z. B. Protein-Bowl">
      <div class="field-label">Kategorie</div>
      <div class="chip-group" id="rb-kategorie">
        ${MEALS.map((m) => `<button type="button" class="chip ${m === recipeBuilder.kategorie ? 'active' : ''}" data-value="${m}">${m}</button>`).join('')}
      </div>
      <div class="field-label">Zubereitungszeit (Minuten)</div>
      <input type="number" id="rb-zeit" value="15">
      <div class="field-label">Schwierigkeit</div>
      <div class="chip-group" id="rb-schwierigkeit">
        <button type="button" class="chip active" data-value="leicht">Leicht</button>
        <button type="button" class="chip" data-value="mittel">Mittel</button>
      </div>

      <div class="hr"></div>
      <div class="field-label">Zutat suchen</div>
      <input type="text" id="rb-ing-search" placeholder="Lebensmittel suchen…">
      <div id="rb-ing-results"></div>
      <div class="field-label">Zutaten</div>
      <div id="rb-ing-list"></div>

      <div class="hr"></div>
      <div class="field-label">Zubereitung (ein Schritt pro Zeile)</div>
      <textarea id="rb-steps" rows="5" style="width:100%;border:2px solid var(--ink);padding:12px 14px;font-size:15px;"></textarea>

      <button class="btn btn-primary btn-full" id="rb-save" style="margin-top:16px;">Rezept speichern</button>
    `);

    body.querySelector('#rb-kategorie').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      recipeBuilder.kategorie = btn.dataset.value;
      [...body.querySelector('#rb-kategorie').children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
    });
    body.querySelector('#rb-schwierigkeit').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      recipeBuilder.schwierigkeit = btn.dataset.value;
      [...body.querySelector('#rb-schwierigkeit').children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
    });

    body.querySelector('#rb-ing-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const resultsEl = body.querySelector('#rb-ing-results');
      if (q.length < 1) {
        resultsEl.innerHTML = '';
        return;
      }
      const matches = allFoods().filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
      resultsEl.innerHTML = matches
        .map((f) => `<div class="food-row"><div class="food-row-main"><div class="food-name">${f.name}</div></div><div class="food-row-action"><button class="btn btn-primary btn-small" data-add-food="${f.id}">+</button></div></div>`)
        .join('');
      resultsEl.querySelectorAll('[data-add-food]').forEach((btn) => {
        btn.addEventListener('click', () => {
          recipeBuilder.zutaten.push({ foodId: btn.dataset.addFood, grams: 100 });
          body.querySelector('#rb-ing-search').value = '';
          resultsEl.innerHTML = '';
          renderRecipeBuilderIngredients(body);
        });
      });
    });

    body.querySelector('#rb-save').addEventListener('click', () => {
      const name = body.querySelector('#rb-name').value.trim();
      if (!name) {
        showToast('Bitte einen Namen angeben.');
        return;
      }
      if (recipeBuilder.zutaten.length === 0) {
        showToast('Bitte mindestens eine Zutat hinzufügen.');
        return;
      }
      const zeit = parseInt(body.querySelector('#rb-zeit').value, 10) || 15;
      const schritte = body.querySelector('#rb-steps').value.split('\n').map((s) => s.trim()).filter(Boolean);
      const raw = {
        id: 'recipe_custom_' + uid(),
        name,
        kategorie: recipeBuilder.kategorie,
        zubereitungszeit: zeit,
        schwierigkeit: recipeBuilder.schwierigkeit,
        vegetarisch: false,
        vegan: false,
        zutaten: recipeBuilder.zutaten.map((z) => ing(z.foodId, z.grams)),
        zubereitung: schritte.length > 0 ? schritte : ['Zutaten nach Wunsch zubereiten.'],
      };
      const built = buildRecipe(raw);
      built.tags.push('EIGENES');
      built.custom = true;
      const customs = loadJSON(K.customRecipes, []);
      customs.push(built);
      saveJSON(K.customRecipes, customs);
      closeModal();
      showToast('Rezept gespeichert.');
      renderRecipeList();
    });

    renderRecipeBuilderIngredients(body);
  }

  function renderRecipeBuilderIngredients(body) {
    const el = body.querySelector('#rb-ing-list');
    el.innerHTML = recipeBuilder.zutaten
      .map((z, i) => {
        const food = findFood(z.foodId);
        return `
        <div class="steps-row" style="margin-bottom:8px;">
          <span style="flex:2;font-size:14px;">${food ? food.name : z.foodId}</span>
          <input type="number" class="rb-ing-grams" data-idx="${i}" value="${z.grams}" style="flex:1;" inputmode="decimal">
          <button class="meal-item-del" data-remove-ing="${i}">✕</button>
        </div>
      `;
      })
      .join('');
    el.querySelectorAll('.rb-ing-grams').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        recipeBuilder.zutaten[parseInt(e.target.dataset.idx, 10)].grams = parseFloat(e.target.value) || 0;
      });
    });
    el.querySelectorAll('[data-remove-ing]').forEach((btn) => {
      btn.addEventListener('click', () => {
        recipeBuilder.zutaten.splice(parseInt(btn.dataset.removeIng, 10), 1);
        renderRecipeBuilderIngredients(body);
      });
    });
  }

  /* ---------- Was passt noch heute? ---------- */

  function renderMealSuggestions() {
    const profile = getProfile();
    const day = getDay(todayKey());
    const eaten = day.calories.reduce((s, i) => s + i.kcal, 0);
    const eatenProtein = day.calories.reduce((s, i) => s + i.protein, 0);
    const remaining = profile.calorieGoal - eaten;
    const proteinGap = Math.max(0, profile.proteinGoal - eatenProtein);

    const el = document.getElementById('meal-suggestions');
    if (remaining <= 50) {
      el.innerHTML = `<p class="empty-state">Kein Kalorienbudget mehr übrig heute.</p>`;
      return;
    }

    let candidates = allRecipes().filter((r) => r.gesamtNaehrwerte.kcal <= remaining);
    candidates = candidates
      .slice()
      .sort((a, b) => (proteinGap > 0 ? b.gesamtNaehrwerte.protein - a.gesamtNaehrwerte.protein : a.gesamtNaehrwerte.kcal - b.gesamtNaehrwerte.kcal));
    candidates = candidates.slice(0, 3);

    if (candidates.length === 0) {
      el.innerHTML = `<p class="empty-state">Keine passenden Rezepte im verbleibenden Budget gefunden.</p>`;
      return;
    }

    el.innerHTML = candidates
      .map(
        (r) => `
      <div class="suggestion-card" data-id="${r.id}">
        <div class="suggestion-card-name">${r.name}</div>
        <div class="suggestion-card-meta">${r.gesamtNaehrwerte.kcal} KCAL · ${r.gesamtNaehrwerte.protein}G PROTEIN · ${r.zubereitungszeit} MIN</div>
      </div>
    `
      )
      .join('');
    el.querySelectorAll('.suggestion-card').forEach((card) => {
      card.addEventListener('click', () => openRecipeDetail(card.dataset.id));
    });
  }

  /* ==========================================================================
     TRAINING — Übungsbrowser
     ========================================================================== */

  let exerciseFilter = 'Alle';

  function renderExerciseBrowser() {
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

  function renderExerciseList() {
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

  function defaultAssignments(daysPerWeek) {
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

  function renderTrainingPlaene() {
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
                ${d.exercises.map((ex) => `<div class="day-ex-row"><span>${getExerciseById(ex.exerciseId)?.name || ex.exerciseId}</span><span class="reps">${ex.sets}×${ex.reps}</span></div>`).join('')}
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

  function openPlanActivationModal(plan, isCustom) {
    const defaults = defaultAssignments(plan.daysPerWeek);
    const body = openModal(plan.name, `
      <p class="sub">${plan.subtitle || ''}</p>
      ${plan.days
        .map((d, i) => {
          const wd = Object.keys(defaults).find((k) => defaults[k] === i);
          return `
          <div class="day-block">
            <div class="day-block-title">${d.label}</div>
            ${d.exercises.map((ex) => `<div class="day-ex-row"><span>${getExerciseById(ex.exerciseId)?.name || ex.exerciseId}</span><span class="reps">${ex.sets}×${ex.reps}</span></div>`).join('')}
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

  let planBuilder = { name: '', level: 'Anfänger', days: [] };

  function initTrainingHandlers() {
    document.getElementById('btn-custom-plan').addEventListener('click', () => {
      planBuilder = { name: '', level: 'Anfänger', days: [] };
      openPlanBuilderModal();
    });
  }

  function openPlanBuilderModal() {
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
      planBuilder.days.push({ weekday: '', label: `Tag ${planBuilder.days.length + 1}`, exercises: [] });
      renderPlanBuilderDays(body);
    });

    body.querySelector('#pb-save').addEventListener('click', () => {
      if (!planBuilder.name.trim()) {
        showToast('Bitte einen Namen für den Plan angeben.');
        return;
      }
      if (planBuilder.days.length === 0 || planBuilder.days.some((d) => d.exercises.length === 0)) {
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
        days: planBuilder.days.map((d) => ({ day: d.label, label: d.label, exercises: d.exercises })),
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

  function renderPlanBuilderDays(body) {
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
    el.querySelectorAll('[data-remove-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        planBuilder.days.splice(parseInt(btn.dataset.removeDay, 10), 1);
        renderPlanBuilderDays(body);
      });
    });
  }

  /* ==========================================================================
     TRAINING — Verlauf
     ========================================================================== */

  function renderWorkoutHistory() {
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
        <div class="history-volume">${round(h.volume)} KG<br>VOLUMEN</div>
      </div>
    `
      )
      .join('');
  }

  /* ==========================================================================
     WORKOUT-MODUS
     ========================================================================== */

  let workoutState = null;
  let restTimer = null;
  let restSeconds = 90;

  function startWorkout(plan, day) {
    workoutState = {
      planId: plan.id,
      planName: plan.name,
      dayLabel: day.label,
      exercises: day.exercises.map((ex) => {
        const setCount = ex.sets;
        return {
          exerciseId: ex.exerciseId,
          targetReps: ex.reps,
          sets: Array.from({ length: setCount }, () => ({ reps: '', weight: '', done: false })),
        };
      }),
      currentIndex: 0,
    };
    document.getElementById('workout-mode').classList.remove('hidden');
    document.getElementById('workout-rest').classList.add('hidden');
    document.getElementById('workout-exercise-view').classList.remove('hidden');
    renderWorkoutExercise();
  }

  function renderWorkoutExercise() {
    const ex = workoutState.exercises[workoutState.currentIndex];
    const exData = getExerciseById(ex.exerciseId);
    document.getElementById('workout-progress').textContent = `ÜBUNG ${workoutState.currentIndex + 1} / ${workoutState.exercises.length}`;

    const view = document.getElementById('workout-exercise-view');
    view.innerHTML = `
      <div class="workout-ex-name">${exData ? exData.name : ex.exerciseId}</div>
      <div class="workout-ex-meta">${exData ? `${exData.group} · ${exData.level} · ${exData.equipment}` : ''} · ZIEL ${ex.targetReps} WDH</div>
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

  function showRestTimer() {
    document.getElementById('workout-exercise-view').classList.add('hidden');
    const restEl = document.getElementById('workout-rest');
    restEl.classList.remove('hidden');
    document.querySelectorAll('#rest-options .chip').forEach((c) => c.classList.toggle('active', parseInt(c.dataset.sec, 10) === restSeconds));
    runRestCountdown(restSeconds);
  }

  function runRestCountdown(seconds) {
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

  function advanceToNextExercise() {
    workoutState.currentIndex++;
    document.getElementById('workout-rest').classList.add('hidden');
    document.getElementById('workout-exercise-view').classList.remove('hidden');
    renderWorkoutExercise();
  }

  function initWorkoutModeHandlers() {
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
      if (confirm('Training abbrechen? Der Fortschritt geht verloren.')) {
        clearInterval(restTimer);
        workoutState = null;
        document.getElementById('workout-mode').classList.add('hidden');
      }
    });
  }

  function finishWorkout() {
    let volume = 0;
    workoutState.exercises.forEach((ex) => {
      ex.sets.forEach((s) => {
        const w = parseFloat(s.weight) || 0;
        const r = parseFloat(s.reps) || 0;
        volume += w * r;
      });
    });
    const entry = {
      id: uid(),
      date: todayKey(),
      planId: workoutState.planId,
      planName: workoutState.planName,
      dayLabel: workoutState.dayLabel,
      exercises: workoutState.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets.filter((s) => s.reps !== '' || s.weight !== '').map((s) => ({ reps: parseFloat(s.reps) || 0, weight: parseFloat(s.weight) || 0 })),
      })),
      volume,
    };
    const history = loadJSON(K.history, []);
    history.push(entry);
    saveJSON(K.history, history);

    workoutState = null;
    document.getElementById('workout-mode').classList.add('hidden');
    showToast('Training gespeichert. Gut gemacht.');
    renderHeute();
    if (document.querySelector('.subtab.active')?.dataset.subtab === 'verlauf') renderWorkoutHistory();
  }

  /* ==========================================================================
     FORTSCHRITT
     ========================================================================== */

  function renderFortschritt() {
    renderWeightSection();
    renderCalorieChart();
    renderTrainingCalendar();
    renderMeasurements();
    renderPersonalRecords();
  }

  function initFortschrittHandlers() {
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

  function setupCanvas(canvas) {
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

  function renderWeightSection() {
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

  function renderCalorieChart() {
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

  function renderTrainingCalendar() {
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

  function renderMeasurements() {
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

  function renderPersonalRecords() {
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

  /* ==========================================================================
     PROFIL
     ========================================================================== */

  const ACTIVITY_LABELS = {
    '1.2': 'Kaum aktiv',
    '1.375': 'Leicht aktiv',
    '1.55': 'Mäßig aktiv',
    '1.725': 'Sehr aktiv',
    '1.9': 'Extrem aktiv',
  };
  const GOAL_LABELS = { abnehmen: 'Abnehmen', halten: 'Gewicht halten', aufbau: 'Muskelaufbau' };

  function renderProfil() {
    const profile = getProfile();
    if (!profile) return;
    document.getElementById('profile-data').innerHTML = `
      <div class="profile-row"><span>Alter</span><span>${profile.age} Jahre</span></div>
      <div class="profile-row"><span>Geschlecht</span><span>${profile.gender === 'm' ? 'Männlich' : 'Weiblich'}</span></div>
      <div class="profile-row"><span>Größe</span><span>${profile.height} cm</span></div>
      <div class="profile-row"><span>Gewicht</span><span>${profile.weight} kg</span></div>
      <div class="profile-row"><span>Aktivität</span><span>${ACTIVITY_LABELS[profile.activity] || profile.activity}</span></div>
      <div class="profile-row"><span>Ziel</span><span>${GOAL_LABELS[profile.goal] || profile.goal}</span></div>
    `;
    document.getElementById('profile-goals').innerHTML = `
      <div class="profile-row"><span>Kalorien</span><span>${profile.calorieGoal} kcal</span></div>
      <div class="profile-row"><span>Protein</span><span>${profile.proteinGoal} g</span></div>
      <div class="profile-row"><span>Kohlenhydrate</span><span>${profile.carbGoal} g</span></div>
      <div class="profile-row"><span>Fett</span><span>${profile.fatGoal} g</span></div>
    `;
  }

  function initProfilHandlers() {
    document.getElementById('btn-edit-profile').addEventListener('click', openEditProfileModal);
    document.getElementById('btn-edit-goals').addEventListener('click', openEditGoalsModal);
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('change', importData);
    document.getElementById('btn-reset').addEventListener('click', resetAllData);
  }

  function openEditProfileModal() {
    const profile = getProfile();
    const body = openModal('Angaben bearbeiten', `
      <div class="field-label">Alter</div>
      <input type="number" id="ep-age" value="${profile.age}">
      <div class="field-label">Geschlecht</div>
      <div class="chip-group" id="ep-gender">
        <button type="button" class="chip ${profile.gender === 'm' ? 'active' : ''}" data-value="m">Männlich</button>
        <button type="button" class="chip ${profile.gender === 'w' ? 'active' : ''}" data-value="w">Weiblich</button>
      </div>
      <div class="field-label">Größe (cm)</div>
      <input type="number" id="ep-height" value="${profile.height}">
      <div class="field-label">Gewicht (kg)</div>
      <input type="number" step="0.1" id="ep-weight" value="${profile.weight}">
      <div class="field-label">Aktivitätslevel</div>
      <div class="chip-group vertical" id="ep-activity">
        ${Object.entries(ACTIVITY_LABELS).map(([val, label]) => `<button type="button" class="chip ${profile.activity === val ? 'active' : ''}" data-value="${val}">${label}</button>`).join('')}
      </div>
      <div class="field-label">Ziel</div>
      <div class="chip-group vertical" id="ep-goal">
        ${Object.entries(GOAL_LABELS).map(([val, label]) => `<button type="button" class="chip ${profile.goal === val ? 'active' : ''}" data-value="${val}">${label}</button>`).join('')}
      </div>
      <button class="btn btn-primary btn-full" id="ep-save">Speichern & Ziele neu berechnen</button>
    `);

    let gender = profile.gender, activity = profile.activity, goal = profile.goal;
    body.querySelector('#ep-gender').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...body.querySelector('#ep-gender').children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      gender = btn.dataset.value;
    });
    body.querySelector('#ep-activity').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...body.querySelector('#ep-activity').children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      activity = btn.dataset.value;
    });
    body.querySelector('#ep-goal').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      [...body.querySelector('#ep-goal').children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      goal = btn.dataset.value;
    });

    body.querySelector('#ep-save').addEventListener('click', () => {
      const updated = {
        ...profile,
        age: parseInt(body.querySelector('#ep-age').value, 10),
        gender,
        height: parseFloat(body.querySelector('#ep-height').value),
        weight: parseFloat(body.querySelector('#ep-weight').value),
        activity,
        goal,
      };
      Object.assign(updated, calcGoals(updated));
      saveJSON(K.profile, updated);
      closeModal();
      showToast('Angaben aktualisiert.');
      renderProfil();
      renderHeute();
    });
  }

  function openEditGoalsModal() {
    const profile = getProfile();
    const body = openModal('Ziele anpassen', `
      <div class="field-label">Kalorien (kcal)</div>
      <input type="number" id="eg-kcal" value="${profile.calorieGoal}">
      <div class="field-label">Protein (g)</div>
      <input type="number" id="eg-protein" value="${profile.proteinGoal}">
      <div class="field-label">Kohlenhydrate (g)</div>
      <input type="number" id="eg-carbs" value="${profile.carbGoal}">
      <div class="field-label">Fett (g)</div>
      <input type="number" id="eg-fat" value="${profile.fatGoal}">
      <button class="btn btn-ghost btn-full" id="eg-auto">Automatisch berechnen</button>
      <button class="btn btn-primary btn-full" id="eg-save">Speichern</button>
    `);

    body.querySelector('#eg-auto').addEventListener('click', () => {
      const goals = calcGoals(profile);
      body.querySelector('#eg-kcal').value = goals.calorieGoal;
      body.querySelector('#eg-protein').value = goals.proteinGoal;
      body.querySelector('#eg-carbs').value = goals.carbGoal;
      body.querySelector('#eg-fat').value = goals.fatGoal;
    });

    body.querySelector('#eg-save').addEventListener('click', () => {
      const updated = {
        ...profile,
        calorieGoal: parseInt(body.querySelector('#eg-kcal').value, 10),
        proteinGoal: parseInt(body.querySelector('#eg-protein').value, 10),
        carbGoal: parseInt(body.querySelector('#eg-carbs').value, 10),
        fatGoal: parseInt(body.querySelector('#eg-fat').value, 10),
      };
      saveJSON(K.profile, updated);
      closeModal();
      showToast('Ziele aktualisiert.');
      renderProfil();
      renderHeute();
    });
  }

  function exportData() {
    const data = {};
    ALL_KEYS.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (raw !== null) data[key] = JSON.parse(raw);
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form-export-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export gestartet.');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data[K.profile]) {
          showToast('Ungültige Datei.');
          return;
        }
        ALL_KEYS.forEach((key) => {
          if (data[key] !== undefined) saveJSON(key, data[key]);
        });
        showToast('Import erfolgreich. App wird neu geladen.');
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        showToast('Datei konnte nicht gelesen werden.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function resetAllData() {
    if (!confirm('Wirklich alle Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
    ALL_KEYS.forEach((key) => localStorage.removeItem(key));
    location.reload();
  }

  /* ==========================================================================
     Mitternachts-Check
     ========================================================================== */

  let lastKnownDateKey = todayKey();
  function startMidnightWatcher() {
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

  function bootstrapApp() {
    renderHeute();
    renderProfil();
    startMidnightWatcher();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initOnboarding();
    initNav();
    initHeuteHandlers();
    initKalorienHandlers();
    initScannerHandlers();
    initRecipeHandlers();
    initTrainingHandlers();
    initWorkoutModeHandlers();
    initFortschrittHandlers();
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
})();
