/* ------------------------------------------------------------------ *
 *  Supabase transport — same interface as the local one, real devices.
 *
 *  Actions are rows in an append-only table. Postgres pushes new rows to
 *  every subscriber over a websocket, so a phone in the dining room and a
 *  screen in the kitchen see the same order within a second of each other.
 *
 *  Free tier covers a demo and a first restaurant comfortably.
 *  Setup: supabase/schema.sql, then two variables in .env.local.
 * ------------------------------------------------------------------ */

import { createClient } from "@supabase/supabase-js";

const RETAIN_MS = 30 * 24 * 60 * 60 * 1000;   // what the history page can reach

let client = null;
export function supabase() {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } });
  return client;
}

export const supabaseConfigured = () =>
  Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export function createSupabaseTransport({ branchId, onAction, onReady, onStatus }) {
  const sb = supabase();
  if (!sb) throw new Error("Supabase is not configured");

  const seen = new Set();
  let channel = null;
  let closed = false;

  const accept = (row) => {
    if (closed) return;
    const a = { ...row.payload, seq: String(row.id), at: new Date(row.created_at).getTime() };
    if (seen.has(a.seq)) return;
    seen.add(a.seq);
    onAction(a);
  };

  (async () => {
    onStatus?.("connecting");

    /* replay the retained window so a screen opened at 8pm still knows what
       happened at 7, and the history page can look back over the month */
    const since = new Date(Date.now() - RETAIN_MS).toISOString();
    const { data, error } = await sb
      .from("order_events")
      .select("id, payload, created_at")
      .eq("branch_id", branchId)
      .gte("created_at", since)
      .order("id", { ascending: true });

    if (error) {
      onStatus?.("error");
      onReady([]);
      return;
    }

    const log = (data || []).map((r) => {
      const a = { ...r.payload, seq: String(r.id), at: new Date(r.created_at).getTime() };
      seen.add(a.seq);
      return a;
    });
    onReady(log);

    channel = sb
      .channel(`orders:${branchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_events", filter: `branch_id=eq.${branchId}` },
        (p) => accept(p.new)
      )
      .subscribe((s) => {
        onStatus?.(s === "SUBSCRIBED" ? "connected" : s === "CHANNEL_ERROR" ? "error" : "connecting");
      });
  })();

  return {
    async publish(action) {
      const a = { ...action, at: Date.now() };
      /* applied locally first so the sender's own screen never waits on
         a round trip; the echo back from Postgres is dropped by `seen` */
      const local = { ...a, seq: "local-" + (crypto.randomUUID?.() || Math.random()) };
      seen.add(local.seq);
      onAction(local);

      const { error } = await sb.from("order_events").insert({
        branch_id: branchId,
        type: action.type,
        payload: a,
      });
      if (error) onStatus?.("error");
      return local;
    },
    async reset() {
      await sb.from("order_events").delete().eq("branch_id", branchId);
    },
    close() {
      closed = true;
      if (channel) sb.removeChannel(channel);
    },
  };
}
