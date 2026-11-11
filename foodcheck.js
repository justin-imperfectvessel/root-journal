/* Case File — food checks: Low Fermentation Diet ratings for every food, and getting packaged foods in from
   their label (a photo of the ingredients list, read on this device) or their barcode (looked up in Open Food Facts).
   Ratings: ● fits · ◐ limit · ✕ avoid · ? not rated. Symbols plus words, so nothing depends on color.
   A food's rating comes from your own choice if you set one, else its ingredients and name, else the foods in a saved meal.
   Loaded after meals.js; shares its global scope. */

const LFD_RANK = { ok: 0, limit: 1, avoid: 2 };
const LFD_MARK = { ok: "●", limit: "◐", avoid: "✕", none: "?" };
const LFD_WORD = { ok: "Fits", limit: "Limit", avoid: "Avoid", none: "Not rated" };
const worstLfd = rs => rs.reduce((w, r) => (r && (w == null || LFD_RANK[r] > LFD_RANK[w]) ? r : w), null);

// rate free text (a name or an ingredient list) against the diet's rules; each match is blanked so exceptions win
const lfdTextMemo = new Map();
function lfdText(text) {
  const key = String(text || "").toLowerCase();
  if (lfdTextMemo.has(key)) return lfdTextMemo.get(key);
  let t = ` ${key.replace(/[_*•·]/g, " ")} `;
  const hits = [];
  for (const [re, r, why] of LFD.rules) {
    t = t.replace(new RegExp(re.source, "gi"), m => {
      const term = m.trim();
      if (term && !hits.some(h => h.term === term)) hits.push({ term, r, why });
      return " ".repeat(m.length);
    });
  }
  const out = { r: worstLfd(hits.map(h => h.r)), hits };
  if (lfdTextMemo.size > 4000) lfdTextMemo.clear();
  lfdTextMemo.set(key, out);
  return out;
}
// rating for a library item: { r, hits, src } where src is "you", "label", "meal" or "name"
function lfdOf(it, map = lib(), depth = 0) {
  if (!it) return { r: null, hits: [], src: "name" };
  if (LFD_RANK[it.lfd] != null) return { r: it.lfd, hits: [], src: "you" };
  if (it.parts && it.parts.length && depth < 3) {
    const subs = it.parts.map(p => map[p.id] && { it: map[p.id], x: lfdOf(map[p.id], map, depth + 1) }).filter(Boolean);
    const hits = subs.filter(s => s.x.r && s.x.r !== "ok").map(s => ({ term: s.it.name, r: s.x.r, why: s.x.hits[0] ? s.x.hits[0].why : "" }));
    return { r: worstLfd(subs.map(s => s.x.r)), hits, src: "meal" };
  }
  const label = it.ingredients ? lfdText(it.ingredients) : null;
  const named = lfdText([it.name, it.usdaName].filter(Boolean).join(" · "));
  if (label && label.r) return { r: worstLfd([label.r, named.r === "avoid" ? "avoid" : null]), hits: label.hits.concat(named.r === "avoid" ? named.hits : []), src: "label" };
  return { r: named.r, hits: named.hits, src: "name" };
}
function lfdBadge(r, opt = {}) {
  const k = r || "none";
  return `<span class="lfd lfd-${k}" aria-label="Low fermentation: ${LFD_WORD[k]}">${LFD_MARK[k]}${opt.short ? "" : ` ${LFD_WORD[k]}`}</span>`;
}
// "● Fits · " in front of a food's sub line
const lfdLead = (it, map) => `${lfdBadge(lfdOf(it, map).r)} · `;
// counts for a set of library items
function lfdCount(items, map = lib()) {
  const c = { n: 0, ok: 0, limit: 0, avoid: 0, none: 0, avoidNames: [], limitNames: [] };
  for (const it of items) {
    if (!it) continue;
    const r = lfdOf(it, map).r;
    c.n++; c[r || "none"]++;
    if (r === "avoid") c.avoidNames.push(it.name);
    if (r === "limit") c.limitNames.push(it.name);
  }
  return c;
}
function lfdCountText(c) {
  if (!c.n) return "";
  if (c.ok === c.n) return `${LFD_MARK.ok} All fit`;
  return [c.avoid ? `${LFD_MARK.avoid} ${c.avoid} to avoid` : "", c.limit ? `${LFD_MARK.limit} ${c.limit} to limit` : "", c.none ? `${LFD_MARK.none} ${c.none} not rated` : ""].filter(Boolean).join(" · ");
}
// every food eaten on a day, with saved meals opened up into their foods
const dayFoodItems = (d, map = lib()) => (d ? itemNames(d, map).filter(i => i.cat === "food") : []);
const dayLfd = (d, map = lib()) => lfdCount(dayFoodItems(d, map), map);

