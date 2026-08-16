/* ------------------------------------------------------------------ *
 *  Leaf — shared order model
 *
 *  Both surfaces (guest phone, back of house) send the same actions and
 *  run the same reducer, so neither one owns the truth. Whatever carries
 *  the actions between devices is swappable: see lib/transport.
 *
 *  Every action carries branchId. Nothing is ever read across branches.
 * ------------------------------------------------------------------ */

/* Defaults only. The live values come off the shared config below, which
   every screen replays from the same log — see DEFAULT_CONFIG. */
export const EDIT_WINDOW_SEC = 90;
export const SERVICE_RATE = 0.10;
export const TAX_RATE = 0.16;

/* Who may do what. Editable from the Team page; shipped values are the
   fallback a branch starts on. */
export const DEFAULT_PERMS = {
  owner:   ["floor", "kds", "menu", "tables", "reports", "history", "team", "settings", "close", "refund", "price", "eightysix"],
  manager: ["floor", "kds", "menu", "tables", "reports", "history", "team", "close", "price", "eightysix"],
  server:  ["floor", "kds", "menu", "tables", "close", "eightysix"],
  kitchen: ["kds", "eightysix"],
};

export const DEFAULT_CONFIG = {
  service: SERVICE_RATE,
  tax: TAX_RATE,
  editWindow: EDIT_WINDOW_SEC,
  perms: DEFAULT_PERMS,
};

export const uid = () => Math.random().toString(36).slice(2, 10);

/* ------------------------------- actions ----------------------------- */

export const A = {
  PLACED: "order/placed",
  TOGGLED: "order/lineToggled",
  BUMPED: "order/bumped",
  RECALLED: "order/recalled",
  SERVED: "order/served",
  CANCELLED: "order/cancelled",
  CONFIRMED: "order/confirmed",
  TABLE_CLOSED: "table/closed",
  ITEM_86: "menu/availability",
  WAITER: "table/waiterCalled",
  WAITER_SEEN: "table/waiterAnswered",
  CONFIG: "config/changed",
  PAY_REQUEST: "table/payRequested",
  MENU_SET: "menu/itemSaved",
  MENU_REMOVE: "menu/itemRemoved",
};

export const act = {
  placed: (order) => ({ type: A.PLACED, order }),
  toggled: (orderId, lineId) => ({ type: A.TOGGLED, orderId, lineId }),
  bumped: (orderId, station = "all") => ({ type: A.BUMPED, orderId, station }),
  recalled: (orderId) => ({ type: A.RECALLED, orderId }),
  served: (orderId) => ({ type: A.SERVED, orderId }),
  cancelled: (orderId) => ({ type: A.CANCELLED, orderId }),
  confirmed: (orderId) => ({ type: A.CONFIRMED, orderId }),
  tableClosed: (tableNo, method) => ({ type: A.TABLE_CLOSED, tableNo, method }),
  item86: (itemId, off) => ({ type: A.ITEM_86, itemId, off }),
  waiter: (tableNo) => ({ type: A.WAITER, tableNo }),
  waiterSeen: (tableNo) => ({ type: A.WAITER_SEEN, tableNo }),
  config: (patch) => ({ type: A.CONFIG, patch }),
  payRequest: (tableNo, method) => ({ type: A.PAY_REQUEST, tableNo, method }),
  menuSet: (item) => ({ type: A.MENU_SET, item }),
  menuRemove: (itemId) => ({ type: A.MENU_REMOVE, itemId }),
};

export const emptyState = () => ({
  orders: [], eightySixed: [], calls: [], payRequests: [], config: DEFAULT_CONFIG,
  /* menu edits only — the shipped menu is merged in by effectiveMenu() */
  menu: { items: {}, removed: [] },
});

/* -------------------------------- reducer ---------------------------- */
/* Pure and total: every peer replaying the same actions in the same order
   lands on the same state, which is what lets late joiners catch up by
   replaying the log instead of asking anyone for a snapshot. */

