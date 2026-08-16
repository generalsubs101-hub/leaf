import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLeaf } from "./lib/store.js";
import { DEFAULT_CONFIG, tableMoney, pinHash, DEFAULT_PINS } from "./lib/model.js";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import {
  MENU as SHIPPED_MENU, CATEGORIES, STATIONS, CAT_STATION, TAG_IDS, ALLERGEN_IDS,
  effectiveMenu, indexBy, stationOfIn,
} from "./lib/menu.js";

/* ------------------------------------------------------------------ *
 *  LEAF — back of house
 *  One app, four roles. The kitchen display is a full-screen route
 *  inside it rather than a separate product, so a manager can drop
 *  into the pass without signing into anything else.
 *
 *  Every record carries branchId from day one. Swapping the seed data
 *  for an API means replacing useStore() and nothing else.
 * ------------------------------------------------------------------ */

const LATE_GRACE_SEC = 120;   // how long past promised time before a ticket is "late"

/* ------------------------------- roles ------------------------------- */
/* Permissions are checked by key, never by role name, so adding a role
   later is a data change rather than a hunt through conditionals. They
   are editable from the Team page and travel on the shared log, so every
   screen in the building agrees on who can do what. */

const ROLES = [
  { id: "owner",   name: "Owner",         nameAr: "المالك",        who: "Rana Haddad",   whoAr: "رنا حداد" },
  { id: "manager", name: "Manager",       nameAr: "المدير",        who: "Samer Odeh",    whoAr: "سامر عودة" },
  { id: "server",  name: "Cashier / Waiter", nameAr: "كاشير / نادل", who: "Lina Mansour",  whoAr: "لينا منصور" },
  { id: "kitchen", name: "Kitchen",       nameAr: "المطبخ",        who: "Abu Nidal",     whoAr: "أبو نضال" },
];

const BRANCHES = [
  { id: "b1", name: "Rainbow Street", nameAr: "شارع الرينبو", city: "Amman", tables: 14 },
  { id: "b2", name: "Abdoun",         nameAr: "عبدون",        city: "Amman", tables: 10 },
];

/* The live menu, same as the phones see: what ships, plus whatever has
   been edited here. Republished by App below before anything renders, so
   the KDS and the floor read dishes at their current name and price. */
let MENU = SHIPPED_MENU;
let byId = indexBy(MENU);
const stationOf = (itemId) => stationOfIn(MENU, itemId);

/* a few realistic modifier labels so tickets read like real tickets */
const MODS = {
  hummus:   [["Large", "كبير"], ["Whole wheat", "خبز أسمر"], ["Minced lamb", "لحمة مفرومة"]],
  mutabbal: [["Small", "صغير"], ["No bread", "بدون خبز"]],
  fattoush: [["Large", "كبير"]],
  kibbeh:   [["Small", "صغير"]],
  warak:    [["Small", "صغير"]],
  zaatar:   [["Extra zaatar", "زعتر إضافي"]],
  jibneh:   [["Akkawi", "عكاوي"]],
  arayes:   [["Hot", "حار"]],
  mishwi:   [["Medium well", "وسط مائل للنضج"], ["Fries", "بطاطا مقلية"], ["Garlic paste", "ثومية"]],
  tawook:   [["Not spicy", "غير حار"], ["Vermicelli rice", "أرز بالشعيرية"]],
  kofta:    [["Hot", "حار"], ["Grilled vegetables", "خضار مشوية"]],
  riyash:   [["Medium", "وسط"], ["Green salad", "سلطة خضراء"]],
  mansaf:   [["Two people", "لشخصين"], ["Extra jameed sauce", "مرقة جميد إضافية"]],
  maqluba:  [["One person", "لشخص واحد"]],
  sayadieh: [["One person", "لشخص واحد"]],
  knafeh:   [["With ice cream", "مع بوظة"]],
  baklava:  [],
  limonana: [], qahwa: [["No sugar", "بدون سكر"]], orange: [], ayran: [],
};

const NOTES = [
  ["No coriander please — allergy", "بدون كزبرة من فضلك — حساسية"],
  ["Birthday, bring the knafeh last", "عيد ميلاد، الكنافة بالآخر"],
  ["Very hot, we like it spicy", "كتير حار، منحب الحرّ"],
  ["Child portion if possible", "حصة أطفال إذا ممكن"],
];

/* --------------------------- seeded floor ---------------------------- */
/* Tickets are seeded relative to load time so the board is already alive
   when someone opens it: one still inside the guest edit window, a couple
   mid-cook, one running late, one plated and waiting on a runner. */

const uid = () => Math.random().toString(36).slice(2, 9);
const jd = (n) => n.toFixed(2);

function mkLine(itemId, qty, modIdx = 0, note) {
  const mods = (MODS[itemId] || []).slice(0, modIdx);
  return {
    lineId: uid(),
    itemId,
    qty,
    mods,
    note,
    station: stationOf(itemId),
    done: false,
    unit: byId[itemId].price,
  };
}

/* secondsAgo → when the round was sent; negative status flows from that */
const SEED = [
  { table: 12, round: 1, secondsAgo: 34,  lines: [["hummus", 2, 3], ["fattoush", 1, 1], ["mishwi", 1, 3], ["limonana", 3, 0]], note: 0 , pace: 0.9},
  { table: 5,  round: 1, secondsAgo: 210, lines: [["tawook", 2, 2], ["kofta", 1, 2], ["hummus", 1, 1], ["ayran", 2, 0]] , pace: 0.8},
  /* approaching its promised time — the amber state */
  { table: 9,  round: 2, secondsAgo: 580, lines: [["knafeh", 2, 1], ["qahwa", 4, 1]] , pace: 1.05},
  { table: 3,  round: 1, secondsAgo: 1580, lines: [["mansaf", 1, 2], ["warak", 1, 1], ["orange", 2, 0]], note: 1 , pace: 0.72},
  { table: 7,  round: 1, secondsAgo: 640,  lines: [["riyash", 2, 2], ["mutabbal", 1, 1], ["arayes", 2, 1]], note: 2 , pace: 0.95},
  /* deliberately overdue on load: saj promises 8 minutes and this is past it,
     so the board opens showing what a late ticket looks like */
  { table: 14, round: 1, secondsAgo: 760,  lines: [["zaatar", 4, 1], ["jibneh", 2, 1], ["ayran", 4, 0]] , pace: 1.4},
  { table: 2,  round: 3, secondsAgo: 96,   lines: [["baklava", 1, 0], ["qahwa", 2, 1]] , pace: 1.0},
  { table: 11, round: 1, secondsAgo: 900,  lines: [["maqluba", 2, 1], ["kibbeh", 1, 1], ["limonana", 2, 0]], note: 3 , pace: 1.25},
];

function seedOrders(branchId) {
  const t0 = Date.now();
  return SEED.map((s) => {
    const placedAt = t0 - s.secondsAgo * 1000;
    const lines = s.lines.map(([id, q, m]) => mkLine(id, q, m));
    const age = s.secondsAgo;
    /* anything old enough gets progressively marked off, so the board
       doesn't open with every ticket pristine */
    let status = "new";
    if (age > DEFAULT_CONFIG.editWindow) status = "firing";
    if (age > 800) { status = "ready"; lines.forEach((l) => (l.done = true)); }
    if (age > 1400) status = "served";
    if (status === "firing" && age > 300) {
      lines.slice(0, Math.max(1, lines.length - 2)).forEach((l) => (l.done = true));
    }
    return {
      id: "T" + s.table + "-R" + s.round + "-" + uid(),
      branchId,
      tableNo: s.table,
      round: s.round,
      placedAt,
      status,                       // new | firing | ready | served
      note: s.note != null ? NOTES[s.note] : null,
      lines,
      paid: age > 1400,
      /* the demo's closed tables need a tender, or the payments report
         opens with everything filed under "unknown" */
      payMethod: age > 1400 ? TENDERS[s.table % TENDERS.length] : null,
      /* clamped so a slow seeded round can't claim it was bumped in the future */
      bumpedAt:
        status === "ready" || status === "served"
          ? Math.min(
              placedAt + Math.max(...lines.map((l) => byId[l.itemId].min)) * 60 * 1000 * (s.pace || 1),
              t0 - 40000
            )
          : null,
    };
  });
}

/* ------------------------------ store -------------------------------- */
/* Real orders now. Everything comes off the shared log that the guest
   phones write to, so this board is not a simulation of a service — it
   is the service. A fresh branch opens empty: the floor and the pass show
   only what someone actually ordered. The demo tickets are still here,
   one query param away, for screenshots and walkthroughs. */

/* ?demo — fill an empty branch with the seeded service
   ?reset — wipe this device's log first, so the room starts empty again */
const DEMO = new URLSearchParams(location.search).has("demo");
const RESET = new URLSearchParams(location.search).has("reset");

function useStore() {
  const [branchId, setBranchId] = useState("b1");
  const net = useLeaf({ branchId, role: "staff" });
  const [log, setLog] = useState([]);
  const seeded = React.useRef({});
  const wiped = React.useRef({});

  const note = (msg) =>
    setLog((l) => [{ id: uid(), at: Date.now(), msg }, ...l].slice(0, 40));

  /* ?reset clears the day's log on this device — the way back to an empty
     room once tickets (seeded or real) are already sitting in storage */
  useEffect(() => {
    if (!RESET || !net.ready || wiped.current[branchId]) return;
    wiped.current[branchId] = true;
    /* Supabase deletes rows over the wire, the local transport is sync —
       either way, only reload once the log is actually gone */
    Promise.resolve(net.reset()).then(() =>
      location.replace(location.pathname + "?bo" + (DEMO ? "&demo" : ""))
    );
  }, [net.ready, branchId]); // eslint-disable-line

  /* one-time seed per branch, opt-in, and only if nobody has ordered anything */
  useEffect(() => {
    if (!DEMO || RESET || !net.ready || seeded.current[branchId]) return;
    seeded.current[branchId] = true;
    const t = setTimeout(() => {
      if (net.orders.length === 0) seedOrders(branchId).forEach(net.placeOrder);
    }, 400);
    return () => clearTimeout(t);
  }, [net.ready, branchId, net.orders.length]); // eslint-disable-line

  const toggle86 = (itemId) => {
    const on = net.eightySixed.includes(itemId);
    net.set86(itemId, !on);
    note((on ? "Back on the menu" : "Sold out") + " — " + byId[itemId].name);
  };

  const answerCall = (tableNo) => {
    net.answerCall(tableNo);
    note(`Table ${tableNo} — waiter on the way`);
  };

  const closeTable = (tableNo, method) => {
    net.closeTable(tableNo, method);
    note(`Table ${tableNo} closed — ${method}`);
  };

  return {
    branchId,
    switchBranch: setBranchId,
    orders: net.orders,
    eightySixed: net.eightySixed,
    calls: net.calls,
    payRequests: net.payRequests || [],
    config: net.config || DEFAULT_CONFIG,
    setConfig: net.setConfig,
    menu: net.menu,
    saveMenuItem: net.saveMenuItem,
    removeMenuItem: net.removeMenuItem,
    status: net.status,
    mode: net.mode,
    log,
    note,
    toggleLine: net.toggleLine,
    bump: net.bump,
    recall: net.recall,
    serve: net.serve,
    closeTable,
    answerCall,
    toggle86,
    /* Wipes the day's log everywhere it is stored — this device's tabs, or
       the branch's rows in Postgres. The reload is what clears the state
       already replayed into memory. */
    clearDay: () =>
      Promise.resolve(net.reset()).then(() =>
        location.replace(location.pathname + "?bo")
      ),
    /* a table sending another round is a real event now, not a timer */
    injectOrder: () => {},
  };
}

/* ------------------------------ strings ------------------------------ */

