// =========================
//  GLOBAL
// =========================
let map;
let markersOnMap = {};
let currentUser = null;
let isAdmin = false;

// =========================
//  INIT APP
// =========================
document.addEventListener("DOMContentLoaded", async () => {
  await checkLoginState();
});

// =========================
//  CHECK LOGIN + LOAD MAP
// =========================
async function checkLoginState() {
  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user || null;

  if (!currentUser) {
    document.getElementById("auth-view").classList.remove("hidden");
    document.getElementById("app-view").classList.add("hidden");
    return;
  }

  // Load profile (check admin)
  const prof = await supabase.from("profiles")
    .select("is_admin")
    .eq("id", currentUser.id)
    .maybeSingle();

  isAdmin = prof.data?.is_admin === true;

  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");

  initMap();
  loadMarkers();
}

// =========================
//  SIGNUP / LOGIN / LOGOUT
// =========================
async function signUp() {
  const email = document.getElementById("email_signup").value;
  const password = document.getElementById("password_signup").value;

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return alert(error.message);

  // Create profile
  await supabase.from("profiles").insert({
    id: (await supabase.auth.getUser()).data.user.id,
    full_name: email,
    is_admin: false
  });

  alert("Đăng ký thành công. Hãy kiểm tra email xác minh.");
}

async function signIn() {
  const email = document.getElementById("email_login").value;
  const password = document.getElementById("password_login").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  checkLoginState();
}

async function logout() {
  await supabase.auth.signOut();
  location.reload();
}

// =========================
//  INIT MAP
// =========================
function initMap() {
  map = L.map("map").setView([11.95, 108.45], 10);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

  map.on("click", (e) => openAddForm(e.latlng));
}

// =========================
//  OPEN ADD MARKER FORM
// =========================
function openAddForm(latlng) {
  document.getElementById("lat").value = latlng.lat;
  document.getElementById("lng").value = latlng.lng;
  document.getElementById("add-modal").classList.remove("hidden");
}

function closeAddForm() {
  document.getElementById("add-modal").classList.add("hidden");
}

// =========================
//  UPLOAD IMAGE HANDLER
// =========================
async function uploadMarkerImage(userId, file, oldPath = null) {
  if (!file) return { path: null, url: null };

  // Delete old image if exists
  if (oldPath) {
    await supabase.storage.from("marker-images").remove([oldPath]);
  }

  const filename = `${Date.now()}.jpg`;
  const path = `${userId}/${filename}`;

  const { error } = await supabase.storage
    .from("marker-images")
    .upload(path, file);

  if (error) {
    console.error("Upload failed:", error);
    throw error;
  }

  const url = `${SUPABASE_URL}/storage/v1/object/public/marker-images/${path}`;
  return { path, url };
}

// =========================
//  CREATE MARKER
// =========================
async function saveMarker() {
  try {
    const lat = parseFloat(document.getElementById("lat").value);
    const lng = parseFloat(document.getElementById("lng").value);
    const name = document.getElementById("name").value;
    const notes = document.getElementById("notes").value;
    const is_public = document.getElementById("is_public").checked;

    const file = document.getElementById("image").files[0];

    let uploaded = { path: null, url: null };
    if (file) {
      uploaded = await uploadMarkerImage(currentUser.id, file);
    }

    const { error } = await supabase.from("markers").insert({
      user_id: currentUser.id,
      lat, lng, name, notes,
      is_public,
      image_path: uploaded.path,
      image_url: uploaded.url
    });

    if (error) throw error;

    closeAddForm();
    loadMarkers();
  } catch (err) {
    alert("Lỗi khi lưu marker: " + err.message);
  }
}

// =========================
//  LOAD MARKERS
// =========================
async function loadMarkers() {
  Object.values(markersOnMap).forEach(m => map.removeLayer(m));
  markersOnMap = {};

  let query = supabase.from("markers").select("*");

  if (!isAdmin) {
    query = query.or(`user_id.eq.${currentUser.id},is_public.eq.true`);
  }

  const { data, error } = await query;
  if (error) return console.error(error);

  data.forEach(addMarkerToMap);
}

// =========================
//  RENDER MARKER
// =========================
function addMarkerToMap(m) {
  const marker = L.marker([m.lat, m.lng], { draggable: true }).addTo(map);

  const imgHtml = m.image_url
    ? `<img src="${m.image_url}" width="150" class="rounded mb-2"/>`
    : "";

  const adminLabel = isAdmin ? `<div class="text-xs text-red-500">ADMIN VIEW</div>` : "";

  const popup = `
    ${imgHtml}
    <b>${m.name}</b><br>
    ${m.notes}<br>
    <small>(${m.lat.toFixed(5)}, ${m.lng.toFixed(5)})</small><br>
    <label>
      <input type="checkbox" ${m.is_public ? "checked" : ""} onchange="togglePublic('${m.id}', this.checked)">
      Công khai
    </label>
    <br><br>
    <button onclick="openEdit('${m.id}')" class="bg-blue-500 text-white px-2 py-1 rounded">Sửa</button>
    <button onclick="deleteMarker('${m.id}', '${m.image_path}')" class="bg-red-500 text-white px-2 py-1 rounded">Xóa</button>
    ${adminLabel}
  `;

  marker.bindPopup(popup);

  // Drag update
  marker.on("dragend", async (e) => {
    const p = e.target.getLatLng();
    await supabase.from("markers")
      .update({ lat: p.lat, lng: p.lng })
      .eq("id", m.id);

    loadMarkers();
  });

  markersOnMap[m.id] = marker;
}

// =========================
//  DELETE MARKER
// =========================
async function deleteMarker(id, imagePath) {
  if (!confirm("Xóa marker này?")) return;

  if (imagePath) {
    await supabase.storage.from("marker-images").remove([imagePath]);
  }

  await supabase.from("markers").delete().eq("id", id);
  loadMarkers();
}

// =========================
//  EDIT MARKER
// =========================
let editingMarkerId = null;

function openEdit(id) {
  editingMarkerId = id;
  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEdit() {
  editingMarkerId = null;
  document.getElementById("edit-modal").classList.add("hidden");
}

async function saveEdit() {
  try {
    const name = document.getElementById("edit_name").value;
    const notes = document.getElementById("edit_notes").value;
    const file = document.getElementById("edit_image").files[0];

    const { data: old } = await supabase
      .from("markers")
      .select("*")
      .eq("id", editingMarkerId)
      .single();

    let uploaded = {
      path: old.image_path,
      url: old.image_url
    };

    if (file) {
      uploaded = await uploadMarkerImage(currentUser.id, file, old.image_path);
    }

    await supabase.from("markers")
      .update({
        name,
        notes,
        image_path: uploaded.path,
        image_url: uploaded.url
      })
      .eq("id", editingMarkerId);

    closeEdit();
    loadMarkers();
  } catch (err) {
    alert("Lỗi khi cập nhật: " + err.message);
  }
}

// =========================
//  TOGGLE PUBLIC
// =========================
async function togglePublic(id, value) {
  await supabase.from("markers").update({ is_public: value }).eq("id", id);
}

// =========================
//  SEARCH MARKERS
// =========================
function searchMarkers() {
  const keyword = document.getElementById("search").value.toLowerCase();

  Object.entries(markersOnMap).forEach(([id, m]) => {
    const mk = m._popup?._content?.toLowerCase() || "";
    if (mk.includes(keyword)) map.addLayer(m);
    else map.removeLayer(m);
  });
}
