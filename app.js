// app.js

let map;
let markersLayer = L.layerGroup();
let markersById = {};

function initMap() {
  map = L.map("map").setView([11.9, 108.3], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);
  markersLayer.addTo(map);

  map.on("click", function (e) {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    $("m-lat").value = lat;
    $("m-lng").value = lng;
  });
}

window.clearMarkers = function () {
  markersLayer.clearLayers();
  markersById = {};
  $("markers-list").innerHTML = "";
};

async function addMarkerToMap(row) {
  const id = row.id;
  const lat = parseFloat(row.lat);
  const lng = parseFloat(row.lng);
  const name = row.name || "(no name)";
  const notes = row.notes || "";
  const created_at = row.created_at;
  const image_url = row.image_url || null;

  const m = L.marker([lat, lng]);

  let popupHtml = `
    <b>${escapeHtml(name)}</b>
    <div>Lat: ${lat}</div>
    <div>Lng: ${lng}</div>
    <div>${escapeHtml(notes)}</div>
  `;

  if (image_url) {
    const signed
