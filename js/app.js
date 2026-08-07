/* ============================================================
   CLIMATE RISK ATLAS — application logic
   ============================================================ */

mapboxgl.accessToken = "pk.eyJ1IjoiZW5naW5lZXJnZWd6IiwiYSI6ImNtb3gxcXpjczAyMnQyc3M5eW54N3JkNm4ifQ.x-d5Z72lb93DhW4JrosplA";

const RISK_COLOR = {
  "Negligible": "#1fd67a",
  "Low": "#ffc23c",
  "Moderate": "#ff7a1f",
  "High": "#ff2d3d"
};
const HAZARD_ICON = {
  "Extreme Heat": "☀", "Deep Freeze": "❄", "Air Quality": "≈",
  "Wildfire Risk": "▲", "Flood Risk": "≋", "Storm Risk": "◈", "Drought Risk": "○"
};

const state = {
  league: "NBA",
  allData: {},
  activeHazards: new Set(),   // hazard field names active for current league
  threshold: "all",           // 'all' | '1' | '2' | '3'
  minHazards: "1",            // '1' | '2' | '3'
  view: "2d",
  basemap: "light",
  markers: [],
  openPopup: null,
};

const STYLE_LIGHT = "mapbox://styles/mapbox/light-v11";
const STYLE_SAT = "mapbox://styles/mapbox/satellite-streets-v12";

const DEFAULT_VIEW = { center: [-97, 40], zoom: 3.35, pitch: 0, bearing: 0 };

// ---------------------------------------------------------------
// MAP INIT
// ---------------------------------------------------------------
const map = new mapboxgl.Map({
  container: "map",
  style: STYLE_LIGHT,
  center: DEFAULT_VIEW.center,
  zoom: DEFAULT_VIEW.zoom,
  pitch: DEFAULT_VIEW.pitch,
  bearing: DEFAULT_VIEW.bearing,
  attributionControl: true,
  antialias: true
});
map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

map.on("load", () => {
  addTerrainAndBuildings();
  boot();
});

function addTerrainAndBuildings() {
  try {
    if (!map.getSource("mapbox-dem")) {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14
      });
    }
  } catch (e) { /* noop */ }
  add3DBuildingsLayer();
}

function add3DBuildingsLayer() {
  if (map.getLayer("3d-buildings")) return;
  const layers = map.getStyle().layers;
  let labelLayerId;
  for (const l of layers) {
    if (l.type === "symbol" && l.layout && l.layout["text-field"]) { labelLayerId = l.id; break; }
  }
  if (!map.getSource("composite")) return;
  try {
    map.addLayer({
      id: "3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 12,
      paint: {
        "fill-extrusion-color": "#232a31",
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": ["get", "min_height"],
        "fill-extrusion-opacity": 0.55
      }
    }, labelLayerId);
  } catch (e) { /* style may not have composite building layer, e.g. satellite */ }
}

// ---------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------
async function boot() {
  state.allData = await DataLoader.loadAll();
  buildLeagueChips();
  setLeague(state.league);
  bindControls();
}

// ---------------------------------------------------------------
// LEAGUE / HAZARD CHIPS
// ---------------------------------------------------------------
function buildLeagueChips() {
  const wrap = document.getElementById("leagueChips");
  wrap.innerHTML = "";
  LEAGUES.forEach(lg => {
    const b = document.createElement("button");
    b.className = "chip" + (lg === state.league ? " active" : "");
    b.textContent = lg;
    b.dataset.league = lg;
    b.addEventListener("click", () => setLeague(lg));
    wrap.appendChild(b);
  });
}

function buildHazardChips() {
  const wrap = document.getElementById("hazardChips");
  wrap.innerHTML = "";
  const fields = state.allData[state.league].hazardFields;

  const allChip = document.createElement("button");
  allChip.className = "chip active";
  allChip.textContent = "All";
  allChip.addEventListener("click", () => {
    state.activeHazards = new Set(fields);
    refreshHazardChipStates();
    render();
  });
  wrap.appendChild(allChip);

  fields.forEach(h => {
    const b = document.createElement("button");
    b.className = "chip active";
    b.dataset.hazard = h;
    b.innerHTML = `<span class="dot" style="background:${hazardDotColor(h)}"></span>${h}`;
    b.addEventListener("click", () => {
      if (state.activeHazards.has(h)) state.activeHazards.delete(h);
      else state.activeHazards.add(h);
      refreshHazardChipStates();
      render();
    });
    wrap.appendChild(b);
  });
}

