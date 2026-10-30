/* SIBO Root Journal — meals: each meal is one entry with a type, a time and its foods.
   d.meals = [{ id, type, time }]; a food entry in d.items carries mid (its meal's id) and meal (the type).
   Meal times stand in for first and last bite and the meal count, and give the gaps between meals.
   Loaded after nutrition.js; shares its global scope. */

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_ONE = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const MEAL_TIME = { breakfast: "08:00", lunch: "12:30", dinner: "18:30", snack: "15:30" };

const dayMeals = d => ((d && d.meals) || []).slice().sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
const mealFoods = (d, mid) => ((d && d.items) || []).filter(e => e.mid === mid);
const timedMeals = d => dayMeals(d).filter(m => m.time);
function lastMealTime(d) { const t = timedMeals(d); return t.length ? t[t.length - 1].time : (d && d.food && d.food.last) || ""; }
function firstMealTime(d) { const t = timedMeals(d); return t.length ? t[0].time : (d && d.food && d.food.first) || ""; }
// hours between one meal and the next, in the order eaten
function mealGapsOf(d) {
  const t = timedMeals(d).map(m => hrs(m.time)), out = [];
  for (let i = 1; i < t.length; i++) out.push(t[i] - t[i - 1]);
  return out;
}
function overnightFast(date) {
  const a = lastMealTime(S.days[addDays(date, -1)]), b = firstMealTime(S.days[date]);
  return a && b ? 24 - hrs(a) + hrs(b) : null;
}
const fmtGap = h => { const m = Math.round(h * 60), hh = Math.floor(m / 60), mm = m % 60; return hh ? `${hh} h${mm ? ` ${mm} min` : ""}` : `${mm} min`; };
// first bite, last bite and the meal count follow the meals, so the timing analysis keeps reading d.food
function syncMealTiming(d) {
  if (!d.meals) return;
  const t = timedMeals(d);
  d.food ||= {};
  d.food.count = d.meals.length || "";
  // untimed meals leave older first and last bite times alone
  if (t.length) Object.assign(d.food, { first: t[0].time, last: t[t.length - 1].time, fromMeals: true });
  else if (d.food.fromMeals) Object.assign(d.food, { first: "", last: "", fromMeals: false });
}
function guessMealType(d, date) {
  const have = new Set(dayMeals(d).map(m => m.type));
  if (date === todayStr()) { const now = mealAt(nowHours()); return now === "snack" && !have.has("dinner") && nowHours() >= 17 ? "dinner" : now; }
  return MEAL_TYPES.find(k => k !== "snack" && !have.has(k)) || "snack";
}
function defaultMealTime(type, date) {
  if (date === todayStr() && mealAt(nowHours()) === type) return new Date().toTimeString().slice(0, 5);
  return MEAL_TIME[type];
}
// a meal of this type on this day, made if needed (voice entries and loose foods use it)
function mealFor(d, type, time = "") {
  d.meals ||= [];
  let m = d.meals.find(x => x.type === type && (!time || !x.time || type !== "snack" || Math.abs(hrs(x.time) - hrs(time)) <= 1.5));
  if (!m) { m = { id: newId(), type, time }; d.meals.push(m); }
  else if (!m.time && time) m.time = time;
  return m;
}

