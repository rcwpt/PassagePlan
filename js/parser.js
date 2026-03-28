/**
 * parser.js
 * Handles parsing of route files: CSV, GPX, and RTZ
 * Returns an array of waypoint objects: [{ name, lat, lon }]
 */

const RouteParser = (() => {

  /**
   * Parse a CSV file.
   * Expected columns (flexible header detection):
   *   name/waypoint/wpt, lat/latitude, lon/lng/longitude
   * Falls back to column indices 0=name, 1=lat, 2=lon if headers are absent.
   */
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) throw new Error('CSV file is empty.');

    // Detect header
    const firstLine = lines[0].toLowerCase();
    const hasCols = col => firstLine.includes(col);
    const hasHeader = hasCols('lat') || hasCols('lon') || hasCols('name') || hasCols('waypoint');

    let nameIdx = 0, latIdx = 1, lonIdx = 2;
    let startRow = 0;

    if (hasHeader) {
      startRow = 1;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      nameIdx = headers.findIndex(h => h === 'name' || h === 'waypoint' || h === 'wpt');
      latIdx  = headers.findIndex(h => h === 'lat'  || h === 'latitude');
      lonIdx  = headers.findIndex(h => h === 'lon'  || h === 'lng' || h === 'longitude');
      if (latIdx === -1 || lonIdx === -1) throw new Error('CSV missing lat/lon columns.');
      if (nameIdx === -1) nameIdx = null;
    }

    const waypoints = [];
    for (let i = startRow; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const lat = parseFloat(cols[latIdx]);
      const lon = parseFloat(cols[lonIdx]);
      if (isNaN(lat) || isNaN(lon)) continue;
      const name = nameIdx !== null ? (cols[nameIdx] || `WP${waypoints.length + 1}`) : `WP${waypoints.length + 1}`;
      waypoints.push({ name, lat, lon });
    }

    if (waypoints.length === 0) throw new Error('No valid waypoints found in CSV.');
    return waypoints;
  }

  /**
   * Parse a GPX file.
   * Reads <wpt> elements first; if none found, reads track points from <trkpt>.
   * Then reads route points from <rtept> as fallback.
   */
  function parseGPX(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid GPX/XML file.');

    let nodes = Array.from(doc.querySelectorAll('wpt'));
    if (nodes.length === 0) nodes = Array.from(doc.querySelectorAll('rtept'));
    if (nodes.length === 0) nodes = Array.from(doc.querySelectorAll('trkpt'));
    if (nodes.length === 0) throw new Error('No waypoints found in GPX file.');

    return nodes.map((node, idx) => {
      const lat = parseFloat(node.getAttribute('lat'));
      const lon = parseFloat(node.getAttribute('lon'));
      const nameEl = node.querySelector('name');
      const name = nameEl ? nameEl.textContent.trim() : `WP${idx + 1}`;
      return { name, lat, lon };
    }).filter(wp => !isNaN(wp.lat) && !isNaN(wp.lon));
  }

  /**
   * Parse an RTZ (Route Exchange Format) file.
   * RTZ is an XML dialect used in maritime ECDIS systems.
   * Reads <waypoint> elements with <position lat="" lon=""> children.
   */
  function parseRTZ(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid RTZ/XML file.');

    // Try case-insensitive element selection via namespace-agnostic approach
    const allElements = Array.from(doc.getElementsByTagName('*'));

    const waypointEls = allElements.filter(el =>
      el.localName.toLowerCase() === 'waypoint'
    );

    if (waypointEls.length === 0) throw new Error('No waypoints found in RTZ file.');

    return waypointEls.map((wptEl, idx) => {
      // Find <position> child
      const posEls = Array.from(wptEl.getElementsByTagName('*')).filter(
        el => el.localName.toLowerCase() === 'position'
      );
      const posEl = posEls[0];
      if (!posEl) return null;

      const lat = parseFloat(posEl.getAttribute('lat'));
      const lon = parseFloat(posEl.getAttribute('lon'));
      if (isNaN(lat) || isNaN(lon)) return null;

      const name = wptEl.getAttribute('name') || `WP${idx + 1}`;
      return { name, lat, lon };
    }).filter(wp => wp !== null);
  }

  /**
   * Main entry point.
   * Reads a File object and returns a Promise resolving to waypoint array.
   */
  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const text = e.target.result;
        const ext = file.name.split('.').pop().toLowerCase();
        try {
          let waypoints;
          if (ext === 'csv') {
            waypoints = parseCSV(text);
          } else if (ext === 'gpx') {
            waypoints = parseGPX(text);
          } else if (ext === 'rtz') {
            waypoints = parseRTZ(text);
          } else {
            reject(new Error(`Unsupported file type: .${ext}. Please use .csv, .gpx, or .rtz`));
            return;
          }
          resolve(waypoints);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
  }

  return { parseFile, parseCSV, parseGPX, parseRTZ };
})();
