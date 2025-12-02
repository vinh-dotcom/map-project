// app.js: map logic + CRUD markers + realtime

let map;
let markersLayer = L.layerGroup();
let markersById = {}; // id -> leaflet marker

function initMap() {
map = L.map('map').setView([11.9, 108.3], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom: 19,
attribution: '© OpenStreetMap contributors'
}).addTo(map);

markersLayer.addTo(map);

// click to add location (prefill lat/lng)
map.on('click', function(e) {
const lat = e.latlng.lat.toFixed(6);
const lng = e.latlng.lng.toFixed(6);
$('m-lat').value = lat;
$('m-lng').value = lng;
});
}

function $ (id) { return document.getElementById(id); }

// Load markers for current user
window.loadUserMarkers = async function() {
if (!window.currentUser) return;
const uid = window.currentUser.id;
// clear existing
clearMarkers();

const { data, error } = await supabase
.from('markers')
.select('*')
.eq('user_id', uid)
.order('created_at', { ascending: false });

if (error) { console.error(error); return; }
for (const m of data) await addMarkerToMap(m);
renderMarkersList(data);
};

window.clearMarkers = function() {
markersLayer.clearLayers();
markersById = {};
$('markers-list').innerHTML = '';
};

async function addMarkerToMap(markerRow) {
const { id, lat, lng, name,