// ---------- Today ----------
function gapRow(h, kind) {
  const tag = kind === "night" ? (h >= 12 ? "good" : "short") : h >= 4 ? "good" : h < 3 ? "short" : "";
  return `<div class="row gap-row ${tag}"><span>${kind === "night" ? `${fmtGap(h)} overnight fast` : `${fmtGap(h)} between meals`}</span></div>`;
}
function mealsHtml(d, date) {
  const map = lib(), ms = dayMeals(d), x = dayNutrition(d, map);
  let h = "", prev = null;
  const night = overnightFast(date);
  if (night != null && ms.some(m => m.time)) h += gapRow(night, "night");
  for (const m of ms) {
    if (prev && m.time) h += gapRow(hrs(m.time) - hrs(prev.time), "day");
    const names = mealFoods(d, m.id).map(e => map[e.id] && map[e.id].name).filter(Boolean), n = x.byMeal[m.id];
    h += `<button type="button" class="row nav meal-card" data-act="mealEdit" data-mid="${m.id}"><span class="row-main"><span class="row-label">${MEAL_ONE[m.type]}${m.time ? ` <span class="meal-time">${esc(fmtTime(m.time))}</span>` : ` <span class="meal-time">no time</span>`}</span>
      <span class="row-sub">${names.length ? esc(names.join(", ")) : "No foods yet"}</span></span><span class="row-value">${n && n.kcal ? `${fmtN(n.kcal)} kcal` : ""}</span>${icon("chevR", "chev")}</button>`;
    if (m.time) prev = m;
  }
  const have = new Set(ms.map(m => m.type));
  h += `<div class="row meal-add">${MEAL_TYPES.filter(k => k === "snack" || !have.has(k)).map(k => `<button type="button" class="chip" data-act="mealAdd" data-type="${k}">${icon("plus", "chk")}${MEAL_ONE[k]}</button>`).join("")}</div>`;
  return h;
}