// the rating panel on a food's sheet: why, and a switch to set your own rating
function lfdPanel(it, map = lib()) {
  if (!it) return "";
  const x = lfdOf(it, map), auto = LFD_RANK[it.lfd] == null;
  const why = x.src === "you" ? "You set this rating."
    : x.src === "meal" ? (x.hits.length ? x.hits.map(h => `${LFD_MARK[h.r]} ${esc(h.term)}`).join(", ") : "Every food in it fits.")
    : x.hits.length ? x.hits.filter(h => h.r !== "ok" || x.r === "ok").slice(0, 6).map(h => `${LFD_MARK[h.r]} ${esc(h.term)}: ${esc(h.why)}`).join("<br>")
    : "Nothing in the name or ingredients matches the diet's lists. Set it yourself if you know.";
  return `<h3 class="sheet-h3">Low Fermentation Diet</h3><div class="list">
    <div class="row"><span class="row-main"><span class="row-label">${lfdBadge(x.r)}</span><span class="row-sub">${why}</span></span></div>
    <div class="row field-row"><span class="row-label">Rating</span>${seg("Low fermentation rating", [["auto", "Auto"], ["ok", LFD_MARK.ok], ["limit", LFD_MARK.limit], ["avoid", LFD_MARK.avoid]], auto ? "auto" : it.lfd, "lfdSet", `data-id="${it.id}"`)}</div>
    ${it.ingredients ? `<div class="row"><span class="row-sub"><b>Ingredients:</b> ${esc(it.ingredients)}</span></div>` : ""}</div>`;
}
function lfdDayRow(d) {
  const c = dayLfd(d);
  if (!c.n) return "";
  const names = [...c.avoidNames.map(n => `${LFD_MARK.avoid} ${n}`), ...c.limitNames.map(n => `${LFD_MARK.limit} ${n}`)];
  return `<div class="row lfd-day"><span class="row-main"><span class="row-label">Low fermentation: ${c.ok} of ${c.n} food${c.n > 1 ? "s" : ""} fit</span>${names.length ? `<span class="row-sub">${esc([...new Set(names)].slice(0, 6).join(" · "))}</span>` : ""}</span></div>`;
}

