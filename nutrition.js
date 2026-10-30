/* SIBO Root Journal — nutrition: USDA food search, portions, meals, daily totals, targets, and nutrition insights.
   Food data is USDA FoodData Central (FNDDS survey foods, public domain), bundled as foods.json and searched on this device.
   A food in the library carries its nutrients per 100 g, its household portions and your usual portion, so a
   tick on Today logs that portion. Loaded after insights.js; shares its global scope. */

const NUT_KEYS = ["kcal", "p", "f", "c", "fib", "sug", "sat", "ca", "fe", "mg", "zn", "d", "b12"];
const NUT_INFO = { kcal: ["Calories", "kcal"], p: ["Protein", "g"], f: ["Fat", "g"], c: ["Carbs", "g"], fib: ["Fiber", "g"], sug: ["Sugars", "g"], sat: ["Saturated fat", "g"],
  ca: ["Calcium", "mg"], fe: ["Iron", "mg"], mg: ["Magnesium", "mg"], zn: ["Zinc", "mg"], d: ["Vitamin D", "µg"], b12: ["Vitamin B12", "µg"] };
const MACROS = ["kcal", "p", "f", "c", "fib"], MICROS = ["fe", "zn", "b12", "ca", "mg", "d"];
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snacks"], ["other", "Not sorted"]];
const MEAL_NAME = Object.fromEntries(MEALS);
const ACTIVITY = [["sedentary", "Mostly sitting", 1.2], ["light", "Light activity", 1.375], ["moderate", "Active most days", 1.55], ["high", "Very active", 1.725], ["athlete", "Hard training daily", 1.9]];

const zeroNut = () => Object.fromEntries(NUT_KEYS.map(k => [k, 0]));
const addNut = (a, b, x = 1) => { for (const k of NUT_KEYS) a[k] += (b[k] || 0) * x; return a; };
const fmtN = v => v == null ? "–" : v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
const fmtQ = q => String(Math.round(q * 100) / 100);
const nowHours = () => { const n = new Date(); return n.getHours() + n.getMinutes() / 60; };
const mealAt = h => h < 10.5 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : h < 21.5 ? "dinner" : "snack";

// ---------- food database ----------
// spelling the survey database doesn't use
const FOOD_SYN = { sourdough: "sour dough", zucchini: "summer squash", courgette: "summer squash", oats: "oatmeal", porridge: "oatmeal", yoghurt: "yogurt",
  aubergine: "eggplant", tofu: "soybean curd", prawn: "shrimp", prawns: "shrimp", fries: "french fries", soda: "soft drink", cilantro: "coriander", capsicum: "pepper", mince: "ground" };
const FOOD_GROUP_WORDS = new Set(["fish", "chicken", "beef", "pork", "turkey", "lamb", "cheese", "bread", "rice", "yogurt", "milk", "squash", "nuts", "seeds", "beans", "juice"]);
const DISH_RE = /\b(salad|sandwich|burrito|taco|cake|pie|soup|stew|casserole|souffle|chips|paste|creamed|deviled|split|pudding|sauce|loaf|patty|dip|dressing|nectar|drink|bar|cookie|muffin|oil|butter|smoothie|shake|pizza|roll|wrap|curry|fried rice|nugget|nuggets|sticks|substitute|flavored|candy|bread|creamer|pickled|foo yung)\b/;
const PLAIN_RE = /\b(raw|cooked|baked|broiled|boiled|plain|whole|fresh|nfs|scrambled|grilled|roasted|steamed|brewed)\b/;
const Foods = {
  data: null, loading: null, failed: false,
  load() {
    if (this.data) return Promise.resolve(this.data);
    if (!this.loading) this.loading = fetch("foods.json").then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(j => {
      this.data = j.foods.map(([name, v, portions, fdc]) => {
        const lower = name.toLowerCase();
        return { name, lower, words: lower.split(/[^a-z0-9]+/).filter(Boolean), nut: Object.fromEntries(j.keys.map((k, i) => [k, v[i]])), portions, fdc };
      });
      this.failed = false;
      return this.data;
    }).catch(e => { this.loading = null; this.failed = true; throw e; });
    return this.loading;
  },
  search(q, n = 30) {
    if (!this.data) return [];
    const plain = " " + q.toLowerCase() + " ";
    let syn = plain;
    for (const [a, b] of Object.entries(FOOD_SYN)) syn = syn.replace(new RegExp(`\\b${a}\\b`, "g"), b);
    // search the words as typed and, if different, the database's own spelling; keep each food's best score
    const best = new Map();
    for (const str of syn === plain ? [plain] : [plain, syn]) for (const [sc, f] of this.rank(str)) if (!best.has(f) || sc < best.get(f)) best.set(f, sc);
    return [...best].sort((a, b) => a[1] - b[1]).slice(0, n).map(x => x[0]);
  },
  rank(s) {
    const toks = s.split(/[^a-z0-9]+/).filter(Boolean);
    if (!toks.length) return [];
    const forms = toks.map(t => t.length > 3 && /[^s]es$/.test(t) ? [t, t.slice(0, -2), t.slice(0, -1)] : t.length > 3 && /[^s]s$/.test(t) ? [t, t.slice(0, -1)] : [t]);
    const out = [], asked = new Set(toks);
    for (const f of this.data) {
      let score = 0, ok = true;
      for (const fs of forms) {
        let wi = f.words.findIndex(w => fs.some(t => w.startsWith(t)));
        if (wi < 0) { ok = false; break; }
        if (wi === 1 && FOOD_GROUP_WORDS.has(f.words[0])) wi = 0; // "Fish, salmon, baked": salmon is the real first word
        score += wi * 1.5 + (fs.includes(f.words[wi]) ? 0 : 1);
      }
      if (!ok) continue;
      score += f.words.length * 0.35; // plain names before long recipe names
      // whole foods before dishes made from them, unless the dish was asked for
      const dish = f.lower.match(DISH_RE);
      if (dish && !asked.has(dish[1])) score += 3;
      if (/\b(with|and|or)\b/.test(f.lower) && !asked.has("with") && !asked.has("and")) score += 1;
      if (PLAIN_RE.test(f.lower)) score -= 1;
      if (/as ingredient|glutinous|coated/.test(f.lower)) score += 1.5;
      if (/baby food|infant formula|toddler/.test(f.lower)) score += 8;
      out.push([score, f]);
    }
    return out;
  },
};