function hazardDotColor(h) {
  const palette = {
    "Extreme Heat": "#e07a3f", "Deep Freeze": "#6fb8e8", "Air Quality": "#b08fd8",
    "Wildfire Risk": "#e8823d", "Flood Risk": "#4f9fd8", "Storm Risk": "#8f8fe8",
    "Drought Risk": "#c2a23b"
  };
  return palette[h] || "#8a8f96";
}

function refreshHazardChipStates() {
  const wrap = document.getElementById("hazardChips");
  const fields = state.allData[state.league].hazardFields;
  const chips = [...wrap.querySelectorAll(".chip")];
  const allActive = state.activeHazards.size === fields.length;
  chips[0].classList.toggle("active", allActive);
  chips.slice(1).forEach(c => {
    c.classList.toggle("active", state.activeHazards.has(c.dataset.hazard));
  });
}

function setLeague(lg) {
  state.league = lg;
  state.activeHazards = new Set(state.allData[lg].hazardFields);
  [...document.getElementById("leagueChips").children].forEach(c =>
    c.classList.toggle("active", c.dataset.league === lg)
  );
  buildHazardChips();
  document.getElementById("drawerTitle").textContent = `${lg} Venues`;
  render();
}

// ---------------------------------------------------------------
// CONTROLS
// ---------------------------------------------------------------
function bindControls() {
  segButtons("thresholdSeg", v => { state.threshold = v; render(); });
  segButtons("minHazardSeg", v => { state.minHazards = v; render(); });
  segButtons("viewSeg", v => { state.view = v; applyView(); });
  segButtons("basemapSeg", v => { state.basemap = v; applyBasemap(); });

  document.getElementById("btnMenu").addEventListener("click", () => {
    document.getElementById("controlRail").classList.toggle("open");
  });
  document.getElementById("btnHazardList").addEventListener("click", () => {
    document.getElementById("venueDrawer").classList.toggle("open");
  });
  document.getElementById("closeDrawer").addEventListener("click", () => {
    document.getElementById("venueDrawer").classList.remove("open");
  });
  document.getElementById("btnExportPNG").addEventListener("click", exportPNG);
  document.getElementById("btnExportData").addEventListener("click", exportData);
  document.getElementById("btnHome").addEventListener("click", resetView);

  map.on("move", updateZoomCaption);
  updateZoomCaption();
}

function segButtons(id, cb) {
  const el = document.getElementById(id);
  [...el.children].forEach(btn => {
    btn.addEventListener("click", () => {
      [...el.children].forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      cb(btn.dataset.val);
    });
  });
}

function updateZoomCaption() {
  const c = map.getCenter();
  document.getElementById("zoomCaption").textContent =
    `${c.lat.toFixed(2)}°, ${c.lng.toFixed(2)}°  ·  z${map.getZoom().toFixed(1)}  ·  ${state.view.toUpperCase()}`;
}

function resetView() {
  if (state.openPopup) { state.openPopup.remove(); state.openPopup = null; }
  state.view = "2d";
  const seg = document.getElementById("viewSeg");
  [...seg.children].forEach(b => b.classList.toggle("active", b.dataset.val === "2d"));
  map.easeTo({
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    pitch: DEFAULT_VIEW.pitch,
    bearing: DEFAULT_VIEW.bearing,
    duration: 900
  });
}

function applyView() {
  if (state.view === "3d") {
    map.easeTo({ pitch: 55, bearing: -12, duration: 900 });
  } else {
    map.easeTo({ pitch: 0, bearing: 0, duration: 900 });
  }
  render();
}

