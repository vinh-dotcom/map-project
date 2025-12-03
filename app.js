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
  const { id, lat, lng, name, notes, image_path, created_at } = markerRow;
  const mk = L.marker([lat, lng]);
  const popupParts = [`<b>${name || '(no name)'}</b>`, `<div>Lat: ${lat}</div>`, `<div>Lng: ${lng}</div>`, `<div>${notes || ''}</div>`];
  if (image_path) {
    const signed = await getImageUrl(image_path);
    if (signed) popupParts.push(`<div><img src="${signed}" style="max-width:200px;display:block;margin-top:6px"/></div>`);
  }
  popupParts.push(`<div class="text-xs text-gray-500">${new Date(created_at).toLocaleString()}</div>`);
  mk.bindPopup(popupParts.join(''));
  mk.addTo(markersLayer);
  markersById[id] = mk;
}

function renderMarkersList(rows) {
  const container = $('markers-list');
  container.innerHTML = '';
  if (!rows || rows.length === 0) { container.innerHTML = '<div class="text-gray-500">Chưa có điểm nào</div>'; return; }
  rows.forEach(r => {
    const div = document.createElement('div');
    div.className = 'border p-2 rounded mb-2';
    div.innerHTML = `<div class="font-medium">${r.name || '(no name)'}</div>
                     <div class="text-sm">${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}</div>
                     <div class="text-xs text-gray-600">${new Date(r.created_at).toLocaleString()}</div>
                     <div class="mt-2 flex gap-2">
                       <button data-id="${r.id}" class="btn-zoom bg-sky-500 text-white px-2 py-1 rounded text-sm">Zoom</button>
                       <button data-id="${r.id}" class="btn-delete bg-red-500 text-white px-2 py-1 rounded text-sm">Xoá</button>
                     </div>`;
    container.appendChild(div);
  });

  // attach events
  container.querySelectorAll('.btn-zoom').forEach(b => {
    b.addEventListener('click', (ev) => {
      const id = ev.target.dataset.id;
      const mk = markersById[id];
      if (mk) map.setView(mk.getLatLng(), 16);
    });
  });
  container.querySelectorAll('.btn-delete').forEach(b => {
    b.addEventListener('click', async (ev) => {
      const id = ev.target.dataset.id;
      if (!confirm('Xác nhận xóa?')) return;
      const { error } = await supabase.from('markers').delete().eq('id', id);
      if (error) return alert('Xóa lỗi: ' + error.message);
      // remove from map & list
      const mk = markersById[id]; if (mk) markersLayer.removeLayer(mk);
      delete markersById[id];
      // remove element
      ev.target.closest('div').remove();
    });
  });
}

// Add marker flow
$('btn-add-marker').addEventListener('click', async () => {
  if (!window.currentUser) return alert('Bạn cần đăng nhập');
  const name = $('m-name').value || '';
  const lat = parseFloat($('m-lat').value);
  const lng = parseFloat($('m-lng').value);
  const notes = $('m-notes').value || '';
  const fileInput = $('m-image');
  const file = fileInput.files[0];

  if (isNaN(lat) || isNaN(lng)) return alert('Lat/Lng không hợp lệ');

  try {
    let image_path = null;
    if (file) {
      image_path = await uploadImage(file, window.currentUser.id);
    }

    const payload = {
      user_id: window.currentUser.id,
      lat,
      lng,
      name,
      notes,
      image_path
    };

    const { data, error } = await supabase.from('markers').insert([payload]).select().single();
    if (error) throw error;
    // success: marker will be added by realtime handler or we can add directly
    await addMarkerToMap(data);
    // prepend to list
    const existing = await supabase.from('markers').select('*').eq('user_id', window.currentUser.id).order('created_at', { ascending: false });
    renderMarkersList(existing.data);

    // reset form
    $('m-name').value=''; $('m-notes').value=''; $('m-image').value='';
    alert('Thêm marker thành công');
  } catch (err) {
    console.error(err);
    alert('Lỗi khi thêm marker: ' + err.message);
  }
});

// geolocate
$('btn-geolocate').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('Trình duyệt không hỗ trợ geolocation');
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    $('m-lat').value = lat; $('m-lng').value = lng;
  }, err => alert('Không lấy được vị trí: ' + err.message));
});

// Realtime: lắng nghe thay đổi trong bảng markers (postgres_changes)
function setupRealtime() {
  // unsubscribe existing channels if any
  if (window._markers_channel) {
    try { window._markers_channel.unsubscribe(); } catch(e){}
  }

  const channel = supabase.channel('public:markers')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'markers' }, payload => {
      const ev = payload.eventType; // INSERT, UPDATE, DELETE
      const record = payload.new || payload.old;
      // Only act on records of current user
      if (!window.currentUser) return;
      if ((payload.new && payload.new.user_id !== window.currentUser.id) && (payload.old && payload.old.user_id !== window.currentUser.id)) {
        return; // ignore other users
      }

      if (ev === 'INSERT') {
        addMarkerToMap(record).then(async () => {
          const list = await supabase.from('markers').select('*').eq('user_id', window.currentUser.id).order('created_at', { ascending: false });
          renderMarkersList(list.data);
        });
      } else if (ev === 'UPDATE') {
        // simple approach: reload all
        loadUserMarkers();
      } else if (ev === 'DELETE') {
        // remove
        const id = payload.old.id;
        const mk = markersById[id]; if (mk) markersLayer.removeLayer(mk);
        delete markersById[id];
        const list = supabase.from('markers').select('*').eq('user_id', window.currentUser.id).order('created_at', { ascending: false })
          .then(r => renderMarkersList(r.data));
      }
    })
    .subscribe();

  window._markers_channel = channel;
}

// Start
initMap();
setupRealtime();
