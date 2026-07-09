// ------------------------------------------------------------
//  Paste your two values here (Supabase → Settings → API).
//
//  The anon key is SAFE to have in public code — it can only do
//  what your Row Level Security policies allow. NEVER paste the
//  "service_role" key here; that one bypasses all security.
// ------------------------------------------------------------

const SUPABASE_URL = "https://lqeetnlfqmarlqmbxusn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_HLTiqXAPVp94_ot9i3yIFQ_nRlegnZ7";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