const T = {
  en: {
    dir: "ltr",
    nav: { floor: "Floor", kds: "Kitchen", menu: "Menu", tables: "Tables & QR", reports: "Reports", history: "History", team: "Team", settings: "Settings" },
    historyTitle: "History", historySub: "Every bill and every round, day by day.",
    bills: "Bills", ordersTab: "Rounds", noneThatDay: "Nothing on this day.",
    historyRetain: "Kept for 30 days.",
    /* dish editor */
    edit: "Edit", remove: "Remove", removed: "removed", newDish: "New dish", editDish: "Edit dish",
    deleteDish: "Delete dish", dishName: "Name", dishNameAr: "Name (Arabic)",
    dishDesc: "Description", dishDescAr: "Description (Arabic)",
    category: "Section", emoji: "Emoji", tags: "Tags", allergens: "Allergens",
    uploadPhoto: "Upload photo", removePhoto: "Remove photo", photoUrl: "…or paste an image link",
    photoFailed: "That file could not be read as an image.",
    needName: "A dish needs a name.", idTaken: "A dish with that name already exists.",
    stationFollows: "Goes to the station of its section",
    optionGroups: "Options the guest picks", addGroup: "Add group", addOption: "Add option",
    groupName: "Group", groupNameAr: "Group (Arabic)", optName: "Option", optNameAr: "Option (Arabic)",
    pickOne: "Pick one", pickMany: "Pick any", requiredOpt: "Required",
    popular: "Most ordered", chef: "Chef's pick", vegan: "Vegan", vegetarian: "Vegetarian",
    spicy: "Spicy", national: "National dish", sharing: "For sharing", breakfast: "Breakfast",
    alg_gluten: "Gluten", alg_dairy: "Dairy", alg_nuts: "Nuts", alg_sesame: "Sesame",
    alg_egg: "Egg", alg_fish: "Fish",
    signedInAs: "Signed in as", switchRole: "Switch role", demoRole: "Demo — switch role",
    viewAs: "View as", signOut: "Sign out",
    signInSub: "Enter your staff PIN", wrongPin: "That PIN wasn't recognised", clear: "Clear",
    pinsTitle: "Staff PINs", pinsSub: "The PIN each role signs in with. Four digits or more.",
    pinDefault: "still the shipped default",
    pinsWarn: "Stored hashed, so a PIN can be set but never read back. This keeps the back office out of a guest's hands; it is not a substitute for real accounts.",
    branch: "Branch", open: "Open", live: "Live", today: "Today",
    connecting: "Connecting", thisDevice: "This device", waiterCalled: "Asked for a waiter",
    answerCall: "On my way", markServed: "Delivered",
    wantsToPay: "Wants to pay", takePayment: "Take payment",
    closeHint: "Card and wallet payments close their own table. This one asked to pay cash.",
    /* kds */
    allDay: "All day", allDayHint: "Everything still to cook, across every ticket",
    station: "Station", allStations: "All stations", bump: "Ready", recall: "Recall",
    editable: "Guest can still change this", locks: "locks in",
    late: "Late", left: "left", overBy: "over by", newTicket: "New",
    noTickets: "The pass is clear", noTicketsSub: "New rounds land here the moment a table sends them.",
    round: "Round", rounds: "rounds", table: "Table", items: "items", covers: "Covers",
    markReady: "Mark ready", undo: "Undo",
    /* floor */
    floorTitle: "Floor", floorSub: "Every table in the room, and what it owes.",
    free: "Free", ordering: "Ordering", inKitchen: "In kitchen", ready: "Ready to run", eating: "Eating", billed: "Bill requested", closed: "Closed",
    openTotal: "Open total", noOrders: "Nothing ordered yet", viewOrder: "Open table", close: "Close",
    closeTable: "Close table", closeAs: "Close this table as",
    payCliq: "CliQ", paidCash: "Cash", payVisa: "Visa machine",
    payCardOnline: "Card online", payApple: "Apple Pay", payGoogle: "Google Pay",
    collected: "Payments collected", method: "Method", amount: "Amount", tablesN: "Tables",
    totalCollected: "Total collected", noPayments: "Nothing collected yet.",
    externalNote: "Leaf marks the check closed and hands the POS an external tender. The POS still issues the tax invoice.",
    subtotal: "Subtotal", service: "Service 10%", tax: "Tax 16%", total: "Total",
    /* menu */
    menuTitle: "Menu", menuSub: "Take something off and it disappears from every table's phone within seconds.",
    available: "Available", soldOut: "Sold out",
    eightySix: "Mark sold out", bringBack: "Put back on",
    prepTime: "Prep", price: "Price", searchMenu: "Search the menu",
    /* tables */
    tablesTitle: "Tables & QR", tablesSub: "One code per table. Reprint anytime — the code never changes.",
    seats: "seats", printQr: "Print card", tableCode: "Code",
    printAll: "Print all cards", openGuest: "Open", scanToOrder: "Scan to see the menu and order",
    qrLocalWarn: "These codes point at localhost, which a phone cannot open. Open the back office on the network address to print codes that scan.",
    /* reports */
    reportsTitle: "Reports", reportsSub: "Today so far, on this branch.",
    revenue: "Revenue", ticketsN: "Rounds sent", avgTicket: "Average table", avgPrep: "Average time to ready",
    topItems: "Most ordered", promised: "Promised", actual: "Actual", onTime: "On time",
    noSales: "Nothing sold yet today.", noTimings: "No round has been bumped yet.",
    /* team */
    teamTitle: "Team", teamSub: "Who can do what. Roles apply across every branch.",
    permissions: "Can", role: "Role",
    permHint: "Tap a cell to grant or remove it",
    save: "Save", cancel: "Cancel", saved: "Saved",
    ratesNote: "Applies to rounds sent from now on. Anything already ordered keeps the rate it was quoted at.",
    /* settings */
    settingsTitle: "Settings", settingsSub: "How Leaf talks to the rest of the restaurant.",
    posTitle: "Point of sale", posSub: "Leaf never becomes the invoice of record. Orders and closes are pushed to whatever you already run.",
    connected: "Connected", availableNow: "Available", onRequest: "On request",
    ratesTitle: "Charges", editWindow: "Guest edit window", seconds: "seconds",
    complianceTitle: "Invoicing", jofotara: "JoFotara (الفوترة الوطنية)",
    jofotaraNote: "Tax invoices are issued by your POS, not by Leaf. Confirm your POS is enrolled before switching off paper receipts.",
    verify: "Not verified yet",
    activity: "Recent activity", nothingYet: "Nothing yet today",
    clearTitle: "Clear the day",
    clearSub: "Removes every round, open table and bill from this branch and puts the room back to empty. Use it at the end of service, or to wipe demo tickets. It cannot be undone.",
    clearBtn: "Clear the day", clearConfirm: "Yes — clear it", clearCancel: "Keep it",
    clearOn: "Clearing…", clearNone: "The room is already empty.",
    noAccess: "This section isn't part of your role", noAccessSub: "Ask an owner or manager if you need it.",
  },
  ar: {
    dir: "rtl",
    nav: { floor: "الصالة", kds: "المطبخ", menu: "المنيو", tables: "الطاولات و QR", reports: "التقارير", history: "السجل", team: "الفريق", settings: "الإعدادات" },
    historyTitle: "السجل", historySub: "كل فاتورة وكل جولة، يوم بيوم.",
    bills: "الفواتير", ordersTab: "الجولات", noneThatDay: "ما في شي بهذا اليوم.",
    historyRetain: "بينحفظ لـ ٣٠ يوم.",
    edit: "تعديل", remove: "حذف", removed: "تم الحذف", newDish: "صنف جديد", editDish: "تعديل الصنف",
    deleteDish: "احذف الصنف", dishName: "الاسم", dishNameAr: "الاسم بالعربي",
    dishDesc: "الوصف", dishDescAr: "الوصف بالعربي",
    category: "القسم", emoji: "الإيموجي", tags: "الوسوم", allergens: "مسببات الحساسية",
    uploadPhoto: "ارفع صورة", removePhoto: "احذف الصورة", photoUrl: "…أو الصق رابط صورة",
    photoFailed: "ما قدرنا نقرأ الملف كصورة.",
    needName: "الصنف بدّه اسم.", idTaken: "في صنف بنفس الاسم.",
    stationFollows: "بيروح لمحطة القسم",
    optionGroups: "خيارات بيختارها الزبون", addGroup: "أضف مجموعة", addOption: "أضف خيار",
    groupName: "المجموعة", groupNameAr: "المجموعة بالعربي", optName: "الخيار", optNameAr: "الخيار بالعربي",
    pickOne: "اختيار واحد", pickMany: "اختيار متعدد", requiredOpt: "إلزامي",
    popular: "الأكثر طلباً", chef: "اختيار الشيف", vegan: "نباتي صرف", vegetarian: "نباتي",
    spicy: "حار", national: "الطبق الوطني", sharing: "للمشاركة", breakfast: "فطور",
    alg_gluten: "غلوتين", alg_dairy: "ألبان", alg_nuts: "مكسرات", alg_sesame: "سمسم",
    alg_egg: "بيض", alg_fish: "سمك",
    signedInAs: "تسجيل الدخول باسم", switchRole: "تبديل الدور", demoRole: "تجريبي — بدّل الدور",
    viewAs: "اعرض كـ", signOut: "تسجيل الخروج",
    signInSub: "أدخل رمز الموظف", wrongPin: "الرمز غير صحيح", clear: "مسح",
    pinsTitle: "رموز الموظفين", pinsSub: "الرمز اللي بيدخل فيه كل دور. أربع خانات أو أكثر.",
    pinDefault: "لسا الرمز الافتراضي",
    pinsWarn: "بينحفظ مشفّر، فبتقدر تغيّره بس ما بتقدر تشوفه. هذا بيمنع الزبون من الدخول، بس مش بديل عن حسابات حقيقية.",
    branch: "الفرع", open: "مفتوح", live: "مباشر", today: "اليوم",
    connecting: "جاري الاتصال", thisDevice: "هذا الجهاز", waiterCalled: "طلبت نادل",
    answerCall: "أنا بالطريق", markServed: "تم التقديم",
    wantsToPay: "بدهم يدفعوا", takePayment: "استلم الدفعة",
    closeHint: "الدفع بالبطاقة أو المحفظة بيقفل الطاولة لحاله. هاي الطاولة طلبت تدفع كاش.",
    allDay: "المجموع الكلي", allDayHint: "كل ما تبقّى للطبخ من جميع الطلبات",
    station: "القسم", allStations: "كل الأقسام", bump: "جاهز", recall: "استرجاع",
    editable: "الزبون ما زال يقدر يعدّل", locks: "يُقفل خلال",
    late: "متأخر", left: "متبقي", overBy: "تأخر", newTicket: "جديد",
    noTickets: "لا يوجد طلبات", noTicketsSub: "الطلبات الجديدة بتظهر هون فور إرسالها من الطاولة.",
    round: "جولة", rounds: "جولات", table: "طاولة", items: "أصناف", covers: "الضيوف",
    markReady: "جاهز", undo: "تراجع",
    floorTitle: "الصالة", floorSub: "كل طاولة في المطعم، وكم عليها.",
    free: "فاضية", ordering: "بتطلب", inKitchen: "في المطبخ", ready: "جاهز للتقديم", eating: "بتاكل", billed: "طلبت الحساب", closed: "مغلقة",
    openTotal: "المبلغ المفتوح", noOrders: "ما في طلبات بعد", viewOrder: "افتح الطاولة", close: "إغلاق",
    closeTable: "إغلاق الطاولة", closeAs: "أغلق الطاولة كـ",
    payCliq: "كليك", paidCash: "نقداً", payVisa: "جهاز الفيزا",
    payCardOnline: "بطاقة أونلاين", payApple: "Apple Pay", payGoogle: "Google Pay",
    collected: "المبالغ المحصّلة", method: "طريقة الدفع", amount: "المبلغ", tablesN: "طاولات",
    totalCollected: "إجمالي المحصّل", noPayments: "ما في تحصيل لحد الآن.",
    externalNote: "ليف بتسكّر الحساب وبتسجّل الدفع كـ external tender على نظامك. الفاتورة الضريبية بتظل تصدر من الكاشير.",
    subtotal: "المجموع", service: "خدمة ١٠٪", tax: "ضريبة ١٦٪", total: "الإجمالي",
    menuTitle: "المنيو", menuSub: "أي صنف بتشيله بيختفي من شاشات كل الطاولات خلال ثواني.",
    available: "متوفر", soldOut: "منتهي",
    eightySix: "علّمه منتهي", bringBack: "رجّعه للمنيو",
    prepTime: "التحضير", price: "السعر", searchMenu: "دوّر في المنيو",
    tablesTitle: "الطاولات و QR", tablesSub: "كود لكل طاولة. اطبعه وقت ما بدك — الكود ما بتغيّر.",
    seats: "مقاعد", printQr: "اطبع البطاقة", tableCode: "الكود",
    printAll: "اطبع كل البطاقات", openGuest: "افتح", scanToOrder: "امسح الكود لتشوف المنيو وتطلب",
    qrLocalWarn: "هذي الأكواد بتشير على localhost واللي الموبايل ما بيقدر يفتحه. افتح الإدارة من عنوان الشبكة عشان تطبع أكواد بتنمسح.",
    reportsTitle: "التقارير", reportsSub: "اليوم لحد الآن، في هذا الفرع.",
    revenue: "المبيعات", ticketsN: "الجولات المرسلة", avgTicket: "معدل الطاولة", avgPrep: "معدل وقت التجهيز",
    topItems: "الأكثر طلباً", promised: "الموعود", actual: "الفعلي", onTime: "في الوقت",
    noSales: "ما في مبيعات اليوم لحد الآن.", noTimings: "ما في جولة جاهزة لحد الآن.",
    teamTitle: "الفريق", teamSub: "مين بيقدر يعمل شو. الأدوار بتنطبق على كل الفروع.",
    permissions: "الصلاحيات", role: "الدور",
    permHint: "اضغط على الخانة لمنح الصلاحية أو سحبها",
    save: "حفظ", cancel: "إلغاء", saved: "تم الحفظ",
    ratesNote: "بينطبق على الجولات الجاي بعد هلأ. اللي تم طلبه بيضل بالسعر اللي تسعّر فيه.",
    settingsTitle: "الإعدادات", settingsSub: "كيف ليف بتحكي مع باقي أنظمة المطعم.",
    posTitle: "نظام الكاشير", posSub: "ليف ما بتصير هي الفاتورة الرسمية. الطلبات والإغلاقات بتنرسل للنظام اللي عندك.",
    connected: "متصل", availableNow: "متاح", onRequest: "عند الطلب",
    ratesTitle: "الرسوم", editWindow: "مدة تعديل الزبون", seconds: "ثانية",
    complianceTitle: "الفوترة", jofotara: "الفوترة الوطنية (JoFotara)",
    jofotaraNote: "الفواتير الضريبية بتصدر من نظام الكاشير مش من ليف. تأكد إن نظامك مسجّل قبل ما توقف الفواتير الورقية.",
    verify: "لم يتم التحقق بعد",
    activity: "آخر النشاطات", nothingYet: "ما في نشاط اليوم",
    clearTitle: "تصفير اليوم",
    clearSub: "بيمسح كل الجولات والطاولات المفتوحة والفواتير من هذا الفرع وبيرجّع الصالة فاضية. استعمله بآخر الدوام، أو لمسح الطلبات التجريبية. ما في تراجع.",
    clearBtn: "صفّر اليوم", clearConfirm: "نعم — صفّرها", clearCancel: "خليها",
    clearOn: "جاري التصفير…", clearNone: "الصالة أصلاً فاضية.",
    noAccess: "هذا القسم مش ضمن دورك", noAccessSub: "احكي مع المالك أو المدير إذا بتحتاجه.",
  },
};

/* ----------------------------- ornaments ----------------------------- */

function Leaf({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      <path fill={color} d="M11.11 22L12.18 21.45L13.26 20.89L14.32 20.26L15.32 19.51L16.2 18.52L16.83 17.24L17.06 15.73L16.83 14.22L16.29 12.86L15.58 11.69L14.8 10.68L14.03 9.82L13.34 9.1L12.81 8.55L12.44 8.2L12.18 8.05L11.94 7.97L11.71 7.71L11.63 7.14L11.78 6.31L12.12 5.32L12.58 4.23L13.06 3.11L13.45 2L12.44 2.55L11.37 3.1L10.29 3.68L9.24 4.36L8.25 5.2L7.41 6.29L6.87 7.7L6.78 9.28L7.12 10.8L7.75 12.11L8.53 13.23L9.35 14.18L10.14 14.99L10.83 15.64L11.37 16.14L11.76 16.45L12.05 16.6L12.33 16.76L12.56 17.14L12.6 17.83L12.41 18.74L12.04 19.78L11.57 20.88Z" />
    </svg>
  );
}

const ICON = {
  floor: "M3 21V8l9-5 9 5v13h-7v-6h-4v6z",
  kds: "M4 4h16M6 4v6a6 6 0 0 0 12 0V4M12 16v4M8 20h8",
  menu: "M4 5h16M4 12h16M4 19h10",
  tables: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  history: "M4 6h16a1 1 0 0 1 1 1v13l-3-2-3 2-3-2-3 2-3-2V7a1 1 0 0 1 1-1zM8 10h8M8 14h5",
  team: "M16 20v-2a4 4 0 0 0-8 0v2M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-2a3.6 3.6 0 0 0-2.6-3.4",
  settings: "M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 15h-.3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.5 8.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z",
};

function Ico({ name, size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  );
}

/* ---------------------------- time helpers ---------------------------- */

const clock = (secs) => {
  const s = Math.max(0, Math.floor(secs));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};

/* Promised time is the slowest thing on the ticket — a table is only fed
   when the last plate lands, so that's what the kitchen is racing. */
const promisedSec = (order) =>
  Math.max(...order.lines.map((l) => byId[l.itemId].min)) * 60;

/* ---------------------------- tenders -------------------------------- */
/* Stored as stable keys, never as the button's label — the reports group
   on these, and a label changes with the language. Guest-side keys
   (applepay, googlepay, card) come off the phone's own checkout. */

const TENDERS = ["cliq", "cash", "visa"];

const PAY_KEYS = {
  cliq: "payCliq", cash: "paidCash", visa: "payVisa",
  card: "payCardOnline", applepay: "payApple", googlepay: "payGoogle",
};

/* an unknown value is a round closed before this existed — it stored the
   label itself, so showing it back is better than showing nothing */
const payLabel = (t, method) => t[PAY_KEYS[method]] || method || "—";

/* The window a round was sent under. Rounds carry their own, so shortening
   the setting mid-service never re-locks food already on the pass. */
const windowOf = (order) => order.editWindow ?? DEFAULT_CONFIG.editWindow;

/* The heat of a ticket: this drives the whole colour system. */
function heatOf(order, now) {
  const age = (now - order.placedAt) / 1000;
  /* confirmedAt is the guest waiving the rest of their window, so the hold
     comes off early rather than the line waiting out a dead clock */
  if (age < windowOf(order) && !order.confirmedAt) return "wet";
  const p = promisedSec(order);
  if (age > p + LATE_GRACE_SEC) return "late";
  if (age > p * 0.75) return "close";
  return "cool";
}

/* =============================== APP ================================= */

