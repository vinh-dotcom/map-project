// app.debug.js (replace app.js with this temporarily)

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
    $("m-lat").value = e.latlng.lat.toFixed(6);
    $("m-lng").value = e.latlng.lng.toFixed(6);
  });
}
window.clearMarkers = function () {
  markersLayer.clearLayers();
  markersById = {};
  $("markers-list").innerHTML = "";
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function addMarkerToMap(row) {
  const id = row.id;
  const lat = parseFloat(row.lat);
  const lng = parseFloat(row.lng);
  const m = L.marker([lat, lng]);
  let html = `<b>${escapeHtml(row.name || "(no name)")}</b><div>Lat: ${lat}</div><div>Lng: ${lng}</div>`;
  if (row.image_url) {
    const signed = await getImageUrl(row.image_url).catch(()=>null);
    if (signed) html += `<div style="margin-top:6px"><img src="${signed}" style="max-width:240px;display:block"/></div>`;
  }
  m.bindPopup(html);
  m.addTo(markersLayer);
  markersById[id] = m;
}

function renderMarkersList(rows) {
  const c = $("markers-list");
  c.innerHTML = "";
  if (!rows || rows.length === 0) { c.innerHTML = '<div class="text-gray-500">Chưa có điểm nào</div>'; return; }
  rows.forEach(r => {
    const div = document.createElement("div");
    div.className = "border p-2 rounded mb-2";
    div.innerHTML = `<div class="font-medium">${escapeHtml(r.name||'(no name)')}</div>
      <div class="text-sm">${Number(r.lat).toFixed(6)}, ${Number(r.lng).toFixed(6)}</div>
      <div class="text-xs text-gray-600">${new Date(r.created_at).toLocaleString()}</div>
      <div class="mt-2 flex gap-2">
        <button data-id="${r.id}" class="btn-zoom bg-sky-500 text-white px-2 py-1 rounded text-sm">Zoom</button>
        <button data-id="${r.id}" class="btn-delete bg-red-500 text-white px-2 py-1 rounded text-sm">Xoá</button>
      </div>`;
    c.appendChild(div);
  });
  c.querySelectorAll('.btn-zoom').forEach(b => b.addEventListener('click', ev=>{
    const id = ev.target.dataset.id; const mk = markersById[id]; if (mk) map.setView(mk.getLatLng(),16);
  }));
  c.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', async ev=>{
    const id = ev.target.dataset.id;
    if (!confirm('Xác nhận xóa?')) return;
    const { error } = await supabase.from('markers').delete().eq('id', id);
    if (error) return alert('Xóa lỗi: '+error.message);
    const mk = markersById[id]; if (mk) markersLayer.removeLayer(mk); delete markersById[id];
    ev.target.closest('div').remove();
  }));
}

// Load markers
window.loadUserMarkers = async function() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[DEBUG] loadUserMarkers - session:', session);
    if (!session) { console.warn('[DEBUG] no session in loadUserMarkers'); return; }
    const uid = session.user.id;
    clearMarkers();
    const { data, error } = await supabase.from('markers').select('*').eq('user_id', uid).order('created_at',{ascending:false});
    if (error) { console.error('[DEBUG] loadUserMarkers error', error); return; }
    for (const r of data) await addMarkerToMap(r);
    renderMarkersList(data);
  } catch (e) {
    console.error('[DEBUG] loadUserMarkers exception', e);
  }
};