// ---------- labels: photo of the ingredients, or a barcode ----------
const OCR_LIB = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const ZXING_LIB = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
const OFF_API = "https://world.openfoodfacts.org/api/v2/product/";
const loadedLibs = {};
function loadLib(src, global) {
  if (window[global]) return Promise.resolve(window[global]);
  return loadedLibs[src] ||= new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = src; sc.async = true; sc.crossOrigin = "anonymous";
    sc.onload = () => (window[global] ? res(window[global]) : rej(new Error("library missing")));
    sc.onerror = () => { delete loadedLibs[src]; rej(new Error("offline")); };
    document.head.appendChild(sc);
  });
}
// draw a photo onto a canvas, scaled down, optionally grayscale with a contrast lift (helps text recognition)
async function photoCanvas(file, max, gray) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    if (gray) {
      const px = g.getImageData(0, 0, c.width, c.height), a = px.data;
      for (let i = 0; i < a.length; i += 4) { const v = Math.min(255, Math.max(0, (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2] - 128) * 1.35 + 128)); a[i] = a[i + 1] = a[i + 2] = v; }
      g.putImageData(px, 0, 0);
    }
    return c;
  } finally { URL.revokeObjectURL(url); }
}
// read a photo once per variant ([max size, grayscale]); one reader serves every pass
async function ocrTexts(file, variants, progress) {
  const T = await loadLib(OCR_LIB, "Tesseract");
  let pass = 0;
  const worker = await T.createWorker("eng", 1, { logger: m => { if (m.status === "recognizing text" && progress) progress(Math.round((pass + m.progress) / variants.length * 100)); } });
  try {
    const out = [];
    for (; pass < variants.length; pass++) out.push((await worker.recognize(await photoCanvas(file, ...variants[pass]))).data.text || "");
    return out;
  } finally { worker.terminate(); }
}
const ocrPhoto = async (file, progress) => (await ocrTexts(file, [[2200, true]], progress))[0];
// pull the ingredients list out of whatever the photo caught (stops at the French list on Canadian labels)
function ingredientsFrom(text) {
  let t = String(text || "").replace(/\r/g, "").replace(/[|{}\[\]~«»_]/g, " ").replace(/-\n(?=[a-z])/g, "").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  const m = t.match(/ingr[eé]dients?\s*[:;.\-]?\s*/i);
  if (m) t = t.slice(m.index + m[0].length);
  const end = t.search(/\bingr[eé]dients?\s*[:;]|\b(contains|may contain|contient|peut contenir|allergen|allergy advice|nutrition facts|valeur nutritive|nutrition information|storage|best before|meilleur avant|distributed by|manufactured|product of|produit de)\b/i);
  if (end > 20) t = t.slice(0, end);
  return t.replace(/[.\s,;:]+$/, "").replace(/\s+([,.;])/g, "$1").trim();
}
// read a Nutrition Facts table (Canadian bilingual or US). Values are per serving, as printed.
const LAB_FIELDS = [ // key, label, unit, pattern for the row, rows to skip
  ["kcal", "Calories", "kcal", /\bcalori\w*|\benergy\b/i],
  ["f", "Fat", "g", /\b(total\s+)?fat\b|lipides/i, /satur|trans/i],
  ["sat", "Saturated fat", "g", /satur/i],
  ["c", "Carbs", "g", /carbo|glucides/i],
  ["fib", "Fibre", "g", /fib(re|er)s?\b/i],
  ["sug", "Sugars", "g", /sugars?\b|sucres/i, /added|ajout/i],
  ["p", "Protein", "g", /protein|prot[eé]ines?/i],
  ["ca", "Calcium", "mg", /calcium/i],
  ["fe", "Iron", "mg", /\biron\b|\bfer\b/i],
  ["mg", "Magnesium", "mg", /magn[eé]sium/i],
  ["zn", "Zinc", "mg", /\bzinc\b/i],
];
const labNum = s => { s = s.replace(/[Oo]/g, "0").replace(",", "."); return /^0\d$/.test(s) ? Number("0." + s[1]) : Number(s); }; // "02" is a lost decimal point: 0.2
function nutritionFrom(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(l => l.replace(/[|{}\[\]~«»_]/g, " ").replace(/\s{2,}/g, " ").trim()).filter(Boolean);
  const vals = {};
  for (const [k, , unit, re, skip] of LAB_FIELDS) {
    for (const l of lines) {
      const m = l.match(re);
      if (!m || (skip && skip.test(l)) || vals[k] != null) continue;
      const rest = l.slice(m.index + m[0].length);
      if (k === "kcal") { const v = rest.match(/(\d{1,4})/); if (v) vals.kcal = Number(v[1]); continue; }
      // a number with a unit; OCR often reads "g" as "q" or "9", and "0" as "O"
      const v = rest.match(/(?:^|[^\d.%])([\dOo]{1,4}(?:[.,]\d{1,2})?)\s?(mg|mcg|µg|g|q|9)(?![a-z%])/i);
      if (!v) continue;
      let n = labNum(v[1]); const u = v[2].toLowerCase();
      if (!isFinite(n)) continue;
      if (unit === "g" && u === "mg") n /= 1000;
      if (unit === "mg" && /g|q|9/.test(u) && !/m/.test(u)) n *= 1000;
      vals[k] = n;
    }
  }
  let serv = null, g = null;
  for (const re of [/\b(?:per|serving size|portion)\b\s*:?\s*(.*?)\s*\(\s*([\dOo]+(?:[.,]\d+)?)\s?(g|q|9|ml)\b/i, /\bpour\b\s*(.*?)\s*\(\s*([\dOo]+(?:[.,]\d+)?)\s?(g|q|9|ml)\b/i]) {
    const m = lines.join("\n").match(re);
    if (m) { serv = m[1].replace(/(\d)([a-z])/gi, "$1 $2").replace(/^[^\da-z]+|[^\da-z)]+$/gi, "").trim() || null; g = labNum(m[2]); break; }
  }
  return { serv, g, vals, n: Object.keys(vals).length };
}
// merge several reads of the same table: the first read wins, the others fill gaps
function mergeNutrition(...reads) {
  const out = { serv: null, g: null, vals: {} };
  for (const r of reads) { out.serv ??= r.serv; out.g ??= r.g; for (const k in r.vals) out.vals[k] ??= r.vals[k]; }
  out.n = Object.keys(out.vals).length;
  return out;
}
// colour and grayscale each catch rows the other misses
const ocrNutrition = async (file, progress) => mergeNutrition(...(await ocrTexts(file, [[2200, false], [2200, true]], progress)).map(nutritionFrom));
// a quick sense check: calories from the macros should land near the printed calories
function labCheck(v) {
  if (!v || !v.kcal) return "";
  const est = 4 * (v.c || 0) + 4 * (v.p || 0) + 9 * (v.f || 0);
  if (Math.abs(est - v.kcal) <= Math.max(10, v.kcal * 0.3)) return "";
  return `The numbers don't quite add up (fat, carbs and protein make about ${fmtN(est)} kcal, not ${fmtN(v.kcal)}). Check them against the label.`;
}
async function readBarcode(file) {
  const canvas = await photoCanvas(file, 1600, false);
  if ("BarcodeDetector" in window) {
    try { const r = await new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }).detect(canvas); if (r[0]) return r[0].rawValue; } catch (e) { /* fall back to the library */ }
  }
  const Z = await loadLib(ZXING_LIB, "ZXing");
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  const tryCanvas = c => { try { return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c))), hints).getText(); } catch (e) { return null; } };
  let code = tryCanvas(canvas);
  if (!code) { // a sideways photo: turn it a quarter and try again
    const r = document.createElement("canvas"); r.width = canvas.height; r.height = canvas.width;
    const g = r.getContext("2d"); g.translate(r.width, 0); g.rotate(Math.PI / 2); g.drawImage(canvas, 0, 0);
    code = tryCanvas(r);
  }
  return code;
}
// Open Food Facts: only the barcode number leaves the phone
async function lookupBarcode(code) {
  const fields = "product_name,product_name_en,brands,ingredients_text,ingredients_text_en,nutriments,serving_size,serving_quantity";
  const r = await fetch(`${OFF_API}${encodeURIComponent(code)}.json?fields=${fields}`, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!r.ok) return null;
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  const p = j.product, n = p.nutriments || {}, v = k => (n[k] === "" || n[k] == null ? null : Number(n[k]));
  const kcal = v("energy-kcal_100g") ?? (v("energy_100g") != null ? v("energy_100g") / 4.184 : null);
  let nut = null;
  if (kcal != null) {
    const mg = k => (v(k) != null ? v(k) * 1000 : 0), ug = k => (v(k) != null ? v(k) * 1e6 : 0);
    nut = { kcal, p: v("proteins_100g") || 0, f: v("fat_100g") || 0, c: v("carbohydrates_100g") || 0, fib: v("fiber_100g") || 0, sug: v("sugars_100g") || 0, sat: v("saturated-fat_100g") || 0,
      ca: mg("calcium_100g"), fe: mg("iron_100g"), mg: mg("magnesium_100g"), zn: mg("zinc_100g"), d: ug("vitamin-d_100g"), b12: ug("vitamin-b12_100g") };
  }
  const sq = Number(p.serving_quantity);
  const portions = sq > 0 ? [[`1 serving${p.serving_size ? ` (${p.serving_size})` : ""}`, sq]] : [];
  const name = [p.product_name_en || p.product_name, (p.brands || "").split(",")[0]].filter(Boolean).join(", ").trim();
  // the English list is sometimes a stub; use the fuller one
  const en = (p.ingredients_text_en || "").trim(), any = (p.ingredients_text || "").trim();
  const ingredients = (en.length >= any.length * 0.6 ? en : any).replace(/_/g, "").trim();
  return { code, name, ingredients, nut, portions };
}

