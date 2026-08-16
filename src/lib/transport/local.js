/* ------------------------------------------------------------------ *
 *  Local transport — no account, no network, no cost.
 *
 *  Actions travel between tabs and windows on the same machine over a
 *  BroadcastChannel, and the log is mirrored into localStorage so a tab
 *  opened later can replay it and catch up.
 *
 *  This is a real demo, not a mock: two browser windows side by side
 *  behave exactly like a phone and a kitchen screen. It just can't
 *  cross devices — for that, swap in the Supabase transport.
 * ------------------------------------------------------------------ */

const KEY = (branchId) => `leaf:log:${branchId}`;
/* The log is what the history page reads, so it keeps a month rather than
   a shift. Still capped by the entry limit in write(). */
const RETAIN_MS = 30 * 24 * 60 * 60 * 1000;

const read = (branchId) => {
  try {
    const raw = localStorage.getItem(KEY(branchId));
    if (!raw) return [];
    const log = JSON.parse(raw);
    return log.filter((a) => Date.now() - a.at < RETAIN_MS);
  } catch {
    return [];
  }
};

const write = (branchId, log) => {
  try {
    /* a month of trading rather than 800 actions, so the history page has
       something to look back at; still bounded so quota can't run away */
    localStorage.setItem(KEY(branchId), JSON.stringify(log.slice(-8000)));
  } catch {
    /* private mode or quota — the channel still works, only replay is lost */
  }
};

export function createLocalTransport({ branchId, onAction, onReady, onStatus }) {
  let log = read(branchId);
  const seen = new Set(log.map((a) => a.seq));
  let ch = null;

  try {
    ch = new BroadcastChannel(`leaf:${branchId}`);
  } catch {
    /* Safari private mode and old browsers: this tab still works alone */
  }

  const accept = (a) => {
    if (!a || seen.has(a.seq)) return;
    seen.add(a.seq);
    log.push(a);
    write(branchId, log);
    onAction(a);
  };

  const clear = () => {
    log = [];
    seen.clear();
    write(branchId, []);
  };

  if (ch) {
    ch.onmessage = (e) => {
      if (e.data?.kind === "action") accept(e.data.action);
      /* a reset has to reach every tab: one that kept the old log in memory
         would hand it straight back on the next sync */
      if (e.data?.kind === "reset") { clear(); onReady([]); }
      /* a tab that just opened asks for anything it missed */
      if (e.data?.kind === "sync") {
        const since = e.data.since || 0;
        log.filter((a) => a.at > since).forEach((a) =>
          ch.postMessage({ kind: "action", action: a })
        );
      }
    };
  }

  /* another tab may hold actions this one never saw (it was closed when
     they were written and localStorage was full) — ask for them */
  const lastAt = log.length ? log[log.length - 1].at : 0;
  if (ch) ch.postMessage({ kind: "sync", since: lastAt });

  onStatus?.(ch ? "connected" : "solo");
  onReady(log);

  return {
    publish(action) {
      const a = { ...action, seq: crypto.randomUUID?.() || Math.random().toString(36).slice(2), at: Date.now() };
      accept(a);
      ch?.postMessage({ kind: "action", action: a });
      return a;
    },
    reset() {
      clear();
      ch?.postMessage({ kind: "reset" });
    },
    close() {
      ch?.close();
    },
  };
}
