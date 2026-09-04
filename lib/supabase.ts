import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service-role key.
 * This bypasses RLS — only use in server-side code (API routes, scripts).
 */
export const supabase = createClient(
  (process.env.SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
);
