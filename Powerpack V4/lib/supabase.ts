import { createClient } from '@supabase/supabase-js';

// Environment variables for Cloudflare Pages
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://himoecdeqtxzsbcsexbr.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbW9lY2RlcXR4enNiY3NleGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwOTc1MzYsImV4cCI6MjA4MDY3MzUzNn0.DB8Tva4al-ILk-4rCpTzx1OwCo1DMgmnmqdfhRdR9i0';

export const supabase = createClient(supabaseUrl, supabaseKey);