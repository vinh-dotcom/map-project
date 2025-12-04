// app.js
// Assumes supabase (window.supabase) created in supabase.js

// Globals
let map;
const markersOnMap = {}; // id -> { marker, record }
let currentEdit = null; // { id, marker, origLatLng, moved }

// DOM refs
const $ = id => document.getElementById(id);

// UI helpers
function showToast(msg) { alert(msg); }

// AUTH UI
async function refreshAuthUI() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user || null;
  if (user) {
    $('user-name').textContent = user.email || user.id;
    $('user-name').classList.remove('hidden');
    $('btn-logout-top').classList.remove('hidden');
    $('btn-open-add').classList.remove('hidden');
    $('auth-view') && $('auth-view').classList && $('auth-view').classList.add('hidden');
    checkAdminAndShow(user.id);
    await loadMarkers();
  } else {
    $('user-name').classList.add('hidden');
    $('btn-logout-top').classList.add('hidden');
    $('btn-open-add').classList.remove('hidden');
    // show minimal login UI: but we use nav entry point to login externally
  }
}

// Sign in / signup handlers expected in supabase.js usage or elsewhere
window.signIn = async function(email, password) {
  // optional helper: call supabase.auth.signInWithPassword(...)
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return showToast('Login error: ' + error.message);
  await refreshAuthUI();
}
window.signUp = async function(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return showToast('Signup error: ' + error.message);
  showToast('Đăng ký thành công. Kiểm tra email nếu cần.');
}

// Logout UI
$('btn-logout-top').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

