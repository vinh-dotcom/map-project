// app.js

let map;
let markersLayer = L.layerGroup();
let markersById = {};

function initMap(){
  map = L.map('map').setView([11.9, 108.3], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  markersLayer.addTo(map);

  map.on('click', function(e){
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    $('m-lat').value = lat;
    $('m-lng').value = lng;
  });
}

window.clearMarkers = function(){
  markersLayer.clearLayers();
  markersById = {};
  $('markers-list').innerHTML = '';
};

async function addMarkerToMap(row){
  const id = row.id;
  const lat = parseFloat(row.lat);
  const lng = parseFloat(row.lng);
  const name = row.name || '(no name)';
  const notes = row.notes || '';
  const created_at = row.created_at;
  const image_url = row.image_url || null;

  // create marker and popup
  const m = L.marker([lat, lng]);
  let popupHtml = `<b>${escapeHtml(name)}</b><div>Lat: ${lat}</div><div>Lng: ${lng}</div><div>${escapeHtml(notes)}</div>`;
  if (image_url) {
    const signed = await getImageUrl(image_url).catch(()=>null);
    if (signed) popupHtml += `<div style="margin-top:6px"><img src="${signed}" style="max-width:240px;display:block"/></div>`;
  }
  popupHtml += `<div class="text-xs text-gray-500" style="margin-top:6px">${new Date(created_at).toLocaleString()}</div>`;
  m.bindPopup(popupHtml);
  m.addTo(markersLayer);
  markersById[id] = m;
}

function renderMarkersList(rows){
  const container = $('markers-list');
  container.innerHTML = '';
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="text-gray-500">Chưa có điểm nào</div>';
    return;
  }
  rows.forEach(r => {
    const div = document.createElement('div');
    div.className = 'border p-2 rounded mb-2';
    div.innerHTML = `<div class="font-medium">${escapeHtml(r.name || '(no name)')}</div>
      <div class="text-sm">${Number(r.lat).toFixed(6)}, ${Number(r.lng).toFixed(6)}</div>
      <div class="text-xs text-gray-600">${new Date(r.created_at).toLocaleString()}</div>
      <div class="mt-2 flex gap-2">
        <button data-id="${r.id}" class="btn-zoom bg-sky-500 text-white px-2 py-1 rounded text-sm">Zoom</button>
        <button data-id="${r.id}" class="btn-delete bg-red-500 text-white px-2 py-1 rounded text-sm">Xoá</button>
      </div>`;
    container.appendChild(div);
  });

  container.querySelectorAll('.btn-zoom').forEach(b => {
    b.addEventListener('click', ev => {
      const id = ev.target.dataset.id;
      const mk = markersById[id];
      if (mk) map.setView(mk.getLatLng(), 16);
    });
  });

  container.querySelectorAll('.btn-delete').forEach(b => {
    b.addEventListener('click', async ev => {
      const id = ev.target.dataset.id;
      if (!confirm('Xác nhận xóa?')) return;
      const { error } = await supabase.from('markers').delete().eq('id', id);
      if (error) return alert('Xóa lỗi: ' + error.message);
      // remove locally
      const mk = markersById[id];
      if (mk) markersLayer.removeLayer(mk);
      delete markersById[id];
      ev.target.closest('div').remove();
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// load user markers
window.loadUserMarkers = async function(){
  if (!window.currentUser) return;
  const uid = window.currentUser.id;
  clearMarkers();
  const { data, error } = await supabase.from('markers').select('*').eq('user_id', uid).order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  for (const row of data) await addMarkerToMap(row);
  renderMarkersList(data);
};

// add marker button
$('btn-add-marker').addEventListener('click', async () => {
  if (!window.currentUser) return alert('Bạn cần đăng nhập');
  const name = $('m-name').value || '';
  const lat = parseFloat($('m-lat').value);
  const lng = parseFloat($('m-lng').value);
  const notes = $('m-notes').value || '';
  const file = $('m-image').files[0];

  if (Number.isNaN(lat) || Number.isNaN(lng)) return alert('Lat/Lng không hợp lệ');

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
      image_url: image_path
    };

    const { data, error } = await supabase.from('markers').insert([payload]).select().single();
    if (error) throw error;

    // add immediately
    await addMarkerToMap(data);
    // refresh list
    const all = await supabase.from('markers').select('*').eq('user_id', window.currentUser.id).order('created_at', { ascending: false });
    renderMarkersList(all.data);

    // reset
    $('m-name').value=''; $('m-notes').value=''; $('m-image').value='';
    alert('Thêm marker thành công');
  } catch (err) {
    console.error(err);
    alert('Lỗi khi thêm marker: ' + (err.message || err));
  }
});

// geolocate
$('btn-geolocate').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('Trình duyệt không hỗ trợ geolocation');
  navigator.geolocation.getCurrentPosition(pos => {
    $('m-lat').value = pos.coords.latitude.toFixed(6);
    $('m-lng').value = pos.coords.longitude.toFixed(6);
  }, err => alert('Không lấy được vị trí: ' + err.message));
});

// realtime: subscribe to changes but only act for current user
function setupRealtime() {
  if (window._markers_channel) {
    try { window._markers_channel.unsubscribe(); } catch(e){}
  }
  const channel = supabase.channel('public:markers')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'markers' }, payload => {
      const ev = payload.eventType; // INSERT, UPDATE, DELETE
      const recNew = payload.new;
      const recOld = payload.old;
      const currentUid = window.currentUser?.id;
      // ignore if not current user's record
      if (recNew && recNew.user_id !== currentUid) return;
      if (recOld && recOld.user_id !== currentUid) return;

      if (ev === 'INSERT' && recNew) {
        addMarkerToMap(recNew).then(async () => {
          const all = await supabase.from('markers').select('*').eq('user_id', currentUid).order('created_at', { ascending: false });
          renderMarkersList(all.data);
        });
      } else if (ev === 'DELETE' && recOld) {
        const id = recOld.id;
        const mk = markersById[id]; if (mk) markersLayer.removeLayer(mk);
        delete markersById[id];
        // refresh list
        supabase.from('markers').select('*').eq('user_id', currentUid).order('created_at', { ascending: false })
          .then(r => renderMarkersList(r.data));
      } else if (ev === 'UPDATE') {
        // reload
        window.loadUserMarkers();
      }
    })
    .subscribe();

  window._markers_channel = channel;
}

// init
initMap();
setupRealtime();
