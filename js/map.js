/**
 * map.js
 * Handles Leaflet map initialization, route rendering,
 * waypoint markers, and Windy weather overlay integration.
 */

const RouteMap = (() => {
  let map = null;
  let routeLayer = null;
  let markerLayer = null;
  let windyFrame = null;

  const WINDY_BASE_URL    = 'https://embed.windy.com/embed2.html';
  const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  /** Initialise the Leaflet map inside the given container element id. */
  function init(containerId) {
    map = L.map(containerId, {
      center: [5.0, 110.0],
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 18,
    }).addTo(map);

    routeLayer  = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);

    return map;
  }

  /** Create a custom SVG waypoint icon. */
  function _createIcon(index, isFirst, isLast) {
    let color = '#2980b9';
    if (isFirst) color = '#27ae60';
    if (isLast)  color = '#e74c3c';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0 C6.27 0 0 6.27 0 14 C0 24.5 14 36 14 36 C14 36 28 24.5 28 14 C28 6.27 21.73 0 14 0Z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="14" y="19" text-anchor="middle" fill="#fff"
            font-family="Arial,sans-serif" font-size="11" font-weight="bold">${index}</text>
    </svg>`;
    return L.divIcon({
      html: svg,
      className: '',
      iconSize: [28, 36],
      iconAnchor: [14, 36],
      popupAnchor: [0, -36],
    });
  }

  /**
   * Render a route on the map.
   * @param {Array} waypoints - [{ name, lat, lon, eta, course, distance }]
   */
  function renderRoute(waypoints) {
    clearRoute();

    if (!waypoints || waypoints.length === 0) return;

    const latlngs = waypoints.map(wp => [wp.lat, wp.lon]);

    // Draw polyline
    L.polyline(latlngs, {
      color: '#1a6fa8',
      weight: 3,
      opacity: 0.85,
      dashArray: '8, 5',
    }).addTo(routeLayer);

    // Draw markers
    waypoints.forEach((wp, idx) => {
      const isFirst = idx === 0;
      const isLast  = idx === waypoints.length - 1;
      const icon    = _createIcon(idx + 1, isFirst, isLast);

      const etaLine    = wp.eta      ? `<br><span class="popup-label">ETA:</span> ${wp.eta}` : '';
      const courseLine = wp.course   ? `<br><span class="popup-label">Course:</span> ${wp.course}°` : '';
      const distLine   = wp.distance ? `<br><span class="popup-label">Dist:</span> ${wp.distance} NM` : '';

      const popup = `
        <div class="map-popup">
          <strong>WP${idx + 1}: ${wp.name}</strong><br>
          <span class="popup-label">Lat:</span> ${wp.lat.toFixed(5)}&deg;
          &nbsp;&nbsp;
          <span class="popup-label">Lon:</span> ${wp.lon.toFixed(5)}&deg;
          ${distLine}${courseLine}${etaLine}
        </div>`;

      L.marker([wp.lat, wp.lon], { icon })
        .addTo(markerLayer)
        .bindPopup(popup);
    });

    // Fit map to route bounds
    map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
  }

  /** Clear all route layers. */
  function clearRoute() {
    if (routeLayer)  routeLayer.clearLayers();
    if (markerLayer) markerLayer.clearLayers();
  }

  /**
   * Fly the map to a coordinate.
   * @param {number} lat
   * @param {number} lon
   * @param {number} [zoom=10]
   */
  function flyTo(lat, lon, zoom = 10) {
    if (map) map.flyTo([lat, lon], zoom, { duration: 1.5 });
  }

  /**
   * Show or hide the Windy weather overlay iframe.
   * @param {boolean} show
   * @param {Array|null} center - optional [lat, lon] centre override
   * @param {string} [layer='wind'] - Windy overlay type
   */
  function toggleWindy(show, center, layer) {
    const container = document.getElementById('windy-overlay');
    if (!container) return;

    if (!show) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    const lat  = center ? center[0] : map.getCenter().lat;
    const lon  = center ? center[1] : map.getCenter().lng;
    const zoom = map.getZoom();
    const overlay = layer || 'wind';

    const params = new URLSearchParams({
      lat:       lat.toFixed(3),
      lon:       lon.toFixed(3),
      detailLat: lat.toFixed(3),
      detailLon: lon.toFixed(3),
      zoom:      String(zoom),
      level:      'surface',
      overlay:    overlay,
      product:    'ecmwf',
      menu:       '',
      message:    'true',
      marker:     '',
      calendar:   'now',
      pressure:   '',
      type:       'map',
      location:   'coordinates',
      detail:     '',
      metricWind: 'kt',
      metricTemp: '\u00b0C',
      radarRange: '-1',
    });

    const src = `${WINDY_BASE_URL}?${params.toString()}`;

    container.innerHTML = `<iframe src="${src}" frameborder="0" allowfullscreen></iframe>`;
    container.style.display = 'block';
  }

  /** Return the underlying Leaflet map instance. */
  function getMap() { return map; }

  return { init, renderRoute, clearRoute, flyTo, toggleWindy, getMap };
})();
