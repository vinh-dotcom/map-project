// =========================================================
//  INIT SUPABASE + GLOBAL STATE
// =========================================================
let map;
let currentUser = null;
let markersLayer = L.layerGroup();
let markerBeingEdited = null;
let editingMode = false;

const modal = document.getElementById("markerModal");
const addBtn = document.getElementById("addMarkerBtn");
const saveBtn = document.getElementById("saveMarker");
const cancelBtn = document.getElementById("cancelMarker");

let tempLat = null;
let tempLng = null;

// =========================================================
//  SHOW / HIDE MODAL
// =========================================================
function openModal(title = "Thêm marker") {
  document.getElementById("modalTitle").innerText = title;
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  document.getElementById("markerName").value = "";
  document.getElementById("markerNotes").value = "";
  document.getElementById("markerImage").value = "";
  document.getElementById("markerPublic").checked = false;
  editingMode = false;
  markerBeingEdited = null;
}

// =========================================================
//  INIT MAP
// =========================================================
function initMap() {
  map = L.map("map").setView([11.94, 108.44], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
  }).addTo(map);

  markersLayer.addTo(map);

  // CLICK MAP → THÊM MARKER
  map.on("click", (e) => {
    if (editingMode) return; // không cho thêm khi đang sửa
    tempLat = e.latlng.lat;
    tempLng = e.latlng.lng;
    openModal("Thêm marker");
  });
}

// =========================================================
//  LOAD MARKERS
// =========================================================
async function loadMarkers() {
  markersLayer.clearLayers();

  const { data, error } = await supabase
    .from("markers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load marker lỗi", error);
    return;
  }

  data.forEach((m) => {
    const marker = L.marker([m.lat, m.lng]).addTo(markersLayer);

    let img = m.image_url
      ? `<img src="${m.image_url}" class="w-full mb-2 rounded" />`
      : "";

    let editBtn = "";
    let deleteBtn = "";

    if (m.user_id === currentUser.id) {
      editBtn = `<button onclick="editMarker('${m.id}')" class="px-2 py-1 bg-yellow-500 text-white rounded mr-2">Sửa</button>`;
      deleteBtn = `<button onclick="deleteMarker('${m.id}')" class="px-2 py-1 bg-red-600 text-white rounded">Xóa</button>`;
    }

    marker.bindPopup(`
      <b>${m.name || "Không tên"}</b><br>
      ${img}
      ${m.notes || ""}
      <br><br>
      ${editBtn}
      ${deleteBtn}
    `);

    marker._markerId = m.id;
  });
}

// =========================================================
//  SAVE MARKER (CREATE OR UPDATE)
// =========================================================
saveBtn.onclick = async () => {
  const name = document.getElementById("markerName").value.trim();
  const notes = document.getElementById("markerNotes").value.trim();
  const is_public = document.getElementById("markerPublic").checked;
  const file = document.getElementById("markerImage").files[0];

  if (!name) return alert("Nhập tên!");

  let newImage = null;

  // ========================
  // UPLOAD ẢNH NẾU CÓ
  // ========================
  if (file) {
    newImage = await uploadImage(
      markerBeingEdited?.id || crypto.randomUUID(),
      file,
      markerBeingEdited?.image_path || null
    );
  }

  // ========================
  // THÊM MARKER
  // ========================
  if (!editingMode) {
    const { error } = await supabase.from("markers").insert([
      {
        user_id: currentUser.id,
        name,
        notes,
        lat: tempLat,
        lng: tempLng,
        is_public,
        image_url: newImage?.url || null,
        image_path: newImage?.path || null,
      },
    ]);

    if (error) {
      console.error(error);
      alert("Lỗi thêm marker: " + error.message);
      return;
    }
  }

  // ========================
  // SỬA MARKER
  // ========================
  else {
    const { error } = await supabase
      .from("markers")
      .update({
        name,
        notes,
        is_public,
        image_url: newImage?.url || markerBeingEdited.image_url,
        image_path: newImage?.path || markerBeingEdited.image_path,
      })
      .eq("id", markerBeingEdited.id);

    if (error) {
      console.error(error);
      alert("Lỗi sửa marker: " + error.message);
      return;
    }
  }

  closeModal();
  loadMarkers();
};

// =========================================================
//  EDIT MARKER
// =========================================================
window.editMarker = async function (id) {
  editingMode = true;

  const { data, error } = await supabase
    .from("markers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return alert("Không tải được marker!");

  markerBeingEdited = data;

  document.getElementById("markerName").value = data.name;
  document.getElementById("markerNotes").value = data.notes;
  document.getElementById("markerPublic").checked = data.is_public;

  tempLat = data.lat;
  tempLng = data.lng;

  openModal("Sửa marker");

  // Cho kéo marker để chỉnh tọa độ
  enableMarkerDrag(id);
};

// =========================================================
//  ENABLE DRAG WHEN EDIT MODE
// =========================================================
function enableMarkerDrag(markerId) {
  markersLayer.eachLayer((m) => {
    if (m._markerId === markerId) {
      m.dragging.enable();
      m.on("dragend", (e) => {
        tempLat = e.target.getLatLng().lat;
        tempLng = e.target.getLatLng().lng;
      });
    }
  });
}

// =========================================================
//  DELETE MARKER
// =========================================================
window.deleteMarker = async function (id) {
  if (!confirm("Xóa marker này?")) return;

  const { error } = await supabase.from("markers").delete().eq("id", id);

  if (error) {
    alert("Không xóa được!");
    return;
  }

  loadMarkers();
};

// =========================================================
//  CANCEL BUTTON
// =========================================================
cancelBtn.onclick = () => closeModal();

// =========================================================
//  BUTTON ADD MARKER
// =========================================================
addBtn.onclick = () => {
  editingMode = false;
  tempLat = null;
  tempLng = null;
  openModal("Thêm marker");
};

// =========================================================
//  SEARCH
// =========================================================
document.getElementById("searchBtn").onclick = async () => {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return loadMarkers();

  const { data } = await supabase
    .from("markers")
    .select("*")
    .or(`name.ilike.%${q}%,notes.ilike.%${q}%`);

  markersLayer.clearLayers();

  data.forEach((m) => {
    L.marker([m.lat, m.lng]).addTo(markersLayer)
      .bindPopup(`<b>${m.name}</b><br>${m.notes}`);
  });
};

// =========================================================
//  AUTH HANDLER
// =========================================================
document.getElementById("signInBtn").onclick = async () => {
  const email = document.getElementById("authEmail").value;
  const pass = document.getElementById("authPassword").value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (error) return alert("Sai thông tin đăng nhập!");

  location.reload();
};

document.getElementById("signUpBtn").onclick = async () => {
  const email = document.getElementById("authEmail").value;
  const pass = document.getElementById("authPassword").value;

  const { error } = await supabase.auth.signUp({ email, password: pass });

  if (error) return alert("Lỗi đăng ký!");

  alert("Đăng ký thành công! Đăng nhập lại.");
};

document.getElementById("logoutBtn").onclick = async () => {
  await supabase.auth.signOut();
  location.reload();
};

// =========================================================
//  CHECK SESSION
// =========================================================
(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    document.getElementById("authModal").classList.remove("hidden");
    return;
  }

  currentUser = session.user;

  document.getElementById("authModal").classList.add("hidden");
  document.getElementById("userArea").classList.remove("hidden");
  document.getElementById("userEmail").innerText = currentUser.email;

  initMap();
  loadMarkers();
})();
