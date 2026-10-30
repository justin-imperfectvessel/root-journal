/* SIBO Root Journal — supplements and medications: a catalog of what's common for SIBO, IMO and H2S,
   each with its form and typical doses, and the sheet that picks one and its dose.
   A day entry is { id, dose, time, x } where dose is the amount ("20 drops") and x the times taken that day.
   Library items keep the last dose and times as the default, and sk links them to the catalog.
   Doses are typical label or study doses for reference, not advice.
   Loaded after meals.js; shares its global scope. */

// [name, cat, group, form, doses, times a day, note, other names]
const SUPP_ROWS = [
  // herbal antimicrobials
  ["Iberogast", "supp", "anti", "Tincture", ["20 drops", "30 drops", "40 drops"], 3, "Label dose is 20 drops (about 1 mL) 3 times a day, before or with meals, in a little water.", ["stw 5", "stw5", "iberogast advance"]],
  ["Allicin (Allimed)", "supp", "anti", "Capsule, 450 mg", ["1 cap", "2 caps", "3 caps"], 3, "Stabilized garlic extract, mostly used for methane. Protocols commonly use 1–2 caps 3 times a day.", ["allimed", "allicin", "allimax", "garlic extract"]],
  ["Berberine", "supp", "anti", "Capsule, 500 mg", ["500 mg", "1000 mg"], 2, "Usually 500 mg 2–3 times a day with meals.", ["berberine hcl"]],
  ["Oregano oil", "supp", "anti", "Tablet or softgel", ["1 tab", "2 tabs"], 3, "Emulsified oregano (such as ADP) is commonly 2 tabs 3 times a day with food.", ["adp", "oregano", "oil of oregano"]],
  ["Neem", "supp", "anti", "Capsule", ["300 mg", "600 mg"], 3, "Commonly 300–600 mg 2–3 times a day.", []],
  ["Candibactin-AR", "supp", "anti", "Softgel", ["1 softgel", "2 softgels"], 2, "Oregano, thyme and sage. Used with Candibactin-BR in the Johns Hopkins herbal study, 2 softgels twice a day.", ["candibactin ar"]],
  ["Candibactin-BR", "supp", "anti", "Capsule", ["1 cap", "2 caps"], 2, "Berberine blend. Used with Candibactin-AR in the Johns Hopkins herbal study, 2 caps twice a day.", ["candibactin br", "candibactin"]],
  ["Dysbiocide", "supp", "anti", "Capsule", ["1 cap", "2 caps"], 2, "Used with FC-Cidal in the Johns Hopkins herbal study, 2 caps twice a day.", []],
  ["FC-Cidal", "supp", "anti", "Capsule", ["1 cap", "2 caps"], 2, "Used with Dysbiocide in the Johns Hopkins herbal study, 2 caps twice a day.", ["fc cidal"]],
  ["Atrantil", "supp", "anti", "Capsule", ["1 cap", "2 caps"], 3, "Label dose is 2 caps 3 times a day for the first weeks, then less.", []],
  ["Biocidin", "supp", "anti", "Liquid drops", ["2 drops", "5 drops", "10 drops", "15 drops"], 2, "Usually started at 1–2 drops and raised slowly, up to about 15 drops twice a day.", []],
  ["Interfase Plus", "supp", "anti", "Capsule", ["1 cap", "2 caps"], 2, "Biofilm enzyme, taken on an empty stomach, often before antimicrobials.", ["interfase", "biofilm"]],
  ["NAC (N-acetylcysteine)", "supp", "anti", "Capsule", ["600 mg", "1200 mg"], 2, "Used as a biofilm agent. It is high in sulfur, so it can worsen hydrogen sulfide symptoms.", ["nac", "n-acetylcysteine", "n-acetyl cysteine"]],
  ["Monolaurin", "supp", "anti", "Pellets or capsule", ["1 scoop", "1 cap", "2 caps"], 2, "Lauric acid derivative. Usually started low.", ["lauricidin"]],
  // binders
  ["GI Detox", "supp", "binder", "Capsule", ["1 cap", "2 caps"], 2, "Binder. Take 2 hours away from food, medications and other supplements.", ["gi detox+"]],
  ["Activated charcoal", "supp", "binder", "Capsule", ["1 cap", "2 caps"], 1, "Binder. Take 2 hours away from food, medications and other supplements.", ["charcoal"]],
  ["Bismuth (Pepto-Bismol)", "tx", "anti", "Chewable or liquid", ["262 mg", "524 mg"], 2, "Binds hydrogen sulfide. 524 mg is 2 chewables or 30 mL of liquid. Can turn stool and tongue black.", ["bismuth", "pepto", "pepto-bismol", "bismuth subsalicylate"]],
  // prokinetics
  ["Ginger + artichoke (Prokinex)", "supp", "pro", "Capsule", ["1 cap", "2 caps"], 1, "Ginger with artichoke leaf. Commonly 1 cap before meals or at bedtime.", ["prokinex", "ginger + artichoke", "ginger and artichoke", "ginger artichoke"]],
  ["MotilPro", "supp", "pro", "Capsule", ["1 cap", "2 caps", "3 caps"], 1, "Ginger, 5-HTP and other motility nutrients, usually at bedtime.", ["motil pro"]],
  ["Motility Activator", "supp", "pro", "Capsule", ["1 cap", "2 caps"], 1, "Ginger and artichoke. Usually at bedtime, away from food.", []],
  ["Ginger", "supp", "pro", "Capsule", ["250 mg", "500 mg", "1000 mg"], 2, "Ginger root extract. Studies on stomach emptying used about 1 g.", ["ginger root", "ginger capsule"]],
  ["Triphala", "supp", "pro", "Capsule or powder", ["500 mg", "1000 mg"], 1, "Ayurvedic blend, usually at bedtime.", []],
  ["Bitters", "supp", "dig", "Tincture", ["10 drops", "20 drops", "1 dropperful"], 3, "A few drops on the tongue or in water 10–15 minutes before meals.", ["digestive bitters", "swedish bitters"]],
  // digestion
  ["Betaine HCl with pepsin", "supp", "dig", "Capsule, about 650 mg", ["1 cap", "2 caps", "3 caps"], 2, "With protein meals. Usually started at 1 cap and raised one at a time. Stop if you feel warmth or burning.", ["betaine", "betaine hcl", "hcl", "stomach acid"]],
  ["Digestive enzymes", "supp", "dig", "Capsule", ["1 cap", "2 caps"], 3, "With the first bites of a meal.", ["enzymes", "digestive enzyme"]],
  ["Ox bile", "supp", "dig", "Capsule", ["125 mg", "250 mg", "500 mg"], 2, "With fatty meals.", ["bile salts"]],
  ["TUDCA", "supp", "dig", "Capsule", ["250 mg", "500 mg"], 1, "Bile acid, usually 250–500 mg with meals.", ["tauroursodeoxycholic acid"]],
  // fiber and bowel movements
  ["PHGG (Sunfiber)", "supp", "fiber", "Powder", ["3 g", "5 g", "6 g"], 1, "One scoop is about 5–6 g. The rifaximin + PHGG study used 5 g a day.", ["phgg", "sunfiber", "partially hydrolyzed guar gum", "guar gum"]],
  ["Psyllium husk", "supp", "fiber", "Powder", ["1 tsp", "2 tsp", "1 tbsp"], 1, "Mix into a full glass of water.", ["psyllium", "metamucil"]],
  ["Magnesium citrate", "supp", "fiber", "Capsule or powder", ["150 mg", "300 mg", "400 mg", "600 mg"], 1, "Draws water into the bowel. Often taken at bedtime and adjusted to stool.", ["mag citrate", "natural calm"]],
  ["Magnesium oxide", "supp", "fiber", "Tablet", ["400 mg", "800 mg"], 1, "The strongest magnesium for constipation. Often taken at bedtime.", ["mag oxide"]],
  ["Magnesium glycinate", "supp", "nut", "Capsule", ["120 mg", "200 mg", "400 mg"], 1, "Gentle on the bowel. Usually for sleep or low magnesium, not constipation.", ["mag glycinate", "magnesium bisglycinate"]],
  ["Vitamin C", "supp", "nut", "Capsule or powder", ["500 mg", "1000 mg", "2000 mg"], 1, "Larger doses loosen stool.", ["ascorbic acid"]],
  // gut lining and probiotics
  ["S. boulardii", "supp", "pro_b", "Capsule, 250 mg", ["1 cap", "2 caps"], 2, "Probiotic yeast. Florastor is 250 mg per cap.", ["saccharomyces boulardii", "florastor", "boulardii"]],
  ["Probiotic", "supp", "pro_b", "Capsule", ["1 cap", "2 caps"], 1, "Strains vary. Some people with SIBO feel worse on lactobacillus-heavy blends.", ["probiotics"]],
  ["L-glutamine", "supp", "lining", "Powder", ["5 g", "10 g"], 1, "Gut lining support. One teaspoon is about 5 g.", ["glutamine"]],
  ["Zinc carnosine", "supp", "lining", "Capsule, 75 mg", ["75 mg"], 2, "Usually 75 mg twice a day.", ["pepzin gi", "zinc l-carnosine"]],
  ["DGL licorice", "supp", "lining", "Chewable", ["1 tab", "2 tabs"], 2, "Chewed 20 minutes before meals.", ["dgl", "licorice"]],
  ["Slippery elm", "supp", "lining", "Powder or capsule", ["400 mg", "1 tsp"], 2, "Coats the gut. Take away from other supplements.", []],
  ["Colostrum", "supp", "lining", "Powder or capsule", ["500 mg", "1 g", "5 g"], 1, "Some people react to the dairy in it.", []],
  ["Quercetin", "supp", "lining", "Capsule", ["250 mg", "500 mg"], 2, "Used to calm mast cells.", []],
  // nutrients often low with SIBO
  ["Vitamin D3", "supp", "nut", "Softgel or drops", ["1000 IU", "2000 IU", "5000 IU"], 1, "With a meal that has some fat.", ["vitamin d", "d3"]],
  ["Vitamin B12", "supp", "nut", "Tablet or lozenge", ["500 mcg", "1000 mcg"], 1, "SIBO bacteria can use up B12.", ["b12", "methylcobalamin"]],
  ["Iron", "supp", "nut", "Tablet", ["18 mg", "25 mg", "65 mg"], 1, "Every other day is often absorbed as well and is easier on the gut.", ["ferrous", "iron bisglycinate"]],
  ["Omega-3 fish oil", "supp", "nut", "Softgel", ["1 g", "2 g"], 1, "With food.", ["fish oil", "omega 3", "omega-3"]],
  ["Molybdenum", "supp", "nut", "Capsule", ["75 mcg", "150 mcg", "300 mcg"], 1, "Helps clear sulfite, sometimes used with hydrogen sulfide.", []],
  ["Melatonin", "supp", "nut", "Tablet", ["0.5 mg", "1 mg", "3 mg"], 1, "At bedtime.", []],
  ["Electrolytes", "supp", "nut", "Powder", ["½ packet", "1 packet"], 1, "", ["lmnt"]],
  // prescriptions
  ["Rifaximin (Xifaxan)", "tx", "anti", "Tablet, 550 mg", ["550 mg"], 3, "The usual course is 550 mg 3 times a day for 14 days.", ["rifaximin", "xifaxan"]],
  ["Neomycin", "tx", "anti", "Tablet, 500 mg", ["500 mg"], 2, "Paired with rifaximin for methane, 500 mg twice a day for 14 days.", []],
  ["Metronidazole (Flagyl)", "tx", "anti", "Tablet", ["250 mg", "500 mg"], 3, "Sometimes paired with rifaximin for methane.", ["metronidazole", "flagyl"]],
  ["Prucalopride (Motegrity)", "tx", "pro", "Tablet", ["0.5 mg", "1 mg", "2 mg"], 1, "Low doses are used as a prokinetic, usually at bedtime.", ["prucalopride", "motegrity", "resolor"]],
  ["Low-dose erythromycin", "tx", "pro", "Tablet or liquid", ["50 mg", "62.5 mg", "125 mg"], 1, "Prokinetic dose, usually at bedtime.", ["erythromycin"]],
  ["Low-dose naltrexone (LDN)", "tx", "pro", "Capsule", ["0.5 mg", "1.5 mg", "3 mg", "4.5 mg"], 1, "Usually started low and raised, at bedtime.", ["ldn", "naltrexone"]],
  ["Linaclotide (Linzess)", "tx", "fiber", "Capsule", ["72 mcg", "145 mcg", "290 mcg"], 1, "On an empty stomach, 30 minutes before the first meal.", ["linaclotide", "linzess"]],
  ["Lubiprostone (Amitiza)", "tx", "fiber", "Capsule", ["8 mcg", "24 mcg"], 2, "With food and water.", ["lubiprostone", "amitiza"]],
  ["Nystatin", "tx", "anti", "Tablet or powder", ["500,000 units", "1,000,000 units"], 3, "Antifungal.", []],
  ["Fluconazole", "tx", "anti", "Tablet", ["100 mg", "150 mg", "200 mg"], 1, "Antifungal.", ["diflucan"]],
];
const SUPP_GROUPS = { anti: "Antimicrobials", binder: "Binders", pro: "Prokinetics", dig: "Digestion", fiber: "Fiber and bowel movements", pro_b: "Probiotics", lining: "Gut lining and mast cells", nut: "Nutrients" };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SUPPS = SUPP_ROWS.map(([n, cat, g, form, doses, per, note, a]) => ({ k: slug(n), n, cat, g, form, doses, per, note, terms: [n.toLowerCase(), n.toLowerCase().replace(/\s*\(.*\)/, ""), ...a] }));
const SUPPMAP = Object.fromEntries(SUPPS.map(c => [c.k, c]));