// ---------- portions & entries ----------
// USDA often lists the small size first; start people on the regular one
const defaultPortion = ps => ps && ps.length ? (ps.find(x => /regular|medium/i.test(x[0])) || ps.find(x => !/small|thin|mini|snack-size|cubic|crust/i.test(x[0])) || ps[0])[0] : "g";
function usualOf(it) {
  if (it.usual) return it.usual;
  if (it.parts) return { q: 1, u: "1 meal" };
  const u = defaultPortion(it.portions);
  return u === "g" ? { q: 100, u: "g" } : { q: 1, u };
}
function unitGrams(it, u) {
  if (u === "g") return 1;
  const p = (it.portions || []).find(x => x[0] === u);
  return p ? p[1] : null;
}
// an entry's amount, falling back to the usual portion when it was logged before the food had nutrition
function entryQU(e, it) {
  if (e.q != null && e.u && (it.parts ? e.u === "1 meal" : unitGrams(it, e.u) != null)) return { q: e.q, u: e.u };
  return usualOf(it);
}
function nutOf(it, q, u, map, depth = 0) {
  if (!it) return null;
  if (it.parts) {
    if (depth) return null;
    const tot = zeroNut(); let any = false;
    for (const p of it.parts) { const n = nutOf(map[p.id], p.q, p.u, map, 1); if (n) { any = true; addNut(tot, n, q); } }
    return any ? tot : null;
  }
  if (!it.nut) return null;
  const g = unitGrams(it, u);
  if (g == null) return null;
  const out = {};
  for (const k of NUT_KEYS) out[k] = (it.nut[k] || 0) * q * g / 100;
  return out;
}
function fmtQU(q, u) {
  if (u === "g") return `${fmtQ(q)} g`;
  if (u === "1 meal") return q === 1 ? "1 serving" : `${fmtQ(q)} servings`;
  if (q === 1) return u;
  const rest = u.replace(/^1\s+/, "");
  return /^1\s/.test(u) && /^[a-z]+$/i.test(rest) ? `${fmtQ(q)} ${/(s|sh|ch|x)$/.test(rest) ? rest + "es" : rest + "s"}` : `${fmtQ(q)} × ${rest}`;
}
const entryMeal = e => e.meal || (e.time ? mealAt(hrs(e.time)) : "other");
function newFoodEntry(it, date, opt = {}) {
  const u0 = usualOf(it);
  const meal = opt.meal || (opt.time ? mealAt(hrs(opt.time)) : it.meal || (date === todayStr() ? mealAt(nowHours()) : "other"));
  return { id: it.id, dose: "", time: opt.time || "", q: opt.q ?? u0.q, u: opt.u || u0.u, meal };
}
// spoken amounts ("2 slices", "200 grams", "a cup") onto this food's portions
const UNIT_RE = { cup: "cup", slice: "slice", piece: "piece", tbsp: "tablespoon|tbsp", tsp: "teaspoon|tsp", bowl: "bowl", handful: "handful", serving: "serving",
  scoop: "scoop", glass: "glass|cup", plate: "plate", large: "large", medium: "medium|regular", small: "small" };
function resolveQty(it, qty) {
  if (!qty || !qty.q) return {};
  if (qty.unit === "g") return { q: qty.q, u: "g" };
  if (qty.unit === "oz") return { q: Math.round(qty.q * 28.35), u: "g" };
  const u0 = usualOf(it);
  if (qty.unit && UNIT_RE[qty.unit]) {
    // "slice" means an ordinary slice: prefer "1 slice" or a regular size over thin or large variants
    const re = new RegExp(`\\b(${UNIT_RE[qty.unit]})`, "i"), ps = (it.portions || []).filter(x => re.test(x[0]));
    const p = ps.find(x => new RegExp(`^1 (${UNIT_RE[qty.unit]})$`, "i").test(x[0])) || ps.find(x => /regular|medium/i.test(x[0])) || ps.find(x => !/small|thin|large|thick|mini/i.test(x[0])) || ps[0];
    if (p) return { q: qty.q, u: p[0] };
  }
  return u0.u === "g" ? { q: Math.round(qty.q * u0.q), u: "g" } : { q: qty.q, u: u0.u };
}

function dayNutrition(d, map = lib()) {
  const tot = zeroNut(), meals = {}, byMeal = {};
  let foods = 0, measured = 0;
  for (const e of (d && d.items) || []) {
    const it = map[e.id];
    if (!it || it.cat !== "food") continue;
    foods++;
    const { q, u } = entryQU(e, it), n = nutOf(it, q, u, map), m = entryMeal(e);
    meals[m] ||= { ...zeroNut(), foods: 0 };
    meals[m].foods++;
    const b = byMeal[e.mid || "t:" + m] ||= zeroNut();
    if (n) { measured++; addNut(tot, n); addNut(meals[m], n); addNut(b, n); }
  }
  const mv = Object.values(byMeal);
  return { tot, meals, byMeal, foods, measured, cover: foods ? measured / foods : 0, ok: measured >= 2 && measured / foods >= 0.7,
    maxMealFat: mv.length ? Math.max(...mv.map(m => m.f)) : 0, maxMealKcal: mv.length ? Math.max(...mv.map(m => m.kcal)) : 0 };
}
// averages over the days in a window that are mostly measured
function nutritionAverage(n = 7, end = todayStr()) {
  const map = lib(), days = [];
  for (let i = 0; i < n; i++) { const d = S.days[addDays(end, -i)]; if (!d) continue; const x = dayNutrition(d, map); if (x.ok) days.push(x.tot); }
  if (!days.length) return null;
  const avg = zeroNut();
  days.forEach(t => addNut(avg, t, 1 / days.length));
  return { avg, days: days.length };
}

// ---------- targets ----------
// Calories: Mifflin-St Jeor resting energy × activity, to maintain weight. Protein 1.2 g/kg. Fat 30% of calories.
// Carbs: the rest, at least 130 g. Fiber 14 g per 1,000 kcal. Vitamins and minerals: adult RDAs (NIH Office of Dietary Supplements).
function nutritionTargets() {
  const b = S.profile.body || {}, o = S.profile.targets || {};
  const w = num(b.w), h = num(b.h), age = num(b.age), sex = b.sex;
  const ready = w != null && h != null && age != null && !!sex;
  let kcal = null;
  if (ready) {
    const bmr = 10 * w + 6.25 * h - 5 * age + (sex === "m" ? 5 : sex === "f" ? -161 : -78);
    kcal = Math.round(bmr * (ACTIVITY.find(a => a[0] === (b.act || "light")) || ACTIVITY[1])[2] / 10) * 10;
  }
  const T = {}, auto = {};
  auto.kcal = kcal;
  auto.p = w != null ? Math.round(w * 1.2) : null;
  T.kcal = num(o.kcal) ?? auto.kcal;
  T.p = num(o.p) ?? auto.p;
  auto.f = T.kcal ? Math.round(T.kcal * 0.3 / 9) : null;
  T.f = num(o.f) ?? auto.f;
  auto.c = T.kcal && T.p != null && T.f != null ? Math.max(130, Math.round((T.kcal - T.p * 4 - T.f * 9) / 4)) : null;
  T.c = num(o.c) ?? auto.c;
  auto.fib = T.kcal ? Math.round(T.kcal / 1000 * 14) : sex === "m" ? 34 : sex === "f" ? 25 : null;
  T.fib = num(o.fib) ?? auto.fib;
  auto.sat = T.kcal ? Math.round(T.kcal * 0.1 / 9) : null;
  T.sat = auto.sat;
  const f = sex === "f", m = sex === "m", a = age ?? 30;
  const pick = (mv, fv) => m ? mv : f ? fv : Math.max(mv, fv);
  Object.assign(T, {
    ca: a >= 71 || (f && a >= 51) ? 1200 : 1000, fe: pick(8, a >= 51 ? 8 : 18), mg: pick(a >= 31 ? 420 : 400, a >= 31 ? 320 : 310),
    zn: pick(11, 8), d: a >= 71 ? 20 : 15, b12: 2.4,
  });
  return { T, auto, ready, adult: age == null || age >= 19 };
}