// ---------- the meal sheet ----------
function mealTypeSeg(cur) {
  return `<span class="seg meal-seg" role="radiogroup" aria-label="Meal">${MEAL_TYPES.map(k => `<label><input type="radio" name="mtype" value="${k}" ${cur === k ? "checked" : ""}><span>${k === "breakfast" ? "Bkfst" : MEAL_ONE[k]}</span></label>`).join("")}</span>`;
}
function openMeal(date, mid, type) {
  const d = getDay(date), m = mid && d && (d.meals || []).find(x => x.id === mid);
  type = m ? m.type : type || guessMealType(d, date);
  const draft = { type, time: m ? m.time || "" : defaultMealTime(type, date), foods: m ? mealFoods(d, m.id).map(e => ({ id: e.id, ...entryQU(e, lib()[e.id] || {}) })) : [] };
  openSheet({ k: "meal", date, mid: m ? m.id : null, draft, q: "" });
  Foods.load().then(() => refreshMealResults()).catch(() => refreshMealResults());
}
function mealDraftNut(dr, map) {
  const n = zeroNut(); let measured = 0;
  for (const f of dr.foods) { const v = nutOf(map[f.id], f.q, f.u, map); if (v) { addNut(n, v); measured++; } }
  return { n, measured };
}
function mealFoodsHtml(s) {
  const map = lib(), dr = s.draft;
  if (!dr.foods.length) return `<div class="row"><span class="row-sub">Search below, or tap one of your usual foods.</span></div>`;
  const { n, measured } = mealDraftNut(dr, map);
  return dr.foods.map((f, i) => {
    const it = map[f.id]; if (!it) return "";
    const v = nutOf(it, f.q, f.u, map);
    return `<button type="button" class="row nav food-row" data-act="mfEdit" data-i="${i}"><span class="row-main"><span class="row-label">${esc(it.name)}</span>
      <span class="row-sub">${v ? `${esc(fmtQU(f.q, f.u))} · ${fmtN(v.kcal)} kcal · ${fmtN(v.p)} g protein` : "No nutrition yet"}</span></span>${icon("chevR", "chev")}</button>`;
  }).join("") + (measured ? `<div class="row nut-prev">${["kcal", "p", "f", "c", "fib"].map(k => `<span><b>${fmtN(n[k])}</b>${k === "kcal" ? " kcal" : " g " + NUT_INFO[k][0].toLowerCase()}</span>`).join("")}</div>` : "");
}
function mealResultsHtml(s) {
  const q = (s.q || "").trim(), ql = q.toLowerCase(), dr = s.draft, inMeal = new Set(dr.foods.map(f => f.id));
  const foods = S.profile.library.filter(i => i.cat === "food" && !i.hidden);
  if (!q) {
    // usual foods for this meal first, then the ones logged most
    const uses = usageCounts();
    const pick = foods.slice().sort((a, b) => (b.meal === dr.type) - (a.meal === dr.type) || (uses[b.id] || 0) - (uses[a.id] || 0) || a.name.localeCompare(b.name)).slice(0, 14);
    return pick.length ? `<h3 class="sheet-h3">Your foods</h3><div class="row chips-row"><div class="chips">${pick.map(i => `<button type="button" class="chip ${inMeal.has(i.id) ? "on" : ""}" data-act="mlAdd" data-id="${i.id}" aria-pressed="${inMeal.has(i.id)}">${inMeal.has(i.id) ? icon("check", "chk") : ""}${esc(i.name)}</button>`).join("")}</div></div>` : "";
  }
  const mine = foods.filter(i => i.name.toLowerCase().includes(ql)).slice(0, 6);
  let h = "";
  if (mine.length) h += `<h3 class="sheet-h3">Your foods</h3><div class="list">${mine.map(i => `<button type="button" class="row nav" data-act="mlAdd" data-id="${i.id}"><span class="row-main"><span class="row-label">${esc(i.name)}</span><span class="row-sub">${inMeal.has(i.id) ? "In this meal" : hasNutrition(i) ? esc(fmtQU(usualOf(i).q, usualOf(i).u)) : "No nutrition yet"}</span></span>${icon(inMeal.has(i.id) ? "check" : "plus", "chev")}</button>`).join("")}</div>`;
  if (!Foods.data) h += `<div class="list"><div class="row"><span class="row-sub">${Foods.failed ? "Couldn't load the food database. Check your connection and try again; after one load it works offline." : "Loading the food database…"}</span></div></div>`;
  else if (q.length >= 2) {
    s.results = Foods.search(q);
    h += `<h3 class="sheet-h3">USDA foods</h3><div class="list">${s.results.length ? s.results.map((f, i) => `<button type="button" class="row nav" data-act="mlPick" data-i="${i}"><span class="row-main"><span class="row-label">${esc(f.name)}</span><span class="row-sub">${f.portions[0] ? `${esc(f.portions[0][0])} · ${fmtN(f.nut.kcal * f.portions[0][1] / 100)} kcal` : `100 g · ${fmtN(f.nut.kcal)} kcal`}</span></span>${icon("chevR", "chev")}</button>`).join("")
      : `<div class="row"><span class="row-sub">No match. Try a simpler word, like "bread" or "chicken".</span></div>`}</div>`;
  }
  h += `<div class="list"><button type="button" class="row action" data-act="mlPlain">${icon("plus", "lead")}<span class="row-label">Add "${esc(q)}" without nutrition</span></button>
    <button type="button" class="row action" data-act="mlLabel">${icon("plus", "lead")}<span class="row-label">Enter from a food label</span></button></div>`;
  return h;
}
function refreshMealResults() {
  const s = UI.sheet;
  if (!s || s.k !== "meal") return;
  const r = $("#ml-res"), f = $("#ml-foods");
  if (r) r.innerHTML = mealResultsHtml(s);
  if (f) f.innerHTML = mealFoodsHtml(s);
}
function mealSheetParts(s) {
  const dr = s.draft, map = lib();
  if (s.k === "mealFood") {
    const f = s.back.draft.foods[s.i], it = f && map[f.id];
    if (!it) return { title: "Food", form: false, body: `<p class="sheet-text">This food was removed.</p>` };
    const portions = it.parts ? [["1 meal", null]] : [...(it.portions || []), ["g", 1]];
    return { title: it.name, submitLabel: "Done",
      body: `<div class="list">${hasNutrition(it) ? amountRows(portions, f.q, f.u) : `<div class="row"><span class="row-sub">This food has no nutrition yet. Add it once and every past and future entry counts.</span></div>`}</div>
        ${hasNutrition(it) ? `<div class="list">${previewHtml(it, f.q, f.u)}</div>` : ""}
        ${it.parts ? `<div class="list">${it.parts.map(p => map[p.id] ? `<div class="row"><span class="row-label">${esc(map[p.id].name)}</span><span class="row-value">${esc(fmtQU(p.q, p.u))}</span></div>` : "").join("")}</div>`
          : `<div class="list"><button type="button" class="row action" data-act="mfLink">${icon(hasNutrition(it) ? "search" : "plus", "lead")}<span class="row-label">${hasNutrition(it) ? "Change nutrition match" : "Add nutrition"}</span></button></div>`}`,
      del: `<button type="button" class="btn destructive block" data-act="mfDel">Remove from this meal</button>` };
  }
  const canSave = dr.foods.length >= 2 && !dr.foods.some(f => map[f.id] && map[f.id].parts);
  return { title: s.mid ? MEAL_ONE[dr.type] : `Add ${MEAL_ONE[dr.type].toLowerCase()}`, submitLabel: s.mid ? "Save" : "Add",
    body: `<div class="list"><div class="row field-row"><span class="row-label">Meal</span>${mealTypeSeg(dr.type)}</div>
        <label class="row field-row" for="ml-time"><span class="row-label">Time</span><input type="time" id="ml-time" name="time" value="${esc(dr.time || "")}"></label></div>
      <h3 class="sheet-h3">What you had</h3>
      <div class="list" id="ml-foods">${mealFoodsHtml(s)}</div>
      <div class="searchbar">${icon("search")}<input type="search" id="ml-q" value="${esc(s.q || "")}" placeholder="Add a food, e.g. eggs" aria-label="Add a food" autocomplete="off" enterkeyhint="search"></div>
      <div id="ml-res">${mealResultsHtml(s)}</div>
      ${canSave ? `<div class="list"><button type="button" class="row action small" data-act="mlSaveUsual"><span class="row-label">Save as a usual meal</span></button></div>` : ""}
      <p class="footnote">Nutrition data: USDA FoodData Central. It's searched on this device.</p>`,
    del: s.mid ? `<button type="button" class="btn destructive block" data-act="mealDel">Delete ${MEAL_ONE[dr.type].toLowerCase()}</button>` : "" };
}
// step into a food sheet from the meal and come back to it (Cancel and Back return here too)
function mealSub(next) { next.back = UI.sheet; UI.sheet = next; pushHist(); renderSheet(); }
function mealReturn() { goBack(); }
function addToDraft(dr, it, qu) {
  if (dr.foods.some(f => f.id === it.id)) return false;
  const u = usualOf(it);
  dr.foods.push({ id: it.id, q: qu ? qu.q : u.q, u: qu ? qu.u : u.u });
  return true;
}
function submitMealSheet(fd) {
  const s = UI.sheet, map = lib();
  if (s.k === "mealFood") {
    const f = s.back.draft.foods[s.i], it = f && map[f.id];
    if (f && fd.get("q") != null) { f.q = num(fd.get("q")) ?? f.q; f.u = fd.get("u") || f.u; if (it) it.usual = { q: f.q, u: f.u }; Store.saveProfile(); }
    mealReturn(); return;
  }
  const dr = s.draft, date = s.date, d = touchDay(date);
  dr.type = MEAL_TYPES.includes(fd.get("mtype")) ? fd.get("mtype") : dr.type;
  dr.time = fd.get("time") || "";
  d.meals ||= [];
  let m = d.meals.find(x => x.id === s.mid);
  if (!m) { m = { id: newId() }; d.meals.push(m); }
  Object.assign(m, { type: dr.type, time: dr.time });
  d.items = d.items.filter(e => e.mid !== m.id);
  for (const f of dr.foods) {
    d.items.push({ id: f.id, dose: "", time: "", q: f.q, u: f.u, meal: dr.type, mid: m.id });
    if (map[f.id]) map[f.id].meal = dr.type;
  }
  syncMealTiming(d);
  Store.saveProfile(); haptic(); commitDay(date); closeSheet(); render();
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const s = UI.sheet, map = lib();
  switch (t.dataset.act) {
    case "mealAdd": openMeal(UI.date, null, t.dataset.type); break;
    case "mealEdit": openMeal(UI.date, t.dataset.mid); break;
    case "mlAdd": {
      const it = map[t.dataset.id]; if (!it || !s) break;
      const i = s.draft.foods.findIndex(f => f.id === it.id);
      if (i >= 0 && !s.q) s.draft.foods.splice(i, 1); else if (i < 0) addToDraft(s.draft, it);
      haptic(); refreshMealResults(); break;
    }
    case "mlPick": if (s && s.results) mealSub({ k: "foodSearch", step: "pick", f: s.results[Number(t.dataset.i)], q: s.q, meal: s.draft.type, fromMeal: true }); break;
    case "mlLabel": if (s) mealSub({ k: "foodSearch", step: "label", q: s.q, fromMeal: true }); break;
    case "mlPlain": {
      const it = s && s.q.trim() && addLibraryItem(s.q.trim(), "food");
      if (it) { addToDraft(s.draft, it); s.q = ""; const i = $("#ml-q"); if (i) i.value = ""; refreshMealResults(); }
      break;
    }
    case "mfEdit": if (s) mealSub({ k: "mealFood", i: Number(t.dataset.i) }); break;
    case "mfDel": if (s && s.back) { s.back.draft.foods.splice(s.i, 1); mealReturn(); } break;
    case "mfLink": if (s && s.back) { const f = s.back.draft.foods[s.i]; if (f && map[f.id]) { UI.sheet = { k: "foodSearch", step: "search", q: map[f.id].name, link: f.id, back: s.back }; renderSheet(); Foods.load().then(() => { const r = $("#fs-res"); if (r && UI.sheet) r.innerHTML = foodResultsHtml(UI.sheet); }).catch(() => {}); } } break;
    case "mlSaveUsual": if (s) mealSub({ k: "foodMeal", parts: s.draft.foods.map(f => ({ ...f })), meal: s.draft.type }); break;
    case "mealDel": {
      if (!s || !s.mid) break;
      const d = touchDay(s.date);
      d.meals = (d.meals || []).filter(m => m.id !== s.mid);
      d.items = d.items.filter(x => x.mid !== s.mid);
      syncMealTiming(d); commitDay(s.date); closeSheet(); render(); break;
    }
  }
});
document.addEventListener("input", e => {
  const t = e.target, s = UI.sheet;
  if (!s || s.k !== "meal") return;
  if (t.id === "ml-q") { s.q = t.value; const r = $("#ml-res"); if (r) r.innerHTML = mealResultsHtml(s); }
  else if (t.id === "ml-time") s.draft.time = t.value;
});
document.addEventListener("change", e => {
  const t = e.target, s = UI.sheet;
  if (!s || s.k !== "meal" || t.name !== "mtype") return;
  s.draft.type = t.value;
  // a new meal's time follows its type until you change it
  const ti = $("#ml-time");
  if (!s.mid && ti && Object.values(MEAL_TIME).includes(ti.value)) { ti.value = defaultMealTime(t.value, s.date); s.draft.time = ti.value; }
  const h = $("#sheet-title"); if (h) h.textContent = s.mid ? MEAL_ONE[t.value] : `Add ${MEAL_ONE[t.value].toLowerCase()}`;
  refreshMealResults();
});

