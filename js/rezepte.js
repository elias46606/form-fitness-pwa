/* FORM — rezepte.js — Rezepte-Tab: Filter, Detailansicht, eigene Rezepte. */
import { RECIPES, buildRecipe, ing } from '../data.js';
import { renderHeute } from './heute.js';
import { renderKalorien } from './kalorien.js';
import { K, MEALS, allFoods, findFood, getDay, getProfile, loadJSON, round, saveDay, saveJSON, todayKey, uid } from './storage.js';
import { bindChipSelect, closeModal, openModal, showToast } from './ui.js';

  /* ==========================================================================
     REZEPTE
     ========================================================================== */

  export const RECIPE_TAG_LABELS = {
    proteinreich: 'PROTEINREICH',
    'low-cal': 'UNTER 400 KCAL',
    schnell: 'SCHNELL',
    vegetarisch: 'VEGETARISCH',
    vegan: 'VEGAN',
    EIGENES: 'EIGENES',
  };

  export const recipeFilterState = { kategorie: 'Alle', tag: null };
  export let openRecipeId = null;
  export const recipePortionState = { factor: 1, excluded: new Set() };

  export function allRecipes() {
    return RECIPES.concat(loadJSON(K.customRecipes, []));
  }

  export function findRecipe(id) {
    return allRecipes().find((r) => r.id === id);
  }

  export function renderRecipesPanel() {
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
      bindChipSelect(kategorieEl, (value) => {
        recipeFilterState.kategorie = value;
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

  export function renderRecipeList() {
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

  export function toggleRecipeFavorite(id) {
    let favs = loadJSON(K.recipeFavorites, []);
    if (favs.includes(id)) favs = favs.filter((f) => f !== id);
    else favs.unshift(id);
    saveJSON(K.recipeFavorites, favs);
  }

  export function fmtRecipeAmount(menge, einheit, factor) {
    const scaled = menge * factor;
    const rounded = einheit === 'g' || einheit === 'ml' ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    return `${rounded} ${einheit}`;
  }

  export function computeScaledTotals(recipe, factor, excluded) {
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

  export function openRecipeDetail(id) {
    const recipe = findRecipe(id);
    if (!recipe) return;
    openRecipeId = id;
    recipePortionState.factor = 1;
    recipePortionState.excluded = new Set();
    document.getElementById('recipe-overlay').classList.remove('hidden');
    renderRecipeDetailContent();
  }

  export function closeRecipeDetail() {
    document.getElementById('recipe-overlay').classList.add('hidden');
    openRecipeId = null;
  }

  export let recipeSelectedMeal = null;

  export function renderRecipeDetailContent() {
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

    bindChipSelect(document.getElementById('recipe-portions'), (value, btn) => {
      recipePortionState.factor = parseFloat(btn.dataset.factor);
      renderRecipeIngredients(recipe);
      updateRecipeMetaLine(recipe);
    });

    bindChipSelect(document.getElementById('recipe-meal-select'), (value) => {
      recipeSelectedMeal = value;
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

  export function renderRecipeIngredients(recipe) {
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

  export function updateRecipeMetaLine(recipe) {
    const totals = computeScaledTotals(recipe, recipePortionState.factor, recipePortionState.excluded);
    document.getElementById('recipe-meta-line').textContent =
      `${round(totals.kcal)} KCAL · ${round(totals.protein)}G PROTEIN · ${recipe.zubereitungszeit} MIN · ${recipe.kategorie.toUpperCase()}`;
  }

  export function initRecipeHandlers() {
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

  export let recipeBuilder = null;

  export function openCustomRecipeModal() {
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

    bindChipSelect(body.querySelector('#rb-kategorie'), (value) => { recipeBuilder.kategorie = value; });
    bindChipSelect(body.querySelector('#rb-schwierigkeit'), (value) => { recipeBuilder.schwierigkeit = value; });

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

  export function renderRecipeBuilderIngredients(body) {
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

  export function renderMealSuggestions() {
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
