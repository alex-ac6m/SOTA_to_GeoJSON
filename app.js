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
  map = L.map('map').setView([37.3, -122.0], 8);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(map);

  map.on('click', onMapClick);
}

function loadSummits() {
  Papa.parse("summits.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    beforeFirstChunk: chunk => chunk.split('\n').slice(1).join('\n'),
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
          region: row.SummitCode.split('-')[0]
        }));

      console.log(`Loaded ${summits.length} summits`);
    }
  });
}

function enableCenterSelection() {
  centerLocked = false;
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

function renderSummits() {
  clearSummitMarkers();

  filteredSummits.forEach(summit => {
    const color = summit.activationCount > 0 ? "blue" : "red";

    const marker = L.circleMarker([summit.latitude, summit.longitude], {
      radius: 6,
      color: color
    }).addTo(map);

    marker.bindPopup(`
      <b>${summit.summitName}</b><br>
      Code: ${summit.summitCode}<br>
      Points: ${summit.points}<br>
      Activations: ${summit.activationCount}<br>
      Distance: ${summit.distance.toFixed(1)} mi
    `);

    summitMarkers.push(marker);
  });
}

function updateResults() {
  document.getElementById("results").innerHTML =
    `<p><b>${filteredSummits.length}</b> summits found</p>`;
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateGPX() {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SOTA Map Tool">`;

  filteredSummits.forEach(summit => {
    gpx += `
  <wpt lat="${summit.latitude}" lon="${summit.longitude}">
    <name>${escapeXml(summit.summitName)}</name>
    <desc>${escapeXml(`${summit.summitCode} | ${summit.points} pts | Activations: ${summit.activationCount}`)}</desc>
  </wpt>`;
  });

  gpx += `</gpx>`;
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
    features: filteredSummits.map(summit => ({
      geometry: {
        coordinates: [summit.longitude, summit.latitude, 0, 0],
        type: "Point"
      },
      type: "Feature",
      properties: {
        creator: "SOTA Map Tool",
        "-created-on": currentTime,
        "-updated-on": currentTime,
        description: `SOTA Summit Code: ${summit.summitCode}\nActivation Count: ${summit.activationCount}`,
        title: summit.summitName,
        "marker-size": "1",
        folderId: null,
        "marker-rotation": null,
        "marker-symbol": `circle-${summit.points}`,
        name: summit.summitName,
        "marker-color": summit.activationCount > 0 ? "0000FF" : "FF0000",
        class: "Marker",
        updated: currentTime
      }
    }))
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
