/* FORM — profil.js — Profil-Tab: Angaben, Ziele, Export/Import/Reset. */
import { renderHeute } from './heute.js';
import { ALL_KEYS, K, calcGoals, getProfile, saveJSON, todayKey } from './storage.js';
import { closeModal, openModal, showToast } from './ui.js';

  /* ==========================================================================
     PROFIL
     ========================================================================== */

  export const ACTIVITY_LABELS = {
    '1.2': 'Kaum aktiv',
    '1.375': 'Leicht aktiv',
    '1.55': 'Mäßig aktiv',
    '1.725': 'Sehr aktiv',
    '1.9': 'Extrem aktiv',
  };
  export const GOAL_LABELS = { abnehmen: 'Abnehmen', halten: 'Gewicht halten', aufbau: 'Muskelaufbau' };

  export function renderProfil() {
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

  export function initProfilHandlers() {
    document.getElementById('btn-edit-profile').addEventListener('click', openEditProfileModal);
    document.getElementById('btn-edit-goals').addEventListener('click', openEditGoalsModal);
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('change', importData);
    document.getElementById('btn-reset').addEventListener('click', resetAllData);
  }

  export function openEditProfileModal() {
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

  export function openEditGoalsModal() {
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

  export function exportData() {
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

  export function importData(e) {
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

  export function resetAllData() {
    if (!confirm('Wirklich alle Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
    ALL_KEYS.forEach((key) => localStorage.removeItem(key));
    location.reload();
  }
