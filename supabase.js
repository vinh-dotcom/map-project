// Thay SUPABASE_URL và SUPABASE_ANON_KEY bằng thông tin của project Supabase
const SUPABASE_URL = "https://nhzkktsnsaclwwchzdkc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oemtrdHNuc2FjbHd3Y2h6ZGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1ODMyMjUsImV4cCI6MjA4MDE1OTIyNX0.Z9MhK_AaJhapRhn0m8RDDURrcEKmRSFqVF_XMJROBWg";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Supabase keys missing");
}

window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: window.localStorage,   // 🚀 QUAN TRỌNG NHẤT
    autoRefreshToken: true
  }
});
