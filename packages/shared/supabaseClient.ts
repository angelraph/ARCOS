import { createClient } from "@supabase/supabase-js";

// Server-only. Uses the service role key, which bypasses row-level security — never import
// this from client components or expose the key to the browser. Both apps/agents (writer)
// and apps/web's server-side lib/rationales.ts (reader) call this.
export function createSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export interface RationaleRow {
  agent_id: string;
  action_type: string;
  rationale: string;
  rationale_hash: string;
  tx_ref: string;
  ledger_tx_hash: string;
  created_at: string;
}