export default function App() {
  const [lang, setLang] = useState("en");
  const t = T[lang];
  const isAr = lang === "ar";

  /* null until someone signs in; the PIN they use decides the role */
  const [roleId, setRoleId] = useState(() => readSession());
  const role = ROLES.find((r) => r.id === roleId) || ROLES[1];

  const store = useStore();
  /* republished before any child renders, so every screen — pass, floor,
     history — reads a dish at its current name, price and station */
  MENU = useMemo(() => effectiveMenu(store.menu), [store.menu]);
  byId = useMemo(() => indexBy(MENU), [MENU]);
  /* permissions are live config now, so a change made on one screen
     re-gates every other screen without a reload */
  const perms = store.config.perms || DEFAULT_CONFIG.perms;
  const can = (p) => (perms[roleId] || []).includes(p);
  const [view, setView] = useState("floor");
  const [now, setNow] = useState(Date.now());
  const [openTable, setOpenTable] = useState(null);
  const [toast, setToast] = useState(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const i = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(i);
  }, [toast]);

  /* the kitchen never sees the rest of the app; and if a permission is
     taken away while you are standing on that page, you get moved off it */
  useEffect(() => {
    if (roleId === "kitchen") setView("kds");
    else if (!can(view)) setView((perms[roleId] || ["floor"])[0]);
  }, [roleId, perms]); // eslint-disable-line

  const orders = store.orders;
  const branch = BRANCHES.find((b) => b.id === store.branchId);

  const kitchenQueue = orders
    .filter((o) => o.status === "new" || o.status === "firing")
    .sort((a, b) => a.placedAt - b.placedAt);

  const say = (msg, kind = "ok") => setToast({ msg, kind });

  const NAV = ["floor", "kds", "menu", "tables", "reports", "history", "team", "settings"].filter(can);
  const kioskKds = roleId === "kitchen";

  const signIn = (r) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ role: r, at: Date.now() }));
    setRoleId(r);
    setView((store.config.perms?.[r] || ["floor"])[0]);
  };
  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setRoleId(null);
  };

  /* nothing of the back office renders until a PIN has been accepted */
  if (!roleId) {
    return (
      <SignIn t={t} isAr={isAr} lang={lang} setLang={setLang}
        staff={store.config.staff || DEFAULT_CONFIG.staff} onIn={signIn} />
    );
  }

  return (
    <div className={"bo" + (kioskKds ? " bo-kiosk" : "")} dir={t.dir} lang={lang}>
      <style>{CSS}</style>

      {!kioskKds && (
        <aside className={"rail" + (navOpen ? " rail-open" : "")}>
          <div className="rail-brand">
            <span className="rail-mark"><Leaf size={17} color="#EDEFE6" /></span>
            <div>
              <b>Leaf</b>
              <span>{isAr ? "إدارة المطعم" : "Back of house"}</span>
            </div>
          </div>

          <nav className="rail-nav">
            {NAV.map((v) => (
              <button
                key={v}
                className={"rail-item" + (view === v ? " rail-on" : "")}
                onClick={() => { setView(v); setNavOpen(false); }}
              >
                <Ico name={v} />
                <span>{t.nav[v]}</span>
                {v === "kds" && kitchenQueue.length > 0 && (
                  <em className="rail-count mono">{kitchenQueue.length}</em>
                )}
              </button>
            ))}
          </nav>

          <div className="rail-foot">
            <div className="whoami">
              <span className="avatar">{(isAr ? role.whoAr : role.who).slice(0, 1)}</span>
              <div>
                <b>{isAr ? role.whoAr : role.who}</b>
                <span>{isAr ? role.nameAr : role.name}</span>
              </div>
            </div>
            {/* an owner can look through another role's eyes without
                signing out; everyone else sees only their own screens */}
            {roleId === "owner" && (
              <label className="rolepick">
                <span>{t.viewAs}</span>
                <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{isAr ? r.nameAr : r.name}</option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn-quiet signout" onClick={signOut}>{t.signOut}</button>
          </div>
        </aside>
      )}

      <div className="main">
        <header className="top">
          {!kioskKds && (
            <button className="burger" onClick={() => setNavOpen((v) => !v)} aria-label="Menu">
              <span /><span /><span />
            </button>
          )}

          {kioskKds && (
            <div className="kiosk-brand">
              <Leaf size={16} color="var(--sumac)" />
              <b>{isAr ? "المطبخ" : "Kitchen"}</b>
            </div>
          )}

          <label className="branchpick">
            <Ico name="floor" size={14} />
            <select value={store.branchId} onChange={(e) => store.switchBranch(e.target.value)}
              disabled={roleId === "kitchen"}>
              {BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>{isAr ? b.nameAr : b.name}</option>
              ))}
            </select>
          </label>

          <span className={"livedot livedot-" + store.status}>
            <i />{store.status === "connected" || store.status === "solo" ? t.live : t.connecting}
          </span>
          <span className="modetag">{store.mode === "supabase" ? "Supabase" : t.thisDevice}</span>

          <div className="top-right">
            <span className="clock mono">
              {new Date(now).toLocaleTimeString(isAr ? "ar-JO" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button className="langbtn" onClick={() => setLang(isAr ? "en" : "ar")}>
              {isAr ? "EN" : "ع"}
            </button>
            {kioskKds && (
              <button className="btn-quiet signout signout-top" onClick={signOut}>{t.signOut}</button>
            )}
          </div>
        </header>

        <div className={"stage" + (view === "kds" ? " stage-kds" : "")}>
          {!can(view) ? (
            <Denied t={t} />
          ) : view === "kds" ? (
            <KDS t={t} isAr={isAr} now={now} queue={kitchenQueue} orders={orders} store={store} say={say} can={can} />
          ) : view === "floor" ? (
            <Floor t={t} isAr={isAr} now={now} orders={orders} branch={branch}
              onOpen={setOpenTable} can={can} calls={store.calls} payRequests={store.payRequests}
              onAnswer={(n) => { store.answerCall(n); say(`${t.table} ${n} — ${t.answerCall}`); }}
              canServe={can("close")}
              onServe={(ids, n) => {
                ids.forEach(store.serve);
                say(`${t.table} ${n} — ${t.markServed}`);
              }} />
          ) : view === "menu" ? (
            <MenuAdmin t={t} isAr={isAr} store={store} can={can} orders={orders} say={say} />
          ) : view === "tables" ? (
            <Tables t={t} isAr={isAr} branch={branch} orders={orders} />
          ) : view === "history" ? (
            <History t={t} isAr={isAr} orders={orders} lang={lang} />
          ) : view === "reports" ? (
            <Reports t={t} isAr={isAr} orders={orders} now={now} />
          ) : view === "team" ? (
            <Team t={t} isAr={isAr} roleId={roleId} perms={perms} canEdit={can("team")}
              onToggle={(rid, key) => {
                const cur = perms[rid] || [];
                const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
                store.setConfig({ perms: { ...perms, [rid]: next } });
                say(`${ROLES.find((r) => r.id === rid)[isAr ? "nameAr" : "name"]} — ${t.saved}`);
              }} />
          ) : (
            <Settings t={t} isAr={isAr} store={store} canEdit={can("settings")} />
          )}
        </div>
      </div>

      {openTable != null && (
        <TableDrawer
          t={t} isAr={isAr} now={now} tableNo={openTable}
          orders={orders.filter((o) => o.tableNo === openTable)}
          onClose={() => setOpenTable(null)}
          /* A card or wallet payment closes its own table from the phone,
             so the only table a human still has to close is one that asked
             to pay cash. The control appears with that request. */
          canClose={can("close") && store.payRequests.some((p) => p.tableNo === openTable)}
          onServe={can("close") ? (ids, n) => {
            ids.forEach(store.serve);
            say(`${t.table} ${n} — ${t.markServed}`);
          } : null}
          onCloseTable={(m) => { store.closeTable(openTable, m); setOpenTable(null); say(`${t.table} ${openTable} — ${m}`); }}
        />
      )}

      {toast && <div className={"toast toast-" + toast.kind}>{toast.msg}</div>}
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
    </div>
  );
}

function Denied({ t }) {
  return (
    <div className="empty">
      <Leaf size={22} color="var(--line-solid)" />
      <h3>{t.noAccess}</h3>
      <p>{t.noAccessSub}</p>
    </div>
  );
}

/* ============================ KITCHEN =============================== */
/* The screen this whole product is judged on. Three things a real line
   needs and most demos skip: an all-day count, a visible promised time,
   and — because our guests can amend for 90 seconds — a clear signal
   that a ticket is not yet safe to fire. */

function KDS({ t, isAr, now, queue, orders, store, say, can }) {
  const [station, setStation] = useState("all");
  const [lastBump, setLastBump] = useState(null);

  const visible = useMemo(
    () =>
      queue
        .map((o) => ({
          ...o,
          shown: station === "all" ? o.lines : o.lines.filter((l) => l.station === station),
        }))
        .filter((o) => o.shown.length > 0),
    [queue, station]
  );

  /* All day: every unfinished line in the queue, collapsed by dish.
     This is what a chef shouts across the pass, so it gets its own column. */
  const allDay = useMemo(() => {
    const m = {};
    queue.forEach((o) =>
      o.lines.forEach((l) => {
        if (l.done) return;
        if (station !== "all" && l.station !== station) return;
        m[l.itemId] = (m[l.itemId] || 0) + l.qty;
      })
    );
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [queue, station]);

  const counts = useMemo(() => {
    const c = { all: 0 };
    queue.forEach((o) =>
      o.lines.forEach((l) => {
        if (l.done) return;
        c.all += 1;
        c[l.station] = (c[l.station] || 0) + 1;
      })
    );
    return c;
  }, [queue]);

  const pass = orders
    .filter((o) => o.status === "ready")
    .sort((a, b) => (b.bumpedAt || 0) - (a.bumpedAt || 0));

  const doBump = (o) => {
    store.bump(o.id, station);
    setLastBump(o.id);
    say(`${t.table} ${o.tableNo} · ${t.round} ${o.round} → ${t.bump}`);
  };

  return (
    <div className="kds">
      <div className="kds-bar">
        <div className="stations">
          <button className={"stn" + (station === "all" ? " stn-on" : "")} onClick={() => setStation("all")}>
            {t.allStations}<em className="mono">{counts.all || 0}</em>
          </button>
          {STATIONS.map((s) => (
            <button key={s.id} className={"stn" + (station === s.id ? " stn-on" : "")}
              onClick={() => setStation(s.id)}>
              {isAr ? s.nameAr : s.name}
              <em className="mono">{counts[s.id] || 0}</em>
            </button>
          ))}
        </div>
        {lastBump && (
          <button className="recall" onClick={() => { store.recall(lastBump); setLastBump(null); }}>
            ↺ {t.recall}
          </button>
        )}
      </div>

      <div className="kds-body">
        <div className="tickets">
          {visible.length === 0 ? (
            <div className="empty empty-kds">
              <Leaf size={22} color="var(--line-solid)" />
              <h3>{t.noTickets}</h3>
              <p>{t.noTicketsSub}</p>
            </div>
          ) : (
            visible.map((o) => (
              <Ticket key={o.id} o={o} t={t} isAr={isAr} now={now}
                onToggle={(lineId) => store.toggleLine(o.id, lineId)}
                onBump={() => doBump(o)} />
            ))
          )}
        </div>

        <aside className="kds-side">
          <section className="allday">
            <div className="side-head">
              <h3>{t.allDay}</h3>
              <span>{t.allDayHint}</span>
            </div>
            {allDay.length === 0 ? (
              <p className="side-empty">—</p>
            ) : (
              <ul className="allday-list">
                {allDay.map(([id, n]) => (
                  <li key={id}>
                    <b className="mono">{n}</b>
                    <span>{isAr ? byId[id].nameAr : byId[id].name}</span>
                    {can("eightysix") && (
                      <button className="mini86" onClick={() => store.toggle86(id)}
                        title={t.eightySix}>{t.soldOut}</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="passrail">
            <div className="side-head">
              <h3>{t.bump}</h3>
              <span>{isAr ? "بانتظار النادل" : "Waiting on a runner"}</span>
            </div>
            {pass.length === 0 ? (
              <p className="side-empty">—</p>
            ) : (
              <ul className="pass-list">
                {pass.slice(0, 8).map((o) => (
                  <li key={o.id}>
                    <div>
                      <b>{t.table} {o.tableNo}</b>
                      <span className="mono">{clock((now - (o.bumpedAt || now)) / 1000)}</span>
                    </div>
                    <div className="pass-act">
                      <button onClick={() => store.recall(o.id)}>{t.undo}</button>
                      <button className="pass-served" onClick={() => store.serve(o.id)}>✓</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Ticket({ o, t, isAr, now, onToggle, onBump }) {
  const ageSec = (now - o.placedAt) / 1000;
  const heat = heatOf(o, now);
  const p = promisedSec(o);
  const lockIn = Math.max(0, windowOf(o) - ageSec);
  const over = ageSec - p;
  const doneN = o.shown.filter((l) => l.done).length;
  const fresh = ageSec < 12;

  return (
    <article className={`tk tk-${heat}` + (fresh ? " tk-fresh" : "")}>
      <header className="tk-head">
        <div className="tk-id">
          <b>{t.table} {o.tableNo}</b>
          {o.round > 1 && <span className="tk-round">{t.round} {o.round}</span>}
        </div>
        <span className="tk-age mono">{clock(ageSec)}</span>
      </header>

      <div className="tk-meter">
        <span className="tk-meter-fill" style={{ width: Math.min(100, (ageSec / p) * 100) + "%" }} />
      </div>

      <div className="tk-sub">
        {heat === "late"
          ? <span className="tk-overdue">{t.late} · {t.overBy} {clock(over)}</span>
          : <span><b className="mono">{clock(Math.max(0, p - ageSec))}</b> {t.left}</span>}
        <span className="mono tk-prog">{doneN}/{o.shown.length}</span>
      </div>

      {heat === "wet" && (
        <div className="tk-hold">
          {t.editable} — {t.locks} <b className="mono">{clock(lockIn)}</b>
        </div>
      )}

      <ul className="tk-lines">
        {o.shown.map((l) => (
          <li key={l.lineId} className={"tkl" + (l.done ? " tkl-done" : "")}>
            <button className="tkl-hit" onClick={() => onToggle(l.lineId)}>
              <span className="tkl-q mono">{l.qty}</span>
              <span className="tkl-body">
                <span className="tkl-n">{isAr ? byId[l.itemId].nameAr : byId[l.itemId].name}</span>
                {l.mods.length > 0 && (
                  <span className="tkl-mods">
                    {l.mods.map((m) => (isAr ? m[1] : m[0])).join(" · ")}
                  </span>
                )}
                {/* what the guest typed for this dish — the line cook needs
                    it louder than the modifiers, not folded in with them */}
                {l.note && <span className="tkl-note">“{l.note}”</span>}
              </span>
              <span className="tkl-check" aria-hidden="true">✓</span>
            </button>
          </li>
        ))}
      </ul>

      {o.note && <p className="tk-note">“{isAr ? o.note[1] : o.note[0]}”</p>}

      <button className="tk-bump" onClick={onBump} disabled={heat === "wet"}>
        {heat === "wet" ? `${t.locks} ${clock(lockIn)}` : t.markReady}
      </button>
    </article>
  );
}

/* ============================== FLOOR ================================ */

const tableState = (rows, now) => {
  if (rows.length === 0) return "free";
  if (rows.every((o) => o.paid)) return "closed";
  if (rows.some((o) => o.status === "new")) return "ordering";
  if (rows.some((o) => o.status === "ready")) return "ready";
  if (rows.some((o) => o.status === "firing")) return "inKitchen";
  return "eating";
};

/* thin wrapper so the floor keeps its one-argument call sites; the rates
   ride on each round, so this needs no config of its own */
const money = (rows) => tableMoney(rows);

function Floor({ t, isAr, now, orders, branch, onOpen, onAnswer, onServe, canServe,
  calls = [], payRequests = [] }) {
  const tables = Array.from({ length: branch.tables }, (_, i) => i + 1);
  const byTable = useMemo(() => {
    const m = {};
    orders.forEach((o) => { (m[o.tableNo] = m[o.tableNo] || []).push(o); });
    return m;
  }, [orders]);

  const openRows = orders.filter((o) => !o.paid);
  const openMoney = money(openRows);
  const covers = new Set(openRows.map((o) => o.tableNo)).size;

  return (
    <>
      <PageHead t={t} title={t.floorTitle} sub={t.floorSub}>
        <Stat label={t.covers} value={covers} />
        <Stat label={t.openTotal} value={jd(openMoney.grand)} unit="JD" />
      </PageHead>

      <div className="floorgrid">
        {tables.map((n) => {
          const rows = byTable[n] || [];
          const st = tableState(rows, now);
          const m = money(rows.filter((o) => !o.paid));
          const active = rows.filter((o) => !o.paid);
          const oldest = active.length
            ? Math.max(...active.map((o) => (now - o.placedAt) / 1000))
            : 0;
          const call = calls.find((c) => c.tableNo === n);
          const calling = !!call;
          /* plated and waiting on a runner — the same status the kitchen's
             pass rail is showing, read from the one shared log */
          const paying = payRequests.find((p) => p.tableNo === n);
          const ready = active.filter((o) => o.status === "ready");
          const waiting = ready.length
            ? Math.max(...ready.map((o) => (now - (o.bumpedAt || now)) / 1000))
            : 0;
          return (
            /* a div, not a button: the answer control lives inside the tile
               and a button cannot legally nest inside another button */
            <div key={n} role="button" tabIndex={0}
              className={"tbl tbl-" + st + (calling ? " tbl-calling" : "")}
              onClick={() => onOpen(n)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(n); }
              }}>
              <div className="tbl-top">
                <b className="mono">{n}</b>
                {calling ? <span className="tbl-bell">🔔</span>
                         : <span className={"tbl-pin tbl-pin-" + st} />}
              </div>
              <span className="tbl-state">{t[st]}</span>

              {/* the other half of the kitchen's ✓ — the food is plated and
                  waiting, and this is where the runner signs it off */}
              {ready.length > 0 && canServe && (
                <div className="tbl-run">
                  <span className="tbl-run-t">
                    {t.ready} · <span className="mono">{clock(waiting)}</span>
                  </span>
                  <button
                    className="tbl-served"
                    onClick={(e) => { e.stopPropagation(); onServe(ready.map((o) => o.id), n); }}
                  >
                    {t.markServed}
                  </button>
                </div>
              )}

              {paying && (
                <div className="tbl-pay">
                  <span className="tbl-pay-t">
                    {t.wantsToPay} · {t.paidCash} · <span className="mono">{clock((now - paying.at) / 1000)}</span>
                  </span>
                  <button
                    className="tbl-take"
                    onClick={(e) => { e.stopPropagation(); onOpen(n); }}
                  >
                    {t.takePayment}
                  </button>
                </div>
              )}

              {calling && (
                <div className="tbl-call">
                  <span className="tbl-call-t">
                    {t.waiterCalled} · <span className="mono">{clock((now - call.at) / 1000)}</span>
                  </span>
                  <button
                    className="tbl-answer"
                    onClick={(e) => { e.stopPropagation(); onAnswer(n); }}
                  >
                    {t.answerCall}
                  </button>
                </div>
              )}
              {active.length > 0 ? (
                <>
                  <span className="tbl-money mono">{jd(m.grand)} <i>JD</i></span>
                  <span className="tbl-meta">
                    {active.length} {active.length === 1 ? t.round : t.rounds} ·{" "}
                    <span className="mono">{clock(oldest)}</span>
                  </span>
                </>
              ) : (
                <span className="tbl-meta tbl-quiet">{st === "closed" ? t.closed : t.noOrders}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function TableDrawer({ t, isAr, now, tableNo, orders, onClose, onCloseTable, canClose, onServe }) {
  const open = orders.filter((o) => !o.paid);
  const m = money(open);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="drawer-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer">
        <header className="drawer-head">
          <div>
            <h2>{t.table} {tableNo}</h2>
            <span>{open.length} {open.length === 1 ? t.round : t.round} · {isAr ? "مفتوح" : "open"}</span>
          </div>
          <button className="drawer-x" onClick={onClose} aria-label={t.close}>×</button>
        </header>

        <div className="drawer-body">
          {open.length === 0 && <p className="side-empty">{t.noOrders}</p>}

          {open.map((o) => (
            <section key={o.id} className="drow">
              <div className="drow-head">
                <b>{t.round} {o.round}</b>
                <span className={"pill pill-" + o.status}>{statusLabel(t, o.status)}</span>
                {o.status === "ready" && onServe ? (
                  <button className="drow-served" onClick={() => onServe([o.id], tableNo)}>
                    {t.markServed}
                  </button>
                ) : null}
                <span className="mono drow-age">{clock((now - o.placedAt) / 1000)}</span>
              </div>
              {o.lines.map((l) => (
                <div key={l.lineId} className="dline">
                  <span className="mono dline-q">{l.qty}×</span>
                  <span className="dline-n">
                    {isAr ? byId[l.itemId].nameAr : byId[l.itemId].name}
                    {l.mods.length > 0 && (
                      <em>{l.mods.map((x) => (isAr ? x[1] : x[0])).join(" · ")}</em>
                    )}
                    {l.note && <em className="dline-note">“{l.note}”</em>}
                  </span>
                  <span className="mono dline-p">{jd(l.unit * l.qty)}</span>
                </div>
              ))}
              {o.note && <p className="dnote">“{isAr ? o.note[1] : o.note[0]}”</p>}
            </section>
          ))}

          {open.length > 0 && (
            <div className="dtotals">
              <Row l={t.subtotal} v={jd(m.sub)} />
              <Row l={t.service} v={jd(m.service)} />
              <Row l={t.tax} v={jd(m.tax)} />
              <Row l={t.total} v={jd(m.grand)} big />
            </div>
          )}
        </div>

        {open.length > 0 && canClose && (
          <footer className="drawer-foot">
            {!confirming ? (
              <>
                <p className="closenote">{t.closeHint}</p>
                <button className="btn-primary" onClick={() => setConfirming(true)}>{t.closeTable}</button>
              </>
            ) : (
              <>
                <p className="closeas">{t.closeAs}</p>
                <div className="closebtns">
                  {TENDERS.map((k) => (
                    <button key={k} onClick={() => onCloseTable(k)}>{payLabel(t, k)}</button>
                  ))}
                </div>
                <p className="closenote">{t.externalNote}</p>
              </>
            )}
          </footer>
        )}
      </aside>
    </div>
  );
}

const statusLabel = (t, s) =>
  s === "new" ? t.newTicket : s === "firing" ? t.inKitchen : s === "ready" ? t.bump : t.eating;

/* ------------------------------ sign in ------------------------------ */
/* Each role has a PIN. Entering one signs you in as that role, which is
   also what decides the permissions — so the door and the permission
   model are the same thing rather than two ideas that can disagree. */

const SESSION_KEY = "leaf:bo:session";

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    /* a shift, not forever: a screen left on the pass signs itself out */
    if (!s.role || Date.now() - s.at > 16 * 60 * 60 * 1000) return null;
    return s.role;
  } catch { return null; }
}

function SignIn({ t, isAr, lang, setLang, staff, onIn }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = (value) => {
    const h = pinHash(value);
    const role = Object.keys(staff).find((r) => staff[r] === h);
    if (!role) {
      setErr(true); setPin(""); setShake((n) => n + 1);
      return;
    }
    onIn(role);
  };

  const press = (d) => {
    setErr(false);
    const next = (pin + d).slice(0, 8);
    setPin(next);
    if (next.length >= 4) setTimeout(() => submit(next), 120);
  };

  return (
    <div className="signin" dir={t.dir} lang={lang}>
      <style>{CSS}</style>
      <div className={"signin-card" + (err ? " signin-bad" : "")} key={shake}>
        <span className="signin-mark"><Leaf size={22} color="#EDEFE6" /></span>
        <h1>Leaf</h1>
        <p>{t.signInSub}</p>

        <div className="signin-dots">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={pin.length > i ? "on" : ""} />
          ))}
        </div>
        {err && <p className="signin-err">{t.wrongPin}</p>}

        <div className="pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} onClick={() => press(String(n))}>{n}</button>
          ))}
          <button className="pad-ghost" onClick={() => { setPin(""); setErr(false); }}>{t.clear}</button>
          <button onClick={() => press("0")}>0</button>
          <button className="pad-ghost" onClick={() => setPin(pin.slice(0, -1))}>←</button>
        </div>

        <button className="signin-lang" onClick={() => setLang(isAr ? "en" : "ar")}>
          {isAr ? "English" : "عربي"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- dish editor ---------------------------- */
/* Photos are stored inline on the shared log, so they are downscaled hard
   before they go anywhere: a phone camera JPEG would blow the browser's
   storage quota in a handful of dishes. */

const PHOTO_MAX = 720;

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read failed"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("not an image"));
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

const slug = (s) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);

const blankItem = () => ({
  id: "", cat: "mezze", name: "", nameAr: "", price: 0, min: 5,
  desc: "", descAr: "", tags: [], allergens: [], emoji: "🍽️", hue: 90,
  photo: "", groups: [],
});

function DishEditor({ t, isAr, item, isNew, onSave, onCancel, onDelete, taken }) {
  const [d, setD] = useState(item);
  const [err, setErr] = useState(null);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const toggle = (k, v) =>
    set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

  const pickPhoto = async (file) => {
    if (!file) return;
    try { set("photo", await shrinkImage(file)); }
    catch { setErr(t.photoFailed); }
  };

  const save = () => {
    const id = d.id || slug(d.name);
    if (!d.name.trim()) return setErr(t.needName);
    if (!id) return setErr(t.needName);
    if (isNew && taken.includes(id)) return setErr(t.idTaken);
    onSave({
      ...d,
      id,
      price: Math.max(0, Number(d.price) || 0),
      min: Math.max(0, Math.round(Number(d.min) || 0)),
      groups: d.groups.map((g) => ({
        ...g,
        options: g.options.map((o) => ({ ...o, price: Number(o.price) || 0 })),
      })),
    });
  };

  /* option groups: the Portion / Bread / Toppings the guest picks from */
  const setGroup = (gi, patch) =>
    set("groups", d.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const setOpt = (gi, oi, patch) =>
    setGroup(gi, {
      options: d.groups[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)),
    });

  return (
    <div className="drawer-wrap" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <aside className="drawer drawer-wide">
        <header className="drawer-head">
          <div className="ed-head">
            <b>{isNew ? t.newDish : d.name || t.editDish}</b>
            <span>{t.menuTitle}</span>
          </div>
          <button className="drawer-x" onClick={onCancel} aria-label={t.close}>×</button>
        </header>

        <div className="drawer-body">
          {err && <p className="ed-err">{err}</p>}

          <div className="ed-photo">
            {d.photo
              ? <img src={d.photo} alt="" />
              : <span className="ed-photo-none">{d.emoji}</span>}
            <div className="ed-photo-act">
              <label className="btn-quiet ed-file">
                {t.uploadPhoto}
                <input type="file" accept="image/*" hidden
                  onChange={(e) => pickPhoto(e.target.files?.[0])} />
              </label>
              {d.photo && (
                <button className="btn-quiet" onClick={() => set("photo", "")}>{t.removePhoto}</button>
              )}
            </div>
          </div>

          <label className="ed-f">
            <span>{t.photoUrl}</span>
            <input value={d.photo.startsWith("data:") ? "" : d.photo}
              placeholder="https://…"
              onChange={(e) => set("photo", e.target.value)} />
          </label>

          <div className="ed-two">
            <label className="ed-f">
              <span>{t.dishName}</span>
              <input value={d.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label className="ed-f">
              <span>{t.dishNameAr}</span>
              <input dir="rtl" value={d.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
            </label>
          </div>

          <label className="ed-f">
            <span>{t.dishDesc}</span>
            <textarea rows="2" value={d.desc} onChange={(e) => set("desc", e.target.value)} />
          </label>
          <label className="ed-f">
            <span>{t.dishDescAr}</span>
            <textarea rows="2" dir="rtl" value={d.descAr} onChange={(e) => set("descAr", e.target.value)} />
          </label>

          <div className="ed-three">
            <label className="ed-f">
              <span>{t.price}</span>
              <input type="number" min="0" step="0.25" value={d.price}
                onChange={(e) => set("price", e.target.value)} />
            </label>
            <label className="ed-f">
              <span>{t.prepTime}</span>
              <input type="number" min="0" step="1" value={d.min}
                onChange={(e) => set("min", e.target.value)} />
            </label>
            <label className="ed-f">
              <span>{t.category}</span>
              <select value={d.cat} onChange={(e) => set("cat", e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{isAr ? c.nameAr : c.name}</option>
                ))}
              </select>
            </label>
          </div>

          <p className="ed-hint">{t.stationFollows} — <b>{
            (STATIONS.find((s) => s.id === CAT_STATION[d.cat]) || {})[isAr ? "nameAr" : "name"] || "—"
          }</b></p>

          <div className="ed-f">
            <span>{t.emoji}</span>
            <input className="ed-emoji" value={d.emoji} maxLength={4}
              onChange={(e) => set("emoji", e.target.value)} />
          </div>

          <div className="ed-f">
            <span>{t.tags}</span>
            <div className="ed-chips">
              {TAG_IDS.map((tag) => (
                <button key={tag} type="button"
                  className={"chip" + (d.tags.includes(tag) ? " chip-on" : "")}
                  onClick={() => toggle("tags", tag)}>{t[tag] || tag}</button>
              ))}
            </div>
          </div>

          <div className="ed-f">
            <span>{t.allergens}</span>
            <div className="ed-chips">
              {ALLERGEN_IDS.map((a) => (
                <button key={a} type="button"
                  className={"chip" + (d.allergens.includes(a) ? " chip-on" : "")}
                  onClick={() => toggle("allergens", a)}>{t["alg_" + a] || a}</button>
              ))}
            </div>
          </div>

          <div className="ed-groups">
            <div className="ed-groups-h">
              <b>{t.optionGroups}</b>
              <button className="btn-quiet ed-add" onClick={() => set("groups", [...d.groups, {
                id: "g" + (d.groups.length + 1), name: "", nameAr: "", type: "single",
                required: true, options: [{ id: "o1", name: "", nameAr: "", price: 0 }],
              }])}>{t.addGroup}</button>
            </div>
            <p className="ed-hint">{t.groupsHint}</p>

            {d.groups.map((g, gi) => (
              <div key={gi} className="ed-group">
                <div className="ed-two">
                  <label className="ed-f">
                    <span>{t.groupName}</span>
                    <input value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value, id: g.id || slug(e.target.value) })} />
                  </label>
                  <label className="ed-f">
                    <span>{t.groupNameAr}</span>
                    <input dir="rtl" value={g.nameAr} onChange={(e) => setGroup(gi, { nameAr: e.target.value })} />
                  </label>
                </div>
                <div className="ed-grow">
                  <label className="ed-inline">
                    <select value={g.type} onChange={(e) => setGroup(gi, { type: e.target.value })}>
                      <option value="single">{t.pickOne}</option>
                      <option value="multi">{t.pickMany}</option>
                    </select>
                  </label>
                  <label className="ed-inline ed-check">
                    <input type="checkbox" checked={!!g.required}
                      onChange={(e) => setGroup(gi, { required: e.target.checked })} />
                    <span>{t.requiredOpt}</span>
                  </label>
                  <button className="ed-x"
                    onClick={() => set("groups", d.groups.filter((_, i) => i !== gi))}>{t.remove}</button>
                </div>

                {g.options.map((o, oi) => (
                  <div key={oi} className="ed-opt">
                    <input placeholder={t.optName} value={o.name}
                      onChange={(e) => setOpt(gi, oi, { name: e.target.value, id: o.id || slug(e.target.value) })} />
                    <input placeholder={t.optNameAr} dir="rtl" value={o.nameAr}
                      onChange={(e) => setOpt(gi, oi, { nameAr: e.target.value })} />
                    <input type="number" step="0.25" className="ed-opt-p" value={o.price}
                      onChange={(e) => setOpt(gi, oi, { price: e.target.value })} />
                    <button className="ed-x ed-x-icon" onClick={() =>
                      setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}>×</button>
                  </div>
                ))}
                <button className="btn-quiet ed-add" onClick={() => setGroup(gi, {
                  options: [...g.options, { id: "o" + (g.options.length + 1), name: "", nameAr: "", price: 0 }],
                })}>{t.addOption}</button>
              </div>
            ))}
          </div>
        </div>

        <footer className="drawer-foot ed-foot">
          <button className="btn-primary" onClick={save}>{t.save}</button>
          {!isNew && onDelete && (
            <button className="btn-danger" onClick={onDelete}>{t.deleteDish}</button>
          )}
          <button className="btn-quiet" onClick={onCancel}>{t.cancel}</button>
        </footer>
      </aside>
    </div>
  );
}

function Row({ l, v, big }) {
  return (
    <div className={"trow" + (big ? " trow-big" : "")}>
      <span>{l}</span>
      <span className="mono">{v} <i>JD</i></span>
    </div>
  );
}

function PageHead({ t, title, sub, children }) {
  return (
    <header className="phead">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children && <div className="phead-stats">{children}</div>}
    </header>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b className="mono">{value}{unit && <i> {unit}</i>}</b>
    </div>
  );
}

/* ============================== MENU ================================= */

function MenuAdmin({ t, isAr, store, can, orders, say }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState(null);   // {item, isNew} | null
  const canEdit = can("price");

  /* how often each dish has gone out today — turns an admin list into
     something a manager can actually make a decision from */
  const sold = useMemo(() => {
    const m = {};
    orders.forEach((o) => o.lines.forEach((l) => { m[l.itemId] = (m[l.itemId] || 0) + l.qty; }));
    return m;
  }, [orders]);

  const rows = MENU.filter((mi) => {
    if (cat !== "all" && mi.cat !== cat) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return mi.name.toLowerCase().includes(s) || mi.nameAr.includes(q.trim());
  });

  return (
    <>
      <PageHead t={t} title={t.menuTitle} sub={t.menuSub}>
        <Stat label={t.soldOut} value={store.eightySixed.length} />
        {canEdit && (
          <button className="btn-quiet btn-printall"
            onClick={() => setEditing({ item: blankItem(), isNew: true })}>
            {t.newDish}
          </button>
        )}
      </PageHead>

      <div className="toolbar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchMenu} />
        <div className="chips">
          <button className={"chip" + (cat === "all" ? " chip-on" : "")} onClick={() => setCat("all")}>
            {t.allStations}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} className={"chip" + (cat === c.id ? " chip-on" : "")}
              onClick={() => setCat(c.id)}>{isAr ? c.nameAr : c.name}</button>
          ))}
        </div>
      </div>

      <div className="tablewrap">
        <table className="grid-t">
          <thead>
            <tr>
              <th>{isAr ? "الصنف" : "Dish"}</th>
              <th>{t.station}</th>
              <th className="num">{t.price}</th>
              <th className="num">{t.prepTime}</th>
              <th className="num">{t.today}</th>
              <th className="num">{t.available}</th>
              {canEdit && <th className="num" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((mi) => {
              const off = store.eightySixed.includes(mi.id);
              const st = STATIONS.find((s) => s.id === stationOf(mi.id));
              return (
                <tr key={mi.id} className={off ? "row-off" : ""}>
                  <td>
                    <span className="mrow">
                      {mi.photo
                        ? <img className="mthumb" src={mi.photo} alt="" loading="lazy" />
                        : <span className="mthumb mthumb-e">{mi.emoji}</span>}
                      <span>
                        <b>{isAr ? mi.nameAr : mi.name}</b>
                        <em>{isAr ? mi.name : mi.nameAr}</em>
                      </span>
                    </span>
                  </td>
                  <td><span className="stn-tag">{isAr ? st.nameAr : st.name}</span></td>
                  <td className="num mono">{jd(mi.price)}</td>
                  <td className="num mono">{mi.min}′</td>
                  <td className="num mono">{sold[mi.id] || 0}</td>
                  <td className="num">
                    <button
                      className={"tog" + (off ? "" : " tog-on")}
                      disabled={!can("eightysix")}
                      onClick={() => store.toggle86(mi.id)}
                      title={off ? t.bringBack : t.eightySix}
                    >
                      <span />
                    </button>
                  </td>
                  {canEdit && (
                    <td className="num">
                      <button className="btn-quiet mini-edit"
                        onClick={() => setEditing({ item: { ...blankItem(), ...mi }, isNew: false })}>
                        {t.edit}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <DishEditor
          t={t} isAr={isAr}
          item={editing.item} isNew={editing.isNew}
          taken={MENU.map((m) => m.id)}
          onCancel={() => setEditing(null)}
          onSave={(item) => {
            store.saveMenuItem(item);
            setEditing(null);
            say(`${item.name} — ${t.saved}`);
          }}
          onDelete={() => {
            store.removeMenuItem(editing.item.id);
            setEditing(null);
            say(`${editing.item.name} — ${t.removed}`);
          }}
        />
      )}
    </>
  );
}

/* ============================== TABLES =============================== */

/* A real, scannable QR — the module grid comes from the encoder and is
   drawn as one path so it stays crisp at any print size. */
function QrBlock({ value, size = 78, quiet = 2 }) {
  const path = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (modules.data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { d, n };
  }, [value]);

  const span = path.n + quiet * 2;
  return (
    <svg className="qr" width={size} height={size}
      viewBox={`${-quiet} ${-quiet} ${span} ${span}`} shapeRendering="crispEdges"
      role="img" aria-label={value}>
      <rect x={-quiet} y={-quiet} width={span} height={span} fill="#EDEFE6" />
      <path d={path.d} fill="#0B2C29" />
    </svg>
  );
}

/* The address a phone will actually open. Whatever host this screen was
   opened on is the host the code points at — so a manager working on
   localhost gets warned, because that code is unscannable from a phone. */
const guestUrl = (branchId, n) =>
  `${location.origin}${location.pathname}?t=${n}${branchId === "b1" ? "" : `&b=${branchId}`}`;

function Tables({ t, isAr, branch, orders }) {
  const nums = Array.from({ length: branch.tables }, (_, i) => i + 1);
  const [printing, setPrinting] = useState(null);
  const localOnly = /^(localhost|127\.|\[?::1)/.test(location.hostname);

  /* the browser's own print dialog, driven off a sheet rendered for it */
  useEffect(() => {
    if (printing == null) return;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    const id = setTimeout(() => window.print(), 60);   // let the sheet paint first
    return () => { window.removeEventListener("afterprint", done); clearTimeout(id); };
  }, [printing]);

  const card = (n) => ({
    n,
    code: `${branch.id.toUpperCase()}-T${String(n).padStart(2, "0")}`,
    url: guestUrl(branch.id, n),
    seats: n % 3 === 0 ? 6 : 4,
  });

  return (
    <>
      <PageHead t={t} title={t.tablesTitle} sub={t.tablesSub}>
        <button className="btn-quiet btn-printall" onClick={() => setPrinting("all")}>
          {t.printAll}
        </button>
      </PageHead>

      {localOnly && <p className="panel-empty qr-warn">{t.qrLocalWarn}</p>}

      <div className="qrgrid">
        {nums.map((n) => {
          const c = card(n);
          const busy = orders.some((o) => o.tableNo === n && !o.paid);
          return (
            <article key={n} className="qrcard">
              <QrBlock value={c.url} />
              <div className="qr-meta">
                <b>{t.table} {n}</b>
                <span className="mono">{c.code}</span>
                <span className="qr-seats">{c.seats} {t.seats}</span>
                {busy && <span className="qr-busy">{t.open}</span>}
              </div>
              <a className="btn-quiet qr-open" href={c.url} target="_blank" rel="noreferrer">
                {t.openGuest}
              </a>
              <button className="btn-quiet" onClick={() => setPrinting(n)}>{t.printQr}</button>
            </article>
          );
        })}
      </div>

      {/* portalled to the body: the app shell is hidden for print, and a
          sheet nested inside it would be hidden along with it */}
      {printing != null && createPortal(
        <div className="printsheet">
          {(printing === "all" ? nums : [printing]).map((n) => {
            const c = card(n);
            return (
              <section key={n} className="pcard">
                <span className="pcard-brand">Leaf</span>
                <b className="pcard-t">{t.table} {c.n}</b>
                <QrBlock value={c.url} size={190} />
                <span className="pcard-scan">{t.scanToOrder}</span>
                <span className="pcard-code">{c.code} · {c.seats} {t.seats}</span>
                <span className="pcard-url">{c.url}</span>
              </section>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

/* ============================== HISTORY ============================== */
/* Everything the log still holds, read back a day at a time. A bill is a
   table's closed rounds grouped by the moment it was settled; an order is
   the round as the kitchen saw it. */

const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

function History({ t, isAr, orders, lang }) {
  const [day, setDay] = useState(() => dayKey(Date.now()));
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [tab, setTab] = useState("bills");
  const [open, setOpen] = useState(null);

  const loc = isAr ? "ar-JO" : "en-GB";

  /* one pass over the log's orders: what happened on each day, so the
     calendar can mark the days worth opening */
  const byDay = useMemo(() => {
    const m = {};
    orders.forEach((o) => {
      const k = dayKey(o.placedAt);
      (m[k] = m[k] || { rounds: [], bills: [], revenue: 0 }).rounds.push(o);
    });
    orders.filter((o) => o.paid).forEach((o) => {
      const k = dayKey(o.paidAt || o.placedAt);
      const d = (m[k] = m[k] || { rounds: [], bills: [], revenue: 0 });
      d.bills.push(o);
      d.revenue += tableMoney([o]).grand;
    });
    return m;
  }, [orders]);

  /* closed rounds collapse into one bill per table per settlement */
  const bills = useMemo(() => {
    const src = (byDay[day] || { bills: [] }).bills;
    const m = {};
    src.forEach((o) => {
      const k = o.tableNo + "|" + (o.paidAt || o.placedAt);
      const b = (m[k] = m[k] || {
        key: k, tableNo: o.tableNo, at: o.paidAt || o.placedAt,
        method: o.payMethod, rounds: [], total: 0,
      });
      b.rounds.push(o);
      b.total += tableMoney([o]).grand;
    });
    return Object.values(m).sort((a, b) => b.at - a.at);
  }, [byDay, day]);

  const rounds = useMemo(
    () => [...(byDay[day] || { rounds: [] }).rounds].sort((a, b) => b.placedAt - a.placedAt),
    [byDay, day]
  );

  const dayTotal = bills.reduce((s, b) => s + b.total, 0);

  /* calendar grid, Monday-first, padded to whole weeks */
  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const pad = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out = Array.from({ length: pad }, () => null);
    for (let i = 1; i <= days; i++) out.push(new Date(month.getFullYear(), month.getMonth(), i));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const today = dayKey(Date.now());

  return (
    <>
      <PageHead t={t} title={t.historyTitle} sub={t.historySub}>
        <Stat label={t.revenue} value={jd(dayTotal)} unit="JD" />
      </PageHead>

      <div className="histwrap">
        <section className="panel cal">
          <div className="cal-head">
            <button className="cal-nav" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
            <b>{month.toLocaleDateString(loc, { month: "long", year: "numeric" })}</b>
            <button className="cal-nav" onClick={() => shift(1)} aria-label="Next month">›</button>
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (!d) return <span key={"p" + i} className="cal-pad" />;
              const k = dayKey(d.getTime());
              const has = byDay[k];
              return (
                <button
                  key={k}
                  className={"cal-day" + (k === day ? " cal-on" : "") + (k === today ? " cal-today" : "")}
                  onClick={() => { setDay(k); setOpen(null); }}
                >
                  <span>{d.getDate()}</span>
                  {has && <i className="cal-dot" />}
                </button>
              );
            })}
          </div>
          <p className="cal-note">{t.historyRetain}</p>
        </section>

        <section className="panel hist">
          <div className="hist-head">
            <b>{new Date(day + "T00:00:00").toLocaleDateString(loc, {
              weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b>
            <div className="chips">
              <button className={"chip" + (tab === "bills" ? " chip-on" : "")}
                onClick={() => setTab("bills")}>{t.bills} <b>{bills.length}</b></button>
              <button className={"chip" + (tab === "orders" ? " chip-on" : "")}
                onClick={() => setTab("orders")}>{t.ordersTab} <b>{rounds.length}</b></button>
            </div>
          </div>

          {tab === "bills" ? (
            !bills.length ? <p className="panel-empty">{t.noneThatDay}</p> : (
              <ul className="histlist">
                {bills.map((b) => (
                  <li key={b.key}>
                    <button className="histrow" onClick={() => setOpen(open === b.key ? null : b.key)}>
                      <span className="histrow-t">
                        <b>{t.table} {b.tableNo}</b>
                        <span>{new Date(b.at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
                          {" · "}{payLabel(t, b.method)}
                          {" · "}{b.rounds.length} {b.rounds.length === 1 ? t.round : t.rounds}</span>
                      </span>
                      <span className="mono histrow-v">{jd(b.total)} <i>JD</i></span>
                    </button>
                    {open === b.key && (
                      <div className="histdetail">
                        {b.rounds.map((o) => (
                          <div key={o.id} className="histround">
                            <span className="histround-h">{t.round} {o.round}</span>
                            {o.lines.map((l) => (
                              <div key={l.lineId} className="dline">
                                <span className="mono dline-q">{l.qty}×</span>
                                <span className="dline-n">
                                  {isAr ? byId[l.itemId].nameAr : byId[l.itemId].name}
                                  {l.mods.length > 0 && (
                                    <em>{l.mods.map((x) => (isAr ? x[1] : x[0])).join(" · ")}</em>
                                  )}
                                  {l.note && <em className="dline-note">“{l.note}”</em>}
                                </span>
                                <span className="mono dline-p">{jd(l.unit * l.qty)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : !rounds.length ? (
            <p className="panel-empty">{t.noneThatDay}</p>
          ) : (
            <ul className="histlist">
              {rounds.map((o) => (
                <li key={o.id}>
                  <button className="histrow" onClick={() => setOpen(open === o.id ? null : o.id)}>
                    <span className="histrow-t">
                      <b>{t.table} {o.tableNo} · {t.round} {o.round}</b>
                      <span>{new Date(o.placedAt).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
                        {" · "}{statusLabel(t, o.status)}
                        {o.paid ? " · " + payLabel(t, o.payMethod) : ""}</span>
                    </span>
                    <span className="mono histrow-v">{jd(tableMoney([o]).grand)} <i>JD</i></span>
                  </button>
                  {open === o.id && (
                    <div className="histdetail">
                      {o.lines.map((l) => (
                        <div key={l.lineId} className="dline">
                          <span className="mono dline-q">{l.qty}×</span>
                          <span className="dline-n">
                            {isAr ? byId[l.itemId].nameAr : byId[l.itemId].name}
                            {l.mods.length > 0 && (
                              <em>{l.mods.map((x) => (isAr ? x[1] : x[0])).join(" · ")}</em>
                            )}
                            {l.note && <em className="dline-note">“{l.note}”</em>}
                          </span>
                          <span className="mono dline-p">{jd(l.unit * l.qty)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/* ============================= REPORTS =============================== */

function Reports({ t, isAr, orders, now }) {
  const all = orders;
  const lines = all.flatMap((o) => o.lines);
  const revenue = money(all).grand;
  const tables = new Set(all.map((o) => o.tableNo)).size;

  const top = useMemo(() => {
    const m = {};
    lines.forEach((l) => { m[l.itemId] = (m[l.itemId] || 0) + l.qty; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [lines]);
  const topMax = top.length ? top[0][1] : 1;

  /* Promised vs actual is the metric only this system can measure: the
     guest was quoted a prep time on their phone, and we know when the
     ticket was bumped. Missing it is what generates complaints. */
  const timed = all.filter((o) => o.bumpedAt);
  const perf = timed.map((o) => ({
    o,
    promised: promisedSec(o),
    actual: (o.bumpedAt - o.placedAt) / 1000,
  }));
  const avgActual = perf.length ? perf.reduce((s, p) => s + p.actual, 0) / perf.length : 0;
  const onTimePct = perf.length
    ? Math.round((perf.filter((p) => p.actual <= p.promised + LATE_GRACE_SEC).length / perf.length) * 100)
    : 100;

  /* What actually came in, split by how it was taken. Cash and the Visa
     machine are counted at the table; CliQ and the phone tenders close
     themselves — same list either way, because both write the same key. */
  const collected = useMemo(() => {
    const m = {};
    all.filter((o) => o.paid).forEach((o) => {
      const k = o.payMethod || "—";
      const row = (m[k] = m[k] || { key: k, amount: 0, tables: new Set() });
      row.amount += tableMoney([o]).grand;
      row.tables.add(o.tableNo);
    });
    return Object.values(m)
      .map((r) => ({ ...r, tables: r.tables.size }))
      .sort((a, b) => b.amount - a.amount);
  }, [all]);
  const collectedTotal = collected.reduce((s, r) => s + r.amount, 0);

  const byStation = useMemo(() => {
    const m = {};
    lines.forEach((l) => { m[l.station] = (m[l.station] || 0) + l.qty; });
    const tot = Object.values(m).reduce((a, b) => a + b, 0) || 1;
    return STATIONS.map((s) => ({ ...s, n: m[s.id] || 0, pct: Math.round(((m[s.id] || 0) / tot) * 100) }));
  }, [lines]);

  return (
    <>
      <PageHead t={t} title={t.reportsTitle} sub={t.reportsSub} />

      <div className="cards4">
        <BigStat label={t.revenue} value={jd(revenue)} unit="JD" />
        <BigStat label={t.ticketsN} value={all.length} />
        <BigStat label={t.avgTicket} value={tables ? jd(revenue / tables) : "0.00"} unit="JD" />
        <BigStat label={t.avgPrep} value={clock(avgActual)}
          sub={`${onTimePct}% ${t.onTime}`} warn={onTimePct < 85} />
      </div>

      <div className="two">
        <section className="panel">
          <h3>{t.topItems}</h3>
          {!top.length && <p className="panel-empty">{t.noSales}</p>}
          <ul className="bars">
            {top.map(([id, n]) => (
              <li key={id}>
                <span className="bar-n">{isAr ? byId[id].nameAr : byId[id].name}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: (n / topMax) * 100 + "%" }} />
                </span>
                <b className="mono">{n}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>{t.station}</h3>
          <ul className="bars">
            {byStation.map((s) => (
              <li key={s.id}>
                <span className="bar-n">{isAr ? s.nameAr : s.name}</span>
                <span className="bar-track">
                  <span className="bar-fill bar-alt" style={{ width: s.pct + "%" }} />
                </span>
                <b className="mono">{s.n}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel">
        <h3>{t.collected}</h3>
        {!collected.length ? (
          <p className="panel-empty">{t.noPayments}</p>
        ) : (
          <div className="tablewrap">
            <table className="grid-t">
              <thead>
                <tr>
                  <th>{t.method}</th>
                  <th className="num">{t.tablesN}</th>
                  <th className="num">{t.amount}</th>
                  <th className="num">{t.today}</th>
                </tr>
              </thead>
              <tbody>
                {collected.map((r) => (
                  <tr key={r.key}>
                    <td><b>{payLabel(t, r.key)}</b></td>
                    <td className="num mono">{r.tables}</td>
                    <td className="num mono">{jd(r.amount)}</td>
                    <td className="num mono">
                      {collectedTotal ? Math.round((r.amount / collectedTotal) * 100) : 0}%
                    </td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td><b>{t.totalCollected}</b></td>
                  <td className="num mono">—</td>
                  <td className="num mono"><b>{jd(collectedTotal)}</b></td>
                  <td className="num mono">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>{t.promised} / {t.actual}</h3>
        {!perf.length ? <p className="panel-empty">{t.noTimings}</p> : (
        <div className="tablewrap">
          <table className="grid-t">
            <thead>
              <tr>
                <th>{t.table}</th><th>{t.round}</th>
                <th className="num">{t.promised}</th>
                <th className="num">{t.actual}</th>
                <th className="num">{t.onTime}</th>
              </tr>
            </thead>
            <tbody>
              {perf.slice(0, 8).map((p) => {
                const ok = p.actual <= p.promised + LATE_GRACE_SEC;
                return (
                  <tr key={p.o.id}>
                    <td><b>{p.o.tableNo}</b></td>
                    <td>{p.o.round}</td>
                    <td className="num mono">{clock(p.promised)}</td>
                    <td className="num mono">{clock(p.actual)}</td>
                    <td className="num">
                      <span className={"dotres " + (ok ? "dotres-ok" : "dotres-no")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </>
  );
}

function BigStat({ label, value, unit, sub, warn }) {
  return (
    <div className="bigstat">
      <span className="bigstat-l">{label}</span>
      <b className="mono">{value}{unit && <i> {unit}</i>}</b>
      {sub && <span className={"bigstat-s" + (warn ? " bigstat-warn" : "")}>{sub}</span>}
    </div>
  );
}

/* =============================== TEAM ================================ */

const PERM_LABELS = [
  ["floor", "See the floor", "متابعة الصالة"],
  ["kds", "Work the kitchen screen", "استخدام شاشة المطبخ"],
  ["eightysix", "Take a dish off the menu", "إيقاف صنف من المنيو"],
  ["close", "Close a table", "إغلاق طاولة"],
  ["price", "Change prices", "تعديل الأسعار"],
  ["reports", "See reports", "عرض التقارير"],
  ["history", "See past bills", "الاطلاع على الفواتير السابقة"],
  ["team", "Manage the team", "إدارة الفريق"],
  ["settings", "Change settings", "تعديل الإعدادات"],
];

function Team({ t, isAr, roleId, perms, canEdit, onToggle }) {
  return (
    <>
      <PageHead t={t} title={t.teamTitle} sub={t.teamSub}>
        {canEdit && <span className="head-hint">{t.permHint}</span>}
      </PageHead>
      <div className="tablewrap">
        <table className="grid-t matrix">
          <thead>
            <tr>
              <th>{t.permissions}</th>
              {ROLES.map((r) => (
                <th key={r.id} className={"num" + (r.id === roleId ? " col-me" : "")}>
                  {isAr ? r.nameAr : r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_LABELS.map(([key, en, ar]) => (
              <tr key={key}>
                <td><b>{isAr ? ar : en}</b></td>
                {ROLES.map((r) => {
                  const on = (perms[r.id] || []).includes(key);
                  /* an owner who revokes their own settings access can never
                     get it back — that one cell stays fixed */
                  const locked = r.id === "owner" && (key === "team" || key === "settings");
                  return (
                    <td key={r.id} className={"num" + (r.id === roleId ? " col-me" : "")}>
                      {canEdit && !locked ? (
                        <button
                          className={"permcell" + (on ? " permcell-on" : "")}
                          onClick={() => onToggle(r.id, key)}
                          aria-pressed={on}
                          title={(isAr ? r.nameAr : r.name) + " — " + (isAr ? ar : en)}
                        >
                          {on ? "✓" : "—"}
                        </button>
                      ) : on ? (
                        <span className="yes">✓</span>
                      ) : (
                        <span className="no">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="people">
        {ROLES.map((r) => (
          <article key={r.id} className={"person" + (r.id === roleId ? " person-me" : "")}>
            <span className="avatar avatar-lg">{(isAr ? r.whoAr : r.who).slice(0, 1)}</span>
            <div>
              <b>{isAr ? r.whoAr : r.who}</b>
              <span>{isAr ? r.nameAr : r.name}</span>
            </div>
            <span className="person-branch">{isAr ? "كل الفروع" : "All branches"}</span>
          </article>
        ))}
      </div>
    </>
  );
}

/* ============================= SETTINGS ============================== */

const ADAPTERS = [
  { id: "noop", name: "Leaf standalone", nameAr: "ليف بشكل مستقل", state: "connected",
    desc: "Orders print to the kitchen and live on this screen. No POS involved.",
    descAr: "الطلبات بتطبع في المطبخ وبتظهر على هذي الشاشة. بدون نظام كاشير." },
  { id: "foodics", name: "Foodics", nameAr: "فودكس", state: "available",
    desc: "Two-way: menu and tables pull in, orders and closes push out.",
    descAr: "باتجاهين: المنيو والطاولات بتنسحب، والطلبات والإغلاقات بتنرسل." },
  { id: "odoo", name: "Odoo POS", nameAr: "أودو", state: "available",
    desc: "Same contract as Foodics, through the Odoo REST layer.",
    descAr: "نفس التكامل، عبر واجهة أودو." },
  { id: "micros", name: "Oracle Micros / Simphony", nameAr: "أوراكل مايكروس", state: "request",
    desc: "On-premise. Needs a small sync agent on the restaurant's network.",
    descAr: "نظام محلي. بحتاج برنامج مزامنة صغير على شبكة المطعم." },
];

/* Clearing a service is the one irreversible thing in the back office, so
   it asks twice and disarms itself if the second press never comes. */
function ClearDay({ t, store }) {
  const [armed, setArmed] = useState(false);
  const [going, setGoing] = useState(false);
  const empty = store.orders.length === 0;

  useEffect(() => {
    if (!armed) return;
    const i = setTimeout(() => setArmed(false), 12000);
    return () => clearTimeout(i);
  }, [armed]);

  return (
    <section className="panel panel-danger">
      <h3>{t.clearTitle}</h3>
      <p className="panel-sub">{t.clearSub}</p>
      {empty ? (
        <p className="panel-empty">{t.clearNone}</p>
      ) : !armed ? (
        <button className="btn-danger" onClick={() => setArmed(true)} disabled={going}>
          {t.clearBtn}
        </button>
      ) : (
        <div className="danger-row">
          <button
            className="btn-danger btn-danger-on"
            disabled={going}
            onClick={() => { setGoing(true); store.clearDay(); }}
          >
            {going ? t.clearOn : t.clearConfirm}
          </button>
          <button className="btn-quiet" onClick={() => setArmed(false)} disabled={going}>
            {t.clearCancel}
          </button>
        </div>
      )}
    </section>
  );
}

/* Charges only bind rounds sent after they change — every round carries the
   rates it was quoted under, so nothing already ordered is repriced. */
function Charges({ t, store, canEdit }) {
  const cfg = store.config;
  const [draft, setDraft] = useState(null);   // null = not editing
  const d = draft ?? {
    service: Math.round(cfg.service * 1000) / 10,
    tax: Math.round(cfg.tax * 1000) / 10,
    editWindow: cfg.editWindow,
  };

  const set = (k, v) => setDraft({ ...d, [k]: v });
  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

  const save = () => {
    store.setConfig({
      service: num(d.service, 0, 100) / 100,
      tax: num(d.tax, 0, 100) / 100,
      editWindow: Math.round(num(d.editWindow, 0, 900)),
    });
    setDraft(null);
  };

  return (
    <section className="panel">
      <h3>{t.ratesTitle}</h3>
      {canEdit ? (
        <>
          <ul className="kv kv-edit">
            <li>
              <span>{t.service}</span>
              <span className="field">
                <input type="number" min="0" max="100" step="0.5" value={d.service}
                  onChange={(e) => set("service", e.target.value)} />
                <i>%</i>
              </span>
            </li>
            <li>
              <span>{t.tax}</span>
              <span className="field">
                <input type="number" min="0" max="100" step="0.5" value={d.tax}
                  onChange={(e) => set("tax", e.target.value)} />
                <i>%</i>
              </span>
            </li>
            <li>
              <span>{t.editWindow}</span>
              <span className="field">
                <input type="number" min="0" max="900" step="5" value={d.editWindow}
                  onChange={(e) => set("editWindow", e.target.value)} />
                <i>{t.seconds}</i>
              </span>
            </li>
          </ul>
          <p className="panel-empty">{t.ratesNote}</p>
          {draft && (
            <div className="danger-row" style={{ marginTop: 11 }}>
              <button className="btn-save" onClick={save}>{t.save}</button>
              <button className="btn-quiet" onClick={() => setDraft(null)}>{t.cancel}</button>
            </div>
          )}
        </>
      ) : (
        <ul className="kv">
          <li><span>{t.service}</span><b className="mono">{Math.round(cfg.service * 1000) / 10}%</b></li>
          <li><span>{t.tax}</span><b className="mono">{Math.round(cfg.tax * 1000) / 10}%</b></li>
          <li><span>{t.editWindow}</span><b className="mono">{cfg.editWindow} {t.seconds}</b></li>
        </ul>
      )}
    </section>
  );
}

/* PINs are stored hashed, so they can be set but never read back — the
   only way out of a forgotten PIN is to set a new one. */
function StaffPins({ t, isAr, store }) {
  const [draft, setDraft] = useState({});
  const [done, setDone] = useState(null);
  const staff = store.config.staff || DEFAULT_CONFIG.staff;

  const save = (roleId) => {
    const pin = (draft[roleId] || "").trim();
    if (pin.length < 4) return;
    store.setConfig({ staff: { ...staff, [roleId]: pinHash(pin) } });
    setDraft({ ...draft, [roleId]: "" });
    setDone(roleId);
    setTimeout(() => setDone(null), 2000);
  };

  return (
    <section className="panel">
      <h3>{t.pinsTitle}</h3>
      <p className="panel-sub">{t.pinsSub}</p>
      <ul className="kv kv-edit">
        {ROLES.map((r) => (
          <li key={r.id}>
            <span>
              {isAr ? r.nameAr : r.name}
              {DEFAULT_CONFIG.staff[r.id] === staff[r.id] && (
                <em className="pin-default"> · {t.pinDefault} {DEFAULT_PINS[r.id]}</em>
              )}
            </span>
            <span className="field">
              <input type="password" inputMode="numeric" maxLength={8} placeholder="••••"
                value={draft[r.id] || ""}
                onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value.replace(/\D/g, "") })} />
              <button className="btn-quiet pin-save" onClick={() => save(r.id)}
                disabled={(draft[r.id] || "").length < 4}>
                {done === r.id ? t.saved : t.save}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="panel-empty">{t.pinsWarn}</p>
    </section>
  );
}

function Settings({ t, isAr, store, canEdit }) {
  return (
    <>
      <PageHead t={t} title={t.settingsTitle} sub={t.settingsSub} />

      <section className="panel">
        <h3>{t.posTitle}</h3>
        <p className="panel-sub">{t.posSub}</p>
        <div className="adapters">
          {ADAPTERS.map((a) => (
            <article key={a.id} className={"adapter ad-" + a.state}>
              <div className="ad-head">
                <b>{isAr ? a.nameAr : a.name}</b>
                <span className={"ad-pill ad-pill-" + a.state}>
                  {a.state === "connected" ? t.connected : a.state === "available" ? t.availableNow : t.onRequest}
                </span>
              </div>
              <p>{isAr ? a.descAr : a.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="two">
        <Charges t={t} store={store} canEdit={canEdit} />

        <section className="panel">
          <h3>{t.complianceTitle}</h3>
          <div className="compliance">
            <div className="comp-head">
              <b>{t.jofotara}</b>
              <span className="ad-pill ad-pill-request">{t.verify}</span>
            </div>
            <p>{t.jofotaraNote}</p>
          </div>
        </section>
      </div>

      <section className="panel">
        <h3>{t.activity}</h3>
        {store.log.length === 0 ? (
          <p className="side-empty">{t.nothingYet}</p>
        ) : (
          <ul className="logs">
            {store.log.map((l) => (
              <li key={l.id}>
                <span className="mono">
                  {new Date(l.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {l.msg}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && <StaffPins t={t} isAr={isAr} store={store} />}

      <ClearDay t={t} store={store} />
    </>
  );
}

/* =============================== CSS ================================= */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

html,body,#root{margin:0;padding:0;height:100%;background:#071D1B}

.bo{
  --ink:#071D1B; --panel:#0E2A27; --panel2:#153B36; --raise:#1B4740;
  --paper:#EDEFE6; --muted:#8CA69D;
  --line:rgba(237,239,230,.10); --line2:rgba(237,239,230,.18); --line-solid:#2C4F49;
  --sumac:#E05B3C; --brass:#E3A33C; --mint:#4FC08D; --bone:#DCE3D5;
  position:fixed; inset:0; display:flex;
  background:var(--ink); color:var(--paper);
  font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased; font-size:14px;
}
.bo *{box-sizing:border-box}
.bo h1,.bo h2,.bo h3{font-family:'Bricolage Grotesque','IBM Plex Sans Arabic',sans-serif;margin:0;letter-spacing:-.02em}
.bo[dir="rtl"] h1,.bo[dir="rtl"] h2,.bo[dir="rtl"] h3{font-family:'IBM Plex Sans Arabic',sans-serif}
.bo :where(button){font:inherit;cursor:pointer;border:none;background:none;color:inherit;padding:0}
.bo :where(select,input){font:inherit;color:inherit}
.bo button:focus-visible,.bo select:focus-visible,.bo input:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
.mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.bo i{font-style:normal}

/* ------------------------------- rail -------------------------------- */
.rail{width:228px;flex-shrink:0;background:var(--panel);border-inline-end:1px solid var(--line);
  display:flex;flex-direction:column;z-index:60}
.rail-brand{display:flex;align-items:center;gap:10px;padding:16px 16px 14px}
.rail-mark{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;
  background:linear-gradient(140deg,#146639,#2FBE79)}
.rail-brand b{display:block;font-family:'Bricolage Grotesque',sans-serif;font-size:16px;font-weight:800;letter-spacing:-.02em}
/* scoped to the text block: an unscoped .rail-brand span also caught the
   logo tile and forced it back to display:block, dropping the leaf into
   the corner instead of centring it */
.rail-brand>div span{display:block;font-size:10.5px;color:var(--muted);letter-spacing:.03em}

.rail-nav{padding:6px 10px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;flex:1}
.rail-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:9px;
  font-size:13.5px;color:var(--muted);transition:background .13s,color .13s;text-align:start}
.rail-item:hover{background:rgba(237,239,230,.05);color:var(--paper)}
.rail-on{background:var(--raise);color:var(--paper);font-weight:600}
.rail-on svg{color:var(--mint)}
.rail-count{margin-inline-start:auto;background:var(--sumac);color:#fff;font-size:10.5px;font-weight:600;
  min-width:19px;height:19px;border-radius:99px;display:grid;place-items:center;padding:0 5px}

.rail-foot{padding:12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.whoami{display:flex;align-items:center;gap:9px}
.avatar{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;
  background:var(--raise);color:var(--mint);font-weight:700;font-size:13px}
.avatar-lg{width:38px;height:38px;font-size:15px}
.whoami b{display:block;font-size:12.5px}
.whoami>div span{display:block;font-size:11px;color:var(--muted)}
.rolepick{display:flex;flex-direction:column;gap:4px}
.rolepick>span{font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.rolepick select{background:var(--panel2);border:1px solid var(--line2);border-radius:8px;
  padding:7px 9px;font-size:12.5px;width:100%}
.rolepick-top{flex-direction:row}
.rolepick-top select{width:auto}

/* ------------------------------- top --------------------------------- */
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.top{height:54px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:0 18px;
  border-bottom:1px solid var(--line);background:var(--panel)}
.kiosk-brand{display:flex;align-items:center;gap:8px;font-family:'Bricolage Grotesque',sans-serif;
  font-size:15px;font-weight:800}
.branchpick{display:flex;align-items:center;gap:7px;color:var(--muted);
  background:var(--panel2);border:1px solid var(--line);border-radius:99px;padding:5px 12px}
.branchpick select{background:none;border:none;font-size:12.5px;color:var(--paper)}
.branchpick select:disabled{opacity:.5}
.livedot{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase}
.livedot i{width:6px;height:6px;border-radius:50%;background:var(--mint);animation:beat 2s infinite}
.livedot-connecting i,.livedot-error i{background:var(--brass);animation:none}
.livedot-error i{background:var(--sumac)}
.modetag{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);
  border:1px solid var(--line2);border-radius:99px;padding:2px 9px}
@keyframes beat{0%,100%{box-shadow:0 0 0 0 rgba(79,192,141,.5)}50%{box-shadow:0 0 0 5px rgba(79,192,141,0)}}
.top-right{margin-inline-start:auto;display:flex;align-items:center;gap:10px}
.clock{font-size:14px;font-weight:500;color:var(--bone)}
.langbtn{width:30px;height:30px;border-radius:8px;background:var(--panel2);border:1px solid var(--line2);
  font-size:12px;font-weight:600}
.burger{width:30px;height:26px;display:none;flex-direction:column;justify-content:center;gap:4px}
.burger span{display:block;height:1.8px;background:var(--paper);border-radius:2px}

.stage{flex:1;overflow-y:auto;padding:22px 24px 40px}
.stage-kds{padding:0;overflow:hidden;display:flex}

/* ----------------------------- page head ----------------------------- */
.phead{display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:20px}
.phead h1{font-size:24px;font-weight:800}
.phead p{margin:5px 0 0;font-size:13px;color:var(--muted);max-width:56ch;line-height:1.5}
.phead-stats{margin-inline-start:auto;display:flex;gap:10px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:9px 15px;min-width:104px}
.stat span{display:block;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.stat b{display:block;font-size:19px;font-weight:600;margin-top:3px}
.stat i{font-size:11px;color:var(--muted)}

/* ================================ KDS ================================ */
.kds{flex:1;display:flex;flex-direction:column;min-width:0}
.kds-bar{flex-shrink:0;display:flex;align-items:center;gap:12px;padding:11px 18px;
  border-bottom:1px solid var(--line);background:var(--panel);overflow-x:auto;scrollbar-width:none}
.kds-bar::-webkit-scrollbar{display:none}
.stations{display:flex;gap:6px}
.stn{display:flex;align-items:center;gap:7px;white-space:nowrap;font-size:13px;padding:7px 13px;
  border-radius:99px;border:1px solid var(--line2);color:var(--muted);transition:all .13s}
.stn:hover{color:var(--paper);border-color:var(--line-solid)}
.stn em{font-style:normal;font-size:11px;background:rgba(237,239,230,.1);border-radius:99px;
  min-width:18px;padding:1px 5px;text-align:center}
.stn-on{background:var(--paper);color:var(--ink);border-color:var(--paper);font-weight:600}
.stn-on em{background:rgba(7,29,27,.14)}
.recall{margin-inline-start:auto;white-space:nowrap;font-size:12.5px;padding:7px 14px;border-radius:99px;
  border:1px solid var(--brass);color:var(--brass)}
.recall:hover{background:rgba(227,163,60,.12)}

.kds-body{flex:1;display:flex;min-height:0}
.tickets{flex:1;min-width:0;overflow-y:auto;padding:16px;
  display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:14px;align-content:start}

/* ---- the ticket: age drives colour, nothing else does ---- */
.tk{background:var(--panel);border:1px solid var(--line-solid);border-radius:13px;overflow:hidden;
  display:flex;flex-direction:column;border-top:3px solid var(--bone)}
.tk-cool{border-top-color:var(--bone)}
.tk-close{border-top-color:var(--brass)}
.tk-late{border-top-color:var(--sumac);box-shadow:0 0 0 1px rgba(224,91,60,.35)}
.tk-wet{border-top-color:var(--line-solid);
  background-image:repeating-linear-gradient(135deg,rgba(237,239,230,.035) 0 9px,transparent 9px 18px)}
.tk-fresh{animation:land .5s cubic-bezier(.2,.9,.3,1)}
@keyframes land{from{transform:translateY(-7px) scale(.985);opacity:0}to{transform:none;opacity:1}}

.tk-head{display:flex;align-items:baseline;gap:10px;padding:11px 13px 8px}
.tk-id{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.tk-id b{font-family:'Bricolage Grotesque',sans-serif;font-size:16px;font-weight:800}
.tk-round{font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--brass);
  border:1px solid rgba(227,163,60,.4);border-radius:99px;padding:1px 7px}
.tk-age{margin-inline-start:auto;font-size:17px;font-weight:500;color:var(--bone)}
.tk-late .tk-age{color:var(--sumac)}
.tk-close .tk-age{color:var(--brass)}

.tk-meter{height:2px;background:rgba(237,239,230,.08);margin:0 13px}
.tk-meter-fill{display:block;height:100%;background:var(--bone);transition:width 1s linear}
.tk-close .tk-meter-fill{background:var(--brass)}
.tk-late .tk-meter-fill{background:var(--sumac)}

.tk-sub{display:flex;justify-content:space-between;padding:6px 13px 9px;font-size:11px;color:var(--muted)}
.tk-overdue{color:var(--sumac);font-weight:600}
.tk-prog{opacity:.75}

.tk-hold{margin:0 13px 9px;font-size:10.5px;line-height:1.45;color:var(--brass);
  background:rgba(227,163,60,.1);border:1px dashed rgba(227,163,60,.42);border-radius:8px;padding:6px 9px}

.tk-lines{list-style:none;margin:0;padding:0 0 4px;flex:1}
.tkl{border-top:1px solid var(--line)}
.tkl-hit{display:flex;align-items:flex-start;gap:10px;width:100%;padding:9px 13px;text-align:start;
  transition:background .12s}
.tkl-hit:hover{background:rgba(237,239,230,.045)}
.tkl-q{flex-shrink:0;min-width:22px;height:22px;border-radius:6px;background:var(--raise);
  color:var(--mint);font-size:12px;font-weight:600;display:grid;place-items:center}
.tkl-body{flex:1;min-width:0}
.tkl-n{display:block;font-size:14px;font-weight:500;line-height:1.3}
.tkl-mods{display:block;font-size:11px;color:var(--brass);margin-top:2px;line-height:1.35}
.tkl-check{flex-shrink:0;width:19px;height:19px;border-radius:5px;border:1.5px solid var(--line-solid);
  color:transparent;font-size:12px;display:grid;place-items:center;transition:all .13s}
.tkl-done .tkl-check{background:var(--mint);border-color:var(--mint);color:var(--ink)}
.tkl-done .tkl-n{text-decoration:line-through;opacity:.4}
.tkl-done .tkl-mods{opacity:.3}
.tkl-done .tkl-q{background:rgba(237,239,230,.06);color:var(--muted)}
/* a guest instruction on a dish is a safety line as often as a preference,
   so it reads in the alert colour rather than as another modifier */
.tkl-note{display:block;margin-top:3px;font-size:11.5px;line-height:1.4;color:var(--sumac);font-style:italic}
.tkl-done .tkl-note{opacity:.3}

.tk-note{margin:0 13px 10px;font-size:11.5px;line-height:1.45;color:var(--sumac);
  background:rgba(224,91,60,.1);border-inline-start:2px solid var(--sumac);border-radius:0 7px 7px 0;padding:7px 9px}
.tk-bump{padding:12px;font-size:13.5px;font-weight:600;background:var(--raise);color:var(--paper);
  border-top:1px solid var(--line);transition:background .13s}
.tk-bump:hover:not(:disabled){background:var(--mint);color:var(--ink)}
.tk-bump:disabled{cursor:not-allowed;color:var(--muted);background:transparent;font-weight:400;font-size:12px}

/* ---- side: all day + pass ---- */
.kds-side{width:280px;flex-shrink:0;border-inline-start:1px solid var(--line);background:var(--panel);
  overflow-y:auto;display:flex;flex-direction:column}
.side-head{padding:13px 15px 9px}
.side-head h3{font-size:13px;letter-spacing:.04em;text-transform:uppercase}
.side-head span{display:block;font-size:10.5px;color:var(--muted);margin-top:3px;line-height:1.4}
.side-empty{margin:0;padding:0 15px 15px;color:var(--muted);font-size:12px}
.allday{border-bottom:1px solid var(--line)}
.allday-list{list-style:none;margin:0;padding:0 8px 12px}
.allday-list li{display:flex;align-items:center;gap:10px;padding:6px 7px;border-radius:8px}
.allday-list li:hover{background:rgba(237,239,230,.045)}
.allday-list b{font-size:17px;font-weight:600;min-width:26px;color:var(--bone)}
.allday-list span{flex:1;font-size:13px;line-height:1.25}
/* the dish name yields before this does — a word is wider than "86" was,
   and it must stay on one line to keep the row height steady */
.mini86{opacity:0;flex-shrink:0;white-space:nowrap;font-size:10px;font-weight:600;letter-spacing:.03em;
  padding:3px 7px;border-radius:6px;
  border:1px solid rgba(224,91,60,.45);color:var(--sumac);transition:opacity .13s}
.allday-list li:hover .mini86{opacity:1}
.mini86:hover{background:rgba(224,91,60,.15)}
.pass-list{list-style:none;margin:0;padding:0 8px 14px}
.pass-list li{display:flex;align-items:center;gap:8px;padding:8px 7px;border-radius:8px;
  border-bottom:1px solid var(--line)}
.pass-list li>div:first-child{flex:1}
.pass-list b{display:block;font-size:13px}
.pass-list span{font-size:11px;color:var(--mint)}
.pass-act{display:flex;gap:5px}
.pass-act button{font-size:11px;padding:5px 9px;border-radius:7px;border:1px solid var(--line2);color:var(--muted)}
.pass-act button:hover{color:var(--paper);border-color:var(--line-solid)}
.pass-served{color:var(--mint) !important;border-color:rgba(79,192,141,.45) !important}

/* ============================== FLOOR ================================ */
.floorgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px}
.tbl{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:13px;
  display:flex;flex-direction:column;gap:4px;text-align:start;cursor:pointer;
  transition:transform .13s,border-color .13s}
.tbl:hover{transform:translateY(-2px);border-color:var(--line-solid)}
.tbl:focus-visible{outline:2px solid var(--paper);outline-offset:2px}
.tbl-top{display:flex;align-items:center;justify-content:space-between}
.tbl-top b{font-family:'Bricolage Grotesque',sans-serif;font-size:22px;font-weight:800;line-height:1}
.tbl-pin{width:8px;height:8px;border-radius:50%;background:var(--line-solid)}
.tbl-pin-ordering{background:var(--brass)}
.tbl-pin-inKitchen{background:var(--sumac)}
.tbl-pin-ready{background:var(--mint);box-shadow:0 0 0 3px rgba(79,192,141,.22)}
.tbl-pin-eating{background:var(--line-solid)}
.tbl-pin-closed{background:var(--line-solid)}
.tbl-state{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.tbl-money{font-size:16px;font-weight:600;margin-top:2px}
.tbl-money i{font-size:10px;color:var(--muted)}
.tbl-meta{font-size:11px;color:var(--muted)}
.tbl-quiet{opacity:.6}
.tbl-ordering{border-color:rgba(227,163,60,.35)}
.tbl-inKitchen{border-color:rgba(224,91,60,.32)}
.tbl-ready{border-color:rgba(79,192,141,.45)}
.tbl-calling{border-color:var(--brass);box-shadow:0 0 0 1px rgba(227,163,60,.4)}
.tbl-bell{font-size:13px;animation:beat 1.4s infinite}
/* the call block sits between the state and the money so a waiter can take
   the table without opening it — the tile itself still opens the drawer */
.tbl-call{display:flex;flex-direction:column;gap:6px;margin:6px 0 2px;padding:7px 8px;
  border-radius:9px;background:rgba(227,163,60,.12);border:1px solid rgba(227,163,60,.3)}
.tbl-call-t{font-size:10.5px;line-height:1.3;color:var(--brass);text-align:start}
.tbl-answer{align-self:stretch;padding:7px;border-radius:7px;font-size:11.5px;font-weight:600;
  background:var(--brass);color:var(--ink);transition:filter .13s}
.tbl-answer:hover{filter:brightness(1.08)}
.tbl-answer:focus-visible{outline:2px solid var(--paper);outline-offset:2px}
/* mint, matching the ready pin and the kitchen's pass rail — the same
   state seen from the dining room instead of the line */
.tbl-run{display:flex;flex-direction:column;gap:6px;margin:6px 0 2px;padding:7px 8px;
  border-radius:9px;background:rgba(79,192,141,.12);border:1px solid rgba(79,192,141,.32)}
.tbl-run-t{font-size:10.5px;line-height:1.3;color:var(--mint);text-align:start}
.tbl-served{align-self:stretch;padding:7px;border-radius:7px;font-size:11.5px;font-weight:600;
  background:var(--mint);color:var(--ink);transition:filter .13s}
.tbl-served:hover{filter:brightness(1.08)}
.tbl-served:focus-visible{outline:2px solid var(--paper);outline-offset:2px}
.drow-served{padding:4px 10px;border-radius:7px;font-size:11px;font-weight:600;
  background:var(--mint);color:var(--ink);transition:filter .13s}
.drow-served:hover{filter:brightness(1.08)}
/* cash waiting to be collected — the only payment a human still handles */
.tbl-pay{display:flex;flex-direction:column;gap:6px;margin:6px 0 2px;padding:7px 8px;
  border-radius:9px;background:rgba(237,239,230,.07);border:1px solid var(--line2)}
.tbl-pay-t{font-size:10.5px;line-height:1.3;color:var(--bone);text-align:start}
.tbl-take{align-self:stretch;padding:7px;border-radius:7px;font-size:11.5px;font-weight:600;
  background:var(--paper);color:var(--ink);transition:filter .13s}
.tbl-take:hover{filter:brightness(1.06)}
.tbl-take:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
.tbl-ready .tbl-state{color:var(--mint)}
.tbl-free{opacity:.62}

/* ----------------------------- drawer -------------------------------- */
.drawer-wrap{position:fixed;inset:0;background:rgba(4,16,15,.62);z-index:90;display:flex;
  justify-content:flex-end;animation:fade .16s}
@keyframes fade{from{opacity:0}to{opacity:1}}
.bo[dir="rtl"] .drawer-wrap{justify-content:flex-start}
.drawer{width:min(420px,100%);background:var(--panel);display:flex;flex-direction:column;
  border-inline-start:1px solid var(--line-solid);animation:slidein .2s cubic-bezier(.2,.9,.3,1)}
@keyframes slidein{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}
.drawer-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}
.drawer-head h2{font-size:19px;font-weight:800}
.drawer-head span{font-size:11.5px;color:var(--muted)}
.drawer-x{margin-inline-start:auto;width:30px;height:30px;border-radius:8px;font-size:19px;color:var(--muted)}
.drawer-x:hover{background:rgba(237,239,230,.07);color:var(--paper)}
.drawer-body{flex:1;overflow-y:auto;padding:14px 18px}
.drow{margin-bottom:16px}
.drow-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.drow-head b{font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.drow-age{margin-inline-start:auto;font-size:11.5px;color:var(--muted)}
.pill{font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:99px;
  border:1px solid var(--line2);color:var(--muted)}
.pill-new{color:var(--brass);border-color:rgba(227,163,60,.4)}
.pill-firing{color:var(--sumac);border-color:rgba(224,91,60,.4)}
.pill-ready{color:var(--mint);border-color:rgba(79,192,141,.4)}
.dline{display:flex;align-items:flex-start;gap:9px;padding:5px 0}
.dline-q{color:var(--muted);font-size:12px;min-width:22px}
.dline-n{flex:1;font-size:13.5px;line-height:1.35}
.dline-n em{display:block;font-style:normal;font-size:11px;color:var(--brass);margin-top:1px}
.dline-p{font-size:13px}
.dnote{margin:6px 0 0;font-size:11.5px;color:var(--sumac);font-style:italic}
.dline-note{display:block;color:var(--sumac)}
.dtotals{border-top:1px solid var(--line);padding-top:11px;margin-top:4px}
.trow{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:var(--muted)}
.trow i{font-size:10px}
.trow-big{color:var(--paper);font-size:17px;font-weight:600;border-top:1px solid var(--line);
  margin-top:7px;padding-top:10px}
.drawer-foot{padding:14px 18px;border-top:1px solid var(--line)}
.btn-primary{width:100%;padding:13px;border-radius:11px;background:var(--paper);color:var(--ink);
  font-weight:600;font-size:14px}
.btn-primary:hover{background:#fff}
.closeas{margin:0 0 9px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.closebtns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
.closebtns button{padding:11px 6px;border-radius:10px;border:1px solid var(--line2);font-size:12.5px}
.closebtns button:hover{border-color:var(--mint);color:var(--mint)}
.closenote{margin:11px 0 0;font-size:10.5px;line-height:1.5;color:var(--muted)}

/* ============================ TABLES / MENU ========================== */
.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.search{background:var(--panel);border:1px solid var(--line2);border-radius:9px;padding:9px 13px;
  font-size:13px;min-width:210px}
.search::placeholder{color:var(--muted)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:12.5px;padding:6px 13px;border-radius:99px;border:1px solid var(--line2);color:var(--muted)}
.chip:hover{color:var(--paper)}
.chip-on{background:var(--paper);color:var(--ink);border-color:var(--paper);font-weight:600}

.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:13px;background:var(--panel)}
.grid-t{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}
.grid-t th{text-align:start;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
  font-weight:500;padding:11px 14px;border-bottom:1px solid var(--line)}
.grid-t td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.grid-t tbody tr:last-child td{border-bottom:none}
.grid-t tbody tr:hover{background:rgba(237,239,230,.03)}
.grid-t .num{text-align:end}
.bo[dir="rtl"] .grid-t .num{text-align:start}
.grid-t td b{font-size:13.5px;font-weight:500;display:block}
.grid-t td em{font-style:normal;font-size:11px;color:var(--muted)}
.row-off{opacity:.45}
.stn-tag{font-size:10.5px;letter-spacing:.04em;padding:2px 8px;border-radius:99px;
  border:1px solid var(--line2);color:var(--muted)}
.tog{width:40px;height:23px;border-radius:99px;background:rgba(237,239,230,.1);position:relative;
  border:1px solid var(--line2);transition:background .15s}
.tog span{position:absolute;top:2px;inset-inline-start:2px;width:17px;height:17px;border-radius:50%;
  background:var(--muted);transition:transform .16s,background .16s}
.tog-on{background:rgba(79,192,141,.22);border-color:rgba(79,192,141,.5)}
.tog-on span{background:var(--mint);transform:translateX(17px)}
.bo[dir="rtl"] .tog-on span{transform:translateX(-17px)}
.tog:disabled{opacity:.4;cursor:not-allowed}

.qrgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(184px,1fr));gap:13px}
.qrcard{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:15px;
  display:flex;flex-direction:column;align-items:center;gap:11px;text-align:center}
.qr{border-radius:6px;flex-shrink:0}
.qr-meta b{display:block;font-size:14px}
.qr-meta span{display:block;font-size:11px;color:var(--muted);margin-top:2px}
.qr-seats{font-size:11px}
.qr-busy{display:inline-block;margin-top:5px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--brass);border:1px solid rgba(227,163,60,.4);border-radius:99px;padding:1px 8px}
.row-total td{border-top:1px solid var(--line2);color:var(--paper)}

/* ------------------------------ sign in ------------------------------ */
/* the palette lives on .bo, and this screen renders outside it — so it
   carries its own copy rather than inheriting black-on-black */
.signin{
  --ink:#071D1B; --panel:#0E2A27; --panel2:#153B36; --raise:#1B4740;
  --paper:#EDEFE6; --muted:#8CA69D;
  --line:rgba(237,239,230,.10); --line2:rgba(237,239,230,.18); --line-solid:#2C4F49;
  --sumac:#E05B3C; --brass:#E3A33C; --mint:#4FC08D; --bone:#DCE3D5;
  position:fixed;inset:0;display:grid;place-items:center;padding:20px;
  background:radial-gradient(120% 90% at 50% -10%,#123f37,#071D1B 62%);
  color:var(--paper);font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;font-size:14px}
.signin button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
.signin-card{width:min(330px,100%);display:flex;flex-direction:column;align-items:center;
  padding:30px 26px 22px;border-radius:20px;background:var(--panel);
  border:1px solid var(--line);box-shadow:0 26px 70px rgba(0,0,0,.42)}
.signin-bad{animation:nope .34s}
@keyframes nope{
  0%,100%{transform:translateX(0)} 20%{transform:translateX(-7px)}
  45%{transform:translateX(6px)} 70%{transform:translateX(-3px)}}
.signin-mark{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;
  background:linear-gradient(140deg,#146639,#2FBE79)}
.signin h1{font-family:'Bricolage Grotesque',sans-serif;font-size:23px;font-weight:800;
  letter-spacing:-.02em;margin:12px 0 3px}
.signin p{margin:0;font-size:12.5px;color:var(--muted)}
.signin-dots{display:flex;gap:11px;margin:20px 0 4px}
.signin-dots i{width:11px;height:11px;border-radius:50%;background:transparent;
  border:1.5px solid var(--line-solid);transition:all .14s}
.signin-dots i.on{background:var(--mint);border-color:var(--mint)}
.signin-err{margin-top:9px;font-size:12px;color:var(--sumac)}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:20px;width:100%}
.pad button{height:52px;border-radius:13px;font-family:'IBM Plex Mono',monospace;font-size:19px;
  background:var(--panel2);color:var(--paper);border:1px solid var(--line);transition:all .1s}
.pad button:hover{background:var(--raise)}
.pad button:active{transform:scale(.96)}
.pad-ghost{font-family:inherit !important;font-size:12.5px !important;color:var(--muted) !important;
  background:transparent !important}
.signin-lang{margin-top:16px;font-size:12px;color:var(--muted)}
.signin-lang:hover{color:var(--paper)}
.btn-quiet.signout{width:100%;margin-top:2px}
.btn-quiet.signout-top{width:auto;padding:6px 12px}
.pin-default{font-style:normal;font-size:10.5px;color:var(--brass)}
.btn-quiet.pin-save{width:auto;padding:7px 12px}
.btn-quiet.pin-save:disabled{opacity:.4;cursor:not-allowed}

/* --------------------------- dish editor ----------------------------- */
.drawer-wide{width:min(560px,100%)}
/* the drawer header styles its subtitle inline; this one needs two lines */
.ed-head b{display:block;font-size:15px;margin-bottom:2px}
.ed-head span{display:block}
.mrow{display:flex;align-items:center;gap:10px}
.mthumb{width:38px;height:38px;border-radius:9px;object-fit:cover;flex-shrink:0;
  background:var(--panel2);display:grid;place-items:center;font-size:17px}
.btn-quiet.mini-edit{width:auto;padding:5px 12px;white-space:nowrap}
.ed-err{margin:0 0 12px;padding:9px 11px;border-radius:9px;font-size:12.5px;
  background:rgba(224,91,60,.12);border:1px solid rgba(224,91,60,.4);color:var(--sumac)}
.ed-photo{display:flex;gap:12px;align-items:center;margin-bottom:14px}
.ed-photo img{width:104px;height:78px;object-fit:cover;border-radius:10px}
.ed-photo-none{width:104px;height:78px;border-radius:10px;background:var(--panel2);
  display:grid;place-items:center;font-size:30px}
.ed-photo-act{display:flex;flex-direction:column;gap:7px;flex:1}
.ed-file{display:block;text-align:center;cursor:pointer}
.ed-f{display:block;margin-bottom:12px}
.ed-f>span{display:block;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--muted);margin-bottom:5px}
.ed-f input,.ed-f textarea,.ed-f select,.ed-opt input,.ed-inline select{
  width:100%;padding:9px 11px;border-radius:9px;font-family:inherit;font-size:13px;
  background:var(--ink);border:1px solid var(--line2);color:var(--paper)}
.ed-f textarea{resize:vertical;line-height:1.5}
.ed-f input:focus,.ed-f textarea:focus,.ed-f select:focus,.ed-opt input:focus{
  outline:none;border-color:var(--mint)}
.ed-emoji{max-width:90px;font-size:18px !important;text-align:center}
.ed-two{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.ed-three{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:11px}
@media(max-width:560px){.ed-two,.ed-three{grid-template-columns:1fr}}
.ed-hint{margin:-4px 0 14px;font-size:11.5px;color:var(--muted)}
.ed-chips{display:flex;flex-wrap:wrap;gap:6px}
.ed-groups{margin-top:6px;padding-top:14px;border-top:1px solid var(--line)}
.ed-groups-h{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}
/* the heading holds one line; the button shrinks to its text instead */
.ed-groups-h b{font-size:13px;white-space:nowrap}
/* .btn-quiet sets width:100% further down the sheet, so these overrides
   have to out-weigh it rather than merely follow it */
.btn-quiet.ed-add{width:auto;flex:0 0 auto;padding:6px 12px;white-space:nowrap}
.ed-group{margin-top:11px;padding:12px;border-radius:11px;background:rgba(237,239,230,.03);
  border:1px solid var(--line)}
.ed-grow{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.ed-inline{flex:0 0 auto}
.ed-inline select{width:auto;padding:6px 10px}
.ed-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.ed-check input{accent-color:var(--mint)}
.ed-opt{display:grid;grid-template-columns:1fr 1fr 82px 28px;gap:7px;margin-bottom:7px;align-items:center}
.ed-opt input{padding:7px 9px;font-size:12.5px}
.ed-opt-p{text-align:end;font-family:'IBM Plex Mono',monospace}
/* sized by its text — it was a 28px square with the word "Remove" in it,
   which pushed the label straight through the border */
.ed-x{padding:6px 11px;border-radius:7px;border:1px solid var(--line2);
  color:var(--muted);font-size:12px;line-height:1;white-space:nowrap}
.ed-x-icon{width:28px;height:28px;padding:0;display:grid;place-items:center;font-size:14px}
.ed-x:hover{color:var(--sumac);border-color:rgba(224,91,60,.5)}
.ed-foot{display:flex;gap:9px;align-items:center}
.ed-foot .btn-primary{flex:1}
.ed-foot .btn-quiet,.ed-foot .btn-danger{width:auto;white-space:nowrap}

/* ----------------------------- history ------------------------------- */
.histwrap{display:grid;grid-template-columns:300px 1fr;gap:14px;align-items:start}
@media(max-width:900px){.histwrap{grid-template-columns:1fr}}
.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cal-head b{font-size:13.5px}
.cal-nav{width:26px;height:26px;border-radius:7px;border:1px solid var(--line2);color:var(--muted);font-size:15px;line-height:1}
.cal-nav:hover{color:var(--paper);border-color:var(--line-solid)}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-pad{aspect-ratio:1}
.cal-day{position:relative;aspect-ratio:1;border-radius:8px;font-size:12px;
  font-family:'IBM Plex Mono',monospace;color:var(--bone);border:1px solid transparent;transition:all .12s}
.cal-day:hover{background:rgba(237,239,230,.06)}
.cal-today{border-color:var(--line2)}
.cal-on{background:var(--paper);color:var(--ink);font-weight:600}
.cal-dot{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);
  width:4px;height:4px;border-radius:50%;background:var(--mint)}
.cal-on .cal-dot{background:var(--ink)}
.cal-note{margin:11px 0 0;font-size:11px;color:var(--muted)}
.hist-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.hist-head>b{font-size:14px}
.hist-head .chips{margin:0}
.hist-head .chip b{font-family:'IBM Plex Mono',monospace;margin-inline-start:5px}
.histlist{list-style:none;margin:0;padding:0}
.histlist>li{border-bottom:1px solid var(--line)}
.histlist>li:last-child{border-bottom:none}
.histrow{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:11px 4px;text-align:start;transition:background .12s}
.histrow:hover{background:rgba(237,239,230,.04)}
.histrow-t b{display:block;font-size:13px}
.histrow-t span{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}
.histrow-v{font-size:14px;font-weight:600;flex-shrink:0}
.histrow-v i{font-style:normal;font-size:10px;color:var(--muted)}
.histdetail{padding:4px 4px 12px}
.histround{margin-bottom:8px}
.histround-h{display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--muted);margin-bottom:4px}
.qr-open{display:block;text-decoration:none;text-align:center}
.qr-open:hover{color:var(--paper);border-color:var(--line-solid)}
.qr-warn{margin:0 0 13px;color:var(--brass)}
.btn-quiet.btn-printall{width:auto;padding:8px 14px;white-space:nowrap}

/* ----------------------------- print --------------------------------- */
/* The app is a fixed-position shell, so printing it directly gives one
   clipped screen. The sheet below is laid out for paper instead and is
   the only thing the printer sees. */
.printsheet{display:none}
@media print{
  html,body,#root{position:static;height:auto;background:#fff}
  .bo{display:none !important}
  .printsheet{display:block}
  .pcard{page-break-after:always;break-after:page;height:100vh;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
    font-family:'Bricolage Grotesque',system-ui,sans-serif;color:#0B2C29}
  .pcard:last-child{page-break-after:auto;break-after:auto}
  .pcard-brand{font-size:26px;font-weight:800;letter-spacing:-.02em}
  .pcard-t{font-size:19px;font-weight:600}
  .pcard .qr{border:1px solid #dcdcdc;border-radius:4px}
  .pcard-scan{font-size:14px}
  .pcard-code{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#555}
  .pcard-url{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#888}
}
.btn-quiet{width:100%;padding:8px;border-radius:9px;border:1px solid var(--line2);font-size:12px;color:var(--muted)}
.btn-quiet:hover{color:var(--paper);border-color:var(--line-solid)}
.panel-danger{border-color:rgba(224,91,60,.34)}
.panel-danger h3{color:var(--sumac)}
.btn-danger{padding:11px 18px;border-radius:11px;font-size:13px;font-weight:600;
  border:1px solid rgba(224,91,60,.5);color:var(--sumac);background:transparent;transition:all .15s}
.btn-danger:hover:not(:disabled){background:rgba(224,91,60,.12);border-color:var(--sumac)}
.btn-danger:disabled{opacity:.5;cursor:not-allowed}
.btn-danger-on{background:var(--sumac);color:#fff;border-color:var(--sumac)}
.btn-danger-on:hover:not(:disabled){background:#c94e31}
.danger-row{display:flex;align-items:center;gap:9px}
.danger-row .btn-quiet{width:auto;padding:11px 16px}

/* ============================== PANELS =============================== */
.cards4{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px;margin-bottom:16px}
.bigstat{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:16px}
.bigstat-l{display:block;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.bigstat b{display:block;font-size:27px;font-weight:600;margin-top:6px;letter-spacing:-.02em}
.bigstat b i{font-size:13px;color:var(--muted)}
.bigstat-s{display:block;font-size:11px;color:var(--mint);margin-top:4px}
.bigstat-warn{color:var(--sumac)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:16px;margin-bottom:14px}
.panel h3{font-size:13px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:12px}
.panel-sub{margin:-6px 0 14px;font-size:12.5px;color:var(--muted);line-height:1.5;max-width:62ch}
.panel-empty{margin:0;font-size:12.5px;color:var(--muted)}
.panel .tablewrap{border:none;border-radius:0;background:none}

.bars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.bars li{display:flex;align-items:center;gap:11px}
.bar-n{flex:0 0 34%;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{flex:1;height:7px;border-radius:99px;background:rgba(237,239,230,.07);overflow:hidden}
.bar-fill{display:block;height:100%;border-radius:99px;background:var(--mint)}
.bar-alt{background:var(--brass)}
.bars b{font-size:12.5px;min-width:22px;text-align:end}
.dotres{display:inline-block;width:8px;height:8px;border-radius:50%}
.dotres-ok{background:var(--mint)}
.dotres-no{background:var(--sumac)}

.matrix td:first-child,.matrix th:first-child{position:sticky;inset-inline-start:0;background:var(--panel)}
.col-me{background:rgba(79,192,141,.06)}
.yes{color:var(--mint);font-size:14px}
.no{color:var(--line-solid)}
.people{display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:12px;margin-top:14px}
.person{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:14px;
  display:flex;align-items:center;gap:11px}
.person-me{border-color:rgba(79,192,141,.4)}
.person b{display:block;font-size:13.5px}
.person>div span{font-size:11.5px;color:var(--muted)}
.person-branch{margin-inline-start:auto;font-size:10px;letter-spacing:.05em;text-transform:uppercase;
  color:var(--muted);text-align:end}

.adapters{display:grid;grid-template-columns:repeat(auto-fit,minmax(232px,1fr));gap:11px}
.adapter{border:1px solid var(--line);border-radius:11px;padding:13px;background:var(--panel2)}
.ad-connected{border-color:rgba(79,192,141,.4)}
.ad-request{opacity:.6}
.ad-head{display:flex;align-items:center;gap:9px;margin-bottom:6px;flex-wrap:wrap}
.ad-head b{font-size:13.5px}
.adapter p{margin:0;font-size:11.5px;line-height:1.5;color:var(--muted)}
.ad-pill{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:99px;
  border:1px solid var(--line2);color:var(--muted)}
.ad-pill-connected{color:var(--mint);border-color:rgba(79,192,141,.45)}
.ad-pill-available{color:var(--brass);border-color:rgba(227,163,60,.45)}
.ad-pill-request{color:var(--muted)}
.head-hint{font-size:11.5px;color:var(--muted)}
.permcell{width:30px;height:30px;border-radius:8px;font-size:13px;line-height:1;
  border:1px solid var(--line2);color:var(--muted);transition:all .12s}
.permcell:hover{border-color:var(--line-solid);color:var(--paper)}
.permcell-on{background:rgba(79,192,141,.16);border-color:rgba(79,192,141,.5);color:var(--mint)}
.permcell:focus-visible{outline:2px solid var(--paper);outline-offset:2px}
.kv-edit li{align-items:center}
.field{display:flex;align-items:center;gap:6px}
.field input{width:78px;padding:6px 8px;border-radius:8px;text-align:end;
  font-family:'IBM Plex Mono',monospace;font-size:13px;
  background:var(--ink);border:1px solid var(--line2);color:var(--paper)}
.field input:focus{outline:none;border-color:var(--mint)}
.field i{font-style:normal;font-size:11.5px;color:var(--muted);min-width:14px}
.btn-save{padding:11px 18px;border-radius:11px;font-size:13px;font-weight:600;
  background:var(--mint);color:var(--ink);transition:filter .13s}
.btn-save:hover{filter:brightness(1.07)}
.kv{list-style:none;margin:0;padding:0}
.kv li{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}
.kv li:last-child{border-bottom:none}
.kv b{font-weight:600}
.compliance{border:1px dashed rgba(227,163,60,.4);border-radius:11px;padding:13px;background:rgba(227,163,60,.06)}
.comp-head{display:flex;align-items:center;gap:9px;margin-bottom:7px;flex-wrap:wrap}
.compliance p{margin:0;font-size:11.5px;line-height:1.55;color:var(--muted)}
.logs{list-style:none;margin:0;padding:0}
.logs li{display:flex;gap:12px;padding:7px 0;font-size:12.5px;border-bottom:1px solid var(--line)}
.logs li:last-child{border-bottom:none}
.logs span{color:var(--muted);flex-shrink:0}

/* ------------------------------ misc --------------------------------- */
.empty{text-align:center;padding:56px 20px;color:var(--muted)}
.empty h3{font-size:16px;color:var(--paper);margin:12px 0 5px}
.empty p{margin:0;font-size:13px}
.empty-kds{grid-column:1/-1;align-self:center}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:120;
  background:var(--paper);color:var(--ink);font-size:13px;font-weight:500;
  padding:11px 19px;border-radius:99px;box-shadow:0 10px 30px rgba(0,0,0,.4);animation:pop .2s}
@keyframes pop{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
.scrim{position:fixed;inset:0;background:rgba(4,16,15,.55);z-index:55}

/* --------------------------- narrow screens -------------------------- */
@media(max-width:1080px){
  .kds-side{width:236px}
  .two{grid-template-columns:1fr}
}
@media(max-width:860px){
  .rail{position:fixed;inset-block:0;inset-inline-start:0;transform:translateX(-102%);
    transition:transform .2s cubic-bezier(.2,.9,.3,1);box-shadow:0 0 40px rgba(0,0,0,.5)}
  .bo[dir="rtl"] .rail{transform:translateX(102%)}
  .rail-open{transform:none !important}
  .burger{display:flex}
  .stage{padding:16px 14px 34px}
  .phead-stats{margin-inline-start:0;width:100%}
  .kds-body{flex-direction:column-reverse}
  .kds-side{width:auto;flex-shrink:0;max-height:38vh;border-inline-start:none;border-top:1px solid var(--line)}
  .tickets{grid-template-columns:repeat(auto-fill,minmax(228px,1fr));padding:12px;gap:11px}
  .drawer{width:100%}
  .livedot{display:none}
}
@media(prefers-reduced-motion:reduce){.bo *{animation:none !important;transition:none !important}}
`;
