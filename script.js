let legendControl = null;
let markersLayer = null;

const PROXY_URL = "https://geomedia.florian-nadegger.workers.dev";

const pollutantsConfig = {
  "1": { name: "PM 2.5", unit: "µg/m³", thresholds: [5, 10, 15, 25, 35] },
  "2": { name: "PM 10", unit: "µg/m³", thresholds: [15, 30, 45, 75, 100] },
  "3": { name: "Ozone (O3)", unit: "ppm", thresholds: [0.03, 0.05, 0.07, 0.09, 0.11] },
  "4": { name: "Nitrogen Dioxide (NO2)", unit: "ppm", thresholds: [0.02, 0.04, 0.06, 0.08, 0.1] },
  "5": { name: "Sulfur Dioxide (SO2)", unit: "ppm", thresholds: [0.01, 0.02, 0.04, 0.06, 0.08] },
  "6": { name: "Carbon Monoxide (CO)", unit: "ppm", thresholds: [2, 4, 6, 8, 10] }
};

const map = L.map("map", {
  center: [20, 0],
  zoom: 2,
  minZoom: 2,
  maxBounds: [[-85, -180], [85, 180]],
  maxBoundsViscosity: 1.0
});

markersLayer = L.layerGroup().addTo(map);

const streetView = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  noWrap: true,
  attribution: "&copy; OpenStreetMap contributors | Data: OpenAQ"
});

const satelliteView = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  noWrap: true,
  attribution: "Tiles &copy; Esri, Earthstar Geographics"
});

const baseMaps = {
  "Street View": streetView,
  "Satellite": satelliteView
};

streetView.addTo(map);
L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

const InfoButton = L.Control.extend({
  options: { position: "topright" },
  onAdd: function () {
    const btn = L.DomUtil.create("button", "leaflet-control info-button");
    btn.innerHTML = "i";
    btn.title = "About this map";
    btn.onclick = () => openInfoModal();
    return btn;
  }
});
map.addControl(new InfoButton());

const LocateButton = L.Control.extend({
  options: { position: "topright" },
  onAdd: function () {
    const btn = L.DomUtil.create("button", "leaflet-control info-button");
    btn.innerHTML = "📍";
    btn.title = "Find my location";
    btn.onclick = () => map.locate({ setView: true, maxZoom: 6 });
    return btn;
  }
});
map.addControl(new LocateButton());

map.on('locationerror', function () {
  alert("Could not find your location. Please ensure location permissions are enabled.");
});

L.Control.geocoder({
  defaultMarkGeocode: false,
  position: 'topleft'
})
.on('markgeocode', function (e) {
  const bbox = e.geocode.bbox;
  map.fitBounds(bbox);
})
.addTo(map);

function getColor(d, thresholds) {
  if (d === null || d === undefined) return "#cccccc";
  return d > thresholds[4] ? "#800026" :
         d > thresholds[3] ? "#BD0026" :
         d > thresholds[2] ? "#E31A1C" :
         d > thresholds[1] ? "#FC4E2A" :
         d > thresholds[0] ? "#FD8D3C" :
                             "#00E400";
}

