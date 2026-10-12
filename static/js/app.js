/* GPIOS — Client Application Logic (Field Notebook & GIS Map) */
'use strict';

// ---------------------------------------------------------------------------
// Global Application State
// ---------------------------------------------------------------------------
let settings = { user_name: '', language: null, location: null, onboarded: false };
let selectedCoords = null;      // [lng, lat]
let currentSessionBirds = [];   // Array of bird records: { species_id, common_name_es, common_name_en, scientific_name, individual_count, observation_notes }
let editingSessionId = null;
let editingSessionTitle = '';
let detailSessionId = null;
let cachedSessions = [];
let selectedBird = null;

const $ = (id) => document.getElementById(id);

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const HOME_FALLBACK_ZOOM = 9;
const DETAIL_ZOOM = 14;

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let toastTimer = null;
function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Connectivity Status (Maps and geocoding require internet)
// ---------------------------------------------------------------------------
function updateOnlineStatus() {
  $('offline-banner').hidden = navigator.onLine;
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ---------------------------------------------------------------------------
// GIS Map Engine (OpenLayers 8.2 loaded from CDN)
// ---------------------------------------------------------------------------
const hasMap = typeof window.ol !== 'undefined';
let map = null;
let baseLayers = {};
let sessionsSource = null;
let sessionsLayer = null;
let tempSource = null;

if (hasMap) {
  baseLayers = {
    osm: new ol.layer.Tile({ visible: true, source: new ol.source.OSM() }),
    satellite: new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19,
        attributions: 'Tiles © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> — Esri, Maxar, Earthstar Geographics, GIS User Community'
      })
    })
  };

  sessionsSource = new ol.source.Vector();
  tempSource = new ol.source.Vector();

  sessionsLayer = new ol.layer.Vector({
    source: sessionsSource,
    zIndex: 10,
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 9,
        fill: new ol.style.Fill({ color: '#1b382b' }),
        stroke: new ol.style.Stroke({ color: '#ffffff', width: 2.5 })
      })
    })
  });

  const tempLayer = new ol.layer.Vector({
    source: tempSource,
    zIndex: 12,
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 7,
        fill: new ol.style.Fill({ color: '#c2410c' }),
        stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
      })
    })
  });

  map = new ol.Map({
    target: 'map',
    layers: [baseLayers.osm, baseLayers.satellite, sessionsLayer, tempLayer],
    view: new ol.View({ center: ol.proj.fromLonLat([0, 20]), zoom: 2, minZoom: 2, maxZoom: 19 })
  });

  map.on('click', (evt) => {
    const sessionFeature = map.forEachFeatureAtPixel(evt.pixel, (f, layer) => (layer === sessionsLayer ? f : undefined));
    if (sessionFeature) {
      mostrarDetalleSesion(sessionFeature.get('sessionId'));
      return;
    }
    const [lng, lat] = ol.proj.toLonLat(evt.coordinate);
    cambiarTab('tab-new');
    setPinLocation(lng, lat, null);
  });

  map.on('pointermove', (evt) => {
    if (evt.dragging) return;
    const hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter: l => l === sessionsLayer });
    map.getTargetElement().style.cursor = hit ? 'pointer' : '';
  });

  $('base-layer-select').addEventListener('change', (e) => {
    Object.entries(baseLayers).forEach(([key, layer]) => layer.setVisible(key === e.target.value));
  });
} else {
  $('map-error').hidden = false;
  document.querySelector('.layer-switcher').hidden = true;
}

function animateTo(lng, lat, zoom = DETAIL_ZOOM) {
  if (!map) return;
  map.getView().animate({ center: ol.proj.fromLonLat([lng, lat]), zoom, duration: 500 });
}

// Adjust the map view smoothly to the exact bounding box of any geographical entity
// (town, city, province, region, state, or country)
function fitBoundingBox(bbox, maxZoom = 18, animate = true) {
  if (!map || !Array.isArray(bbox) || bbox.length !== 4) return;
  const [south, north, west, east] = bbox.map(Number);
  if (![south, north, west, east].every(Number.isFinite)) return;
  const extent = ol.proj.transformExtent([west, south, east, north], 'EPSG:4326', 'EPSG:3857');
  map.getView().fit(extent, {
    padding: [45, 45, 45, 45],
    duration: animate ? 600 : 0,
    maxZoom
  });
}

