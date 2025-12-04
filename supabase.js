// Thay SUPABASE_URL và SUPABASE_ANON_KEY bằng thông tin của project Supabase
const SUPABASE_URL = "https://nhzkktsnsaclwwchzdkc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oemtrdHNuc2FjbHd3Y2h6ZGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1ODMyMjUsImV4cCI6MjA4MDE1OTIyNX0.Z9MhK_AaJhapRhn0m8RDDURrcEKmRSFqVF_XMJROBWg";

const { createClient } = supabase;  // supabase-js đã load từ CDN
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