// Init map
function initMap() {
  map = L.map('map').setView([11.95, 108.45], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // click on map opens add modal and fills coords
  map.on('click', (e) => {
    openAddModal(e.latlng.lat, e.latlng.lng);
  });
}

// Open add modal
function openAddModal(lat=null, lng=null) {
  $('m-name').value = '';
  $('m-lat').value = lat ? lat.toFixed(6) : '';
  $('m-lng').value = lng ? lng.toFixed(6) : '';
  $('m-notes').value = '';
  $('m-image').value = '';
  $('m-is-public').checked = false;
  $('add-modal').classList.remove('hidden');
}
$('btn-open-add').addEventListener('click', () => openAddModal());
$('btn-cancel-add').addEventListener('click', () => $('add-modal').classList.add('hidden'));

// Save new marker
$('btn-save-add').addEventListener('click', async () => {
  try {
    // ensure session valid
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return showToast('Phiên hết hạn, đăng nhập lại.');

    const uid = session.user.id;
    const lat = parseFloat($('m-lat').value);
    const lng = parseFloat($('m-lng').value);
    if (isNaN(lat) || isNaN(lng)) return showToast('Lat/Lng không hợp lệ');

    const name = $('m-name').value || '';
    const notes = $('m-notes').value || '';
    const is_public = $('m-is-public').checked;
    const file = $('m-image').files[0];

    // upload image if any
    let image_path = null, image_url = null;
    if (file) {
      const res = await uploadImage(uid, file, null);
      image_path = res.path;
      image_url = res.publicUrl;
    }

    const { error } = await supabase.from('markers').insert([{
      // do not send user_id if default auth.uid() used; but sending for clarity is okay if policy allows
      user_id: uid,
      lat, lng, name, notes,
      image_path, image_url,
      is_public
    }]);
    if (error) throw error;

    $('add-modal').classList.add('hidden');
    await loadMarkers();
    showToast('Thêm marker thành công');
  } catch (err) {
    console.error(err);
    showToast('Lỗi khi thêm marker: ' + (err.message || err));
  }
});

// Load markers (for current user + public)
async function loadMarkers() {
  // clear existing
  Object.values(markersOnMap).forEach(o => {
    try { map.removeLayer(o.marker); } catch(e){}
  });
  for (const k in markersOnMap) delete markersOnMap[k];

  // get session
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;

  // build query: user markers OR public markers
  let query = supabase.from('markers').select('*').order('created_at', { ascending: false });
  if (uid && !(await isCurrentAdmin(uid))) {
    // only user's own + public
    query = query.or(`user_id.eq.${uid},is_public.eq.true`);
  } else if (!uid) {
    // public only for non-auth
    query = query.eq('is_public', true);
  } // admin will fetch all by leaving query as-is

  const { data, error } = await query;
  if (error) return console.error('loadMarkers error', error);

  for (const r of data) {
    await renderMarkerRecord(r);
  }
}

// Render single record as marker + entry in list
async function renderMarkerRecord(r) {
  const id = r.id;
  // compute public image url (if image_url exists use it; else try from path)
  let displayUrl = r.image_url || null;
  if (!displayUrl && r.image_path) {
    try {
      const { data: pub } = await supabase.storage.from('marker-images').getPublicUrl(r.image_path);
      displayUrl = pub?.publicUrl || null;
    } catch (e) { console.warn('getPublicUrl failed', e); }
  }

  // create marker
  const marker = L.marker([r.lat, r.lng], { draggable: false }).addTo(map);

  // popup content
  const imgHtml = displayUrl ? `<img src="${displayUrl}" alt="" style="max-width:220px;display:block;margin-bottom:6px" />` : '';
  const publicLabel = r.is_public ? '<div class="text-xs text-green-600">Công khai</div>' : '';
  const popupHtml = `
    ${imgHtml}
    <div><b>${escapeHtml(r.name || '(no name)')}</b></div>
    <div class="text-xs text-gray-600">${escapeHtml(r.notes || '')}</div>
    <div class="text-xs mt-2">${Number(r.lat).toFixed(6)}, ${Number(r.lng).toFixed(6)}</div>
    ${publicLabel}
    <div class="mt-2 flex gap-2">
      <button data-id="${id}" class="btn-open-edit bg-blue-600 text-white px-2 py-1 rounded text-sm">Sửa</button>
      <button data-id="${id}" data-path="${r.image_path||''}" class="btn-delete bg-red-500 text-white px-2 py-1 rounded text-sm">Xóa</button>
    </div>
  `;
  marker.bindPopup(popupHtml);

  // store
  markersOnMap[id] = { marker, record: r, moved: false };

  // bind popup button events when opened (delegate)
  marker.on('popupopen', () => {
    setTimeout(() => { // DOM in popup may not be immediate
      document.querySelectorAll('.btn-open-edit').forEach(b => {
        b.onclick = () => openEditModal(b.dataset.id);
      });
      document.querySelectorAll('.btn-delete').forEach(b => {
        b.onclick = () => deleteMarkerConfirm(b.dataset.id, b.dataset.path || null);
      });
    }, 50);
  });

  // add list entry
  const list = $('markers-list');
  const div = document.createElement('div');
  div.className = 'border p-2 rounded mb-2';
  div.innerHTML = `<div class="font-medium">${escapeHtml(r.name||'(no name)')}</div>
    <div class="text-xs text-gray-600">${escapeHtml(r.notes||'')}</div>
    <div class="mt-2 flex gap-2">
      <button data-id="${id}" class="btn-zoom-list bg-sky-500 text-white px-2 py-1 rounded text-sm">Zoom</button>
      <button data-id="${id}" class="btn-edit-list bg-blue-600 text-white px-2 py-1 rounded text-sm">Sửa</button>
    </div>`;
  list.appendChild(div);

  div.querySelectorAll('.btn-zoom-list').forEach(b => {
    b.onclick = () => {
      map.setView([r.lat, r.lng], 16);
      markersOnMap[id].marker.openPopup();
    };
  });
  div.querySelectorAll('.btn-edit-list').forEach(b => {
    b.onclick = () => openEditModal(b.dataset.id);
  });
}

// Escape html
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Delete with confirm
async function deleteMarkerConfirm(id, imagePath=null) {
  if (!confirm('Xác nhận xóa marker?')) return;
  try {
    if (imagePath) {
      await supabase.storage.from('marker-images').remove([imagePath]);
    }
    const { error } = await supabase.from('markers').delete().eq('id', id);
    if (error) throw error;
    await loadMarkers();
    showToast('Đã xóa');
  } catch (e) {
    console.error(e); showToast('Xóa lỗi: ' + (e.message || e));
  }
}

// ---------- EDIT FLOW (only enable drag while editing) ----------
let editTemp = { id: null, marker: null, origLatLng: null };

async function openEditModal(id) {
  // populate modal with record
  const rec = (markersOnMap[id] && markersOnMap[id].record) ? markersOnMap[id].record
            : (await supabase.from('markers').select('*').eq('id', id).single()).data;

  if (!rec) return showToast('Không tìm thấy marker');

  $('e-name').value = rec.name || '';
  $('e-notes').value = rec.notes || '';
  $('e-is-public').checked = !!rec.is_public;
  $('e-image').value = '';
  $('edit-modal').classList.remove('hidden');

  // enable dragging for this marker
  const obj = markersOnMap[id];
  if (obj && obj.marker) {
    obj.marker.dragging?.enable();
    editTemp = { id, marker: obj.marker, origLatLng: obj.marker.getLatLng() };
    // show confirm move button after user drags
    editTemp.marker.on('dragend', () => {
      $('btn-confirm-move').classList.remove('hidden');
      editTemp.moved = true;
    });
  } else {
    editTemp = { id, marker: null, origLatLng: null };
  }
}

// cancel edit
$('btn-cancel-edit').addEventListener('click', () => {
  // revert dragging if moved
  if (editTemp.marker) {
    try {
      editTemp.marker.setLatLng(editTemp.origLatLng);
      editTemp.marker.dragging?.disable();
    } catch(e){}
  }
  editTemp = { id: null, marker: null, origLatLng: null };
  $('edit-modal').classList.add('hidden');
  $('btn-confirm-move').classList.add('hidden');
});

// confirm move (user accepts marker new position)
$('btn-confirm-move').addEventListener('click', async () => {
  if (!editTemp || !editTemp.id || !editTemp.marker) return;
  const p = editTemp.marker.getLatLng();
  try {
    const { error } = await supabase.from('markers').update({ lat: p.lat, lng: p.lng }).eq('id', editTemp.id);
    if (error) throw error;
    showToast('Vị trí đã cập nhật');
    $('btn-confirm-move').classList.add('hidden');
    // keep dragging enabled until save/cancel
  } catch (e) {
    console.error(e); showToast('Cập nhật vị trí lỗi');
  }
});

// save edit (name/notes/image/is_public)
$('btn-save-edit').addEventListener('click', async () => {
  if (!editTemp || !editTemp.id) return;
  try {
    const name = $('e-name').value || '';
    const notes = $('e-notes').value || '';
    const is_public = $('e-is-public').checked;
    const file = $('e-image').files[0];

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return showToast('Phiên hết hạn');

    // upload new image if any (delete old inside uploadImage)
    let newPath = markersOnMap[editTemp.id].record.image_path;
    let newUrl = markersOnMap[editTemp.id].record.image_url;
    if (file) {
      const res = await uploadImage(uid, file, newPath);
      newPath = res.path;
      newUrl = res.publicUrl;
    }

    // save
    const { error } = await supabase.from('markers').update({
      name, notes, is_public, image_path: newPath, image_url: newUrl
    }).eq('id', editTemp.id);
    if (error) throw error;

    // disable dragging after save
    if (editTemp.marker) {
      editTemp.marker.dragging?.disable();
    }
    editTemp = { id: null, marker: null, origLatLng: null };
    $('edit-modal').classList.add('hidden');
    $('btn-confirm-move').classList.add('hidden');
    await loadMarkers();
    showToast('Cập nhật thành công');
  } catch (e) {
    console.error(e); showToast('Lỗi lưu thay đổi: ' + (e.message||e));
  }
});

// SEARCH (button)
$('btn-search').addEventListener('click', async () => {
  const q = $('search-q').value.trim();
  if (!q) { await loadMarkers(); return; }
  // server side search: name ILIKE or notes ILIKE (for logged user also include their records)
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  let query = supabase.from('markers').select('*').or(`name.ilike.%${q}%,notes.ilike.%${q}%`).order('created_at', { ascending: false });
  if (uid && !(await isCurrentAdmin(uid))) {
    query = query.or(`user_id.eq.${uid},is_public.eq.true`).filter(`name`, 'ilike', `%${q}%`); // fallback: we will fetch then filter client side if API complex
  }
  const { data, error } = await supabase.from('markers').select('*');
  // fallback: simple client side filter from loaded records
  // implement: filter current markersOnMap
  Object.values(markersOnMap).forEach(o => map.removeLayer(o.marker));
  for (const id in markersOnMap) delete markersOnMap[id];

  // naive filter: fetch all user's + public then filter in client
  let fetchQuery = supabase.from('markers').select('*').order('created_at',{ascending:false});
  if (uid && !(await isCurrentAdmin(uid))) {
    fetchQuery = fetchQuery.or(`user_id.eq.${uid},is_public.eq.true`);
  } else if (!uid) {
    fetchQuery = fetchQuery.eq('is_public', true);
  }
  const res = await fetchQuery;
  if (res.error) return showToast('Lỗi tìm kiếm');
  const filtered = res.data.filter(r => (r.name||'').toLowerCase().includes(q.toLowerCase()) || (r.notes||'').toLowerCase().includes(q.toLowerCase()));
  for (const r of filtered) await renderMarkerRecord(r);
});

// clear search
$('btn-clear-search').addEventListener('click', async () => {
  $('search-q').value = '';
  await loadMarkers();
});

// ADMIN check and show
async function isCurrentAdmin(uid) {
  if (!uid) return false;
  const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', uid).maybeSingle();
  if (error) return false;
  return data?.is_admin === true;
}
async function checkAdminAndShow(uid) {
  const admin = await isCurrentAdmin(uid);
  if (admin) $('admin-panel').classList.remove('hidden'); else $('admin-panel').classList.add('hidden');
}

// admin load all
$('btn-refresh-all').addEventListener('click', async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return showToast('Đăng nhập để dùng admin');
  const uid = sessionData.session.user.id;
  const admin = await isCurrentAdmin(uid);
  if (!admin) return showToast('Bạn không có quyền admin');
  const { data, error } = await supabase.from('markers').select('*').order('created_at',{ascending:false});
  if (error) return showToast('Load all lỗi');
  // clear and render
  Object.values(markersOnMap).forEach(o => map.removeLayer(o.marker));
  for (const k in markersOnMap) delete markersOnMap[k];
  for (const r of data) await renderMarkerRecord(r);
});

// helper to initialize
(async function init() {
  initMap();
  // attach signout handler if not present
  $('btn-logout-top').addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });
  // refresh UI on auth changes
  supabase.auth.onAuthStateChange(async () => {
    await refreshAuthUI();
  });
  await refreshAuthUI();
})();

