/* FORM — storage.js — Storage-Schicht: Konstanten, localStorage-Zugriff, Profil/Ziel-Berechnung. */
import { EXERCISES, FOOD_DB, WORKOUT_PLANS } from '../data.js';

  /* ==========================================================================
     Konstanten & Helfer
     ========================================================================== */

  export const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  export const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  export const MEALS = ['Frühstück', 'Mittag', 'Abend', 'Snacks'];
  export const WATER_GOAL_ML = 2500;
  export const GLASS_ML = 250;

  export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  export function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  export function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        console.error('FORM: localStorage voll, Speichern fehlgeschlagen für', key, e);
      } else {
        console.error('FORM: Speichern fehlgeschlagen für', key, e);
      }
      return false;
    }
  }

  export function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  export function todayKey() {
    return dateKey(new Date());
  }

  export function addDays(d, n) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  }

  export function round(n) {
    return Math.round(n);
  }

  export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /* ==========================================================================
     Storage-Schlüssel
     ========================================================================== */

  export const K = {
    profile: 'form:profile',
    days: 'form:kalorien:days',
    weightLog: 'form:fortschritt:weightLog',
    measurements: 'form:fortschritt:measurements',
    favorites: 'form:kalorien:favorites',
    customFoods: 'form:kalorien:customFoods',
    recentFoods: 'form:kalorien:recentFoods',
    activePlan: 'form:training:activePlan',
    customPlans: 'form:training:customPlans',
    history: 'form:training:history',
    scannedProducts: 'form:kalorien:scannedProducts',
    customRecipes: 'form:rezepte:custom',
    recipeFavorites: 'form:rezepte:favorites',
    dismissedReviewBanner: 'form:review:dismissedBanner',
  };

  export const ALL_KEYS = Object.values(K);

  /* Alte, unpräfixierte Schlüssel aus früheren Versionen -> neuer Schlüssel.
     Wird einmalig beim Start migriert, damit Bestandsnutzer ihre Daten behalten. */
  const LEGACY_KEY_MAP = {
    form_profile: K.profile,
    form_days: K.days,
    form_weight_log: K.weightLog,
    form_measurements: K.measurements,
    form_favorites: K.favorites,
    form_custom_foods: K.customFoods,
    form_recent_foods: K.recentFoods,
    form_active_plan: K.activePlan,
    form_custom_plans: K.customPlans,
    form_workout_history: K.history,
    form_scanned_products: K.scannedProducts,
    form_custom_recipes: K.customRecipes,
    form_recipe_favorites: K.recipeFavorites,
    form_dismissed_review_banner: K.dismissedReviewBanner,
  };

  const MIGRATION_DONE_KEY = 'form:migrated:v2';

  export function migrateLegacyStorageKeys() {
    try {
      if (localStorage.getItem(MIGRATION_DONE_KEY)) return;
      Object.entries(LEGACY_KEY_MAP).forEach(([oldKey, newKey]) => {
        const oldVal = localStorage.getItem(oldKey);
        if (oldVal !== null && localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, oldVal);
        }
        if (oldVal !== null) localStorage.removeItem(oldKey);
      });
      localStorage.setItem(MIGRATION_DONE_KEY, '1');
    } catch (e) {
      console.error('FORM: Migration der Storage-Keys fehlgeschlagen', e);
    }
  }

  /* ==========================================================================
     Daten-Zugriff
     ========================================================================== */

  export function getProfile() {
    return loadJSON(K.profile, null);
  }

  export function getDays() {
    return loadJSON(K.days, {});
  }

  export function getDay(key) {
    const days = getDays();
    if (!days[key]) {
      days[key] = { calories: [], water: 0, steps: 0 };
      saveJSON(K.days, days);
    }
    return days[key];
  }

  export function saveDay(key, dayObj) {
    const days = getDays();
    days[key] = dayObj;
    saveJSON(K.days, days);
  }

  export function allFoods() {
    const custom = loadJSON(K.customFoods, []);
    return FOOD_DB.concat(custom);
  }

  export function findFood(id) {
    return allFoods().find((f) => f.id === id);
  }

  export function getActivePlanObj() {
    const active = loadJSON(K.activePlan, null);
    if (!active) return null;
    const plan = getPlanById(active.planId, active.source);
    if (!plan) return null;
    return { active, plan };
  }

  export function getPlanById(id, source) {
    if (source === 'custom') {
      return loadJSON(K.customPlans, []).find((p) => p.id === id) || null;
    }
    return WORKOUT_PLANS.find((p) => p.id === id) || null;
  }

  export function getExerciseById(id) {
    return EXERCISES.find((e) => e.id === id);
  }

  /* ==========================================================================
     Ziel-Berechnung (Mifflin-St-Jeor)
     ========================================================================== */

  export function calcGoals(profile) {
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

  export function round10(v) {
    return Math.round(v * 10) / 10;
  }

  /* Deutsches Dezimalformat für Anzeige: Punkt -> Komma. Intern wird
     weiterhin mit JS-Zahlen (Punkt) gerechnet, nur die Anzeige ändert sich. */
  export function deComma(value) {
    return String(value).replace('.', ',');
  }