let map;
let summits = [];
let filteredSummits = [];

let centerMarker = null;
let radiusCircle = null;
let summitMarkers = [];

let centerLat = null;
let centerLon = null;
let centerLocked = false;

const radiusInput = document.getElementById("radius");
const radiusSlider = document.getElementById("radiusSlider");

document.getElementById("searchBtn").addEventListener("click", searchSummits);
document.getElementById("downloadBtn").addEventListener("click", downloadGPX);
document.getElementById("downloadGeoJSONBtn").addEventListener("click", downloadGeoJSON);
document.getElementById("pickCenterBtn").addEventListener("click", enableCenterSelection);

radiusInput.addEventListener("input", syncRadiusFromInput);
radiusSlider.addEventListener("input", syncRadiusFromSlider);

initMap();
loadSummits();

function syncRadiusFromInput() {
  let value = parseFloat(radiusInput.value);

  if (isNaN(value)) return;

  if (value < 10) value = 10;
  if (value > 100) value = 100;

  radiusInput.value = value;
  radiusSlider.value = value;

  if (centerLat !== null) updateRadiusCircle();
}

function syncRadiusFromSlider() {
  radiusInput.value = radiusSlider.value;
  if (centerLat !== null) updateRadiusCircle();
}

function initMap() {
  map = L.map("map").setView([37.3, -122.0], 8);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18
  }).addTo(map);

  map.on("click", onMapClick);
}

function loadSummits() {
  Papa.parse("summits.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    beforeFirstChunk: chunk => chunk.split("\n").slice(1).join("\n"),
    complete: results => {
      summits = results.data
        .filter(row => row.SummitCode)
        .map(row => ({
          summitName: row.SummitName,
          summitCode: row.SummitCode,
          latitude: parseFloat(row.Latitude),
          longitude: parseFloat(row.Longitude),
          points: parseInt(row.Points),
          activationCount: parseInt(row.ActivationCount) || 0,
          region: row.SummitCode.split("-")[0]
        }));

      console.log(`Loaded ${summits.length} summits`);
    }
  });
}

function enableCenterSelection() {
  centerLocked = false;
  document.getElementById("centerStatus").innerHTML =
    "Center: Click map to select";
}

function onMapClick(e) {
  if (centerLocked) return;

  centerLat = e.latlng.lat;
  centerLon = e.latlng.lng;

  if (centerMarker) map.removeLayer(centerMarker);

  centerMarker = L.marker([centerLat, centerLon]).addTo(map);

  updateRadiusCircle();

  document.getElementById("centerStatus").innerHTML =
    `Center: ${centerLat.toFixed(5)}, ${centerLon.toFixed(5)}`;

  centerLocked = true;
}

function updateRadiusCircle() {
  const radiusMiles = parseFloat(radiusInput.value);

  if (radiusCircle) map.removeLayer(radiusCircle);

  radiusCircle = L.circle([centerLat, centerLon], {
    radius: radiusMiles * 1609.34
  }).addTo(map);
}

function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = deg => deg * Math.PI / 180;

  lat1 = toRad(lat1);
  lon1 = toRad(lon1);
  lat2 = toRad(lat2);
  lon2 = toRad(lon2);

  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;

  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dlon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function getFilters() {
  const regionsRaw = document.getElementById("regions").value.trim();

  return {
    radius: parseFloat(radiusInput.value),
    regions: regionsRaw ? regionsRaw.split(",").map(r => r.trim()) : null,
    minPoints: parseInt(document.getElementById("minPoints").value) || null,
    maxPoints: parseInt(document.getElementById("maxPoints").value) || null,
    minActivations: parseInt(document.getElementById("minActivations").value) || null,
    maxActivations: parseInt(document.getElementById("maxActivations").value) || null
  };
}

function searchSummits() {
  if (centerLat === null) {
    alert("Select a center first.");
    return;
  }

  const filters = getFilters();

  filteredSummits = summits.filter(summit => {
    const dist = distanceMiles(centerLat, centerLon, summit.latitude, summit.longitude);
    summit.distance = dist;

    if (dist > filters.radius) return false;
    if (filters.regions && !filters.regions.includes(summit.region)) return false;
    if (filters.minPoints !== null && summit.points < filters.minPoints) return false;
    if (filters.maxPoints !== null && summit.points > filters.maxPoints) return false;
    if (filters.minActivations !== null && summit.activationCount < filters.minActivations) return false;
    if (filters.maxActivations !== null && summit.activationCount > filters.maxActivations) return false;

    return true;
  });

  renderSummits();
  updateResults();
}

function clearSummitMarkers() {
  summitMarkers.forEach(marker => map.removeLayer(marker));
  summitMarkers = [];
}

