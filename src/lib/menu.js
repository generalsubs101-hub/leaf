/* ------------------------------------------------------------------ *
 *  Leaf — the menu itself.
 *
 *  One definition, read by the guest phone and the back office alike.
 *  It used to be copied into both surfaces, which meant a dish could
 *  cost one thing on the phone and another on the pass.
 *
 *  This is the shipped menu. Anything the restaurant edits from the
 *  back office is stored as an override on the shared log and merged
 *  over the top — see effectiveMenu() below.
 * ------------------------------------------------------------------ */


export const G = {
  breadHummus: {
    id: "bread", name: "Bread", nameAr: "الخبز", type: "single", required: true,
    options: [
      { id: "arabic", name: "Arabic bread", nameAr: "خبز عربي", price: 0 },
      { id: "brown", name: "Whole wheat", nameAr: "خبز أسمر", price: 0.25 },
      { id: "gf", name: "Gluten-free", nameAr: "خالٍ من الغلوتين", price: 0.75 },
      { id: "none", name: "No bread", nameAr: "بدون خبز", price: 0 },
    ],
  },
  hummusTop: {
    id: "top", name: "Topping", nameAr: "الإضافات", type: "multi", required: false,
    options: [
      { id: "pine", name: "Toasted pine nuts", nameAr: "صنوبر محمّص", price: 1.0 },
      { id: "lamb", name: "Minced lamb", nameAr: "لحمة مفرومة", price: 2.5 },
      { id: "oil", name: "Extra olive oil", nameAr: "زيت زيتون إضافي", price: 0 },
      { id: "chilli", name: "Chilli & sumac", nameAr: "فليفلة وسمّاق", price: 0.5 },
    ],
  },
  mezzeSize: {
    id: "size", name: "Portion", nameAr: "الحجم", type: "single", required: true,
    options: [
      { id: "s", name: "Small", nameAr: "صغير", price: 0 },
      { id: "l", name: "Large (shares 3–4)", nameAr: "كبير (يكفي ٣–٤)", price: 2.0 },
    ],
  },
  doneness: {
    id: "done", name: "Cooked", nameAr: "درجة النضج", type: "single", required: true,
    options: [
      { id: "medium", name: "Medium", nameAr: "وسط", price: 0 },
      { id: "mediumwell", name: "Medium well", nameAr: "وسط مائل للنضج", price: 0 },
      { id: "well", name: "Well done", nameAr: "ناضج تماماً", price: 0 },
    ],
  },
  spice: {
    id: "spice", name: "Heat", nameAr: "الحرارة", type: "single", required: true,
    options: [
      { id: "none", name: "Not spicy", nameAr: "غير حار", price: 0 },
      { id: "mild", name: "Mild", nameAr: "خفيف", price: 0 },
      { id: "hot", name: "Hot", nameAr: "حار", price: 0 },
    ],
  },
  grillSide: {
    id: "side", name: "Side", nameAr: "الطبق الجانبي", type: "single", required: true,
    options: [
      { id: "rice", name: "Vermicelli rice", nameAr: "أرز بالشعيرية", price: 0 },
      { id: "fries", name: "Fries", nameAr: "بطاطا مقلية", price: 0 },
      { id: "grilled", name: "Grilled vegetables", nameAr: "خضار مشوية", price: 0.75 },
      { id: "salad", name: "Green salad", nameAr: "سلطة خضراء", price: 0.75 },
    ],
  },
  grillExtra: {
    id: "extra", name: "Add on", nameAr: "إضافات", type: "multi", required: false,
    options: [
      { id: "garlic", name: "Garlic paste", nameAr: "ثومية", price: 0.5 },
      { id: "hummus", name: "Side of hummus", nameAr: "صحن حمص", price: 2.0 },
      { id: "skewer", name: "Extra skewer", nameAr: "سيخ إضافي", price: 3.5 },
    ],
  },
  mansafPortion: {
    id: "portion", name: "Portion", nameAr: "الحجم", type: "single", required: true,
    options: [
      { id: "one", name: "One person", nameAr: "لشخص واحد", price: 0 },
      { id: "two", name: "Two people", nameAr: "لشخصين", price: 9.0 },
      { id: "tray", name: "Sharing tray (4–5)", nameAr: "صينية (٤–٥)", price: 22.0 },
    ],
  },
  mansafExtra: {
    id: "extra", name: "Add on", nameAr: "إضافات", type: "multi", required: false,
    options: [
      { id: "jameed", name: "Extra jameed sauce", nameAr: "مرقة جميد إضافية", price: 1.5 },
      { id: "nuts", name: "Extra almonds & pine nuts", nameAr: "لوز وصنوبر إضافي", price: 1.75 },
      { id: "shank", name: "Lamb shank cut", nameAr: "قطعة موزة", price: 4.0 },
    ],
  },
  cheeseType: {
    id: "cheese", name: "Cheese", nameAr: "نوع الجبنة", type: "single", required: true,
    options: [
      { id: "akkawi", name: "Akkawi", nameAr: "عكاوي", price: 0 },
      { id: "nabulsi", name: "Nabulsi", nameAr: "نابلسي", price: 0.5 },
      { id: "mix", name: "Mixed cheese", nameAr: "جبنة مشكّلة", price: 0.75 },
    ],
  },
  sajExtra: {
    id: "extra", name: "Add on", nameAr: "إضافات", type: "multi", required: false,
    options: [
      { id: "veg", name: "Tomato, mint, olives", nameAr: "بندورة ونعناع وزيتون", price: 0.5 },
      { id: "sujuk", name: "Sujuk", nameAr: "سجق", price: 1.25 },
      { id: "roll", name: "Rolled", nameAr: "ملفوف", price: 0 },
    ],
  },
  sugar: {
    id: "sugar", name: "Sugar", nameAr: "السكر", type: "single", required: true,
    options: [
      { id: "none", name: "No sugar", nameAr: "بدون سكر", price: 0 },
      { id: "light", name: "Lightly sweet", nameAr: "سكر خفيف", price: 0 },
      { id: "full", name: "Sweet", nameAr: "سكر زيادة", price: 0 },
    ],
  },
  ice: {
    id: "ice", name: "Ice", nameAr: "الثلج", type: "single", required: true,
    options: [
      { id: "yes", name: "With ice", nameAr: "مع ثلج", price: 0 },
      { id: "no", name: "No ice", nameAr: "بدون ثلج", price: 0 },
    ],
  },
  knafehSize: {
    id: "size", name: "Portion", nameAr: "الحجم", type: "single", required: true,
    options: [
      { id: "piece", name: "Single piece", nameAr: "قطعة", price: 0 },
      { id: "half", name: "Half kilo tray", nameAr: "نص كيلو", price: 5.5 },
    ],
  },
};