// Fit map to user's defined home area
function goToHomeArea(animate = true) {
  const loc = settings.location;
  if (!map || !loc) return;
  if (Array.isArray(loc.bbox) && loc.bbox.length === 4 && loc.bbox.every(Number.isFinite)) {
    fitBoundingBox(loc.bbox, 18, animate);
  } else if (animate) {
    animateTo(loc.lng, loc.lat, HOME_FALLBACK_ZOOM);
  } else {
    map.getView().setCenter(ol.proj.fromLonLat([loc.lng, loc.lat]));
    map.getView().setZoom(HOME_FALLBACK_ZOOM);
  }
}

$('btn-my-area').addEventListener('click', () => goToHomeArea(true));

function setPinLocation(lng, lat, locationText) {
  selectedCoords = [lng, lat];
  const locInput = $('location-search');

  if (locationText) {
    locInput.value = locationText;
    locInput.dataset.auto = '';
  } else if (!locInput.value.trim() || locInput.dataset.auto) {
    locInput.value = t('form.pinLabel', { lat: lat.toFixed(5), lng: lng.toFixed(5) });
    locInput.dataset.auto = '1';
  }

  if (tempSource) {
    tempSource.clear();
    tempSource.addFeature(new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat([lng, lat])) }));
  }
  renderCoordsDisplay();
  validarFormulario();
}

function renderCoordsDisplay() {
  $('coords-display').textContent = selectedCoords
    ? t('form.coordsSet', { lat: selectedCoords[1].toFixed(6), lng: selectedCoords[0].toFixed(6) })
    : t('form.coordsHint');
}

// ---------------------------------------------------------------------------
// Geocoding (OpenStreetMap Nominatim API)
// ---------------------------------------------------------------------------
async function nominatimSearch(q, signal) {
  const params = new URLSearchParams({ format: 'jsonv2', q, limit: '6', 'accept-language': currentLang });
  const bbox = settings.location?.bbox;
  if (Array.isArray(bbox)) params.set('viewbox', `${bbox[2]},${bbox[1]},${bbox[3]},${bbox[0]}`);
  const res = await fetch(`${NOMINATIM}/search?${params}`, { signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

function placeShortName(item) {
  return item.name || item.display_name.split(',')[0];
}

// Reusable autocomplete component for geocoding input fields
function attachPlaceAutocomplete(input, box, onSelect) {
  let controller = null;

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 3 || input.dataset.auto) { box.hidden = true; return; }
    controller?.abort();
    controller = new AbortController();
    try {
      const results = await nominatimSearch(q, controller.signal);
      box.innerHTML = '';
      results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'sugg-item';
        div.innerHTML = `<strong>${escapeHtml(placeShortName(item))}</strong><small>${escapeHtml(item.display_name)}</small>`;
        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          box.hidden = true;
          onSelect(item);
        });
        box.appendChild(div);
      });
      box.hidden = results.length === 0;
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Geocoding error:', err);
    }
  }, 400);

  input.addEventListener('input', () => { input.dataset.auto = ''; run(); });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
}

// Form field location autocomplete: pins coordinate and fits map to selected entity limits
attachPlaceAutocomplete($('location-search'), $('location-suggestions'), (item) => {
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);
  setPinLocation(lng, lat, placeShortName(item));
  if (Array.isArray(item.boundingbox) && item.boundingbox.length === 4) {
    fitBoundingBox(item.boundingbox);
  } else {
    animateTo(lng, lat);
  }
});

