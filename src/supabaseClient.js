import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Uses cookies instead of localStorage for the auth session. iOS treats a
// home-screen "Add to Home Screen" PWA as a separate storage context from
// Safari and is known to wipe localStorage for standalone PWAs far more
// aggressively than Android ever does -- sometimes on every close. Cookies
// hold up much better there.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)