// ---------- Today: totals and the logged foods ----------
function nutBar(k, v, t, opt = {}) {
  const [name, unit] = NUT_INFO[k], pctv = t ? clamp(v / t) : 0, limit = k === "sat";
  return `<div class="nbar-row${opt.compact ? " compact" : ""}"><span class="nbar-k">${name}</span><span class="nbar-v">${fmtN(v)}${t ? `<em> / ${limit ? "under " : ""}${fmtN(t)}${unit === "kcal" ? "" : " " + unit}</em>` : ` ${unit}`}</span>
    <span class="nbar${limit ? " limit" : ""}" aria-hidden="true"><i style="width:${Math.round(pctv * 100)}%"></i></span></div>`;
}
function foodSummaryHtml(d) {
  const x = dayNutrition(d), { T } = nutritionTargets();
  if (!x.foods) return "";
  const missing = x.foods - x.measured;
  return `<button type="button" class="row nut-sum" data-act="push" data-k="nutrition">
      <span class="nut-main"><span class="nut-kcal"><b>${fmtN(x.tot.kcal)}</b> ${T.kcal ? `of ${fmtN(T.kcal)} kcal` : "kcal"}</span>
      <span class="nut-bars">${["p", "f", "c", "fib"].map(k => nutBar(k, x.tot[k], T[k], { compact: true })).join("")}</span></span>${icon("chevR", "chev")}</button>` +
    (missing ? `<button type="button" class="row action nut-missing" data-act="foodFixNext">${icon("plus", "lead")}<span class="row-label">${missing} food${missing > 1 ? "s need" : " needs"} nutrition</span></button>` : "") +
    (!T.kcal ? `<button type="button" class="row action" data-act="push" data-k="nutrition">${icon("plus", "lead")}<span class="row-label">Set your targets</span></button>` : "");
}
function foodLogHtml(d) {
  const map = lib(), on = (d.items || []).filter(e => map[e.id] && map[e.id].cat === "food" && !e.mid);
  if (!on.length) return "";
  const x = dayNutrition(d, map);
  return `<div class="row meal-head"><span class="row-label">Not in a meal yet</span></div>` + MEALS.map(([k, name]) => {
    const es = on.filter(e => entryMeal(e) === k);
    if (!es.length) return "";
    const rows = es.map(e => {
      const it = map[e.id], { q, u } = entryQU(e, it), n = nutOf(it, q, u, map);
      return `<button type="button" class="row nav food-row" data-act="foodEdit" data-id="${e.id}"><span class="row-main"><span class="row-label">${esc(it.name)}</span>
        <span class="row-sub">${n ? `${esc(fmtQU(q, u))} · ${fmtN(n.kcal)} kcal · ${fmtN(n.p)} g protein` : "Add nutrition"}${e.time ? ` · ${esc(fmtTime(e.time))}` : ""} · tap to put in a meal</span></span>${icon("chevR", "chev")}</button>`;
    }).join("");
    return rows;
  }).join("");
}

// ---------- sheets ----------
const FOOD_SHEETS = ["foodSearch", "foodEntry", "foodMeal", "meal", "mealFood"];
function mealSeg(cur) {
  return `<div class="row field-row"><span class="row-label">Meal</span><span class="seg meal-seg" role="radiogroup">${MEALS.slice(0, 4).map(([k, n]) => `<label><input type="radio" name="meal" value="${k}" ${cur === k ? "checked" : ""}><span>${n === "Snacks" ? "Snack" : n.slice(0, 5) === "Break" ? "Bkfst" : n}</span></label>`).join("")}</span></div>`;
}
function amountRows(portions, q, u) {
  return `<div class="row field-row"><span class="row-label">Amount</span><span class="qty"><button type="button" class="iconbtn step" data-act="qtyStep" data-d="-1" aria-label="Less">−</button>
      <input type="number" id="fq" name="q" value="${fmtQ(q)}" min="0" step="any" inputmode="decimal" aria-label="Amount"><button type="button" class="iconbtn step" data-act="qtyStep" data-d="1" aria-label="More">+</button></span></div>
    <label class="row field-row" for="fu"><span class="row-label">Portion</span><select id="fu" name="u">${portions.map(([l, g]) => `<option value="${esc(l)}" ${l === u ? "selected" : ""}>${esc(l === "g" ? "grams" : l)}${g && l !== "g" ? ` (${fmtN(g)} g)` : ""}</option>`).join("")}</select></label>`;
}
function previewHtml(it, q, u) {
  const n = nutOf(it, q, u, lib());
  return n ? `<div class="row nut-prev" id="fe-prev">${["kcal", "p", "f", "c", "fib"].map(k => `<span><b>${fmtN(n[k])}</b>${k === "kcal" ? " kcal" : " g " + NUT_INFO[k][0].toLowerCase()}</span>`).join("")}</div>` : `<div class="row nut-prev" id="fe-prev"><span class="row-sub">No nutrition for this amount</span></div>`;
}
function draftItem(s) {
  // the food being added, shaped like a library item so the preview can use the same maths
  if (s.step === "pick") return { nut: s.f.nut, portions: s.f.portions };
  return null;
}
function foodResultsHtml(s) {
  const q = (s.q || "").trim(), ql = q.toLowerCase();
  const mine = q ? S.profile.library.filter(i => i.cat === "food" && !i.hidden && i.name.toLowerCase().includes(ql) && i.id !== s.link).slice(0, 6) : [];
  let h = "";
  if (mine.length && !s.link) h += `<h3 class="sheet-h3">Your foods</h3><div class="list">${mine.map(i => `<button type="button" class="row nav" data-act="fsLib" data-id="${i.id}"><span class="row-main"><span class="row-label">${esc(i.name)}</span><span class="row-sub">${hasNutrition(i) ? esc(fmtQU(usualOf(i).q, usualOf(i).u)) : "No nutrition yet"}</span></span>${icon("plus", "chev")}</button>`).join("")}</div>`;
  if (!Foods.data) h += `<div class="list"><div class="row"><span class="row-sub">${Foods.failed ? "Couldn't load the food database. Check your connection and try again; after one load it works offline." : "Loading the food database…"}</span></div></div>`;
  else if (q.length >= 2) {
    s.results = Foods.search(q);
    h += `<h3 class="sheet-h3">USDA foods</h3><div class="list">${s.results.length ? s.results.map((f, i) => `<button type="button" class="row nav" data-act="fsPick" data-i="${i}"><span class="row-main"><span class="row-label">${esc(f.name)}</span><span class="row-sub">${f.portions[0] ? `${esc(f.portions[0][0])} · ${fmtN(f.nut.kcal * f.portions[0][1] / 100)} kcal` : `100 g · ${fmtN(f.nut.kcal)} kcal`}</span></span>${icon("chevR", "chev")}</button>`).join("")
      : `<div class="row"><span class="row-sub">No match. Try a simpler word, like "bread" or "chicken".</span></div>`}</div>`;
  }
  if (q && !s.link) h += `<div class="list"><button type="button" class="row action" data-act="fsPlain">${icon("plus", "lead")}<span class="row-label">Add "${esc(q)}" without nutrition</span></button></div>`;
  h += `<div class="list"><button type="button" class="row action" data-act="fsLabel">${icon("plus", "lead")}<span class="row-label">Enter from a food label</span></button></div>`;
  return h;
}
const hasNutrition = it => !!(it.nut || (it.parts && it.parts.length));