// ---------------------------------------------------------------------------
// Real-time Species Search
// ---------------------------------------------------------------------------
(() => {
  const input = $('bird-search');
  const box = $('bird-suggestions');
  let controller = null;

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    controller?.abort();
    controller = new AbortController();
    try {
      const res = await fetch(`/api/species/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      const results = await res.json();
      box.innerHTML = '';
      results.forEach(sp => {
        const div = document.createElement('div');
        div.className = 'sugg-item';
        div.innerHTML = `<strong>${escapeHtml(speciesName(sp))}</strong> <span class="sci-name">${escapeHtml(sp.scientific_name)}</span>`
          + `<small>${escapeHtml(speciesAltName(sp))} · ${escapeHtml(sp.family || '')}</small>`;
        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectedBird = sp;
          input.value = `${speciesName(sp)} (${sp.scientific_name})`;
          box.hidden = true;
          $('add-bird-btn').disabled = false;
        });
        box.appendChild(div);
      });
      box.hidden = results.length === 0;
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Species search error:', err);
    }
  }, 180);

  input.addEventListener('input', () => {
    selectedBird = null;
    $('add-bird-btn').disabled = true;
    run();
  });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
})();

$('add-bird-btn').addEventListener('click', () => {
  if (!selectedBird) return;
  currentSessionBirds.push({
    species_id: selectedBird.id,
    common_name_es: selectedBird.common_name_es,
    common_name_en: selectedBird.common_name_en,
    scientific_name: selectedBird.scientific_name,
    individual_count: Math.max(1, parseInt($('bird-count').value, 10) || 1),
    observation_notes: $('bird-notes').value.trim()
  });

  $('bird-search').value = '';
  $('bird-count').value = '1';
  $('bird-notes').value = '';
  $('add-bird-btn').disabled = true;
  selectedBird = null;

  renderBirdList();
  validarFormulario();
});

function renderBirdList() {
  const ul = $('session-birds-list');
  ul.innerHTML = '';
  ul.hidden = currentSessionBirds.length === 0;
  currentSessionBirds.forEach((b, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(speciesName(b))}</strong> (${b.individual_count})<br>
        <span class="muted-sm">${escapeHtml(b.observation_notes || t('form.noNotes'))}</span>
      </div>
      <button type="button" class="remove-bird" aria-label="Remove">&times;</button>`;
    li.querySelector('.remove-bird').addEventListener('click', () => {
      currentSessionBirds.splice(idx, 1);
      renderBirdList();
      validarFormulario();
    });
    ul.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Field Session Form Management
// ---------------------------------------------------------------------------
function renderWeatherOptions() {
  const select = $('session-weather');
  const current = select.value || 'sunny';
  select.innerHTML = WEATHER_CODES.map(code => `<option value="${code}">${escapeHtml(t(`weather.${code}`))}</option>`).join('');
  select.value = current;
}

function validarFormulario() {
  const isValid = $('session-title').value.trim()
    && $('session-date').value
    && $('location-search').value.trim()
    && selectedCoords
    && currentSessionBirds.length > 0;
  $('save-session-btn').disabled = !isValid;
}

document.querySelectorAll('#form-new-session input, #form-new-session select').forEach(el => {
  el.addEventListener('input', validarFormulario);
  el.addEventListener('change', validarFormulario);
});

$('save-session-btn').addEventListener('click', async () => {
  const btn = $('save-session-btn');
  const payload = {
    title: $('session-title').value.trim(),
    session_date: $('session-date').value,
    start_time: $('session-time').value || null,
    location_name: $('location-search').value.trim(),
    approx_lat: selectedCoords[1],
    approx_lng: selectedCoords[0],
    habitat_notes: $('session-weather').value,
    observations: currentSessionBirds.map(b => ({
      species_id: b.species_id,
      individual_count: b.individual_count,
      observation_notes: b.observation_notes
    }))
  };

  const isEditing = Boolean(editingSessionId);
  btn.disabled = true;
  try {
    const data = await api(isEditing ? `/api/sessions/${editingSessionId}` : '/api/sessions', {
      method: isEditing ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    const savedId = isEditing ? editingSessionId : data.session_id;
    resetForm();
    await cargarSesiones();
    showToast(t('msg.saved'));
    if (savedId) await mostrarDetalleSesion(savedId);
    else cambiarTab('tab-list');
  } catch (err) {
    console.error('Save error:', err);
    alert(t('msg.saveError', { err: err.message }));
    validarFormulario();
  }
});

function renderEditState() {
  const editing = Boolean(editingSessionId);
  $('edit-mode-indicator').hidden = !editing;
  $('edit-session-title').textContent = editingSessionTitle;
  $('btn-tab-new').textContent = t(editing ? 'tab.edit' : 'tab.new');
  $('save-session-btn').textContent = t(editing ? 'form.saveChanges' : 'form.save');
}

function resetForm() {
  editingSessionId = null;
  editingSessionTitle = '';
  $('session-title').value = '';
  $('session-date').value = todayIso();
  $('session-time').value = '';
  $('location-search').value = '';
  $('location-search').dataset.auto = '';
  $('session-weather').value = 'sunny';
  $('bird-search').value = '';
  selectedBird = null;
  currentSessionBirds = [];
  selectedCoords = null;
  tempSource?.clear();
  renderBirdList();
  renderCoordsDisplay();
  renderEditState();
  validarFormulario();
}

$('btn-cancel-edit').addEventListener('click', () => {
  resetForm();
  cambiarTab('tab-list');
});

// ---------------------------------------------------------------------------
// Session List & Detailed View
// ---------------------------------------------------------------------------
async function cargarSesiones() {
  try {
    cachedSessions = await api('/api/sessions');
  } catch (err) {
    console.error('Could not load sessions:', err);
    cachedSessions = [];
  }
  renderSessionList();
}

function renderSessionList() {
  const container = $('sessions-history-list');
  container.innerHTML = '';
  sessionsSource?.clear();

  if (cachedSessions.length === 0) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(t('list.empty'))}</p>`;
    return;
  }

  cachedSessions.forEach(s => {
    sessionsSource?.addFeature(new ol.Feature({
      geometry: new ol.geom.Point(ol.proj.fromLonLat([s.approx_lng, s.approx_lat])),
      sessionId: s.id
    }));

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'session-card';
    card.innerHTML = `
      <h4>${escapeHtml(s.title)}</h4>
      <div class="meta">${escapeHtml(s.session_date)} · ${escapeHtml(s.location_name)}</div>
      <span class="badge">${escapeHtml(t('list.badge', { species: s.total_species, individuals: s.total_individuals }))}</span>`;
    card.addEventListener('click', () => mostrarDetalleSesion(s.id));
    container.appendChild(card);
  });
}

async function mostrarDetalleSesion(id, { animate = true } = {}) {
  let s;
  try {
    s = await api(`/api/sessions/${id}`);
  } catch {
    alert(t('msg.loadError'));
    cambiarTab('tab-list');
    return;
  }

  detailSessionId = s.id;
  cambiarTab('tab-detail');

  const obsHtml = s.observations.map(o => `
    <li>
      <strong>${escapeHtml(speciesName(o))}</strong> <span class="sci-name">(${escapeHtml(o.scientific_name)})</span><br>
      <span class="obs-line">${escapeHtml(t('detail.count'))} <strong>${o.individual_count}</strong>${o.observation_notes ? ' | ' + escapeHtml(o.observation_notes) : ''}</span>
    </li>`).join('');

  const view = $('session-detail-view');
  view.innerHTML = `
    <div class="detail-actions">
      <button type="button" class="btn-secondary" data-action="back">${escapeHtml(t('detail.back'))}</button>
      <div class="detail-actions-right">
        <button type="button" class="btn-secondary btn-edit" data-action="edit" title="${escapeHtml(t('detail.editTitle'))}">${escapeHtml(t('detail.edit'))}</button>
        <button type="button" class="btn-secondary btn-danger" data-action="delete">${escapeHtml(t('detail.delete'))}</button>
      </div>
    </div>
    <h3 class="detail-title">${escapeHtml(s.title)}</h3>
    <p class="detail-meta">📅 ${escapeHtml(s.session_date)}${s.start_time ? ' · ⏰ ' + escapeHtml(s.start_time) : ''} · 📍 ${escapeHtml(s.location_name)}</p>
    <p class="detail-weather"><strong>${escapeHtml(t('detail.weather'))}</strong> ${escapeHtml(weatherLabel(s.habitat_notes))}</p>
    <h4 class="detail-subtitle">${escapeHtml(t('detail.birds', { n: s.observations.length }))}</h4>
    <ul class="obs-list">${obsHtml}</ul>`;

  view.querySelector('[data-action="back"]').addEventListener('click', () => cambiarTab('tab-list'));
  view.querySelector('[data-action="edit"]').addEventListener('click', () => iniciarEdicionSesion(s));
  view.querySelector('[data-action="delete"]').addEventListener('click', () => eliminarSesion(s.id));

  if (animate) animateTo(s.approx_lng, s.approx_lat);
}

function iniciarEdicionSesion(s) {
  editingSessionId = s.id;
  editingSessionTitle = s.title;

  $('session-title').value = s.title || '';
  $('session-date').value = s.session_date || '';
  $('session-time').value = s.start_time || '';
  $('session-weather').value = LEGACY_WEATHER[s.habitat_notes] || (WEATHER_CODES.includes(s.habitat_notes) ? s.habitat_notes : 'sunny');

  currentSessionBirds = (s.observations || []).map(o => ({
    species_id: o.species_id,
    common_name_es: o.common_name_es,
    common_name_en: o.common_name_en,
    scientific_name: o.scientific_name,
    individual_count: o.individual_count,
    observation_notes: o.observation_notes || ''
  }));
  renderBirdList();

  setPinLocation(s.approx_lng, s.approx_lat, s.location_name);
  animateTo(s.approx_lng, s.approx_lat);
  renderEditState();
  validarFormulario();
  cambiarTab('tab-new');
}

async function eliminarSesion(id) {
  if (!confirm(t('msg.deleteConfirm'))) return;
  try {
    await api(`/api/sessions/${id}`, { method: 'DELETE' });
    if (editingSessionId === id) resetForm();
    await cargarSesiones();
    cambiarTab('tab-list');
  } catch {
    alert(t('msg.deleteError'));
  }
}

// ---------------------------------------------------------------------------
// Backup Import & Export
// ---------------------------------------------------------------------------
$('btn-import').addEventListener('click', () => $('file-import-input').click());

$('file-import-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    try { JSON.parse(text); } catch { alert(t('msg.invalidJson')); return; }

    const data = await api('/api/backup/import-json', { method: 'POST', body: text });
    alert(data.skipped_sessions
      ? t('msg.importedSkipped', { n: data.imported_sessions, s: data.skipped_sessions })
      : t('msg.imported', { n: data.imported_sessions }));
    await cargarSesiones();
    cambiarTab('tab-list');
  } catch (err) {
    console.error('Import error:', err);
    alert(t('msg.importError', { err: err.message }));
  } finally {
    event.target.value = '';
  }
});

// ---------------------------------------------------------------------------
// Tab Navigation
// ---------------------------------------------------------------------------
function cambiarTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  $('panel-new').classList.toggle('active', tabId === 'tab-new');
  $('panel-list').classList.toggle('active', tabId === 'tab-list');
  $('panel-detail').classList.toggle('active', tabId === 'tab-detail');
  if (tabId !== 'tab-detail') detailSessionId = null;
}

document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => cambiarTab(btn.dataset.tab)));

// ---------------------------------------------------------------------------
// Settings & Onboarding Management
// ---------------------------------------------------------------------------
const modalState = { mode: 'onboarding', lang: 'en', location: null, pendingIpLocation: null };

function renderLanguageUi() {
  setLanguage(currentLang);
  renderWeatherOptions();
  renderBirdList();
  renderCoordsDisplay();
  renderEditState();
  renderSessionList();
  renderUserInfo();
  renderModalTexts();
  $('export-csv-link').href = `/api/backup/export-csv?lang=${currentLang}`;
  if (detailSessionId) mostrarDetalleSesion(detailSessionId, { animate: false });
}

function renderUserInfo() {
  $('user-greeting').textContent = settings.user_name ? t('greeting', { name: settings.user_name }) : '';
  const bar = $('map-status-bar');
  bar.textContent = settings.location?.label ? `📍 ${settings.location.label}` : '';
  bar.hidden = !settings.location?.label;
  $('btn-my-area').hidden = !settings.location;
}

function renderModalTexts() {
  const onboarding = modalState.mode === 'onboarding';
  $('settings-title').textContent = t(onboarding ? 'ob.welcomeTitle' : 'ob.settingsTitle');
  $('settings-subtitle').textContent = t(onboarding ? 'ob.welcomeText' : 'ob.settingsText');
  $('btn-settings-save').textContent = t(onboarding ? 'ob.start' : 'ob.save');
  $('btn-settings-cancel').hidden = onboarding;
  document.querySelectorAll('.lang-btn').forEach(b => {
    const active = b.dataset.lang === modalState.lang;
    b.classList.toggle('active', active);
    b.setAttribute('aria-checked', String(active));
  });
  renderModalLocation();
}

function renderModalLocation(extraText) {
  const loc = modalState.location;
  const status = $('set-location-status');
  if (extraText) {
    status.textContent = extraText;
  } else if (loc) {
    const via = { gps: t('ob.viaGps'), ip: t('ob.viaIp'), manual: t('ob.viaManual') }[loc.source] || '';
    status.textContent = `${t('ob.current', { label: loc.label })}${via ? ` (${via})` : ''}`;
  } else {
    status.textContent = t('ob.none');
  }
  status.classList.toggle('ok', Boolean(loc) && !extraText);
}

function openSettings(mode) {
  modalState.mode = mode;
  modalState.lang = currentLang;
  modalState.location = settings.location ? { ...settings.location } : null;
  modalState.pendingIpLocation = null;
  $('set-name').value = settings.user_name || '';
  $('set-location-search').value = '';
  $('set-location-warning').hidden = true;
  $('settings-error').hidden = true;
  renderModalTexts();
  $('settings-modal').hidden = false;
  setTimeout(() => $('set-name').focus(), 50);
}

function closeSettings() {
  $('settings-modal').hidden = true;
  if (currentLang !== (settings.language || currentLang)) {
    currentLang = settings.language;
    renderLanguageUi();
  }
}

$('btn-settings').addEventListener('click', () => openSettings('settings'));
$('btn-settings-cancel').addEventListener('click', closeSettings);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('settings-modal').hidden && modalState.mode === 'settings') closeSettings();
});

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    modalState.lang = btn.dataset.lang;
    currentLang = modalState.lang;
    renderLanguageUi();
  });
});

// Reverse-geocode coordinates to identify the place name and full geographic extent (bounding box)
async function buildLocation(lat, lng, source, fallbackLabel) {
  try {
    const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&accept-language=${currentLang}`);
    const data = await res.json();
    const bbox = Array.isArray(data.boundingbox) && data.boundingbox.length === 4 ? data.boundingbox.map(Number) : null;
    const label = data.display_name ? data.display_name.split(',').slice(0, 3).join(',').trim() : (fallbackLabel || `${lat.toFixed(3)}, ${lng.toFixed(3)}`);
    return { lat, lng, label, bbox, source };
  } catch {
    return { lat, lng, label: fallbackLabel || `${lat.toFixed(3)}, ${lng.toFixed(3)}`, bbox: null, source };
  }
}

function getGpsPosition(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not available'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 }
    );
  });
}

