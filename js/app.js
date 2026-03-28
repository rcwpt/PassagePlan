/**
 * app.js
 * Main application logic:
 *  - Wires up UI controls (file upload, departure time, speed, UN/LOCODE)
 *  - Drives ETA & course calculation using Turf.js
 *  - Populates the passage plan table
 *  - Handles print/PDF export
 */

(function () {
  'use strict';

  /* ── State ──────────────────────────────────────────────────────────────── */
  let waypoints   = [];   // raw [{ name, lat, lon }]
  let planData    = [];   // calculated [{ ...wp, distance, course, eta, totalNM }]
  let unlocode    = {};   // loaded from data/unlocode.json

  /* ── DOM references ─────────────────────────────────────────────────────── */
  const fileInput       = document.getElementById('route-file');
  const uploadBtn       = document.getElementById('upload-btn');
  const departureInput  = document.getElementById('departure-time');
  const speedInput      = document.getElementById('ship-speed');
  const calcBtn         = document.getElementById('calc-btn');
  const locodeInput     = document.getElementById('locode-input');
  const locodeBtn       = document.getElementById('locode-btn');
  const printBtn        = document.getElementById('print-btn');
  const clearBtn        = document.getElementById('clear-btn');
  const windyToggle     = document.getElementById('windy-toggle');
  const statusBar       = document.getElementById('status-bar');
  const tableBody       = document.getElementById('plan-tbody');
  const summaryEl       = document.getElementById('plan-summary');
  const fileNameEl      = document.getElementById('file-name');

  /* ── Initialise ─────────────────────────────────────────────────────────── */
  function init() {
    RouteMap.init('map');
    loadUnlocode();
    bindEvents();

    // Default departure time to now (rounded to minute)
    const now = new Date();
    now.setSeconds(0, 0);
    departureInput.value = now.toISOString().slice(0, 16);
  }

  /* ── Load UN/LOCODE data ─────────────────────────────────────────────────── */
  function loadUnlocode() {
    fetch('data/unlocode.json')
      .then(r => r.json())
      .then(data => {
        unlocode = data;
        setStatus('Ready. Load a route file to begin.', 'info');
      })
      .catch(() => {
        setStatus('Warning: UN/LOCODE database could not be loaded.', 'warn');
      });
  }

  /* ── Event Bindings ─────────────────────────────────────────────────────── */
  function bindEvents() {
    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      fileNameEl.textContent = file.name;
      handleFileUpload(file);
    });

    // Drag-and-drop on the upload area
    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) { fileNameEl.textContent = file.name; handleFileUpload(file); }
    });

    calcBtn.addEventListener('click',   calculatePlan);
    locodeBtn.addEventListener('click', lookupLocode);
    printBtn.addEventListener('click',  printPlan);
    clearBtn.addEventListener('click',  clearAll);

    locodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') lookupLocode(); });
    speedInput.addEventListener('input',    () => { if (waypoints.length) calculatePlan(); });
    departureInput.addEventListener('input', () => { if (waypoints.length) calculatePlan(); });

    windyToggle.addEventListener('change', () => {
      RouteMap.toggleWindy(windyToggle.checked);
    });
  }

  /* ── File upload handler ─────────────────────────────────────────────────── */
  function handleFileUpload(file) {
    setStatus('Parsing route file…', 'info');
    RouteParser.parseFile(file)
      .then(wps => {
        if (wps.length < 2) throw new Error('Route must have at least 2 waypoints.');
        waypoints = wps;
        setStatus(`Route loaded: ${wps.length} waypoints from "${file.name}".`, 'ok');
        calculatePlan();
      })
      .catch(err => {
        setStatus(`Error: ${err.message}`, 'error');
      });
  }

  /* ── ETA & Course Calculation ────────────────────────────────────────────── */
  function calculatePlan() {
    if (waypoints.length === 0) {
      setStatus('No route loaded. Please upload a file first.', 'warn');
      return;
    }

    const speed     = parseFloat(speedInput.value);
    const departure = departureInput.value;

    if (isNaN(speed) || speed <= 0) {
      setStatus('Please enter a valid ship speed (knots).', 'warn');
      return;
    }
    if (!departure) {
      setStatus('Please enter a departure date/time.', 'warn');
      return;
    }

    let currentTime  = new Date(departure);
    let cumulativeNM = 0;
    planData = [];

    waypoints.forEach((wp, idx) => {
      const entry = {
        index:    idx + 1,
        name:     wp.name,
        lat:      wp.lat,
        lon:      wp.lon,
        distance: 0,
        course:   '—',
        eta:      idx === 0 ? formatDateTime(currentTime) : '—',
        cumNM:    0,
      };

      if (idx > 0) {
        const prev    = waypoints[idx - 1];
        const from    = turf.point([prev.lon, prev.lat]);
        const to      = turf.point([wp.lon, wp.lat]);

        // Distance in nautical miles (Turf returns km by default)
        const distKm  = turf.distance(from, to, { units: 'kilometers' });
        const distNM  = distKm * 0.539957;

        // Bearing/Course (0–360°)
        const bearing = turf.bearing(from, to);
        const course  = ((bearing % 360) + 360) % 360;

        // Travel time in hours
        const hoursNeeded = distNM / speed;
        currentTime = new Date(currentTime.getTime() + hoursNeeded * 3600000);

        cumulativeNM += distNM;

        entry.distance = distNM.toFixed(1);
        entry.course   = course.toFixed(1);
        entry.eta      = formatDateTime(currentTime);
        entry.cumNM    = cumulativeNM.toFixed(1);
      }

      planData.push(entry);
    });

    renderTable(planData);
    RouteMap.renderRoute(planData.map(e => ({
      name:     e.name,
      lat:      e.lat,
      lon:      e.lon,
      eta:      e.eta,
      course:   e.course,
      distance: e.distance,
    })));

    const totalDist = planData[planData.length - 1].cumNM;
    const lastEta   = planData[planData.length - 1].eta;
    summaryEl.textContent =
      `Total Distance: ${totalDist} NM  |  Departure: ${planData[0].eta}  |  ETA Destination: ${lastEta}  |  Speed: ${speed} kt`;

    setStatus(`Passage plan calculated for ${waypoints.length} waypoints.`, 'ok');
  }

  /* ── Table Rendering ─────────────────────────────────────────────────────── */
  function renderTable(data) {
    tableBody.innerHTML = '';
    data.forEach(row => {
      const tr = document.createElement('tr');
      if (row.index === 1) tr.classList.add('row-departure');
      if (row.index === data.length) tr.classList.add('row-arrival');

      tr.innerHTML = `
        <td class="col-index">${row.index}</td>
        <td class="col-name">${escapeHtml(row.name)}</td>
        <td class="col-coord">${decimalToDMS(row.lat, 'lat')}</td>
        <td class="col-coord">${decimalToDMS(row.lon, 'lon')}</td>
        <td class="col-num">${row.index === 1 ? '—' : row.distance}</td>
        <td class="col-num">${row.index === 1 ? '—' : row.course}</td>
        <td class="col-num">${row.index === 1 ? '—' : row.cumNM}</td>
        <td class="col-eta">${row.eta}</td>`;
      tableBody.appendChild(tr);
    });
  }

  /* ── UN/LOCODE Lookup ────────────────────────────────────────────────────── */
  function lookupLocode() {
    const code = locodeInput.value.trim().toUpperCase();
    if (!code) { setStatus('Please enter a UN/LOCODE.', 'warn'); return; }

    const entry = unlocode[code];
    if (!entry) {
      setStatus(`UN/LOCODE "${code}" not found in local database.`, 'warn');
      return;
    }

    RouteMap.flyTo(entry.lat, entry.lon, 11);
    setStatus(`Navigated to ${entry.name} (${code}).`, 'ok');
  }

  /* ── Print / Export to PDF ───────────────────────────────────────────────── */
  function printPlan() {
    if (planData.length === 0) {
      setStatus('No passage plan to print. Calculate a plan first.', 'warn');
      return;
    }
    window.print();
  }

  /* ── Clear All ───────────────────────────────────────────────────────────── */
  function clearAll() {
    waypoints = [];
    planData  = [];
    RouteMap.clearRoute();
    tableBody.innerHTML = '';
    summaryEl.textContent = '';
    fileNameEl.textContent = 'No file selected';
    fileInput.value = '';
    setStatus('Cleared. Ready for new route.', 'info');
  }

  /* ── Utility Functions ───────────────────────────────────────────────────── */
  function setStatus(msg, type) {
    statusBar.textContent = msg;
    statusBar.className   = 'status-bar status-' + (type || 'info');
  }

  function formatDateTime(date) {
    const pad = n => String(n).padStart(2, '0');
    // ETA is displayed at HH:MM precision — seconds are intentionally omitted
    // as maritime ETAs are conventionally expressed to the nearest minute.
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
           `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
  }

  function decimalToDMS(decimal, type) {
    const dir     = type === 'lat'
                     ? (decimal >= 0 ? 'N' : 'S')
                     : (decimal >= 0 ? 'E' : 'W');
    const abs     = Math.abs(decimal);
    const deg     = Math.floor(abs);
    const minFull = (abs - deg) * 60;
    const min     = Math.floor(minFull);
    // Clamp seconds to [0, 60) to prevent rounding to 60.0
    const secRaw  = (minFull - min) * 60;
    const sec     = Math.min(secRaw, 59.9).toFixed(1).padStart(4, '0');
    return `${deg}° ${String(min).padStart(2, '0')}' ${sec}" ${dir}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Public API for demo button ────────────────────────────────────────── */
  window._appLoadWaypoints = function (wps, filename) {
    if (!wps || wps.length < 2) {
      setStatus('Demo route must have at least 2 waypoints.', 'warn');
      return;
    }
    waypoints = wps;
    setStatus(`Route loaded: ${wps.length} waypoints from "${filename}".`, 'ok');
    calculatePlan();
  };

  /* ── Boot ────────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', init);
})();