async function loadPollutantData(parameterId) {
  try {
    markersLayer.clearLayers();
    const config = pollutantsConfig[parameterId];

    const latestRes = await fetch(`${PROXY_URL}/v3/parameters/${parameterId}/latest?limit=1000`);
    const latestData = await latestRes.json();

    if (!latestData.results || latestData.results.length === 0) return;

    latestData.results.forEach(measurement => {
      if (!measurement.coordinates || !measurement.coordinates.latitude || !measurement.coordinates.longitude) return;

      const lat = measurement.coordinates.latitude;
      const lon = measurement.coordinates.longitude;
      const val = measurement.value;

      if (val !== null && val !== undefined) {
        const marker = L.circleMarker([lat, lon], {
          radius: 6,
          fillColor: getColor(val, config.thresholds),
          color: "#000",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.9
        }).addTo(markersLayer);

        marker.bindTooltip(`
          <div class="mini-tooltip">
            <b>${val.toFixed(2)} ${config.unit}</b><br>
            <span>Click for details</span>
          </div>
        `, { direction: 'top', opacity: 0.95 });

        marker.bindPopup('<div class="station-popup loading">Loading station details...</div>');

        marker.on('popupopen', async (e) => {
          const currentZoom = map.getZoom();
          map.flyTo([lat, lon], Math.max(currentZoom, 6), { duration: 0.5 });

          try {
            const locRes = await fetch(`${PROXY_URL}/v3/locations/${measurement.locationsId}`);
            const locData = await locRes.json();

            if (locData && locData.results && locData.results.length > 0) {
              const meta = locData.results[0];
              const displayName = meta.name || "Station " + measurement.locationsId;
              const displayLoc = meta.locality || "Unknown Region";
              const displayCountry = meta.country ? meta.country.name : "Unknown Country";
              const displayProvider = meta.provider ? meta.provider.name : "Unknown Provider";
              const displayType = meta.isMonitor ? "Official Monitor" : "Community Sensor";

              const localTime = measurement.datetime && measurement.datetime.local
                ? new Date(measurement.datetime.local).toLocaleString()
                : "Unknown time";

              e.popup.setContent(`
                <div class="station-popup">
                  <div class="popup-title">${displayName}</div>
                  <div class="popup-subtitle">${displayLoc}, ${displayCountry}</div>
                  <div class="popup-provider">Provider: ${displayProvider} (${displayType})</div>
                  <hr class="popup-divider">
                  <div class="popup-measurement">
                      <span>${config.name}:</span>
                      <b>${val.toFixed(2)} ${config.unit}</b>
                  </div>
                  <div class="popup-updated">
                      Updated: ${localTime}
                  </div>
                </div>
              `);
            } else {
              e.popup.setContent('<div class="station-popup message">Station details unavailable.</div>');
            }
          } catch (error) {
            e.popup.setContent('<div class="station-popup message error">Failed to load data.</div>');
          }
        });
      }
    });

    createLegend(config);

  } catch (error) {
    console.error("Error when laoding data:", error);
  }
}

function createLegend(config) {
  if (legendControl) map.removeControl(legendControl);
  legendControl = L.control({ position: "bottomleft" });

  legendControl.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    const grades = [0, ...config.thresholds];

    div.innerHTML = `<strong>${config.name} (${config.unit})</strong><br>`;

    for (let i = 0; i < grades.length; i++) {
      const colorVal = i === 0 ? grades[0] : grades[i] + 0.001;
      div.innerHTML += '<i style="background:' + getColor(colorVal, config.thresholds) +
        '; width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.7;"></i> ' +
        grades[i] + (grades[i + 1] ? ' to ' + grades[i + 1] + '<br>' : '+');
    }
    return div;
  };
  legendControl.addTo(map);
}

async function initMap() {
  try {
    const geoRes = await fetch('Regions.geojson');
    const geoData = await geoRes.json();

    L.geoJson(geoData, {
      style: {
        fillColor: '#cbd5e1',
        weight: 1,
        color: '#64748b',
        fillOpacity: 0.35
      }
    }).addTo(map);

    loadPollutantData("2");

  } catch (error) {
    console.error("Initialization error:", error);
  }
}

document.getElementById('pollutantSelect').addEventListener('change', (e) => {
  loadPollutantData(e.target.value);
});

const infoModal = document.getElementById("infoModal");
const modalClose = document.getElementById("modalClose");
function openInfoModal() { if (infoModal) infoModal.style.display = "block"; }
if (modalClose) { modalClose.onclick = () => { infoModal.style.display = "none"; }; }
window.onclick = (event) => { if (event.target == infoModal) { infoModal.style.display = "none"; } };

initMap();