// the catalog entry for a library item: by its link, or else by its name
function suppInfo(it) {
  if (!it || it.cat === "food" || it.cat === "practice") return null;
  if (it.sk) return SUPPMAP[it.sk] || null;
  const n = it.name.toLowerCase().trim(), words = ` ${n.replace(/[^a-z0-9.+-]+/g, " ")} `;
  let best = null, len = 0;
  for (const c of SUPPS) for (const t of c.terms) {
    if ((t === n || (t.length >= 4 && words.includes(` ${t} `))) && t.length > len) { best = c; len = t.length; }
  }
  return best;
}
function suppSearch(q, cat) {
  const ql = q.toLowerCase().trim();
  if (!ql) return [];
  const score = c => Math.max(...c.terms.map(t => t === ql ? 3 : t.startsWith(ql) ? 2 : t.includes(ql) ? 1 : 0));
  return SUPPS.map(c => [c, score(c) + (c.cat === cat ? 0.5 : 0)]).filter(x => x[1] >= 1).sort((a, b) => b[1] - a[1] || a[0].n.localeCompare(b[0].n)).map(x => x[0]).slice(0, 8);
}
const timesLabel = x => x > 1 ? `${x}× a day` : "once a day";
function doseLabel(e) { return [e.dose, e.x > 1 ? `${e.x}×` : ""].filter(Boolean).join(" "); }
const suppEntry = (it, extra) => ({ id: it.id, dose: it.dose || "", time: "", ...(it.x ? { x: it.x } : {}), ...extra });