/* ------------------------------- menu -------------------------------- */

export const CATEGORIES = [
  { id: "mezze", name: "Mezze", nameAr: "مقبلات" },
  { id: "saj", name: "From the Saj", nameAr: "من الصاج" },
  { id: "grills", name: "Grills", nameAr: "المشاوي" },
  { id: "mains", name: "Mains", nameAr: "الأطباق الرئيسية" },
  { id: "sweets", name: "Sweets", nameAr: "الحلويات" },
  { id: "drinks", name: "Drinks", nameAr: "المشروبات" },
];

export const MENU = [
  { id: "hummus", cat: "mezze", name: "Hummus Beiruti", nameAr: "حمص بيروتي", price: 3.75, min: 6,
    desc: "Chickpeas whipped with tahini, lemon and garlic, finished with parsley and olive oil.",
    descAr: "حمص مخفوق مع الطحينة والليمون والثوم، مع بقدونس وزيت زيتون.",
    tags: ["vegan", "popular"], allergens: ["sesame"], emoji: "🥣", hue: 44,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Lebanese_style_hummus.jpg/500px-Lebanese_style_hummus.jpg",
    groups: [G.mezzeSize, G.breadHummus, G.hummusTop] },

  { id: "mutabbal", cat: "mezze", name: "Mutabbal", nameAr: "متبل باذنجان", price: 3.50, min: 6,
    desc: "Charred aubergine folded through tahini and yoghurt, topped with pomegranate.",
    descAr: "باذنجان مشوي على الفحم مع طحينة ولبن، مزيّن بحب الرمان.",
    tags: ["vegetarian"], allergens: ["sesame", "dairy"], emoji: "🍆", hue: 280,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Baba_Ganoush_05of05_%288735238183%29.jpg/500px-Baba_Ganoush_05of05_%288735238183%29.jpg",
    groups: [G.mezzeSize, G.breadHummus] },

  { id: "fattoush", cat: "mezze", name: "Fattoush", nameAr: "فتوش", price: 4.25, min: 7,
    desc: "Garden vegetables, purslane and toasted bread in a sumac and pomegranate dressing.",
    descAr: "خضار طازجة وبقلة وخبز محمّص مع دبس رمان وسمّاق.",
    tags: ["vegan"], allergens: ["gluten"], emoji: "🥗", hue: 96,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Fattoush_mixed-salad.jpg/500px-Fattoush_mixed-salad.jpg",
    groups: [G.mezzeSize] },

  { id: "kibbeh", cat: "mezze", name: "Fried Kibbeh", nameAr: "كبة مقلية", price: 5.50, min: 12,
    desc: "Four bulgur shells filled with spiced lamb, onion and pine nuts.",
    descAr: "أربع حبات برغل محشية بلحمة وبصل وصنوبر.",
    tags: ["popular"], allergens: ["gluten", "nuts"], emoji: "🥟", hue: 28,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Kibbeh3.jpg/500px-Kibbeh3.jpg",
    groups: [G.spice] },

  { id: "warak", cat: "mezze", name: "Warak Enab", nameAr: "ورق عنب", price: 4.00, min: 8,
    desc: "Vine leaves rolled with rice, tomato and lemon. Served cold.",
    descAr: "ورق عنب محشي بالأرز والبندورة والليمون، يُقدّم بارداً.",
    tags: ["vegan"], allergens: [], emoji: "🍃", hue: 110,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Etli_yaprak_sarma_in_Turkey.jpg/500px-Etli_yaprak_sarma_in_Turkey.jpg",
    groups: [G.mezzeSize] },

  { id: "zaatar", cat: "saj", name: "Zaatar Manakish", nameAr: "مناقيش زعتر", price: 1.75, min: 8,
    desc: "Saj dough brushed with wild thyme and olive oil, baked to order.",
    descAr: "عجينة صاج بالزعتر البلدي وزيت الزيتون، تُخبز عند الطلب.",
    tags: ["vegan", "breakfast"], allergens: ["gluten", "sesame"], emoji: "🫓", hue: 82,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Zaatar_Mankousheh.jpg/500px-Zaatar_Mankousheh.jpg",
    groups: [G.sajExtra] },

  { id: "jibneh", cat: "saj", name: "Cheese Manakish", nameAr: "مناقيش جبنة", price: 2.50, min: 8,
    desc: "Stretchy white cheese on saj dough, straight off the dome.",
    descAr: "جبنة بيضاء مطاطة على عجين الصاج، من الصاج مباشرة.",
    tags: ["vegetarian"], allergens: ["gluten", "dairy"], emoji: "🧀", hue: 48,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Za%27atar_with_cheese_manakish_at_Agasi%2C_Lajpat_Nagar%2C_Delhi_%282025-10-04%29.jpg/500px-Za%27atar_with_cheese_manakish_at_Agasi%2C_Lajpat_Nagar%2C_Delhi_%282025-10-04%29.jpg",
    groups: [G.cheeseType, G.sajExtra] },

  { id: "arayes", cat: "saj", name: "Arayes Lahm", nameAr: "عرايس لحمة", price: 5.00, min: 12,
    desc: "Bread pressed with minced lamb, tomato and chilli, grilled over charcoal.",
    descAr: "خبز محشي بلحمة مفرومة وبندورة وفليفلة، مشوي على الفحم.",
    tags: ["popular"], allergens: ["gluten"], emoji: "🔥", hue: 14,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Arayes_%283%29.jpg/500px-Arayes_%283%29.jpg",
    groups: [G.spice, G.grillExtra] },

  { id: "mishwi", cat: "grills", name: "Mixed Grill", nameAr: "مشاوي مشكّلة", price: 14.50, min: 22,
    desc: "Shish tawook, kofta and lamb cubes over charcoal, with grilled tomato and onion.",
    descAr: "شيش طاووق وكفتة وقطع لحم على الفحم، مع بندورة وبصل مشوي.",
    tags: ["popular", "sharing"], allergens: [], emoji: "🍢", hue: 18,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Arabic_MixedGrill.JPG/500px-Arabic_MixedGrill.JPG",
    groups: [G.doneness, G.spice, G.grillSide, G.grillExtra] },

  { id: "tawook", cat: "grills", name: "Shish Tawook", nameAr: "شيش طاووق", price: 9.75, min: 18,
    desc: "Chicken marinated overnight in yoghurt, garlic and lemon. Three skewers.",
    descAr: "دجاج متبّل ليلة كاملة باللبن والثوم والليمون. ثلاثة أسياخ.",
    tags: [], allergens: ["dairy"], emoji: "🍗", hue: 36,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Tavuk_%C5%9Ei%C5%9F.jpg/500px-Tavuk_%C5%9Ei%C5%9F.jpg",
    groups: [G.spice, G.grillSide, G.grillExtra] },

  { id: "kofta", cat: "grills", name: "Kofta Khashkhash", nameAr: "كفتة خشخاش", price: 9.00, min: 18,
    desc: "Minced lamb with parsley and chilli, grilled and finished in tomato butter.",
    descAr: "لحمة مفرومة مع بقدونس وفليفلة، مشوية ومغطاة بصلصة البندورة.",
    tags: ["spicy"], allergens: ["dairy"], emoji: "🌶️", hue: 8,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Kafta_shish_kebab_and_grilled_vegetables_on_salad_-_Cambridge%2C_MA.jpg/500px-Kafta_shish_kebab_and_grilled_vegetables_on_salad_-_Cambridge%2C_MA.jpg",
    groups: [G.spice, G.grillSide, G.grillExtra] },

  { id: "riyash", cat: "grills", name: "Lamb Chops", nameAr: "ريش غنم", price: 16.00, min: 25,
    desc: "Four chops from young lamb, salted and grilled plain over charcoal.",
    descAr: "أربع قطع ريش غنم صغير، مملّحة ومشوية على الفحم.",
    tags: ["chef"], allergens: [], emoji: "🍖", hue: 12,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Liat_Portal_for_Foodie_Disorder_-_Homemade_Lamb_Chops_with_Rice_and_Grilled_Vegetables.jpg/500px-Liat_Portal_for_Foodie_Disorder_-_Homemade_Lamb_Chops_with_Rice_and_Grilled_Vegetables.jpg",
    groups: [G.doneness, G.grillSide, G.grillExtra] },

  { id: "mansaf", cat: "mains", name: "Mansaf", nameAr: "منسف أردني", price: 12.50, min: 30,
    desc: "Lamb slow-cooked in fermented jameed over rice and shrak bread, with almonds.",
    descAr: "لحم غنم مطبوخ على مهل بالجميد، فوق الأرز وخبز الشراك، مع اللوز.",
    tags: ["national", "popular"], allergens: ["dairy", "gluten", "nuts"], emoji: "🍲", hue: 40,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Mansaf%2C_the_traditional_dish_of_Jordan.jpg/500px-Mansaf%2C_the_traditional_dish_of_Jordan.jpg",
    groups: [G.mansafPortion, G.mansafExtra] },

  { id: "maqluba", cat: "mains", name: "Chicken Maqluba", nameAr: "مقلوبة دجاج", price: 9.50, min: 25,
    desc: "Rice layered with chicken, aubergine and cauliflower, turned out at the table.",
    descAr: "أرز مع دجاج وباذنجان وزهرة، تُقلب أمامك على الطاولة.",
    tags: [], allergens: ["nuts"], emoji: "🍛", hue: 34,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Makluba.JPG/500px-Makluba.JPG",
    groups: [G.spice] },

  { id: "sayadieh", cat: "mains", name: "Sayadieh", nameAr: "صيادية سمك", price: 13.00, min: 28,
    desc: "Fish fillet on caramelised onion rice with tahini sauce and toasted nuts.",
    descAr: "فيليه سمك على أرز بالبصل المحمّر مع صلصة طحينة ومكسرات.",
    tags: ["chef"], allergens: ["fish", "sesame", "nuts"], emoji: "🐟", hue: 200,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Fish_Sayadieh.jpg/500px-Fish_Sayadieh.jpg",
    groups: [G.spice] },

  { id: "knafeh", cat: "sweets", name: "Knafeh Nabulsieh", nameAr: "كنافة نابلسية", price: 4.50, min: 12,
    desc: "Shredded pastry over melting cheese, soaked in orange blossom syrup.",
    descAr: "شعيرات كنافة فوق جبنة ذائبة، مسقية بقطر ماء الزهر.",
    tags: ["popular"], allergens: ["gluten", "dairy", "nuts"], emoji: "🍯", hue: 30,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Qwaider_al_nabulsi_kunafa_al_nama_%2811389641075%29.jpg/500px-Qwaider_al_nabulsi_kunafa_al_nama_%2811389641075%29.jpg",
    groups: [G.knafehSize] },

  { id: "baklava", cat: "sweets", name: "Baklava Plate", nameAr: "بقلاوة", price: 3.75, min: 4,
    desc: "Six assorted pieces with pistachio, walnut and cashew.",
    descAr: "ست قطع مشكّلة بالفستق والجوز والكاجو.",
    tags: ["vegetarian"], allergens: ["gluten", "nuts", "dairy"], emoji: "🥮", hue: 52,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Baklava_kymi_greece.jpg/500px-Baklava_kymi_greece.jpg",
    groups: [] },

  { id: "limonana", cat: "drinks", name: "Mint Lemonade", nameAr: "ليمون بالنعناع", price: 2.75, min: 4,
    desc: "Lemon blended with fresh mint and crushed ice.",
    descAr: "ليمون مخفوق مع نعناع طازج وثلج مجروش.",
    tags: ["popular"], allergens: [], emoji: "🍋", hue: 76,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Mint_lemonade.jpg/500px-Mint_lemonade.jpg",
    groups: [G.sugar, G.ice] },

  { id: "qahwa", cat: "drinks", name: "Arabic Coffee", nameAr: "قهوة عربية", price: 1.50, min: 5,
    desc: "Light roast with cardamom, poured from the dallah.",
    descAr: "قهوة فاتحة بالهيل، تُصبّ من الدلّة.",
    tags: [], allergens: [], emoji: "☕", hue: 26,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/A_dallah_a_traditional_Arabic_coffee_pot_with_cups_and_coffee_beans.jpg/500px-A_dallah_a_traditional_Arabic_coffee_pot_with_cups_and_coffee_beans.jpg",
    groups: [G.sugar] },

  { id: "orange", cat: "drinks", name: "Fresh Orange", nameAr: "عصير برتقال", price: 3.00, min: 4,
    desc: "Pressed to order. Nothing added.",
    descAr: "يُعصر عند الطلب. بدون أي إضافات.",
    tags: ["vegan"], allergens: [], emoji: "🍊", hue: 30,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Glass_of_Fresh_Orange_Juice.jpg/500px-Glass_of_Fresh_Orange_Juice.jpg",
    groups: [G.ice] },

  { id: "ayran", cat: "drinks", name: "Ayran", nameAr: "عيران", price: 1.25, min: 2,
    desc: "Salted yoghurt drink, shaken cold.",
    descAr: "لبن مملّح مخفوق بارد.",
    tags: [], allergens: ["dairy"], emoji: "🥛", hue: 190,
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Ayran_%28large_glass%29.jpg/500px-Ayran_%28large_glass%29.jpg",
    groups: [G.ice] },
];