// the scan sheet (a step of the food search sheet, so it works from a meal too)
const scanStatusHtml = s => s.status ? `<div class="list"><div class="row"><span class="row-sub">${s.busy ? `<span class="spinner"></span> ` : ""}${esc(s.status)}</span></div></div>` : "";
const photoRow = (kind, label, sub) => `<label class="row action" for="sc-${kind}">${icon("plus", "lead")}<span class="row-main"><span class="row-label">${label}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span><input type="file" id="sc-${kind}" class="sr" accept="image/*" data-scan="${kind}"></label>`;
const servLabel = serv => { serv = String(serv || "").trim() || "serving"; return /^[\d½¼¾]/.test(serv) ? serv : `1 ${serv}`; };
function labRows(lab) {
  const v = lab.vals || {}, fld = ([k, label, unit]) => `<label class="row field-row" for="lb-${k}"><span class="row-label">${label}</span><span class="field-end"><input type="number" id="lb-${k}" name="lb_${k}" data-lab="${k}" min="0" step="any" inputmode="decimal" ${k === "kcal" ? "required" : ""} value="${v[k] ?? ""}" placeholder="–"><span class="unit">${unit}</span></span></label>`;
  return `<div class="list"><label class="row field-row stack" for="lb-serv"><span class="row-label">Per</span><input id="lb-serv" name="lb_serv" data-lab="serv" value="${esc(lab.serv || "")}" placeholder="e.g. 2 crackers, 1 cup"></label>
      <label class="row field-row" for="lb-g"><span class="row-label">Weighs</span><span class="field-end"><input type="number" id="lb-g" name="lb_g" data-lab="g" min="0" step="any" inputmode="decimal" value="${lab.g ?? ""}" placeholder="–"><span class="unit">g</span></span></label></div>
    <div class="list">${LAB_FIELDS.map(fld).join("")}</div>
    <p class="footnote" id="lb-check">${esc(labCheck(v))}</p>
    <div class="list"><label class="row field-row" for="lb-q"><span class="row-label">Servings eaten</span><input type="number" id="lb-q" name="q" value="${lab.q ?? 1}" min="0" step="any" inputmode="decimal"></label></div>`;
}
function scanSheetParts(s) {
  if (s.step === "scan") {
    return { title: "Scan a label", form: false,
      body: `<p class="sheet-text"><button type="button" class="textbtn" data-act="fsBack">${icon("chevL")} Search</button> Photograph the ingredients, the nutrition facts, or the barcode. You can add the other photo next.</p>
        <div class="list">
          ${photoRow("ing", "Photo of the ingredients", "Read on this phone; the photo isn't kept or sent. The reader downloads once (a few MB), then works offline.")}
          ${photoRow("nut", "Photo of the nutrition facts", "Also read on this phone. Get the whole table in, flat and in good light.")}
          ${photoRow("bar", "Photo of the barcode", "Looks the product up in Open Food Facts, a free public database. Only the barcode number is sent.")}
          <button type="button" class="row action" data-act="scanType">${icon("plus", "lead")}<span class="row-label">Type it in</span></button>
        </div>
        <div id="scan-status">${scanStatusHtml(s)}</div>` };
  }
  const f = s.found || {}, x = lfdText(f.ingredients || ""), lab = f.lab;
  const off = !lab && f.nut, portions = off ? [...(f.portions || []), ["g", 1]] : null, u = portions ? (f.portions && f.portions[0] ? f.portions[0][0] : "g") : null, q = u === "g" ? 100 : 1;
  const st = kind => `<div id="scan-status-${kind}">${s.statusKind === kind ? scanStatusHtml(s) : ""}</div>`;
  return { title: "Check a label", submitLabel: s.link ? "Save" : "Add",
    body: `<p class="sheet-text"><button type="button" class="textbtn" data-act="scanAgain">${icon("chevL")} Start over</button>${f.code ? ` Barcode ${esc(f.code)}` : ""}</p>
      <div class="list">${s.link ? "" : `<label class="row field-row stack" for="sc-name"><span class="row-label">Name</span><input id="sc-name" name="name" required value="${esc(f.name || s.q || "")}" placeholder="e.g. Rice rusks"></label>`}</div>
      <h3 class="sheet-h3">Ingredients</h3>
      <div class="list"><label class="row field-row stack" for="sc-text"><span class="row-label">As printed</span><textarea id="sc-text" name="ing" rows="5" placeholder="Water, rice flour, salt…">${esc(f.ingredients || "")}</textarea></label>
        ${photoRow("ing", f.ingredients ? "Read again from a photo" : "Add a photo of the ingredients")}</div>
      ${st("ing")}
      <p class="footnote">${f.code && (f.ingredients || "").split(/[,;]/).filter(x => x.trim()).length < 4 ? "<b>This list looks short.</b> Open Food Facts entries are added by volunteers and some are incomplete. Check it against the pack, or photograph the ingredients. " : ""}Fix anything that's wrong. The check below updates as you type.</p>
      <div id="sc-rate">${scanRateHtml(x)}</div>
      <h3 class="sheet-h3">Nutrition facts</h3>
      ${lab ? labRows(lab) : off ? `<div class="list">${amountRows(portions, q, u)}</div><p class="footnote">From Open Food Facts (per 100 g: ${fmtN(f.nut.kcal)} kcal).</p>` : ""}
      <div class="list">${photoRow("nut", lab ? "Read again from a photo" : off ? "Use a photo of the label instead" : "Add a photo of the nutrition facts")}
        ${lab ? "" : `<button type="button" class="row action" data-act="scanNutType">${icon("plus", "lead")}<span class="row-label">Type the numbers</span></button>`}</div>
      ${st("nut")}
      ${lab ? `<p class="footnote">Read from your photo, per serving as printed. Check each number against the label before adding.</p>` : ""}
      ${s.link || s.fromMeal ? "" : `<div class="list">${mealSeg(s.meal || guessMealNow())}<label class="row field-row" for="ft"><span class="row-label">Time</span><input type="time" id="ft" name="time" value=""></label></div>`}` };
}
function scanRateHtml(x) {
  const bad = x.hits.filter(h => h.r !== "ok");
  return `<div class="list"><div class="row"><span class="row-main"><span class="row-label">Low Fermentation Diet: ${lfdBadge(x.r)}</span>
    <span class="row-sub">${bad.length ? bad.map(h => `${LFD_MARK[h.r]} <b>${esc(h.term)}</b>: ${esc(h.why)}`).join("<br>") : x.r === "ok" ? "Every ingredient it recognizes is on the allowed list." : "Nothing recognized yet."}</span></span></div></div>`;
}
// keep what's been typed on the check step before the sheet redraws
function syncScanForm(s) {
  const f = s.found ||= {}, name = $("#sc-name"), ing = $("#sc-text");
  if (name) f.name = name.value;
  if (ing) f.ingredients = ing.value;
  if (f.lab) {
    document.querySelectorAll("[data-lab]").forEach(el => {
      const k = el.dataset.lab, v = el.value.trim();
      if (k === "serv") f.lab.serv = v; else if (k === "g") f.lab.g = v === "" ? null : Number(v); else f.lab.vals[k] = v === "" ? null : Number(v);
    });
    const q = $("#lb-q"); if (q) f.lab.q = q.value;
  }
}
async function handleScanFile(kind, file) {
  const s = UI.sheet;
  if (!s || s.k !== "foodSearch" || (s.step !== "scan" && s.step !== "scanned") || !file) return;
  const onCheck = s.step === "scanned", step = s.step;
  if (onCheck) syncScanForm(s);
  const status = (msg, busy) => {
    Object.assign(s, { status: msg, busy, statusKind: kind });
    const el = $(onCheck ? `#scan-status-${kind}` : "#scan-status");
    if (el && UI.sheet === s) { el.innerHTML = scanStatusHtml(s); if (msg) el.scrollIntoView({ block: "nearest" }); }
  };
  const done = found => { if (UI.sheet !== s || s.step !== step) return; Object.assign(s, { step: "scanned", found: { ...(s.found || {}), ...found }, status: "", busy: false }); renderSheet(); };
  try {
    if (kind === "ing") {
      status("Getting the reader ready…", true);
      const text = await ocrPhoto(file, p => status(`Reading the ingredients… ${p}%`, true));
      if (!/ingr[eé]dients?/i.test(text) && /nutrition facts|valeur nutritive|calori|lipides|glucides/i.test(text)) { status("That looks like the nutrition facts. Use the nutrition facts photo for that one, and photograph the ingredients list here."); return; }
      const ingredients = ingredientsFrom(text);
      if (!ingredients || ingredients.length < 4) { status("Couldn't make out the list. Try again closer, in good light, with the list flat and filling the photo."); return; }
      done({ name: (s.found && s.found.name) || s.q || "", ingredients });
    } else if (kind === "nut") {
      status("Getting the reader ready…", true);
      const r = await ocrNutrition(file, p => status(`Reading the nutrition facts… ${p}%`, true));
      if (r.vals.kcal == null && r.n < 2) { status("Couldn't find a Nutrition Facts table. Try again with the whole table in the photo, flat, in good light."); return; }
      done({ lab: { serv: r.serv, g: r.g, vals: r.vals, q: 1 } });
    } else {
      status("Reading the barcode…", true);
      const code = await readBarcode(file);
      if (!code) { status("Couldn't read the barcode. Try a sharper photo with the barcode filling most of it, or photograph the label instead."); return; }
      status(`Barcode ${code}. Looking it up…`, true);
      const found = await lookupBarcode(code).catch(() => undefined);
      if (found === undefined) { status("Couldn't reach Open Food Facts. Check your connection, or photograph the label instead (that works offline)."); return; }
      if (!found) { status(`Barcode ${code} isn't in Open Food Facts yet. Photograph the ingredients and nutrition facts instead.`); return; }
      done(found);
    }
  } catch (e) {
    status(String(e && e.message) === "offline" ? "The reader needs a connection the first time it's used. Try again when you're online." : "Something went wrong reading that photo. Try another photo, or type it in.");
  }
}
function submitScan(fd) {
  const s = UI.sheet, f = s.found || {}, map = lib();
  const ingredients = String(fd.get("ing") || "").trim();
  const it = s.link ? map[s.link] : addLibraryItem(String(fd.get("name") || f.name || "Packaged food"), "food");
  if (!it) return;
  if (ingredients) it.ingredients = ingredients; else delete it.ingredients;
  if (f.code) it.barcode = f.code;
  let qu = null;
  if (f.lab) { // per serving as printed → per 100 g, the serving becomes the portion
    const g = num(fd.get("lb_g")), label = servLabel(fd.get("lb_serv")), q = num(fd.get("q")) ?? 1;
    const base = g || 100, nut = {};
    NUT_KEYS.forEach(k => { nut[k] = (num(fd.get("lb_" + k)) || 0) * 100 / base; });
    Object.assign(it, { nut, portions: [[label, base]], src: "label", usual: { q, u: label } });
    delete it.fdc; delete it.usdaName;
    qu = { q, u: label };
  } else if (f.nut) {
    const q = num(fd.get("q")) ?? 1, u = fd.get("u") || "g";
    Object.assign(it, { nut: f.nut, portions: f.portions || [], src: "off", usual: { q, u } });
    delete it.fdc; delete it.usdaName;
    qu = { q, u };
  }
  Store.saveProfile();
  if (s.link) { if (s.back) { mealReturn(); return; } closeSheet(); render(); toast("Label saved"); return; }
  if (s.back) { addToDraft(s.back.draft, it, qu || undefined); s.back.q = ""; mealReturn(); return; }
  logFood(it, { ...(qu || {}), meal: fd.get("meal") || undefined, time: fd.get("time") || "" }); closeSheet(); render();
  toast(`${LFD_MARK[lfdOf(it).r || "none"]} ${it.name} added`);
}