function applyBasemap() {
  const target = state.basemap === "satellite" ? STYLE_SAT : STYLE_LIGHT;
  map.setStyle(target);
  map.once("style.load", () => {
    addTerrainAndBuildings();
    render();
  });
}

// ---------------------------------------------------------------
// FILTER LOGIC
// ---------------------------------------------------------------
function thresholdValue() {
  if (state.threshold === "all") return 0;
  return parseInt(state.threshold, 10);
}

function hazardPasses(h) {
  if (!state.activeHazards.has(h.name)) return false;
  if (state.threshold === "all") return true;
  if (state.threshold === "3") return h.score >= 3;
  return h.score >= thresholdValue();
}

function qualifyingCount(team) {
  return team.hazards.filter(hazardPasses).length;
}

function meetsFilter(team) {
  return qualifyingCount(team) >= parseInt(state.minHazards, 10);
}

// ---------------------------------------------------------------
// RENDER MARKERS + POPUPS
// ---------------------------------------------------------------
function clearMarkers() {
  state.markers.forEach(m => m.remove());
  state.markers = [];
}

function render() {
  clearMarkers();
  const data = state.allData[state.league];
  if (!data) return;

  let shown = 0;
  data.teams.forEach(team => {
    if (team.lat === 0 && team.lon === 0) return;
    const ok = meetsFilter(team);
    if (ok) shown++;
    const el = buildMarkerEl(team, ok);
    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([team.lon, team.lat])
      .addTo(map);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openPopup(team);
    });
    state.markers.push(marker);
  });

  renderDrawer();
  updateLegendStatus(shown, data.teams.length);
  updateZoomCaption();
}

