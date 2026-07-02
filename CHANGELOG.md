# Changelog

## Cleanup-Pass — Code-Qualität, Konsistenz, Bugfixes

Kein neues Feature-Verhalten, keine Design-Änderungen — nur Struktur, Konsistenz und Bugfixes. Vor und nach jedem Schritt gegen die volle Playwright-Regressionssuite (Onboarding, Kalorientracking, Barcode-Scan, Rezepte, Workout inkl. Progressive Overload, HIIT-Timer, Wochen-Review, Storage-Migration, Export/Import, Offline-Start) getestet.

### 1. Struktur: app.js in Module aufgeteilt

`app.js` (3426 Zeilen, eine IIFE) ist jetzt 11 ES-Module unter `js/`, geladen über einen einzigen `<script type="module" src="./js/ui.js">`-Tag:

| Datei | Inhalt |
|---|---|
| `js/storage.js` | Konstanten, localStorage-Zugriff, Ziel-Berechnung (Mifflin-St-Jeor) |
| `js/ui.js` | Navigation, Modal, Onboarding, Bootstrap/Init (Einstiegspunkt) |
| `js/heute.js` | Dashboard: Kalorien-/Makro-Übersicht, Wasser, Streak, Trainingskarte |
| `js/kalorien.js` | Suche, manuelle Einträge, Tagesübersicht |
| `js/scanner.js` | Barcode-Scanner + OpenFoodFacts-Anbindung |
| `js/rezepte.js` | Rezepte-Filter, Detailansicht, eigene Rezepte |
| `js/training.js` | Übungsbrowser, Pläne, Workout-Modus, Progressive Overload |
| `js/timer.js` | HIIT-Intervall-Timer |
| `js/fortschritt.js` | Charts, Kalender, Körpermaße, Rekorde |
| `js/review.js` | Wochen-Review-Berechnung und -Ansicht |
| `js/profil.js` | Angaben, Ziele, Export/Import/Reset |

`data.js` ist jetzt ebenfalls ein reines ES-Modul (`export const ...` statt `module.exports`). Die Aufteilung folgte den bestehenden Abschnittsgrenzen der Originaldatei; Modul-Zuordnung und Import/Export-Kanten wurden automatisiert aus einer Zeilen-Bereichs-Zuordnung erzeugt (kein manuelles Abtippen), danach gegen die volle Testsuite verifiziert.

### 2. Storage-Schicht: einheitliches Key-Schema + Migration

- Alle localStorage-Keys folgen jetzt dem Schema `form:domain:name` (z. B. `form:kalorien:days`, `form:training:history`, `form:rezepte:favorites`) statt der bisherigen `form_snake_case`-Namen.
- Eine einmalige Migrationsfunktion (`migrateLegacyStorageKeys`, läuft beim ersten Start nach diesem Update) kopiert vorhandene `form_*`-Daten verlustfrei auf die neuen Keys und räumt die alten danach auf. Verifiziert per Test: alter Profil-/Tages-/Rezept-Favoriten-Datensatz wird korrekt übernommen, Onboarding wird bei bestehendem Profil korrekt übersprungen.
- `saveJSON` fängt jetzt Schreibfehler (`QuotaExceededError` u. a.) ab und loggt sie, statt die App abstürzen zu lassen.

### 3. Dedupe / totes Aufräumen

- Die 14-fach wiederholte Einzelauswahl-Chip-Logik (Onboarding, Mahlzeit-Auswahl, Rezept-Filter/-Builder, Plan-Builder, Profil-Bearbeitung) ist jetzt eine gemeinsame Funktion `bindChipSelect()` in `ui.js`.
- Entfernt: `K.session`-Storage-Key (nie geschrieben oder gelesen) und `obState.step` (Onboarding-Feld ohne Verwendung seit Umstellung auf `data-step`-Navigation).

### 4. Gefundene und behobene Bugs

