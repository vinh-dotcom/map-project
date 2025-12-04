// auth.js

(function(){
  const signedOutPanel = $('signed-out');
  const signedInPanel = $('signed-in');
  const userEmailSpan = $('user-email');
  const markerForm = $('marker-form');

  async function updateUIForUser(user) {
    if (user) {
      signedOutPanel?.classList?.add('hidden');
      signedInPanel?.classList?.remove('hidden');
      markerForm?.classList?.remove('hidden');
      userEmailSpan.textContent = user.email || user.id;
      window.currentUser = user;
      if (window.loadUserMarkers) await window.loadUserMarkers();
    } else {
      signedOutPanel?.classList?.remove('hidden');
      signedInPanel?.classList?.add('hidden');
      markerForm?.classList?.add('hidden');
      userEmailSpan.textContent = '';
      window.currentUser = null;
      if (window.clearMarkers) window.clearMarkers();
    }
  }

  // Signup
  $('btn-signup').addEventListener('click', async () => {
    const email = $('email').value?.trim();
    const password = $('password').value;
    if (!email || !password) return alert('Nhập email và password (ít nhất 6 ký tự).');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert('Signup error: ' + error.message);
    alert('Đăng ký thành công. Kiểm tra email để xác thực (nếu bật).');
  });

  // Login
  $('btn-login').addEventListener('click', async () => {
    const email = $('email').value?.trim();
    const password = $('password').value;
    if (!email || !password) return alert('Nhập email và password.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert('Login error: ' + error.message);
    // session handled by onAuthStateChange
  });

  // Logout
  $('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    // UI will update via state change listener
  });

  // Auth state observer
  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null;
    updateUIForUser(user);
  });

  // On load: get current session
  (async function(){
    try {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user ?? null;
      updateUIForUser(user);
    } catch (err) {
      console.error('Auth init error', err);
    }
  })();
})();