function foodSheetParts(s) {
  if (s.k === "meal" || s.k === "mealFood") return mealSheetParts(s);
  const map = lib();
  if (s.k === "foodSearch" && s.step === "search") {
    const linkIt = s.link && map[s.link];
    return { title: linkIt ? "Add nutrition" : "Add food", form: false,
      body: `${linkIt ? `<p class="sheet-text">Pick the closest match for <b>${esc(linkIt.name)}</b>. Past entries will use your usual portion.</p>` : ""}
        <div class="searchbar">${icon("search")}<input type="search" id="fs-q" value="${esc(s.q || "")}" placeholder="Search foods, e.g. sourdough" aria-label="Search foods" autocomplete="off" enterkeyhint="search"></div>
        <div id="fs-res">${foodResultsHtml(s)}</div><p class="footnote">Nutrition data: USDA FoodData Central. It's searched on this device.</p>` };
  }
  if (s.k === "foodSearch" && s.step === "pick") {
    const f = s.f, it = draftItem(s), portions = [...f.portions, ["g", 1]], u = s.u || defaultPortion(f.portions), q = s.qv ?? (u === "g" ? 100 : 1);
    const linkIt = s.link && map[s.link];
    const name = s.name ?? (linkIt ? linkIt.name : s.q && s.q.trim().length >= 3 ? s.q.trim().replace(/^\w/, c => c.toUpperCase()) : f.name);
    return { title: linkIt ? "Add nutrition" : "Add food", submitLabel: linkIt ? "Save" : "Add",
      body: `<p class="sheet-text"><button type="button" class="textbtn" data-act="fsBack">${icon("chevL")} Results</button> ${esc(f.name)}</p>
        <div class="list">${linkIt ? "" : `<label class="row field-row stack" for="fn"><span class="row-label">Name in your journal</span><input id="fn" name="name" required value="${esc(name)}"></label>`}
        ${amountRows(portions, q, u)}${linkIt || s.fromMeal ? "" : mealSeg(s.meal || guessMealNow())}
        ${linkIt || s.fromMeal ? "" : `<label class="row field-row" for="ft"><span class="row-label">Time</span><input type="time" id="ft" name="time" value=""></label>`}</div>
        <div class="list">${previewHtml(it, q, u)}</div><p class="footnote">This becomes your usual portion, so next time one tap logs it.</p>` };
  }
  if (s.k === "foodSearch" && s.step === "label") {
    const linkIt = s.link && map[s.link];
    const fld = (id, label, unit, req) => `<label class="row field-row" for="lb-${id}"><span class="row-label">${label}</span><span class="field-end"><input type="number" id="lb-${id}" name="${id}" min="0" step="any" inputmode="decimal" ${req ? "required" : ""} placeholder="–"><span class="unit">${unit}</span></span></label>`;
    return { title: "From a food label", submitLabel: linkIt ? "Save" : "Add",
      body: `<p class="sheet-text"><button type="button" class="textbtn" data-act="fsBack">${icon("chevL")} Search</button> Copy the numbers for one serving.</p>
        <div class="list">${linkIt ? "" : `<label class="row field-row stack" for="lb-name"><span class="row-label">Name</span><input id="lb-name" name="name" required value="${esc(s.q || "")}"></label>`}
        <label class="row field-row stack" for="lb-serv"><span class="row-label">Serving</span><input id="lb-serv" name="serv" value="serving" placeholder="e.g. bar, cup, 2 crackers"></label>
        ${fld("g", "Serving weight", "g", false)}</div>
        <div class="list">${fld("kcal", "Calories", "kcal", true)}${fld("p", "Protein", "g")}${fld("f", "Fat", "g")}${fld("c", "Carbs", "g")}${fld("fib", "Fiber", "g")}${fld("sug", "Sugars", "g")}${fld("sat", "Saturated fat", "g")}</div>
        <div class="list"><label class="row field-row" for="lb-q"><span class="row-label">Servings eaten</span><input type="number" id="lb-q" name="q" value="1" min="0" step="any" inputmode="decimal"></label>${linkIt || s.fromMeal ? "" : mealSeg(guessMealNow())}</div>` };
  }
  if (s.k === "foodEntry") {
    const d = getDay(s.date || UI.date) || { items: [] }, e = d.items.find(x => x.id === s.id && !x.mid), it = map[s.id];
    if (!e || !it) return { title: "Food", form: false, body: `<p class="sheet-text">This entry was removed.</p>` };
    const { q, u } = entryQU(e, it), portions = it.parts ? [["1 meal", null]] : [...(it.portions || []), ["g", 1]];
    return { title: it.name, submitLabel: "Save",
      body: `<div class="list">${hasNutrition(it) ? amountRows(portions, q, u) : `<div class="row"><span class="row-sub">This food has no nutrition yet. Add it once and every past and future entry counts.</span></div>`}
          ${mealSeg(entryMeal(e))}<label class="row field-row" for="ft"><span class="row-label">Time</span><input type="time" id="ft" name="time" value="${esc(e.time || "")}"></label></div>
        ${hasNutrition(it) ? `<div class="list">${previewHtml(it, q, u)}</div>` : ""}
        ${it.parts ? `<div class="list">${it.parts.map(p => map[p.id] ? `<div class="row"><span class="row-label">${esc(map[p.id].name)}</span><span class="row-value">${esc(fmtQU(p.q, p.u))}</span></div>` : "").join("")}</div>`
          : `<div class="list"><button type="button" class="row action" data-act="fsLink" data-id="${it.id}">${icon(hasNutrition(it) ? "search" : "plus", "lead")}<span class="row-label">${hasNutrition(it) ? "Change nutrition match" : "Add nutrition"}</span></button></div>`}`,
      del: `<button type="button" class="btn destructive block" data-act="foodDel" data-id="${it.id}">Remove from this day</button>` };
  }
  if (s.k === "foodMeal") {
    const es = s.parts || getDay(UI.date).items.filter(e => map[e.id] && map[e.id].cat === "food" && entryMeal(e) === s.meal);
    return { title: "Save as a meal", submitLabel: "Save",
      body: `<div class="list"><label class="row field-row stack" for="mn"><span class="row-label">Name</span><input id="mn" name="name" required value="Usual ${esc(MEAL_NAME[s.meal].toLowerCase().replace(/s$/, ""))}"></label></div>
        <div class="list">${es.map(e => { const it = map[e.id], { q, u } = entryQU(e, it); return `<div class="row"><span class="row-label">${esc(it.name)}</span><span class="row-value">${esc(fmtQU(q, u))}</span></div>`; }).join("")}</div>
        <p class="footnote">It becomes one button under Food & drink. One tap logs all of it. Each food still counts on its own in Insights.</p>` };
  }
}
function guessMealNow() { return UI.date === todayStr() ? mealAt(nowHours()) : "other"; }