- **Kamera lief im Hintergrund weiter**: Der Barcode-Scanner stoppte die Kamera bisher nur bei Abbrechen/Scan-Erfolg/Fehler, nicht beim Wechsel in den Hintergrund (Tab-/App-Wechsel). Jetzt hört der Scanner auf `visibilitychange`, gibt den Stream beim Verstecken frei und startet ihn beim Zurückkehren neu — mit echtem `getUserMedia`-Stream verifiziert (Stream aktiv → versteckt → Stream beendet → sichtbar → Stream neu gestartet).
- **Inkonsistentes Dezimalformat**: Etliche Zahlenanzeigen zeigten einen Punkt statt eines Kommas (Lebensmittelsuche „13.5P“, Rezept-Zutatenmengen, OpenFoodFacts-Nährwerte, Gewichts-Chart-Achsen, Wasser-Liter-Label, Gewicht im Profil, „Letztes Mal“-Zeile beim Progressive Overload). Ein zentrales `deComma()` in `storage.js` wird jetzt überall dafür verwendet; intern wird weiterhin mit JS-Zahlen (Punkt) gerechnet.
- **Zu optimistische PR-Erkennung**: Die erste Ausführung einer Übung ohne vorherige Historie wurde fälschlich als „neuer Rekord“ gezählt. `isNewPR` verlangt jetzt eine vorhandene Historie, bevor ein Satz als Rekord zählt.
- **Doppel-Eintrag durch schnelles Doppel-Tippen**: „Hinzufügen“ (Lebensmittel, Scan-Produkt, Rezept) und „Training beenden“ deaktivieren sich jetzt sofort beim ersten Klick. Verifiziert: zwei synchron ausgelöste Klicks erzeugen nur einen Tagebucheintrag.
- **Subtab-Kollision**: Der neue Rezepte-Untertab und die Trainings-Untertabs teilten sich unskopierte `.subtab`/`.training-panel`-Selektoren; ein Klick auf „Training“ konnte alle Panels beider Tab-Gruppen verstecken. Jetzt sind beide Abfragen auf ihre jeweilige Tab-Leiste beschränkt.

### 5. Verifiziert, keine Änderung nötig

- **Wochen-Review Mo–So-Grenze**: korrekt für alle Wochentage (Test mit Do/So/Mo-Startdaten). Leere Wochen zeigen „Keine Daten für diese Woche erfasst.“ ohne Fehler.
- **HIIT-Timer im Hintergrund**: Restzeit wird bereits timestamp-basiert berechnet (nicht durch Zählen von `setInterval`-Ticks), inklusive Aufhol-Logik für mehrere verpasste Phasenwechsel; verifiziert per Zustands-Trace über eine komplette Session.
- **Safe-Area-Insets**: alle fünf Vollbild-Overlays (Onboarding, Workout-Modus, Scanner, Intervall-Timer, Rezept-/Review-Detail) hatten bereits `--safe-top`/`--safe-bottom`.
- **`.btn`/`.chip`-Konsistenz**: bereits eine Basisklasse mit Modifikatoren (`btn-primary/ghost/danger/small/full`, `chip.active/accent`) — keine Vereinheitlichung nötig.
- **Export/Import-Vollständigkeit**: Rundtrip-Test (Export → Reset → Import) bestätigt, dass Rezept-Favoriten, gescannte Produkte, Trainingshistorie (inkl. Basis für persönliche Rekorde) und Gewichtsverlauf vollständig wiederhergestellt werden.
- **data.js-Audit**: keine doppelten IDs/Namen in Lebensmitteln (131), Übungen (55) oder Rezepten (40); alle Übungs- und Lebensmittel-Referenzen in Plänen/Rezepten gültig. Abweichungen einzelner Lebensmittel vom naiven `Protein×4 + KH×4 + Fett×9`-Wert (v. a. Gemüse, Obst, alkoholische Getränke) sind reale, durch Ballaststoffe bzw. Alkoholkalorien bedingte Effekte und keine Dateneingabefehler — Werte wurden nicht „korrigiert“.
- **Offline-Start**: kompletter Testlauf mit `context.setOffline(true)` nach Reload — App startet und alle Tabs (Training, Rezepte) funktionieren vollständig offline; einzige Ausnahme ist erwartungsgemäß der Scanner (OpenFoodFacts-Abfrage braucht eine Verbindung).

### 6. CSS

- Zwei eigenständig anklickbare Icon-Buttons (Rezept-Favoriten-Stern, Wochen-Review-Banner-Schließen) hatten 32px-Trefferflächen unter der 44px-Richtlinie; beide jetzt auf 44px angehoben (Layout per Screenshot-Vergleich unverändert).
- Spacing-Skala (`--space-1`…`--space-10`) und Schriftgrößen-/Tracking-Skala (`--text-2xs`…`--text-6xl`, `--tracking-*`) im `:root` ergänzt und auf das Label-/Headline-System angewendet (reine Token-Substitution, computed Werte unverändert — per `getComputedStyle` verifiziert).
- Farben waren bereits vollständig über Custom Properties abgebildet.

### 7. PWA / Service Worker

- Cache-Version auf `form-cache-v2` erhöht, Precache-Liste um alle 11 neuen `js/*.js`-Dateien ergänzt (app.js/data.js-Eintrag entsprechend angepasst).
- Alte Caches werden weiterhin beim `activate`-Event automatisch gelöscht (bereits vorhandene Logik, profitiert jetzt von der Versionierung).

### Nicht angetastet

Verhalten und Design sind unverändert. Größere mechanische Umbenennungen mit unklarem Nutzen/Risiko-Verhältnis (z. B. eine vollständige Ersetzung aller hartkodierten Pixelwerte im 1556-Zeilen-Stylesheet durch Tokens) wurden bewusst nicht flächendeckend durchgeführt, um das Risiko visueller Regressionen in einer bereits funktionierenden, getesteten App nicht unnötig zu erhöhen.