function spikeGradient(hex) {
  // build a lit-from-above cone gradient from a single risk color
  return `linear-gradient(180deg, ${lighten(hex, 38)} 0%, ${hex} 45%, ${darken(hex, 22)} 100%)`;
}
function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${clamp(r + amt)}, ${clamp(g + amt)}, ${clamp(b + amt)})`;
}
function darken(hex, amt) { return lighten(hex, -amt); }
function clamp(v) { return Math.max(0, Math.min(255, v)); }
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const MIN_SPIKE = 5;
const MAX_SPIKE = 30;
const SPIKE_W = 6;
const SPIKE_GAP = 2;

function buildMarkerEl(team, isActive) {
  const el = document.createElement("div");
  el.className = "risk-marker" + (isActive ? "" : " dimmed");

  const cluster = document.createElement("div");
  cluster.className = "spike-cluster";

  const qualifying = team.hazards.filter(hazardPasses);

  if (qualifying.length === 0) {
    const dot = document.createElement("div");
    dot.className = "no-match-dot";
    cluster.appendChild(dot);
  } else {
    qualifying.forEach(h => {
      const spike = document.createElement("div");
      spike.className = "mini-spike";
      const heightPx = MIN_SPIKE + (h.score / 3) * (MAX_SPIKE - MIN_SPIKE);
      const color = RISK_COLOR[h.level] || "#8a8f96";
      spike.style.height = heightPx + "px";
      spike.style.width = SPIKE_W + "px";
      spike.style.background = spikeGradient(color);
      cluster.appendChild(spike);
    });
  }

  const pool = document.createElement("div");
  pool.className = "spike-shadow-pool";
  pool.style.width = Math.max(14, qualifying.length * (SPIKE_W + SPIKE_GAP) + 6) + "px";

  const wrap = document.createElement("div");
  wrap.className = "spike-stack";
  wrap.appendChild(cluster);
  wrap.appendChild(pool);

  el.appendChild(wrap);
  return el;
}

function updateLegendStatus(shown, total) {
  const hazardLabel = state.activeHazards.size === state.allData[state.league].hazardFields.length
    ? "All hazards" : `${state.activeHazards.size} hazard${state.activeHazards.size === 1 ? "" : "s"}`;
  document.getElementById("legendStatus").textContent =
    `Showing: ${state.league} — ${hazardLabel} · ${shown}/${total} venues`;
}

// ---------------------------------------------------------------
// POPUP
// ---------------------------------------------------------------
function openPopup(team) {
  if (state.openPopup) state.openPopup.remove();

  const node = document.createElement("div");
  node.className = "popup-card";

  const peakColor = RISK_COLOR[team.peakRisk] || "#999";

  node.innerHTML = `
    <div class="popup-head">
      <div class="popup-league">${state.league}</div>
      <div class="popup-franchise">${team.franchise}</div>
      <div class="popup-facility">${team.facility} · ${team.city}</div>
      <div class="popup-peak" style="background:${peakColor}22; color:${peakColor}">
        <i style="background:${peakColor}"></i>Peak Risk: ${team.peakRisk}
      </div>
    </div>
    <div class="popup-hazards">
      ${team.hazards.map(h => `
        <div class="popup-hazard-row">
          <div class="popup-hazard-label">${h.name}</div>
          <div class="popup-hazard-track"><div class="popup-hazard-fill" style="width:${(h.score/3)*100}%; background:${RISK_COLOR[h.level]}"></div></div>
          <div class="popup-hazard-value" style="color:${RISK_COLOR[h.level]}">${h.level}</div>
        </div>
      `).join("")}
    </div>
  `;

  state.openPopup = new mapboxgl.Popup({ offset: 28, closeButton: true, maxWidth: "310px" })
    .setLngLat([team.lon, team.lat])
    .setDOMContent(node)
    .addTo(map);

  map.easeTo({ center: [team.lon, team.lat], duration: 600 });
}

// ---------------------------------------------------------------
// DRAWER (venue list)
// ---------------------------------------------------------------
function renderDrawer() {
  const list = document.getElementById("drawerList");
  list.innerHTML = "";
  const data = state.allData[state.league];
  const teams = data.teams
    .filter(meetsFilter)
    .sort((a, b) => qualifyingCount(b) - qualifyingCount(a));

  if (teams.length === 0) {
    list.innerHTML = `<div class="drawer-empty">No venues match the current filters.</div>`;
    return;
  }

  teams.forEach(team => {
    const item = document.createElement("div");
    item.className = "drawer-item";
    const peakColor = RISK_COLOR[team.peakRisk] || "#999";
    const tags = team.hazards
      .filter(hazardPasses)
      .map(h => `<span class="drawer-tag ${h.score >= 3 ? 'hi' : (h.score >= 2 ? 'mod' : 'lo')}">${h.name} · ${h.level}</span>`)
      .join("");

    item.innerHTML = `
      <div class="drawer-item-top">
        <div class="drawer-item-name">${team.franchise}</div>
        <div class="drawer-item-peak" style="background:${peakColor}22; color:${peakColor}">${team.peakRisk}</div>
      </div>
      <div class="drawer-item-facility">${team.facility} · ${team.city}</div>
      <div class="drawer-item-tags">${tags}</div>
    `;
    item.addEventListener("click", () => {
      openPopup(team);
      if (window.innerWidth <= 900) document.getElementById("venueDrawer").classList.remove("open");
    });
    list.appendChild(item);
  });
}

// ---------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------
function exportPNG() {
  map.once("idle", () => {
    const link = document.createElement("a");
    link.download = `climate-risk-atlas-${state.league.toLowerCase()}.png`;
    link.href = map.getCanvas().toDataURL("image/png");
    link.click();
  });
  map.triggerRepaint();
}

function exportData() {
  const data = state.allData[state.league];
  const filtered = data.teams.filter(meetsFilter);
  const hazardFields = data.hazardFields;

  const header = ["Franchise", "Facility", "City", "Country", "Latitude", "Longitude", ...hazardFields, "Peak Risk", "Hazard Count (Mod+High)"];
  const rows = filtered.map(t => {
    const hazardMap = Object.fromEntries(t.hazards.map(h => [h.name, h.level]));
    return [
      t.franchise, t.facility, t.city, t.country, t.lat, t.lon,
      ...hazardFields.map(h => hazardMap[h] ?? ""),
      t.peakRisk, qualifyingCount(t)
    ];
  });

  const csv = Papa.unparse({ fields: header, data: rows });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `climate-risk-atlas-${state.league.toLowerCase()}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