document.addEventListener("change", e => {
  const t = e.target;
  if (t && t.dataset && t.dataset.scan && t.files && t.files[0]) { const file = t.files[0]; t.value = ""; handleScanFile(t.dataset.scan, file); }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t && t.id === "sc-text") { const el = $("#sc-rate"); if (el) el.innerHTML = scanRateHtml(lfdText(t.value)); }
  if (t && t.dataset && t.dataset.lab && UI.sheet && UI.sheet.found && UI.sheet.found.lab) { syncScanForm(UI.sheet); const el = $("#lb-check"); if (el) el.textContent = labCheck(UI.sheet.found.lab.vals); }
});
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const s = UI.sheet;
  switch (t.dataset.act) {
    case "lfdSet": {
      const it = lib()[t.dataset.id];
      if (!it) break;
      if (t.dataset.v === "auto") delete it.lfd; else it.lfd = t.dataset.v;
      Store.saveProfile(); haptic(); renderSheet(); break;
    }
    case "fsScan": if (s) { s.step = "scan"; s.status = ""; renderSheet(); } break;
    case "mlScan": if (s) mealSub({ k: "foodSearch", step: "scan", q: s.q, meal: s.draft.type, fromMeal: true }); break;
    case "scanType": if (s) { Object.assign(s, { step: "scanned", found: { name: s.q || "", ingredients: "" }, status: "" }); renderSheet(); const el = $("#sc-text"); if (el) el.focus(); } break;
    case "scanNutType": if (s && s.found) { syncScanForm(s); s.found.lab = { serv: "", g: null, vals: {}, q: 1 }; s.status = ""; renderSheet(); const el = $("#lb-serv"); if (el) el.focus(); } break;
    case "scanAgain": if (s) { Object.assign(s, { step: "scan", found: null, status: "" }); renderSheet(); } break;
  }
});
