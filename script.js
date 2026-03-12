const pollutantsConfig = {
    "1": { id: "pm25_concentration", name: "PM 2.5", unit: "µg/m³", thresholds: [5, 10, 15, 25, 35] },
    "2": { id: "pm10_concentration", name: "PM 10", unit: "µg/m³", thresholds: [15, 30, 45, 75, 100] },
    "3": { id: "no2_concentration", name: "Nitrogen Dioxide (NO2)", unit: "µg/m³", thresholds: [10, 20, 30, 40, 50] }
};

let currentPollutantId = "1";
let currentYear = 2021;
let markersLayer = null;
let rawData = [];
let currentMarkers = [];

const mapCenter = [20, 0];
const mapZoom = 2;
const map = L.map("map", {
    center: mapCenter,
    zoom: mapZoom,
    minZoom: 2,
    maxBounds: [[-70, -180], [85, 180]],
    maxBoundsViscosity: 1.0
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

map.createPane('regionsPane').style.zIndex = 400;
map.createPane('markersPane').style.zIndex = 450;

const HomeButton = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
        const btn = L.DomUtil.create("button", "leaflet-control home-button");
        btn.innerHTML = "🏠";
        btn.onclick = () => map.setView(mapCenter, mapZoom);
        return btn;
    }
});
map.addControl(new HomeButton());

const FindNearestButton = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
        const btn = L.DomUtil.create("button", "leaflet-control find-nearest-button");
        btn.innerHTML = "🎯";
        btn.title = "Find Nearest Station to Center";
        btn.onclick = () => findNearestStation();
        return btn;
    }
});
map.addControl(new FindNearestButton());

const geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    position: 'topright',
    placeholder: 'Search location...'
})
.on('markgeocode', function(e) {
    map.fitBounds(e.geocode.bbox);
})
.addTo(map);

const InfoButton = L.Control.extend({
    options: { position: "topright" },
    onAdd: function () {
        const btn = L.DomUtil.create("button", "leaflet-control info-button");
        btn.textContent = "i";
        btn.onclick = () => document.getElementById("infoModal").style.display = "flex";
        return btn;
    } 
});
map.addControl(new InfoButton());

function getColor(val, thresholds) {
    if (val === null || val === undefined) return '#cbd5e1';
    return val > thresholds[4] ? '#7f1d1d' :
           val > thresholds[3] ? '#ef4444' :
           val > thresholds[2] ? '#f97316' :
           val > thresholds[1] ? '#facc15' :
           val > thresholds[0] ? '#a3e635' : '#22c55e';
}

function getDynamicRadius() {
    return Math.max(5, map.getZoom() * 1.5);
}

function findNearestStation() {
    if (currentMarkers.length === 0) return;

    let nearestMarker = null;
    let minDistance = Infinity;
    const center = map.getCenter();

    currentMarkers.forEach(marker => {
        const dist = map.distance(center, marker.getLatLng());
        if (dist < minDistance) {
            minDistance = dist;
            nearestMarker = marker;
        }
    });

    if (nearestMarker) {
        map.flyTo(nearestMarker.getLatLng(), 8, { duration: 1.5 });
        nearestMarker.openTooltip();
    }
}

async function initMap() {
    try {
        const response = await fetch('air_quality_subset.json');
        rawData = await response.json();

        const geoRes = await fetch('Regions.geojson');
        const geoData = await geoRes.json();
        L.geoJson(geoData, {
            style: { color: '#64748b', weight: 1, fillOpacity: 0.05, fillColor: '#000' },
            interactive: false 
        }).addTo(map);

        updateMap();

        document.getElementById("pollutantSelect").addEventListener("change", (e) => {
            currentPollutantId = e.target.value;
            updateMap();
        });

        const slider = document.getElementById("yearSlider");
        const display = document.getElementById("yearDisplay");
        slider.addEventListener("input", (e) => {
            currentYear = parseInt(e.target.value);
            display.textContent = currentYear;
            updateMap();
        });
    } catch (err) { console.error(err); }
}

function updateMap() {
    if (markersLayer) map.removeLayer(markersLayer);
    markersLayer = L.layerGroup().addTo(map);
    currentMarkers = [];

    const config = pollutantsConfig[currentPollutantId];
    const yearData = rawData.filter(d => Math.round(d.year) === currentYear);

    yearData.forEach(entry => {
        const val = entry[config.id];
        if (entry.lat && entry.lng && val !== null) {
            const marker = L.circleMarker([entry.lat, entry.lng], {
                radius: getDynamicRadius(),
                fillColor: getColor(val, config.thresholds),
                color: "#ffffff",
                weight: 0.5,
                fillOpacity: 0.8
            });

            const tooltipContent = `
                <div class="station-tooltip">
                    <span class="city">${entry.city}</span>
                    <span class="country">${entry.country_name || entry.iso}</span>
                    <hr>
                    <div class="data-row">
                        <span class="data-label">${config.name}</span>
                        <span class="data-value">${val.toFixed(1)} <small>${config.unit}</small></span>
                    </div>
                </div>
            `;
            
            marker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, -5] });
            marker.on('mouseover', function() { this.setRadius(getDynamicRadius() + 4); this.openTooltip(); });
            marker.on('mouseout', function() { this.setRadius(getDynamicRadius()); this.closeTooltip(); });
            
            marker.addTo(markersLayer);
            currentMarkers.push(marker);
        }
    });
}

map.on('zoomend', function() {
    if (!markersLayer) return;
    const newRadius = getDynamicRadius();
    markersLayer.eachLayer(function(marker) {
        marker.setRadius(newRadius);
    });
});

initMap();

document.getElementById("modalClose").onclick = () => document.getElementById("infoModal").style.display = "none";
window.onclick = (e) => { if (e.target.className === 'modal-backdrop') document.getElementById("infoModal").style.display = "none"; };