export function reduce(state, a) {
  const patch = (id, fn) => ({
    ...state,
    orders: state.orders.map((o) => (o.id === id ? fn(o) : o)),
  });

  switch (a.type) {
    case A.PLACED: {
      if (state.orders.some((o) => o.id === a.order.id)) return state; // idempotent
      return { ...state, orders: [...state.orders, a.order] };
    }

    case A.TOGGLED:
      return patch(a.orderId, (o) => {
        const lines = o.lines.map((l) =>
          l.lineId === a.lineId ? { ...l, done: !l.done } : l
        );
        const all = lines.every((l) => l.done);
        return {
          ...o,
          lines,
          status: all ? "ready" : o.status === "ready" ? "firing" : o.status,
          bumpedAt: all ? a.at : null,
        };
      });

    /* A station bump only clears that station's lines. The ticket is ready
       when every section is done with it, not when the first one finishes. */
    case A.BUMPED:
      return patch(a.orderId, (o) => {
        const lines = o.lines.map((l) =>
          a.station === "all" || l.station === a.station ? { ...l, done: true } : l
        );
        const all = lines.every((l) => l.done);
        return { ...o, lines, status: all ? "ready" : "firing", bumpedAt: all ? a.at : null };
      });

    case A.RECALLED:
      return patch(a.orderId, (o) => ({
        ...o,
        lines: o.lines.map((l) => ({ ...l, done: false })),
        status: "firing",
        bumpedAt: null,
      }));

    case A.SERVED:
      return patch(a.orderId, (o) => ({ ...o, status: "served" }));

    /* The guest giving up the rest of their edit window. The kitchen can
       fire immediately — waiting out a clock the table has already let go
       of is dead time on the pass. */
    case A.CONFIRMED:
      return patch(a.orderId, (o) => ({ ...o, confirmedAt: a.at }));

    /* The guest pulling a round back inside the edit window. It leaves the
       board entirely rather than lingering as a cancelled ticket. */
    case A.CANCELLED:
      return { ...state, orders: state.orders.filter((o) => o.id !== a.orderId) };

    case A.TABLE_CLOSED:
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.tableNo === a.tableNo && !o.paid
            /* paidAt is what files a bill under a date in the history */
            ? { ...o, paid: true, paidAt: a.at, payMethod: a.method, status: "served" }
            : o
        ),
        calls: state.calls.filter((c) => c.tableNo !== a.tableNo),
        payRequests: state.payRequests.filter((p) => p.tableNo !== a.tableNo),
      };

    case A.ITEM_86:
      return {
        ...state,
        eightySixed: a.off
          ? [...new Set([...state.eightySixed, a.itemId])]
          : state.eightySixed.filter((x) => x !== a.itemId),
      };

    case A.WAITER:
      return {
        ...state,
        calls: [
          ...state.calls.filter((c) => c.tableNo !== a.tableNo),
          { tableNo: a.tableNo, at: a.at },
        ],
      };

    /* Someone has picked the call up. It clears on every screen at once —
       two waiters walking to the same table is the failure this prevents. */
    case A.WAITER_SEEN:
      return { ...state, calls: state.calls.filter((c) => c.tableNo !== a.tableNo) };

    /* A shallow merge: callers send whole values (the full perms map, one
       rate), never fragments, so nothing has to be deep-merged back. */
    case A.CONFIG:
      return { ...state, config: { ...state.config, ...a.patch } };

    /* Cash is the only method that needs a human: a card or wallet payment
       closes its own table from the phone. This is the table saying
       "someone has to come and take money", and it is what puts the close
       control in front of the cashier at all. */
    /* Whole items, not field patches: the log stays readable and a replay
       can never leave a dish half-edited. Saving un-deletes by design. */
    case A.MENU_SET:
      return {
        ...state,
        menu: {
          items: { ...state.menu.items, [a.item.id]: a.item },
          removed: state.menu.removed.filter((id) => id !== a.item.id),
        },
      };

    case A.MENU_REMOVE:
      return {
        ...state,
        menu: {
          items: state.menu.items,
          removed: [...new Set([...state.menu.removed, a.itemId])],
        },
      };

    case A.PAY_REQUEST:
      return {
        ...state,
        payRequests: [
          ...state.payRequests.filter((p) => p.tableNo !== a.tableNo),
          { tableNo: a.tableNo, method: a.method, at: a.at },
        ],
      };

    default:
      return state;
  }
}

export const replay = (actions) => actions.reduce(reduce, emptyState());

/* ------------------------------- helpers ----------------------------- */

export const orderTotal = (o) => o.lines.reduce((s, l) => s + l.unit * l.qty, 0);

/* Rates are stamped onto a round when it is placed, so changing them
   mid-service reprices nothing that has already been ordered. Rounds sent
   before this existed fall back to the shipped rates. */
export const ratesOf = (o, cfg = DEFAULT_CONFIG) => ({
  service: o?.rates?.service ?? cfg.service ?? SERVICE_RATE,
  tax: o?.rates?.tax ?? cfg.tax ?? TAX_RATE,
});

/* Each round is charged at its own rates and the results are summed — a
   table straddling a rate change still adds up to what was quoted. */
export function tableMoney(orders, cfg = DEFAULT_CONFIG) {
  return orders.reduce(
    (acc, o) => {
      const r = ratesOf(o, cfg);
      const sub = orderTotal(o);
      const service = sub * r.service;
      const tax = (sub + service) * r.tax;
      return {
        sub: acc.sub + sub,
        service: acc.service + service,
        tax: acc.tax + tax,
        grand: acc.grand + sub + service + tax,
      };
    },
    { sub: 0, service: 0, tax: 0, grand: 0 }
  );
}

/* Seconds the guest still has to change a round. Drives the hatched
   "don't fire this yet" ticket on the kitchen screen. Confirming ends the
   window early — the guest has said they're done. */
export const editLeft = (order, now, cfg = DEFAULT_CONFIG) =>
  order.confirmedAt
    ? 0
    : Math.max(
        0,
        (order.editWindow ?? cfg.editWindow ?? EDIT_WINDOW_SEC) -
          (now - order.placedAt) / 1000
      );

export const isEditable = (order, now, cfg) => editLeft(order, now, cfg) > 0;