function getSotlAsUrl(summitCode) {
  return `https://sotl.as/summits/${summitCode}`;
}

function renderSummits() {
  clearSummitMarkers();

  filteredSummits.forEach(summit => {
    const color = summit.activationCount > 0 ? "blue" : "red";
    const sotlAsUrl = getSotlAsUrl(summit.summitCode);

    const marker = L.circleMarker([summit.latitude, summit.longitude], {
      radius: 6,
      color: color
    }).addTo(map);

    marker.bindPopup(`
      <b>${escapeHtml(summit.summitName)}</b><br>
      Code: ${escapeHtml(summit.summitCode)}<br>
      Points: ${summit.points}<br>
      Activations: ${summit.activationCount}<br>
      Distance: ${summit.distance.toFixed(1)} mi<br>
      <a href="${sotlAsUrl}" target="_blank" rel="noopener noreferrer">Open in SOTL.as</a>
    `);

    summitMarkers.push(marker);
  });
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentileValue / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function activationStatButton(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  const roundedValue = Math.round(value);
  return `
    <button
      type="button"
      class="stat-button"
      onclick="setMinActivations(${roundedValue})"
      title="Use ${roundedValue} as the minimum activation count"
    >
      ${formatNumber(value)}
    </button>
  `;
}

function setMinActivations(value) {
  document.getElementById("minActivations").value = value;
}

function updateResults() {
  const activatedSummits = filteredSummits.filter(s => s.activationCount > 0);
  const activated = activatedSummits.length;
  const unactivated = filteredSummits.length - activated;

  const activationCounts = activatedSummits.map(s => s.activationCount);
  const p25 = percentile(activationCounts, 25);
  const p50 = percentile(activationCounts, 50);
  const p90 = percentile(activationCounts, 90);
  const maxActivations = activationCounts.length ? Math.max(...activationCounts) : null;

  document.getElementById("results").innerHTML = `
    <p><b>${filteredSummits.length}</b> summits found</p>
    <p>Activated: ${activated}</p>
    <p>Unactivated: ${unactivated}</p>

    <h3>Activation Count Stats</h3>
    <p>Activated summits only. Click a value to use it as Min Activations.</p>
    <ul>
      <li>25th percentile: ${activationStatButton(p25)} activations</li>
      <li>50th percentile: ${activationStatButton(p50)} activations</li>
      <li>90th percentile: ${activationStatButton(p90)} activations</li>
      <li>Maximum: ${activationStatButton(maxActivations)} activations</li>
    </ul>
  `;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateGPX() {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SOTA Map Tool">`;

  filteredSummits.forEach(summit => {
    const sotlAsUrl = getSotlAsUrl(summit.summitCode);

    gpx += `
  <wpt lat="${summit.latitude}" lon="${summit.longitude}">
    <name>${escapeXml(summit.summitName)}</name>
    <desc>${escapeXml(
      `${summit.summitCode} | ${summit.points} pts | Activations: ${summit.activationCount} | ${sotlAsUrl}`
    )}</desc>
  </wpt>`;
  });

  gpx += `
</gpx>`;

  return gpx;
}

function downloadGPX() {
  if (filteredSummits.length === 0) {
    alert("No summits selected.");
    return;
  }

  const blob = new Blob([generateGPX()], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "sota_summits.gpx";
  a.click();

  URL.revokeObjectURL(url);
}

function generateGeoJSON() {
  const currentTime = Date.now();

  return {
    features: filteredSummits.map(summit => {
      const sotlAsUrl = getSotlAsUrl(summit.summitCode);

      return {
        geometry: {
          coordinates: [summit.longitude, summit.latitude, 0, 0],
          type: "Point"
        },
        type: "Feature",
        properties: {
          creator: "SOTA Map Tool",
          "-created-on": currentTime,
          "-updated-on": currentTime,
          description:
            `SOTA Summit Code: ${summit.summitCode}\n` +
            `Activation Count: ${summit.activationCount}\n` +
            `SOTL.as: ${sotlAsUrl}`,
          title: summit.summitName,
          "marker-size": "1",
          folderId: null,
          "marker-rotation": null,
          "marker-symbol": `circle-${summit.points}`,
          "marker-color": summit.activationCount > 0 ? "0000FF" : "FF0000",
          class: "Marker",
          updated: currentTime
        }
      };
    })
  };
}

function downloadGeoJSON() {
  if (filteredSummits.length === 0) {
    alert("No summits selected.");
    return;
  }

  const blob = new Blob(
    [JSON.stringify(generateGeoJSON(), null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "sota_summits.geojson";
  a.click();

  URL.revokeObjectURL(url);
}