// ---------- Trends ----------
function trendsMealsHtml(span) {
  const gaps = [], nights = [], counts = [];
  for (const date of span) {
    const d = S.days[date];
    if (!d || !timedMeals(d).length) continue;
    gaps.push(...mealGapsOf(d)); counts.push(d.meals.length);
    const n = overnightFast(date); if (n != null) nights.push(n);
  }
  if (counts.length < 2) return "";
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length, short = gaps.filter(g => g < 3).length;
  return group("Meal timing", `<div class="row"><span class="row-label">Meals per day</span><span class="row-value">${r1(avg(counts))}</span></div>
    ${gaps.length ? `<div class="row"><span class="row-label">Time between meals</span><span class="row-value">${fmtGap(median(gaps))} typical</span></div>
    <div class="row"><span class="row-label">Gaps under 3 hours</span><span class="row-value">${short} of ${gaps.length}</span></div>` : ""}
    ${nights.length ? `<div class="row"><span class="row-label">Overnight fast</span><span class="row-value">${fmtGap(median(nights))} typical</span></div>` : ""}`,
    "The gut's cleaning wave runs between meals, so 4 or more hours apart and a 12-hour overnight fast give it room.");
}

// ---------- insights ----------
function dayEffect(X, pred, lags = [0, 1]) {
  let best = null;
  for (const lag of lags) {
    const on = [], off = [];
    for (const date of X.st.dates) {
      const p = pred(S.days[date], date), v = X.st.res[addDays(date, lag)];
      if (p == null || v == null) continue;
      (p ? on : off).push(v);
    }
    const c = compare(on, off);
    if (c && (!best || Math.abs(c.t) > Math.abs(best.t))) best = { ...c, lag };
  }
  if (best) best.conf = confidence(best, lags.length > 1 ? 0.3 : 0);
  return best;
}
const mealTimedDays = X => X.st.dates.filter(d => timedMeals(S.days[d]).length >= 2);
RULES.push(function mealSpacing(X) {
  const days = mealTimedDays(X).slice(-28);
  if (days.length < 5) return null;
  const gs = days.flatMap(d => mealGapsOf(S.days[d])), med = median(gs), short = gs.filter(g => g < 3).length / gs.length;
  const nights = days.map(overnightFast).filter(v => v != null), nightMed = nights.length >= 3 ? median(nights) : null;
  const fx = dayEffect(X, d => { const g = mealGapsOf(d); return g.length ? g.some(x => x < 3) : null; });
  if (short >= 0.4 || sig(fx)) {
    const ev = [["Journal", `${Math.round(short * 100)}% of gaps between meals were under 3 hours, over ${days.length} days with meal times`], ["Journal", `Typical gap: ${fmtGap(med)}`]];
    if (sig(fx)) ev.push(["Journal", `Days with a gap under 3 hours: ${fxText(fx)}`]);
    if (nightMed != null && nightMed < 12) ev.push(["Journal", `Typical overnight fast: ${fmtGap(nightMed)}`]);
    if (X.yes("snacker")) ev.push(["History", "You said you snack or sip sweet drinks between meals"]);
    return { id: "meal-gaps", kind: "act", conf: sig(fx) ? fx.conf : days.length >= 10 ? "moderate" : "low", drivers: ["mmc_grazing"], test: "meal_spacing",
      title: "Your meals are often close together", summary: `Typical gap ${fmtGap(med)}. The cleaning wave needs about 4 hours without food.`, evidence: ev,
      why: "The migrating motor complex only runs while fasting, roughly every 90 to 120 minutes once the stomach empties. Eating again within 3 hours switches it off before it can sweep the small bowel.", ask: [] };
  }
  if (med >= 4 && short < 0.15) return { id: "meal-gaps-good", kind: "good", conf: days.length >= 10 ? "moderate" : "low", drivers: ["mmc_grazing"],
    title: "Your meals are well spaced", summary: `Typical gap ${fmtGap(med)}${nightMed != null ? `, overnight ${fmtGap(nightMed)}` : ""}.`,
    evidence: [["Journal", `Typical gap between meals: ${fmtGap(med)}, over ${days.length} days`]],
    why: "Gaps of 4 hours or more let the cleaning wave run between meals. Keep it up, especially during and after treatment.", ask: [] };
  return null;
});