// ---------- Today ----------
function suppRowsHtml(d, cat) {
  const map = lib();
  return d.items.filter(e => map[e.id] && map[e.id].cat === cat).map(e => {
    const it = map[e.id], sub = [doseLabel(e), e.time ? fmtTime(e.time) : ""].filter(Boolean).join(" · ");
    return `<button type="button" class="row nav" data-act="spEdit" data-id="${it.id}"><span class="row-main"><span class="row-label">${esc(it.name)}</span>
      <span class="row-sub">${sub ? esc(sub) : "Add dose"}</span></span>${icon("chevR", "chev")}</button>`;
  }).join("");
}
function suppAddRow(cat) {
  return `<button type="button" class="row action" data-act="spAdd" data-cat="${cat}">${icon("plus", "lead")}<span class="row-label">${cat === "tx" ? "Add a medication" : "Add a supplement"}</span></button>`;
}

// ---------- sheet ----------
function openSupp(date, id, cat) {
  const it = id && lib()[id];
  openSheet(it ? { k: "supp", step: "dose", date, id, cat: it.cat, edit: true } : { k: "supp", step: "search", date, cat, q: "" });
}
function suppResultsHtml(s) {
  const q = (s.q || "").trim(), ql = q.toLowerCase();
  const kind = s.cat === "tx" ? "medications" : "supplements";
  if (!q) {
    // browse the catalog by group, this section's items first
    const here = SUPPS.filter(c => c.cat === s.cat);
    return Object.entries(SUPP_GROUPS).map(([g, name]) => {
      const cs = here.filter(c => c.g === g);
      return cs.length ? `<h3 class="sheet-h3">${name}</h3><div class="row chips-row"><div class="chips">${cs.map(c => `<button type="button" class="chip" data-act="spCat" data-k="${c.k}">${esc(c.n)}</button>`).join("")}</div></div>` : "";
    }).join("") + `<p class="footnote">Search to find ${kind === "medications" ? "supplements" : "medications"} too, or add one that isn't listed.</p>`;
  }
  const mine = S.profile.library.filter(i => (i.cat === "supp" || i.cat === "tx") && !i.hidden && i.name.toLowerCase().includes(ql)).slice(0, 5);
  const mineK = new Set(mine.map(i => (suppInfo(i) || {}).k));
  const cs = suppSearch(q, s.cat).filter(c => !mineK.has(c.k));
  let h = "";
  if (mine.length) h += `<h3 class="sheet-h3">Yours</h3><div class="list">${mine.map(i => `<button type="button" class="row nav" data-act="spLib" data-id="${i.id}"><span class="row-main"><span class="row-label">${esc(i.name)}</span><span class="row-sub">${esc(doseLabel(i) || (suppInfo(i) || {}).form || "")}</span></span>${icon("chevR", "chev")}</button>`).join("")}</div>`;
  if (cs.length) h += `<h3 class="sheet-h3">Common for SIBO</h3><div class="list">${cs.map(c => `<button type="button" class="row nav" data-act="spCat" data-k="${c.k}"><span class="row-main"><span class="row-label">${esc(c.n)}</span><span class="row-sub">${esc(c.form)} · ${esc(c.doses[0])} ${timesLabel(c.per)}${c.cat !== s.cat ? ` · ${c.cat === "tx" ? "Medication" : "Supplement"}` : ""}</span></span>${icon("chevR", "chev")}</button>`).join("")}</div>`;
  if (!mine.some(i => i.name.toLowerCase() === ql)) h += `<div class="list"><button type="button" class="row action" data-act="spNew">${icon("plus", "lead")}<span class="row-label">Add "${esc(q)}"</span></button></div>`;
  return h;
}
// what the dose step is about: a library item, a catalog entry, or a new name
function suppTarget(s) {
  const it = s.id && lib()[s.id];
  const c = it ? suppInfo(it) : s.ck ? SUPPMAP[s.ck] : null;
  return { it, c, name: it ? it.name : c ? c.n : s.name, cat: it ? it.cat : c ? c.cat : s.cat };
}
function suppSheetParts(s) {
  if (s.step === "search") return { title: s.cat === "tx" ? "Add medication" : "Add supplement", form: false,
    body: `<div class="searchbar">${icon("search")}<input type="search" id="sp-q" value="${esc(s.q || "")}" placeholder="${s.cat === "tx" ? "Search, e.g. rifaximin" : "Search, e.g. Iberogast"}" aria-label="Search" autocomplete="off" enterkeyhint="search"></div>
      <div id="sp-res">${suppResultsHtml(s)}</div>` };
  const { it, c, name } = suppTarget(s), d = getDay(s.date) || { items: [] }, e = it && d.items.find(x => x.id === it.id);
  const cur = (e && e.dose) || (it && it.dose) || (c && c.doses[0]) || "";
  const opts = c ? [...c.doses] : [];
  if (it && it.dose && !opts.includes(it.dose)) opts.push(it.dose);
  const other = cur && !opts.includes(cur) ? cur : "";
  const x = (e && e.x) || (it && it.x) || (c && c.per) || 1, time = e ? e.time || "" : s.date === todayStr() ? new Date().toTimeString().slice(0, 5) : "";
  return { title: name, submitLabel: e ? "Save" : "Add",
    body: `${s.edit ? "" : `<p class="sheet-text"><button type="button" class="textbtn" data-act="spBack">${icon("chevL")} Search</button></p>`}
      ${c ? `<p class="sheet-text"><b>${esc(c.form)}</b> · ${c.note ? esc(c.note) : `Usually ${esc(c.doses[0])} ${timesLabel(c.per)}.`}</p>` : ""}
      ${s.id ? "" : `<div class="list"><label class="row field-row stack" for="sp-name"><span class="row-label">Name in your journal</span><input id="sp-name" name="name" required value="${esc(name)}"></label></div>`}
      <h3 class="sheet-h3">Dose</h3>
      ${opts.length ? `<div class="row chips-row dose-picks" role="radiogroup" aria-label="Dose"><div class="chips">${opts.map(o => `<label class="chip"><input type="radio" class="sr" name="dose" value="${esc(o)}" ${o === cur ? "checked" : ""}>${esc(o)}</label>`).join("")}</div></div>` : ""}
      <div class="list"><label class="row field-row" for="sp-other"><span class="row-label">${opts.length ? "Other amount" : "Amount"}</span><input id="sp-other" name="doseOther" value="${esc(other)}" placeholder="${esc(c ? c.doses[0].replace(/^[\d.,½]+/, "e.g. 2") : "e.g. 2 caps")}" autocomplete="off"></label></div>
      <div class="list"><div class="row field-row"><span class="row-label">Times today</span><span class="seg" role="radiogroup" aria-label="Times today">${[1, 2, 3, 4].map(n => `<label><input type="radio" name="x" value="${n}" ${n === x ? "checked" : ""}><span>${n}</span></label>`).join("")}</span></div>
        <label class="row field-row" for="sp-time"><span class="row-label">${x > 1 ? "First dose" : "Time"}</span><input type="time" id="sp-time" name="time" value="${esc(time)}"></label></div>
      ${c ? `<p class="footnote">Typical label or study doses, for reference. Log what you actually took and follow what you and your clinician agreed on.</p>` : ""}`,
    del: e ? `<button type="button" class="btn destructive block" data-act="spDel">Remove from this day</button>` : "" };
}
function submitSuppSheet(fd) {
  const s = UI.sheet, { it: had, c, cat } = suppTarget(s);
  const name = String(fd.get("name") || (had && had.name) || "").trim();
  if (!name) return;
  const dose = String(fd.get("doseOther") || "").trim() || String(fd.get("dose") || ""), x = Number(fd.get("x")) || 1;
  const it = had || addLibraryItem(name, cat);
  if (c && !it.sk) it.sk = c.k;
  Object.assign(it, { dose, x });
  if (x === 1) delete it.x;
  const d = touchDay(s.date), e = d.items.find(y => y.id === it.id), time = fd.get("time") || "";
  if (e) Object.assign(e, { dose, time, x }); else d.items.push(suppEntry(it, { time }));
  if (x === 1) delete (e || d.items[d.items.length - 1]).x;
  Store.saveProfile(); haptic(); commitDay(s.date); closeSheet(); render();
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const s = UI.sheet;
  switch (t.dataset.act) {
    case "spAdd": openSupp(UI.date, null, t.dataset.cat); break;
    case "spEdit": openSupp(UI.date, t.dataset.id); break;
    case "spCat": case "spLib": case "spNew": {
      if (!s || s.k !== "supp") break;
      const k = t.dataset.k, lit = t.dataset.id;
      // a catalog pick you already have uses your item, so its usual dose comes along
      const mine = k && S.profile.library.find(i => (i.cat === "supp" || i.cat === "tx") && suppInfo(i) === SUPPMAP[k]);
      const id = lit || (mine && mine.id) || null;
      if (id && lib()[id].hidden) lib()[id].hidden = false;
      UI.sheet = { k: "supp", step: "dose", date: s.date, cat: s.cat, id, ck: id ? null : k || null, name: k || id ? "" : s.q.trim().replace(/^\w/, ch => ch.toUpperCase()), prev: s };
      renderSheet(); break;
    }
    case "spBack": if (s && s.prev) { UI.sheet = s.prev; renderSheet(); } break;
    case "spDel": {
      if (!s || !s.id) break;
      const d = touchDay(s.date);
      d.items = d.items.filter(x => x.id !== s.id);
      commitDay(s.date); closeSheet(); render(); break;
    }
  }
});
document.addEventListener("input", e => {
  const t = e.target, s = UI.sheet;
  if (t.id === "sp-q" && s && s.k === "supp") { s.q = t.value; const r = $("#sp-res"); if (r) r.innerHTML = suppResultsHtml(s); }
  // typing your own amount clears the picked one
  else if (t.id === "sp-other" && t.value) document.querySelectorAll(".dose-picks input:checked").forEach(r => { r.checked = false; });
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.name === "dose" && t.closest(".dose-picks")) { const o = $("#sp-other"); if (o) o.value = ""; }
  else if (t.name === "x" && UI.sheet && UI.sheet.k === "supp") { const l = $("label[for=sp-time] .row-label"); if (l) l.textContent = t.value > 1 ? "First dose" : "Time"; }
});