function logFood(it, opt) {
  const date = UI.date, d = touchDay(date), i = d.items.findIndex(x => x.id === it.id && !x.mid);
  const e = newFoodEntry(it, date, opt);
  if (i >= 0) d.items[i] = { ...d.items[i], ...e }; else d.items.push(e);
  if (opt && opt.meal) it.meal = opt.meal;
  Store.saveProfile(); haptic(); commitDay(date);
}
function submitFoodSheet(fd) {
  const s = UI.sheet, map = lib();
  if (s.k === "meal" || s.k === "mealFood") { submitMealSheet(fd); return; }
  const meal = fd.get("meal") || undefined, time = fd.get("time") || "";
  if (s.k === "foodSearch" && s.step === "pick") {
    const f = s.f, q = num(fd.get("q")) ?? 1, u = fd.get("u");
    const it = s.link ? map[s.link] : addLibraryItem(String(fd.get("name") || f.name), "food");
    Object.assign(it, { nut: f.nut, portions: f.portions, fdc: f.fdc, src: "usda", usdaName: f.name, usual: { q, u } });
    if (s.link) { Store.saveProfile(); if (s.back) { mealReturn(); return; } closeSheet(); render(); toast("Nutrition added. Past entries use your usual portion."); return; }
    if (s.back) { Store.saveProfile(); addToDraft(s.back.draft, it, { q, u }); s.back.q = ""; mealReturn(); return; }
    logFood(it, { q, u, meal, time }); closeSheet(); render(); return;
  }
  if (s.k === "foodSearch" && s.step === "label") {
    const g = num(fd.get("g")), serv = String(fd.get("serv") || "serving").trim() || "serving", q = num(fd.get("q")) ?? 1;
    const per = {}; NUT_KEYS.forEach(k => { per[k] = num(fd.get(k)) || 0; });
    // without a weight, the serving stands in for 100 g so the maths stays the same
    const base = g || 100, nut = {}; NUT_KEYS.forEach(k => { nut[k] = per[k] * 100 / base; });
    const label = `1 ${serv}`;
    const it = s.link ? map[s.link] : addLibraryItem(String(fd.get("name") || s.q || "Food"), "food");
    Object.assign(it, { nut, portions: [[label, base]], src: "label", usual: { q, u: label } });
    delete it.fdc; delete it.usdaName;
    if (s.link) { Store.saveProfile(); if (s.back) { mealReturn(); return; } closeSheet(); render(); toast("Nutrition added"); return; }
    if (s.back) { Store.saveProfile(); addToDraft(s.back.draft, it, { q, u: label }); s.back.q = ""; mealReturn(); return; }
    logFood(it, { q, u: label, meal, time }); closeSheet(); render(); return;
  }
  if (s.k === "foodEntry") {
    const date = s.date || UI.date, d = touchDay(date), e = d.items.find(x => x.id === s.id && !x.mid), it = map[s.id];
    if (!e || !it) { closeSheet(); return; }
    if (fd.get("q") != null) { e.q = num(fd.get("q")) ?? e.q; e.u = fd.get("u") || e.u; it.usual = { q: e.q, u: e.u }; }
    if (meal) { e.meal = meal; it.meal = meal; }
    e.time = time;
    // choosing a meal puts a loose food into that meal
    if (meal && meal !== "other" && !d.items.some(x => x.id === e.id && x.mid && (d.meals || []).some(m => m.id === x.mid && m.type === meal))) { e.mid = mealFor(d, meal, time).id; e.time = ""; syncMealTiming(d); }
    Store.saveProfile(); commitDay(date); closeSheet(); render(); return;
  }
  if (s.k === "foodMeal") {
    const es = (s.parts || getDay(UI.date).items.filter(e => map[e.id] && map[e.id].cat === "food" && entryMeal(e) === s.meal)).filter(e => map[e.id] && !map[e.id].parts);
    const name = String(fd.get("name") || "").trim() || "Usual meal";
    const it = addLibraryItem(name, "food");
    Object.assign(it, { parts: es.map(e => ({ id: e.id, ...entryQU(e, map[e.id]) })), usual: { q: 1, u: "1 meal" }, meal: s.meal });
    Store.saveProfile();
    if (s.back) { mealReturn(); toast(`Saved "${name}". Next time, add it from Your foods.`); return; }
    closeSheet(); render(); toast(`Saved "${name}". Tomorrow, one tap logs it.`);
  }
}

function refreshPreview() {
  const s = UI.sheet, box = $("#fe-prev");
  if (!s || !box) return;
  const it = s.k === "foodEntry" ? lib()[s.id] : s.k === "mealFood" ? lib()[(s.back.draft.foods[s.i] || {}).id] : draftItem(s);
  const q = num(($("#fq") || {}).value) ?? 0, u = ($("#fu") || {}).value;
  if (it && u) box.outerHTML = previewHtml(it, q, u);
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const s = UI.sheet, map = lib();
  switch (t.dataset.act) {
    case "foodAdd":
      openSheet({ k: "foodSearch", step: "search", q: "" });
      Foods.load().then(() => { if (UI.sheet && UI.sheet.k === "foodSearch") { const r = $("#fs-res"); if (r) r.innerHTML = foodResultsHtml(UI.sheet); } }).catch(() => { const r = $("#fs-res"); if (r && UI.sheet) r.innerHTML = foodResultsHtml(UI.sheet); });
      setTimeout(() => { const i = $("#fs-q"); if (i) i.focus(); }, 320);
      break;
    case "fsLink": case "foodFixNext": {
      let id = t.dataset.id;
      if (!id) { const d = getDay(UI.date); const e = d && d.items.find(x => map[x.id] && map[x.id].cat === "food" && !hasNutrition(map[x.id])); if (!e) break; id = e.id; }
      const next = { k: "foodSearch", step: "search", q: map[id].name, link: id };
      if (s) { UI.sheet = next; renderSheet(); } else openSheet(next);
      Foods.load().then(() => { const r = $("#fs-res"); if (r && UI.sheet) r.innerHTML = foodResultsHtml(UI.sheet); }).catch(() => {});
      break;
    }
    case "fsPick": if (s && s.results) { s.f = s.results[Number(t.dataset.i)]; s.step = "pick"; s.u = s.qv = s.name = undefined; renderSheet(); } break;
    case "fsBack": if (s && s.back) { mealReturn(); break; } if (s) { s.step = "search"; renderSheet(); const i = $("#fs-q"); if (i) i.focus(); } break;
    case "fsLabel": if (s) { s.step = "label"; renderSheet(); } break;
    case "fsLib": { const it = map[t.dataset.id]; if (!it) break; logFood(it, {}); closeSheet(); render(); break; }
    case "fsPlain": { const it = addLibraryItem(s.q, "food"); if (it) { logFood(it, {}); closeSheet(); render(); toast("Added. Tap it on Today to add nutrition later."); } break; }
    case "foodEdit": openSheet({ k: "foodEntry", id: t.dataset.id, date: UI.date }); break;
    case "foodDel": { const d = touchDay(UI.date); d.items = d.items.filter(x => x.id !== t.dataset.id || x.mid); commitDay(UI.date); closeSheet(); render(); break; }
    case "foodSaveMeal": openSheet({ k: "foodMeal", meal: t.dataset.m }); break;
    case "qtyStep": {
      const i = $("#fq"); if (!i) break;
      const unit = ($("#fu") || {}).value, step = unit === "g" ? 10 : 0.5;
      i.value = fmtQ(Math.max(0, (num(i.value) || 0) + Number(t.dataset.d) * step));
      refreshPreview(); break;
    }
  }
});
document.addEventListener("input", e => {
  const t = e.target, s = UI.sheet;
  if (t.id === "fs-q" && s && s.k === "foodSearch") { s.q = t.value; const r = $("#fs-res"); if (r) r.innerHTML = foodResultsHtml(s); }
  else if (t.id === "fq") refreshPreview();
  else if (t.dataset.act === "target") {
    S.profile.targets ||= {};
    if (num(t.value) == null) delete S.profile.targets[t.dataset.k]; else S.profile.targets[t.dataset.k] = num(t.value);
    Store.saveProfile();
  }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "fu") {
    // switching between grams and a portion: keep the amount sensible
    const i = $("#fq");
    if (i && t.value === "g" && (num(i.value) || 0) < 10) i.value = "100"; else if (i && t.value !== "g" && (num(i.value) || 0) >= 10) i.value = "1";
    refreshPreview();
  } else if (t.dataset.act === "body") {
    const b = S.profile.body ||= { units: "us" }, f = t.dataset.f;
    if (f === "units" || f === "sex" || f === "act") b[f] = t.value;
    else if (f === "age") b.age = num(t.value);
    else if (f === "w") b.w = num(t.value) == null ? null : b.units === "metric" ? num(t.value) : Math.round(num(t.value) * 0.45359 * 10) / 10;
    else if (f === "hcm") b.h = num(t.value);
    else if (f === "hft" || f === "hin") { const ft = num(($("#b-hft") || {}).value) || 0, inch = num(($("#b-hin") || {}).value) || 0; b.h = ft || inch ? Math.round((ft * 12 + inch) * 2.54) : null; }
    Store.saveProfile(); render();
  } else if (t.dataset.act === "target") render();
});

