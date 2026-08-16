/* ------------------------------------------------------------------ *
 *  useLeaf — the one seam between the interface and whatever is
 *  carrying orders between devices.
 *
 *  Picks Supabase when it is configured and falls back to the local
 *  transport otherwise, so the demo always runs. Both surfaces call this
 *  and nothing else; neither knows which one it got.
 * ------------------------------------------------------------------ */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { A, act, reduce, emptyState, replay, uid, DEFAULT_CONFIG } from "./model.js";
import { createLocalTransport } from "./transport/local.js";

export function useLeaf({ branchId = "b1", role = "guest" } = {}) {
  const [state, setState] = useState(emptyState);
  const [status, setStatus] = useState("connecting");
  const [mode, setMode] = useState("local");
  const tx = useRef(null);

  useEffect(() => {
    let live = true;
    setState(emptyState());

    const onAction = (a) => { if (live) setState((s) => reduce(s, a)); };
    const onReady = (log) => { if (live) { setState(replay(log)); setStatus((v) => v === "connecting" ? "connected" : v); } };
    const onStatus = (s) => { if (live) setStatus(s); };

    (async () => {
      /* The env check happens before the import, so a deployment with no
         backend configured never downloads the client chunk at all. */
      const configured =
        import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (configured) {
        try {
          const mod = await import("./transport/supabase.js");
          tx.current = mod.createSupabaseTransport({ branchId, onAction, onReady, onStatus });
          if (live) setMode("supabase");
          return;
        } catch (e) {
          /* misconfigured URL, package missing, network down — the demo
             still has to work, so fall through to the local transport */
          console.warn("[leaf] Supabase unavailable, using this device only:", e?.message);
        }
      }
      if (!live) return;
      tx.current = createLocalTransport({ branchId, onAction, onReady, onStatus });
      setMode("local");
    })();

    return () => { live = false; tx.current?.close(); tx.current = null; };
  }, [branchId]);

  const send = useCallback((action) => {
    if (!tx.current) return;
    tx.current.publish({ ...action, branchId, by: role });
  }, [branchId, role]);

  const api = useMemo(() => ({
    placeOrder: (order) => send(act.placed(order)),
    cancelOrder: (id) => send(act.cancelled(id)),
    confirmOrder: (id) => send(act.confirmed(id)),
    toggleLine: (id, lineId) => send(act.toggled(id, lineId)),
    bump: (id, station) => send(act.bumped(id, station)),
    recall: (id) => send(act.recalled(id)),
    serve: (id) => send(act.served(id)),
    closeTable: (tableNo, method) => send(act.tableClosed(tableNo, method)),
    set86: (itemId, off) => send(act.item86(itemId, off)),
    callWaiter: (tableNo) => send(act.waiter(tableNo)),
    answerCall: (tableNo) => send(act.waiterSeen(tableNo)),
    setConfig: (patch) => send(act.config(patch)),
    requestPay: (tableNo, method) => send(act.payRequest(tableNo, method)),
    saveMenuItem: (item) => send(act.menuSet(item)),
    removeMenuItem: (itemId) => send(act.menuRemove(itemId)),
    reset: () => tx.current?.reset?.(),
  }), [send]);

  return {
    ...api,
    orders: state.orders,
    eightySixed: state.eightySixed,
    calls: state.calls,
    payRequests: state.payRequests,
    config: state.config,
    menu: state.menu,
    status,
    mode,
    ready: status === "connected" || status === "solo",
  };
}

export { A, act, reduce, emptyState, replay, uid, DEFAULT_CONFIG };