// DEBUG: add marker flow with extensive logs
$('btn-add-marker').addEventListener('click', async () => {
  console.group('DEBUG add-marker flow');
  try {
    console.log('[DEBUG] getSession BEFORE any action');
    const { data: before } = await supabase.auth.getSession();
    console.log('[DEBUG] session BEFORE:', before);

    // also log getUser
    try { const { data: userData } = await supabase.auth.getUser(); console.log('[DEBUG] getUser BEFORE:', userData); } catch(e){ console.warn('[DEBUG] getUser BEFORE failed', e); }

    if (!before || !before.session) {
      console.warn('[DEBUG] no session BEFORE - aborting');
      alert('Phiên làm việc không hợp lệ. Vui lòng đăng nhập lại.');
      console.groupEnd();
      return;
    }
    const uid = before.session.user.id; console.log('[DEBUG] uid BEFORE:', uid);

    const name = $('m-name').value || '';
    const lat = parseFloat($('m-lat').value);
    const lng = parseFloat($('m-lng').value);
    const notes = $('m-notes').value || '';
    const file = $('m-image').files[0];

    if (Number.isNaN(lat) || Number.isNaN(lng)) { alert('Lat/Lng không hợp lệ'); console.groupEnd(); return; }

    let image_path = null;
    if (file) {
      console.log('[DEBUG] Starting uploadImage', file.name);
      // instrument upload
      const start = Date.now();
      try {
        image_path = await (async () => {
          console.log('[DEBUG] calling uploadImage with uid=', uid);
          const res = await uploadImage(file, uid);
          console.log('[DEBUG] uploadImage returned:', res);
          return res;
        })();
      } catch (uErr) {
        console.error('[DEBUG] uploadImage threw', uErr);
        alert('Upload lỗi: ' + (uErr.message || uErr));
        console.groupEnd();
        return;
      }
      console.log('[DEBUG] upload finished in', Date.now()-start, 'ms; path=', image_path);

      // log session after upload
      const { data: afterUpload } = await supabase.auth.getSession();
      console.log('[DEBUG] session AFTER upload:', afterUpload);
      try { const { data: userAfter } = await supabase.auth.getUser(); console.log('[DEBUG] getUser AFTER upload:', userAfter); } catch(e){ console.warn('[DEBUG] getUser AFTER failed', e); }
    } else {
      console.log('[DEBUG] no file selected');
    }

    // final session check before insert
    const { data: sessBeforeInsert } = await supabase.auth.getSession();
    console.log('[DEBUG] session BEFORE insert:', sessBeforeInsert);
    if (!sessBeforeInsert || !sessBeforeInsert.session) {
      console.warn('[DEBUG] session lost BEFORE insert - aborting');
      alert('Phiên làm việc mất trước khi lưu, vui lòng đăng nhập lại.');
      console.groupEnd();
      return;
    }
    const payload = { lat, lng, name, notes, image_url: image_path };
    console.log('[DEBUG] payload:', payload);

    const { data, error } = await supabase.from('markers').insert([payload]).select().single();
    console.log('[DEBUG] insert result:', {data, error});
    if (error) {
      console.error('[DEBUG] INSERT ERROR', error);
      alert('Lỗi khi thêm marker: ' + error.message);
    } else {
      alert('Thêm marker thành công');
      // refresh
      await loadUserMarkers();
    }
  } catch (err) {
    console.error('[DEBUG] Unexpected error', err);
    alert('Lỗi không lường trước: ' + (err.message||err));
  } finally {
    console.groupEnd();
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

function setupRealtime() {
  if (window._markers_channel) { try { window._markers_channel.unsubscribe(); } catch(e){} }
  const channel = supabase.channel('public:markers')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'markers'}, async payload => {
      // keep behavior same: only react for current user
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      const ev = payload.eventType;
      const recNew = payload.new, recOld = payload.old;
      if (!uid) return;
      if (recNew && recNew.user_id !== uid) return;
      if (recOld && recOld.user_id !== uid) return;

      if (ev === 'INSERT' && recNew) {
        await addMarkerToMap(recNew);
        const all = await supabase.from('markers').select('*').eq('user_id', uid).order('created_at', {ascending:false});
        renderMarkersList(all.data);
      } else if (ev === 'DELETE' && recOld) {
        const id = recOld.id; const mk = markersById[id]; if (mk) markersLayer.removeLayer(mk); delete markersById[id];
      } else if (ev === 'UPDATE') {
        window.loadUserMarkers();
      }
    })
    .subscribe();
  window._markers_channel = channel;
}

initMap();
setupRealtime();
