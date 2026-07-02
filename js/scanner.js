/* FORM — scanner.js — Barcode-Scanner + OpenFoodFacts-Anbindung. */
import { renderHeute } from './heute.js';
import { openCustomFoodModal, renderKalorien } from './kalorien.js';
import { K, MEALS, deComma, getDay, loadJSON, round, round10, saveDay, saveJSON, todayKey, uid } from './storage.js';
import { bindChipSelect, closeModal, openModal, showToast } from './ui.js';

  /* ==========================================================================
     BARCODE-SCANNER
     ========================================================================== */

  export const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product/';
  export const OFF_FIELDS = 'product_name,product_name_de,brands,nutriments,nutriscore_grade,serving_size,image_small_url';
  export const HTML5_QRCODE_SRC = 'https://unpkg.com/html5-qrcode';

  export const scannerState = {
    stream: null,
    detecting: false,
    rafId: null,
    html5QrCode: null,
    detector: null,
    pausedByVisibility: false,
  };

  function onScannerVisibilityChange() {
    const overlayOpen = !document.getElementById('scanner-overlay').classList.contains('hidden');
    if (!overlayOpen) return;
    if (document.visibilityState === 'hidden') {
      if (scannerState.stream || scannerState.html5QrCode) {
        scannerState.pausedByVisibility = true;
        stopScanner();
      }
    } else if (scannerState.pausedByVisibility) {
      scannerState.pausedByVisibility = false;
      showScannerState('status', 'Kamera wird aktiviert…');
      startScanner();
    }
  }

  export function loadScript(src) {
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

  export function initScannerHandlers() {
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

  export function openScanner() {
    document.getElementById('scanner-overlay').classList.remove('hidden');
    document.getElementById('scanner-manual-input').value = '';
    showScannerState('status', 'Kamera wird aktiviert…');
    document.addEventListener('visibilitychange', onScannerVisibilityChange);
    startScanner();
  }

  export function closeScannerOverlay() {
    stopScanner();
    scannerState.pausedByVisibility = false;
    document.removeEventListener('visibilitychange', onScannerVisibilityChange);
    document.getElementById('scanner-overlay').classList.add('hidden');
  }

  export function showScannerState(which, text) {
    ['camera', 'status', 'error', 'manual'].forEach((s) => {
      document.getElementById(`scanner-${s}-state`).classList.toggle('hidden', s !== which);
    });
    if (which === 'status') document.getElementById('scanner-status-text').textContent = text || '';
  }

  export function stopScanner() {
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

  export function startScanner() {
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

  export function startNativeScanner() {
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

  export function startFallbackScanner() {
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

  export function showCameraError() {
    showScannerState('error');
    document.getElementById('scanner-error-text').textContent =
      'Kein Zugriff auf die Kamera. Bitte erlaube den Kamera-Zugriff in den Browser- bzw. Systemeinstellungen.';
    const btn = document.getElementById('scanner-manual-btn');
    btn.textContent = 'Barcode manuell eingeben';
    btn.onclick = () => showScannerState('manual');
  }

  export function handleBarcodeResult(code) {
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

  export function showLookupError(err, barcode) {
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

  export function lookupProduct(barcode) {
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

  export function mapOFFProduct(p, barcode) {
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

  export function computeFitnessTags(p) {
    const tags = [];
    if (typeof p.protein === 'number' && p.protein >= 20) tags.push('PROTEINREICH');
    if (typeof p.sugars === 'number' && p.sugars >= 15) tags.push('VIEL ZUCKER');
    if (typeof p.fiber === 'number' && p.fiber >= 6) tags.push('BALLASTSTOFFREICH');
    if (typeof p.kcal === 'number' && p.kcal >= 400) tags.push('KALORIENDICHT');
    if (typeof p.kcal === 'number' && p.kcal <= 120 && typeof p.protein === 'number' && p.protein >= 8) tags.push('GUT FÜRS DEFIZIT');
    return tags;
  }

  export function fmtNutrient(v, unit) {
    return typeof v === 'number' ? `${deComma(round10(v))} ${unit}` : '–';
  }

  export function persistScannedProduct(product) {
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

  export function openProductDetailModal(product) {
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
    bindChipSelect(mealGroup, (value) => { selectedMeal = value; });

    const amountInput = body.querySelector('#pd-amount');
    function updatePreview() {
      const amt = parseFloat(amountInput.value) || 0;
      const factor = amt / 100;
      body.querySelector('#pd-preview').textContent =
        `${round((product.kcal || 0) * factor)} KCAL · ${round((product.protein || 0) * factor)}G PROTEIN · ${round((product.carbs || 0) * factor)}G KOHLENHYDRATE · ${round((product.fat || 0) * factor)}G FETT`;
    }
    amountInput.addEventListener('input', updatePreview);
    updatePreview();

    body.querySelector('#pd-add').addEventListener('click', (e) => {
      const amt = parseFloat(amountInput.value);
      if (!amt || amt <= 0) {
        showToast('Bitte gültige Menge eingeben.');
        return;
      }
      if (e.currentTarget.disabled) return;
      e.currentTarget.disabled = true;
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