export const UNAVAILABLE = ["sayadieh"]; // 86'd by the kitchen today

/* which section of the kitchen cooks a given dish */
export const CAT_STATION = { mezze: "cold", saj: "saj", grills: "grill", mains: "hot", sweets: "pastry", drinks: "bar" };

export const STATIONS = [
  { id: "grill",  name: "Grill",  nameAr: "المشاوي" },
  { id: "hot",    name: "Hot",    nameAr: "الطبخ" },
  { id: "saj",    name: "Saj",    nameAr: "الصاج" },
  { id: "cold",   name: "Cold",   nameAr: "البارد" },
  { id: "pastry", name: "Pastry", nameAr: "الحلويات" },
  { id: "bar",    name: "Bar",    nameAr: "المشروبات" },
];

export const TAG_IDS = ["popular", "chef", "vegan", "vegetarian", "spicy", "national", "sharing", "breakfast"];
export const ALLERGEN_IDS = ["gluten", "dairy", "nuts", "sesame", "egg", "fish"];

/* Edits from the back office live on the shared log as whole items, so a
   replay lands every screen on the same menu. `removed` keeps a deleted
   shipped dish deleted without having to rewrite the list above. */
export function effectiveMenu(menuState) {
  const edits = menuState?.items || {};
  const gone = new Set(menuState?.removed || []);
  const base = MENU.filter((m) => !gone.has(m.id)).map((m) => (edits[m.id] ? edits[m.id] : m));
  const added = Object.values(edits).filter(
    (m) => !gone.has(m.id) && !MENU.some((d) => d.id === m.id)
  );
  return [...base, ...added].sort(
    (a, b) => CATEGORIES.findIndex((c) => c.id === a.cat) - CATEGORIES.findIndex((c) => c.id === b.cat)
  );
}

export const indexBy = (list) => Object.fromEntries(list.map((m) => [m.id, m]));
export const stationOfIn = (list, itemId) =>
  CAT_STATION[list.find((m) => m.id === itemId)?.cat] || "hot";
