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
  console.log("Initializing map...");
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
  console.log("Loading markers for user:", currentUser?.id);
  markersLayer.clearLayers();

  const { data, error } = await supabase
    .from("markers")
    .select("*")
    .or(`user_id.eq.${currentUser.id},is_public.eq.true`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load marker lỗi:", error);
    alert("Lỗi load markers: " + error.message);
    return;
  }

  data.forEach((m) => {
    const marker = L.marker([m.lat, m.lng]).addTo(markersLayer);

    let img = m.image_url
      ? `<img src="${m.image_url}" class="w-full mb-2 rounded max-h-48 object-cover" alt="Ảnh marker" />`
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
  console.log("Saving marker...", editingMode ? "Edit mode" : "Add mode");
  const name = document.getElementById("markerName").value.trim();
  const notes = document.getElementById("markerNotes").value.trim();
  const is_public = document.getElementById("markerPublic").checked;
  const file = document.getElementById("markerImage").files[0];

  if (!name) return alert("Nhập tên!");

  let newImage = null;
  let markerId = editingMode ? markerBeingEdited.id : crypto.randomUUID();  // Generate ID trước nếu add new

  // ========================
  // UPLOAD ẢNH NẾU CÓ
  // ========================
  if (file) {
    console.log("Uploading image...");
    newImage = await uploadImage(
      markerId,
      file,
      editingMode ? markerBeingEdited.image_path : null
    );
    if (!newImage) return;  // Nếu upload fail, dừng
  }

  // ========================
  // THÊM MARKER
  // ========================
  if (!editingMode) {
    console.log("Inserting new marker with ID:", markerId);
    const { error } = await supabase.from("markers").insert([
      {
        id: markerId,  // Insert với ID đã generate
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
      console.error("Insert error:", error);
      alert("Lỗi thêm marker: " + error.message);
      // Rollback ảnh nếu fail
      if (newImage?.path) {
        await supabase.storage.from("marker-images").remove([newImage.path]);
      }
      return;
    }
  }

  // ========================
  // SỬA MARKER
  // ========================
  else {
    const updates = {
      name,
      notes,
      is_public,
    };
    if (newImage) {
      updates.image_url = newImage.url;
      updates.image_path = newImage.path;
    }
    if (tempLat && tempLng) {  // Nếu drag, update vị trí
      updates.lat = tempLat;
      updates.lng = tempLng;
    }

    console.log("Updating marker ID:", markerId);
    const { error } = await supabase
      .from("markers")
      .update(updates)
      .eq("id", markerId);

    if (error) {
      console.error("Update error:", error);
      alert("Lỗi sửa marker: " + error.message);
      // Rollback ảnh mới nếu fail
      if (newImage?.path) {
        await supabase.storage.from("marker-images").remove([newImage.path]);
      }
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
  console.log("Editing marker ID:", id);
  editingMode = true;

  const { data, error } = await supabase
    .from("markers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return alert("Không tải được marker: " + error.message);

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
        console.log("New position after drag:", tempLat, tempLng);
      });
    }
  });
}

// =========================================================
//  DELETE MARKER
// =========================================================
window.deleteMarker = async function (id) {
  if (!confirm("Xóa marker này?")) return;

  console.log("Deleting marker ID:", id);

  // Lấy image_path trước
  const { data: marker } = await supabase.from("markers").select("image_path").eq("id", id).single();
  if (marker?.image_path) {
    const { error: deleteImgErr } = await supabase.storage.from("marker-images").remove([marker.image_path]);
    if (deleteImgErr) console.error("Xóa ảnh lỗi:", deleteImgErr);
  }

  const { error } = await supabase.from("markers").delete().eq("id", id);

  if (error) {
    alert("Không xóa được: " + error.message);
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
  if (!currentUser) return alert("Đăng nhập trước!");
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

  console.log("Searching for:", q);

  const { data, error } = await supabase
    .from("markers")
    .select("*")
    .or(`name.ilike.%${q}%,notes.ilike.%${q}%`)
    .or(`user_id.eq.${currentUser.id},is_public.eq.true`);

  if (error) {
    console.error("Search error:", error);
    return;
  }

  markersLayer.clearLayers();

  data.forEach((m) => {
    const marker = L.marker([m.lat, m.lng]).addTo(markersLayer);

    let img = m.image_url ? `<img src="${m.image_url}" class="w-full mb-2 rounded" alt="Ảnh marker" />` : "";

    marker.bindPopup(`
      <b>${m.name || "Không tên"}</b><br>
      ${img}
      ${m.notes || ""}
    `);
  });
};

// =========================================================
//  AUTH HANDLER
// =========================================================
document.getElementById("signInBtn").onclick = async () => {
  const email = document.getElementById("authEmail").value;
  const pass = document.getElementById("authPassword").value;

  console.log("Signing in with email:", email);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (error) return alert("Sai thông tin đăng nhập: " + error.message);

  location.reload();
};

document.getElementById("signUpBtn").onclick = async () => {
  const email = document.getElementById("authEmail").value;
  const pass = document.getElementById("authPassword").value;

  console.log("Signing up with email:", email);

  const { error } = await supabase.auth.signUp({ email, password: pass });

  if (error) return alert("Lỗi đăng ký: " + error.message);

  alert("Đăng ký thành công! Đăng nhập lại.");
};

document.getElementById("logoutBtn").onclick = async () => {
  console.log("Logging out...");
  await supabase.auth.signOut();
  location.reload();
};

// =========================================================
//  CHECK SESSION
// =========================================================
(async () => {
  console.log("Checking session...");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  console.log("Session data:", session);  // Debug: Xem session có null không

  if (!session) {
    console.log("No session, showing auth modal");
    const authModal = document.getElementById("authModal");
    if (authModal) {
      authModal.classList.remove("hidden");
    } else {
      console.error("authModal element not found!");
    }
    return;
  }

  currentUser = session.user;
  console.log("User logged in:", currentUser.email);

  document.getElementById("authModal").classList.add("hidden");
  document.getElementById("userArea").classList.remove("hidden");
  document.getElementById("userEmail").innerText = currentUser.email;

  initMap();
  loadMarkers();
})();