async function getIpPosition() {
  const providers = [
    async () => {
      const d = await (await fetch('https://ipwho.is/')).json();
      if (!d.success) throw new Error('ipwho.is failed');
      return { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region, country: d.country, timezone: d.timezone?.id };
    },
    async () => {
      const d = await (await fetch('https://ipapi.co/json/')).json();
      if (d.error) throw new Error('ipapi.co failed');
      return { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region, country: d.country_name, timezone: d.timezone };
    }
  ];
  for (const provider of providers) {
    try {
      const r = await provider();
      if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) return r;
    } catch (err) {
      console.warn('IP geolocation provider failed:', err);
    }
  }
  throw new Error('IP geolocation unavailable');
}

function tzOffsetMinutes(timeZone) {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone }));
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((local - utc) / 60000);
}

// Anti-VPN/proxy heuristic: check whether the IP timezone matches the user system clock
function looksLikeVpn(ipTimeZone) {
  const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!ipTimeZone || !systemTz || ipTimeZone === systemTz) return false;
  try {
    return tzOffsetMinutes(ipTimeZone) !== tzOffsetMinutes(systemTz);
  } catch {
    return false;
  }
}

$('btn-detect-location').addEventListener('click', async () => {
  const btn = $('btn-detect-location');
  btn.disabled = true;
  $('set-location-warning').hidden = true;
  renderModalLocation(t('ob.detecting'));

  try {
    // 1) GPS / Operating System location services
    try {
      const pos = await getGpsPosition();
      modalState.location = await buildLocation(pos.lat, pos.lng, 'gps');
      renderModalLocation();
      return;
    } catch (err) {
      console.info('GPS unavailable, attempting IP geolocation fallback:', err.message || err);
    }

    // 2) IP geolocation with timezone validation
    const ip = await getIpPosition();
    const place = [ip.city, ip.region, ip.country].filter(Boolean).join(', ');
    if (looksLikeVpn(ip.timezone)) {
      modalState.pendingIpLocation = ip;
      $('set-location-warning-text').textContent = t('ob.vpnWarning', {
        place,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      $('set-location-warning').hidden = false;
      renderModalLocation();
      return;
    }
    modalState.location = await buildLocation(ip.lat, ip.lng, 'ip', place);
    renderModalLocation();
  } catch (err) {
    console.warn('Location detection failed:', err);
    renderModalLocation(t('ob.detectFailed'));
    $('set-location-search').focus();
  } finally {
    btn.disabled = false;
  }
});

$('btn-use-anyway').addEventListener('click', async () => {
  const ip = modalState.pendingIpLocation;
  if (!ip) return;
  $('set-location-warning').hidden = true;
  renderModalLocation(t('ob.detecting'));
  modalState.location = await buildLocation(ip.lat, ip.lng, 'ip', [ip.city, ip.country].filter(Boolean).join(', '));
  modalState.pendingIpLocation = null;
  renderModalLocation();
});

// Manual place search in settings modal: saves bounding box of the exact entity selected
attachPlaceAutocomplete($('set-location-search'), $('set-location-suggestions'), async (item) => {
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);
  $('set-location-warning').hidden = true;
  $('set-location-search').value = placeShortName(item);
  const bbox = Array.isArray(item.boundingbox) && item.boundingbox.length === 4
    ? item.boundingbox.map(Number)
    : null;
  modalState.location = {
    lat,
    lng,
    label: item.display_name.split(',').slice(0, 3).join(',').trim(),
    bbox,
    source: 'manual'
  };
  renderModalLocation();
});

$('btn-settings-save').addEventListener('click', async () => {
  const name = $('set-name').value.trim();
  if (!name || !modalState.location) {
    $('settings-error').hidden = false;
    return;
  }
  const btn = $('btn-settings-save');
  btn.disabled = true;
  try {
    const locationChanged = JSON.stringify(modalState.location) !== JSON.stringify(settings.location);
    settings = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ user_name: name, language: modalState.lang, location: modalState.location, onboarded: true })
    });
    currentLang = settings.language || modalState.lang;
    $('settings-modal').hidden = true;
    renderLanguageUi();
    if (locationChanged) goToHomeArea(true);
    if (modalState.mode === 'settings') showToast(t('msg.settingsSaved'));
  } catch (err) {
    alert(t('msg.saveError', { err: err.message }));
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Application Initialization
// ---------------------------------------------------------------------------
async function init() {
  updateOnlineStatus();
  try {
    settings = await api('/api/settings');
  } catch (err) {
    console.error('Could not load settings:', err);
  }
  currentLang = settings.language || detectSystemLang();
  resetForm();
  renderLanguageUi();
  goToHomeArea(false);
  await cargarSesiones();
  if (!settings.onboarded) openSettings('onboarding');
}

init();