// ---------- Nutrition screen ----------
function viewNutrition() {
  const date = UI.date, d = getDay(date), x = dayNutrition(d), { T, auto, ready, adult } = nutritionTargets();
  const wk = nutritionAverage(7), b = S.profile.body || { units: "us" }, us = b.units !== "metric";
  let h = largeTitle("Nutrition", "Food only. Supplements aren't counted.");
  if (x.foods) {
    h += group(date === todayStr() ? "Today" : esc(fmtDate(date)), MACROS.map(k => nutBar(k, x.tot[k], T[k])).join("") + nutBar("sat", x.tot.sat, T.sat) +
      MEALS.filter(([k]) => x.meals[k]).map(([k, n]) => `<div class="row"><span class="row-label">${n}</span><span class="row-value">${fmtN(x.meals[k].kcal)} kcal · ${fmtN(x.meals[k].p)} g protein</span></div>`).join(""),
      x.measured < x.foods ? `${x.measured} of ${x.foods} foods have nutrition, so these totals are low.` : "");
  } else h += group(date === todayStr() ? "Today" : esc(fmtDate(date)), `<div class="row"><span class="row-sub">No food logged on this day yet.</span></div>`);
  if (wk) {
    h += group(`Last 7 days <span class="gh-meta">average of ${wk.days} day${wk.days > 1 ? "s" : ""}</span>`, MACROS.map(k => nutBar(k, wk.avg[k], T[k])).join(""));
    h += group("Vitamins & minerals", MICROS.map(k => nutBar(k, wk.avg[k], T[k])).join(""), "Daily averages against adult recommended intakes. Vitamin D is hard to get from food, which is why many people supplement it.");
  }
  // about you
  h += group("About you", `<div class="row field-row"><span class="row-label">Units</span>${radioSeg("units", [["us", "US"], ["metric", "Metric"]], b.units || "us")}</div>
    <div class="row field-row"><span class="row-label">Sex</span>${radioSeg("sex", [["f", "Female"], ["m", "Male"], ["x", "Other"]], b.sex)}</div>
    <label class="row field-row" for="b-age"><span class="row-label">Age</span><span class="field-end"><input type="number" id="b-age" data-act="body" data-f="age" min="13" max="110" inputmode="numeric" value="${esc(b.age ?? "")}" placeholder="–"><span class="unit">years</span></span></label>
    ${us ? `<div class="row field-row"><span class="row-label">Height</span><span class="field-end"><input type="number" id="b-hft" data-act="body" data-f="hft" min="3" max="8" inputmode="numeric" value="${b.h ? Math.floor(b.h / 2.54 / 12) : ""}" placeholder="–"><span class="unit">ft</span><input type="number" id="b-hin" data-act="body" data-f="hin" min="0" max="11" inputmode="numeric" value="${b.h ? Math.round(b.h / 2.54 % 12) % 12 : ""}" placeholder="–"><span class="unit">in</span></span></div>`
      : `<label class="row field-row" for="b-hcm"><span class="row-label">Height</span><span class="field-end"><input type="number" id="b-hcm" data-act="body" data-f="hcm" min="100" max="250" inputmode="numeric" value="${esc(b.h ?? "")}" placeholder="–"><span class="unit">cm</span></span></label>`}
    <label class="row field-row" for="b-w"><span class="row-label">Weight</span><span class="field-end"><input type="number" id="b-w" data-act="body" data-f="w" min="25" max="700" step="0.1" inputmode="decimal" value="${b.w ? (us ? Math.round(b.w / 0.45359) : b.w) : ""}" placeholder="–"><span class="unit">${us ? "lb" : "kg"}</span></span></label>
    <label class="row field-row" for="b-act"><span class="row-label">Activity</span><select id="b-act" data-act="body" data-f="act">${ACTIVITY.map(([k, n]) => `<option value="${k}" ${(b.act || "light") === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>`,
    ready ? "" : "Add these to get targets for eating enough. They stay on this device.");
  h += group("Your daily targets", MACROS.map(k => `<label class="row field-row" for="tg-${k}"><span class="row-label">${NUT_INFO[k][0]}</span><span class="field-end"><input type="number" id="tg-${k}" data-act="target" data-k="${k}" min="0" inputmode="numeric" value="${esc((S.profile.targets || {})[k] ?? "")}" placeholder="${auto[k] != null ? fmtN(auto[k]) : "–"}"><span class="unit">${NUT_INFO[k][1]}</span></span></label>`).join(""),
    `${adult ? "" : "These formulas are for adults. Ask a clinician or dietitian for targets under 19. "}Calories are what your body uses in a day at your activity level, so the aim is eating enough to maintain, not cutting. Protein is 1.2 g per kg (the bare minimum is 0.8), fat 30% of calories, and carbs the rest, at least 130 g. Fiber is 14 g per 1,000 calories; raise it slowly if fiber flares you. Type a number to set your own.`);
  return h;
}
function radioSeg(f, opts, cur) {
  return `<span class="seg" role="radiogroup">${opts.map(([v, n]) => `<label><input type="radio" name="body-${f}" data-act="body" data-f="${f}" value="${v}" ${cur === v ? "checked" : ""}><span>${n}</span></label>`).join("")}</span>`;
}

// 7-day nutrition on Trends
function trendsNutritionHtml() {
  const wk = nutritionAverage(7), mo = nutritionAverage(30), { T } = nutritionTargets();
  if (!wk) return "";
  return group(`Nutrition <span class="gh-meta">7-day average</span>`, MACROS.map(k => nutBar(k, wk.avg[k], T[k])).join("") +
    (mo && mo.days > wk.days ? `<div class="row"><span class="row-sub">30-day average: ${fmtN(mo.avg.kcal)} kcal, ${fmtN(mo.avg.p)} g protein, ${fmtN(mo.avg.fib)} g fiber</span></div>` : "") +
    navRow({ label: "Nutrition details", act: "push", attrs: `data-k="nutrition"` }));
}

// ---------- nutrition insights ----------
function nutEffect(X, pred, lags = [0, 1]) {
  const map = lib();
  let best = null;
  for (const lag of lags) {
    const on = [], off = [];
    for (const date of X.st.dates) {
      const dn = dayNutrition(S.days[date], map);
      if (!dn.ok) continue;
      const p = pred(dn, date), v = X.st.res[addDays(date, lag)];
      if (p == null || v == null) continue;
      (p ? on : off).push(v);
    }
    const c = compare(on, off);
    if (c && (!best || Math.abs(c.t) > Math.abs(best.t))) best = { ...c, lag };
  }
  if (best) best.conf = confidence(best, lags.length > 1 ? 0.3 : 0);
  return best;
}
const sig = fx => fx && fx.diff >= 0.8 && fx.conf && fx.conf !== "low";
RULES.push(
  function eatingEnough(X) {
    const a = nutritionAverage(14), { T } = nutritionTargets();
    if (!a || a.days < 5 || !T.kcal || a.avg.kcal >= T.kcal * 0.8) return null;
    const ev = [["Journal", `Averaging ${fmtN(a.avg.kcal)} kcal a day over ${a.days} measured days, against about ${fmtN(T.kcal)} to maintain`]];
    if (T.p && a.avg.p < T.p * 0.8) ev.push(["Journal", `Protein ${fmtN(a.avg.p)} g a day, target ${fmtN(T.p)} g`]);
    if (X.yes("food_fear")) ev.push(["History", "You said you avoid foods for fear of symptoms"]);
    if (X.yes("restrictive_diet_long")) ev.push(["History", "You said you've been on a restrictive diet for a long time"]);
    if ((X.F.fatigue || 0) >= 0.4) ev.push(["Journal", FEATURES.fatigue]);
    return { id: "eat-enough", kind: "act", conf: a.days >= 10 ? "high" : "moderate", drivers: ["restrictive_diet", "nutrients"], test: "eat_enough",
      title: "You're eating less than your body uses", summary: `About ${pct(a.avg.kcal / T.kcal)} of what you need to maintain.`, evidence: ev,
      why: "Many people with SIBO under-eat without realizing it, often from fear of symptoms. Weeks of too little food can bring fatigue, brain fog, muscle loss and a slower metabolism, and long, narrow diets shrink the variety of protective gut microbes.",
      ask: ["Could a dietitian who knows SIBO help me eat enough with foods I tolerate?"] };
  },
  function proteinLow(X) {
    const a = nutritionAverage(14), { T } = nutritionTargets();
    if (!a || a.days < 5 || !T.p || a.avg.p >= T.p * 0.8 || X.fired.has("eat-enough")) return null;
    return { id: "protein-low", kind: "act", conf: a.days >= 10 ? "moderate" : "low", drivers: ["nutrients"], test: "protein_meals",
      title: "Protein is running low", summary: `${fmtN(a.avg.p)} g a day against a target of ${fmtN(T.p)} g.`,
      evidence: [["Journal", `Protein averaged ${fmtN(a.avg.p)} g over ${a.days} measured days`]],
      why: "Protein rebuilds the gut lining and keeps muscle while you recover. Eggs, fish, poultry, meat, firm tofu and lactose-free dairy are usually well tolerated on SIBO diets.", ask: [] };
  },
  function fiberLow(X) {
    const a = nutritionAverage(14), { T } = nutritionTargets();
    if (!a || a.days < 5 || !T.fib || a.avg.fib >= T.fib * 0.5) return null;
    return { id: "fiber-low", kind: "watch", conf: "moderate", drivers: ["restrictive_diet"],
      title: "Fiber is low", summary: `${fmtN(a.avg.fib)} g a day against ${fmtN(T.fib)} g.`,
      evidence: [["Journal", `Fiber averaged ${fmtN(a.avg.fib)} g over ${a.days} measured days`]],
      why: "Some fiber feeds the microbes that protect the gut lining and keeps stools moving. With SIBO, gentle sources tend to go down best: PHGG, oats, chia, kiwi and well-cooked vegetables. Raise it slowly and watch your log.", ask: [] };
  },
  function microGaps(X) {
    const a = nutritionAverage(14), { T } = nutritionTargets();
    if (!a || a.days < 7) return null;
    const low = MICROS.filter(k => a.avg[k] < T[k] * 0.7);
    if (!low.length) return null;
    const labFor = { fe: "ferritin", zn: "zinc", b12: "b12", d: "vitd" };
    const ev = low.map(k => ["Journal", `${NUT_INFO[k][0]}: ${fmtN(a.avg[k])} ${NUT_INFO[k][1]} a day from food, against ${fmtN(T[k])}`]);
    low.forEach(k => { const l = labFor[k]; if (l && X.labFlag(l) >= 0.5) ev.push(["Lab", `${LABMAP[l].name} ${S.profile.labs[l]} ${LABMAP[l].unit}. ${LABMAP[l].hint}`]); });
    return { id: "micro-gaps", kind: "ask", conf: ev.some(x => x[0] === "Lab") ? "high" : "moderate", drivers: ["nutrients"],
      title: low.length > 1 ? "Your food is low in a few nutrients" : `Your food is low in ${NUT_INFO[low[0]][0].toLowerCase()}`,
      summary: low.map(k => NUT_INFO[k][0]).join(", "), evidence: ev,
      why: "Overgrowth can compete for B12 and iron, and a narrow diet makes gaps likelier. Low iron, zinc, magnesium and vitamin D affect energy, gut lining repair and motility. Supplements you take aren't counted here, so check those too.",
      ask: ["Should we test or supplement any of these?"] };
  },
  function fatDose(X) {
    const fx = nutEffect(X, dn => dn.maxMealFat >= 25);
    if (!sig(fx)) return null;
    return { id: "fat-dose", kind: "act", conf: fx.conf, drivers: ["bile", "pancreatic"], test: "lower_fat",
      title: "Meals over 25 g of fat come before worse days", summary: `${r1(fx.diff)} points worse ${LAG_TEXT[fx.lag]}.`,
      evidence: [["Journal", `Days with a meal of 25 g fat or more: ${fxText(fx)}`]].concat(["fatty_stool", "gallbladder_removed"].filter(k => X.yes(k)).map(k => ["History", `You said yes: ${INTAKEMAP[k].q}`])),
      why: "Fat needs bile and pancreatic enzymes to digest. When either runs low, a large fatty meal is poorly absorbed and feeds fermentation further down. Spreading fat across meals often helps.",
      ask: ["Would a stool elastase test or a look at bile flow be useful?"] };
  },
  function bigMeals(X) {
    const fx = nutEffect(X, dn => dn.maxMealKcal >= 800);
    if (!sig(fx)) return null;
    return { id: "big-meals", kind: "act", conf: fx.conf, drivers: ["gastroparesis", "mmc_grazing"], test: "smaller_meals",
      title: "Big meals come before worse days", summary: `Meals over 800 kcal: ${r1(fx.diff)} points worse ${LAG_TEXT[fx.lag]}.`,
      evidence: [["Journal", `Days with a meal of 800 kcal or more: ${fxText(fx)}`]],
      why: "A large meal stretches the stomach and takes longer to empty, which can mean more fermentation and bloating. Three moderate meals, spaced apart, keep the cleaning wave running between them.", ask: [] };
  },
  function fiberJump(X) {
    const map = lib(), fib = {};
    X.st.dates.forEach(d => { const dn = dayNutrition(S.days[d], map); if (dn.ok) fib[d] = dn.tot.fib; });
    const fx = nutEffect(X, (dn, date) => {
      const prior = []; for (let i = 1; i <= 7; i++) { const v = fib[addDays(date, -i)]; if (v != null) prior.push(v); }
      return prior.length < 3 ? null : dn.tot.fib >= mean(prior) * 1.5 && dn.tot.fib - mean(prior) >= 8;
    });
    if (!sig(fx)) return null;
    return { id: "fiber-jump", kind: "watch", conf: fx.conf, drivers: ["restrictive_diet"],
      title: "Sudden fiber jumps come before worse days", summary: `${r1(fx.diff)} points worse ${LAG_TEXT[fx.lag]}.`,
      evidence: [["Journal", `Days with 50% more fiber than your usual week: ${fxText(fx)}`]],
      why: "Gut microbes adjust to fiber over weeks. A sudden jump ferments fast and can flare gas and bloating. Raising it by a few grams a week usually works better than cutting it out.", ask: [] };
  },
  function nutritionSetup(X) {
    const map = lib(), measured = X.st.dates.filter(d => dayNutrition(S.days[d], map).ok).length, { ready } = nutritionTargets();
    if (ready || measured < 3) return null;
    return { id: "gap-targets", kind: "gap", drivers: [], link: "nutrition",
      title: "Add your height, weight and age", summary: "So the app can tell whether you're eating enough.",
      evidence: [["Journal", `${measured} days with measured food so far`]],
      why: "Targets for calories and protein depend on your size, age and activity. Without them the app can total your food but can't tell you if it's enough.", ask: [] };
  },
);
Object.assign(EXPERIMENTS, {
  eat_enough: { name: "Eat-enough trial", kind: "diet", days: 21, items: ["Calories within 10% of target", "Protein at every meal"],
    notes: "Use foods you already tolerate and spread them over 3 meals. Check the totals on Today. If symptoms flare, change which foods, not how much." },
  protein_meals: { name: "Protein at every meal", kind: "diet", days: 14, items: ["Protein at every meal"], notes: "Aim for a palm-sized portion of protein at each meal: eggs, fish, poultry, meat, firm tofu or lactose-free dairy." },
  smaller_meals: { name: "Moderate meals", kind: "diet", days: 14, items: ["No meal over 700 kcal"], notes: "Split big meals into moderate ones, still spaced 4 or more hours apart." },
});

// ---------- sample data gets real nutrition ----------
const SAMPLE_NUT = {"Eggs":[[143,12.4,9.9,0.96,0,0.2,3.2,48.0,1.7,11.0,1.2,2.5,0.81],[["1 egg",50],["1 cup",135]],2707156],"Chicken & rice":[[149,6.5,5.8,17.0,0.2,0.03,0.936,10.0,0.86,12.0,0.59,0,0.07],[["1 cup",196]],2706537],"Salmon":[[274,25.4,18.4,0.01,0,0.01,4.3,11.0,0.44,34.0,0.46,13.7,3.9],[["1 small/regular fillet",140],["1 large fillet",210],["1 steak",210],["1 cup",135]],2706286],"Blueberries":[[64.0,0.7,0.31,14.6,2.4,9.4,0.028,12.0,0.34,6.0,0.09,0,0],[["1 berry",2],["1 cup",150]],2709275],"Oats":[[76.0,2.2,2.6,11.2,1.7,0.17,0.853,12.0,0.67,24.0,0.61,0,0],[["1 cup, cooked",240],["1 cup, dry, yields",485],["1 oz, dry, yields",170]],2708380],"Coffee":[[1.0,0.12,0.02,0,0,0,0.002,2.0,0.01,3.0,0.02,0,0],[["1 fl oz",30],["1 cup (8 fl oz)",240],["1 small",360],["1 medium",480]],2710375],"Garlic":[[142,6.6,0.38,28.0,2.7,0.99,0.088,180,1.7,25.0,1.1,0,0],[["1 clove",3],["1 teaspoon",5]],2709932],"Onion":[[73.0,1.3,3.1,10.6,1.9,4.8,0.831,27.0,0.24,11.0,0.19,0,0],[["1 cup",215],["1 slice",15],["1 whole",151]],2709951],"Red wine":[[85.0,0.07,0,2.6,0,0.62,0,8.0,0.46,12.0,0.14,0,0],[["1 fl oz",30],["1 glass",180],["1/2 bottle",375]],2710688],"Aged cheddar":[[409,23.3,34.0,2.4,0,0.33,19.2,707,0.16,27.0,3.7,0.6,1.1],[["1 cracker-size slice",9],["1 slice",21],["1 stick",28.4],["1 cup, shredded",113]],2705709],"Banana":[[97.0,0.74,0.28,22.7,1.7,15.8,0.112,5.0,0,28.0,0.16,0,0],[["1 banana",126],["1 slice",6],["1 cup",150],["1 cup, mashed",225]],2709224],"Spinach salad":[[27.0,2.9,0.62,2.4,1.6,0.42,0.063,68.0,1.3,93.0,0.45,0,0],[["1 cup",25],["1 leaf",10],["1 baby leaf",0.6]],2709614],"Sourdough toast":[[299,11.8,2.7,57.0,2.4,5.1,0.581,57.0,4.3,35.0,1.1,0,0],[["1 small or thin/very thin slice",22],["1 medium or regular slice",28],["1 large or thick slice",39],["1 slice, crust not eaten",13]],2707647],"Zucchini":[[21.0,1.3,0.35,4.1,1.2,3.2,0.104,22.0,0.48,22.0,0.36,0,0],[["1 slice",10],["1 whole",200],["1 cup",180],["1 cup, mashed",240]],2709991]};
const SAMPLE_USUAL = { Eggs: [2, "1 egg", "breakfast"], "Sourdough toast": [1, null, "breakfast"], Coffee: [1, "1 cup (8 fl oz)", "breakfast"], "Chicken & rice": [1.5, null, "lunch"],
  Salmon: [1, null, "dinner"], Oats: [1, null, "breakfast"], Banana: [1, "1 banana", "snack"], Blueberries: [1, "1 cup", "snack"], "Aged cheddar": [1, "1 slice", "snack"], "Red wine": [1, "1 glass", "dinner"] };
const baseSampleState = sampleState;
sampleState = function () {
  const st = baseSampleState();
  for (const it of st.profile.library) {
    const s = SAMPLE_NUT[it.name];
    if (!s) continue;
    it.nut = Object.fromEntries(NUT_KEYS.map((k, i) => [k, s[0][i]]));
    it.portions = s[1]; it.fdc = s[2]; it.src = "usda";
    const u = SAMPLE_USUAL[it.name];
    it.usual = { q: u ? u[0] : 1, u: (u && u[1]) || defaultPortion(s[1]) };
    it.meal = u ? u[2] : "dinner";
  }
  const map = Object.fromEntries(st.profile.library.map(i => [i.id, i]));
  for (const d of Object.values(st.days)) {
    // sample meals: breakfast at 8, lunch, an afternoon snack, dinner at the day's last bite
    d.items = d.items.filter((e, i, a) => a.findIndex(x => x.id === e.id) === i);
    const at = { breakfast: "08:00", lunch: "12:30", snack: "15:30", dinner: d.food.last || "19:00" }, ms = {};
    for (const e of d.items) {
      const it = map[e.id]; if (!it || it.cat !== "food") continue;
      e.meal = it.meal;
      ms[e.meal] ||= { id: newId(), type: e.meal, time: at[e.meal] };
      e.mid = ms[e.meal].id;
    }
    d.meals = Object.values(ms);
    if (d.meals.length) { delete d.food.first; delete d.food.last; syncMealTiming(d); }
  }
  Object.assign(st.profile, { body: { units: "us", sex: "f", age: 34, h: 165, w: 59, act: "light" } });
  return st;
};
