/* FORM — kalorien.js — Kalorien-Tab: Suche, manuelle Einträge, Tagesübersicht. */
import { renderHeute } from './heute.js';
import { renderRecipeList, renderRecipesPanel } from './rezepte.js';
import { openScanner } from './scanner.js';
import { K, MEALS, allFoods, deComma, findFood, getDay, loadJSON, round, saveDay, saveJSON, todayKey, uid } from './storage.js';
import { bindChipSelect, closeModal, openModal, showToast } from './ui.js';

  /* ==========================================================================
     KALORIEN
     ========================================================================== */

  export function renderKalorien() {
    renderQuickChips();
    document.getElementById('food-search-results').innerHTML = '';
    renderMeals();
    if (document.getElementById('kalorien-rezepte').dataset.built) renderRecipeList();
  }

  export function switchKalorienSubtab(tab) {
    document.querySelectorAll('#kalorien-subtabs .subtab').forEach((s) => s.classList.toggle('active', s.dataset.subtab === tab));
    document.getElementById('kalorien-tagebuch').classList.toggle('hidden', tab !== 'tagebuch');
    document.getElementById('kalorien-rezepte').classList.toggle('hidden', tab !== 'rezepte');
    if (tab === 'rezepte') renderRecipesPanel();
  }

  export function renderQuickChips() {
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

  export function initKalorienHandlers() {
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
            <div class="food-meta">${f.kcal} KCAL · ${deComma(f.protein)}P ${deComma(f.carbs)}K ${deComma(f.fat)}F / 100G</div>
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

  export function openCustomFoodModal(barcode) {
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

  export function openAddFoodModal(foodId, editEntry) {
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
    bindChipSelect(mealGroup, (value) => { selectedMeal = value; });

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

  export function renderMeals() {
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