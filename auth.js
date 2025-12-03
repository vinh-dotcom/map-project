// auth.js: quản lý đăng nhập/đăng ký/đăng xuất và trạng thái
const $ = id => document.getElementById(id);

const signedOutPanel = $('signed-out');
const signedInPanel = $('signed-in');
const userEmailSpan = $('user-email');
const markerForm = $('marker-form');

$('btn-signup').addEventListener('click', async () => {
  const email = $('email').value;
  const password = $('password').value;
  if (!email || !password) return alert('Nhập email và password');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return alert('Signup error: ' + error.message);
  alert('Đăng ký thành công. Kiểm tra email để verify nếu cần.');
});

$('btn-login').addEventListener('click', async () => {
  const email = $('email').value;
  const password = $('password').value;
  if (!email || !password) return alert('Nhập email và password');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert('Login error: ' + error.message);
  // state update handled in onAuthStateChange
});

$('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
});

// Observe auth state
supabase.auth.onAuthStateChange((event, session) => {
  const user = session?.user ?? null;
  if (user) {
    signedOutPanel?.classList?.add('hidden');
    signedInPanel?.classList?.remove('hidden');
    userEmailSpan.textContent = user.email;
    markerForm.classList.remove('hidden');
    // load markers for user
    window.currentUser = user;
    if (window.loadUserMarkers) window.loadUserMarkers();
  } else {
    signedOutPanel?.classList?.remove('hidden');
    signedInPanel?.classList?.add('hidden');
    userEmailSpan.textContent = '';
    markerForm.classList.add('hidden');
    window.currentUser = null;
    if (window.clearMarkers) window.clearMarkers();
  }
});

// On page load, check session
(async function() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    // trigger load
    signedOutPanel?.classList?.add('hidden');
    signedInPanel?.classList?.remove('hidden');
    userEmailSpan.textContent = session.user.email;
    markerForm.classList.remove('hidden');
    window.currentUser = session.user;
  }
})();
