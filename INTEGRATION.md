# Connecting the two surfaces

The guest phone and the back of house now share one order log. Neither owns
the truth: both send actions, both replay the same reducer, both land on the
same state. What carries those actions between them is swappable.

## Files

```
src/lib/model.js              actions + reducer + money helpers   (shared)
src/lib/store.js              useLeaf() — the only hook either app calls
src/lib/transport/local.js    BroadcastChannel + localStorage      (default)
src/lib/transport/supabase.js Postgres + realtime websocket
supabase/schema.sql           tables, indexes, RLS, housekeeping
```

`useLeaf()` picks Supabase when it is configured and the local transport
otherwise, so the demo always runs. Nothing else in either app knows which
one it got.

## Running the demo right now — no account needed

```bash
npm install
npm run dev
```

Open two windows side by side:

| Window | URL | Is |
|---|---|---|
| Guest | `http://localhost:5173/?t=6` | the phone at table 6 |
| Back of house | `http://localhost:5173/?bo=1` | the floor and the pass |

Change `?t=` to sit at a different table. `?b=b2` switches branch.

The back office opens on an **empty room** — the floor, the pass and the
reports only ever show what someone actually ordered. Two switches change
that:

| URL | Does |
|---|---|
| `?bo=1&demo` | fills an empty branch with a service in progress, for screenshots and walkthroughs |
| `?bo=1&reset` | clears the day's log on this device — every tab goes back to an empty room |

Then try, in order:

1. **Add two dishes and send.** The ticket appears on the pass within a
   second, hatched, with its bump button disabled and counting down.
2. **Wait out the 90 seconds** — or press *Confirm order* on the phone. The
   hatching clears and the ticket becomes fireable.
3. **Tick off every line** on the kitchen screen. The phone flips from
   *Received* to *Ready* on its own.
4. **86 a dish** from the Menu tab. It greys out on the guest menu
   immediately.
5. **Press *Edit order*** on the phone inside the window. The ticket
   disappears from the pass — the line should never be looking at a round
   the guest has withdrawn.
6. **Call the waiter.** The table's tile on the floor rings.

This uses `BroadcastChannel`, so it is genuinely two independent app
instances talking — not one component passing props to another. Its only
limit is that it cannot cross devices.

## Going real — Supabase free tier

1. Create a project at supabase.com.
2. SQL editor → paste all of `supabase/schema.sql` → run.
3. `npm i @supabase/supabase-js`
4. Create `.env.local`:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
```

5. Restart the dev server. The topbar tag changes from **This device** to
   **Supabase**, and a real phone on the same wifi now reaches the kitchen
   screen.

The free tier covers a demo and a first restaurant comfortably. The order
log is pruned to three days by `prune_order_events()`.

## What the log looks like

Nine action types, all carrying `branchId`:

`order/placed` · `order/lineToggled` · `order/bumped` · `order/recalled` ·
`order/served` · `order/cancelled` · `table/closed` · `menu/availability` ·
`table/waiterCalled`

A screen that reconnects replays the day and catches up. It never has to ask
another client for a snapshot, because the reducer is deterministic.

---

# Before this takes real money

The demo posture is deliberately permissive: a diner has no account, so the
anonymous role can write to the order log. Four things to close first.

**1. The table number is a claim, not a credential.** Anyone can post an
order for table 7 by editing the URL. The QR should carry a signed table
token that the server verifies.

**2. Prices come from the client.** A line carries its own `unit`, so a
crafted request can order a mixed grill for 0.01 JD. Move inserts behind an
edge function that looks prices up server-side from the menu.

**3. Bump, recall, close and 86 are anonymous.** These are staff actions
sitting in the same anon-writable table as guest orders. Split them out and
require an authenticated `staff` row.

**4. The AI chef still calls Anthropic from the browser.** `src/App.jsx`
fetches `api.anthropic.com` directly. That works in the artifact sandbox and
fails in a real deployment — and putting the key in `.env` is worse, because
Vite inlines it into the bundle where every diner can read it. It needs the
same server treatment: a Supabase edge function holding the key.

**5. Tax invoices are not ours to issue.** Leaf marks a check closed and
hands the POS an external tender. Confirm JoFotara enrolment on the POS side
before anything here is treated as a receipt.
