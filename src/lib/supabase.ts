// ==============================================================================
// Supabase Client Initialization
// Supports authentication, user settings, trade journal, and alerts
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://crcbgukhnjnfnhmkdubw.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyY2JndWtobmpuZm5obWtkdWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMTY3MjEsImV4cCI6MjEwODU5MjcyMX0.BjYpcq8I-oGlnf3lJDGN3lvL6Mwv7MNw33JoL13j7N8';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && 
  SUPABASE_ANON_KEY && 
  !SUPABASE_URL.includes('your-supabase-project')
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
