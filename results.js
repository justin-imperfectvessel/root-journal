/* SIBO Root Journal — test results.
   Files go into the encrypted on-device vault (vault.js). Only the values the person
   confirms are saved to the journal (S.profile.results, and the newest value per lab
   into S.profile.labs, which the root-cause engine reads). Builds on core.js and ui.js. */

const RESULT_TYPES = [["breath", "Breath test"], ["blood", "Bloodwork"], ["stool", "Stool test"], ["other", "Other"]];
const RESULT_LABS = {
  breath: ["breath_h2", "breath_ch4", "breath_h2s"],
  blood: ["tsh", "ft3", "a1c", "ferritin", "b12", "vitd", "zinc", "ttg", "vinculin", "cdtb"],
  stool: ["elastase", "siga"],
  other: LABS.map(l => l.k),
};
const RESULT_SHEETS = ["result", "vaultImport", "vaultDelete"];
const MAX_FILE = 15 * 1024 * 1024;
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const R = { supported: null, status: "none", files: {}, count: 0 };

const resultsList = () => (S.profile.results ||= []);
const typeName = t => (RESULT_TYPES.find(x => x[0] === t) || ["", "Test"])[1];
const fmtSize = b => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

async function refreshVault() {
  if (R.supported === null) R.supported = await Vault.supported();
  if (!R.supported) { R.status = "unsupported"; return; }
  R.status = await Vault.status();
  R.count = await Vault.count();
  R.files = {};
  if (R.status === "unlocked") (await Vault.list()).forEach(f => { R.files[f.id] = f; });
}
Vault.onChange(async () => {
  await refreshVault();
  if (!Vault.isUnlocked() && UI.sheet && UI.sheet.k === "result" && UI.sheet.file) { closeSheet(); toast("Vault locked"); }
  if (page() && page().k === "results") render();
});

// ---------- page ----------
function viewResults() {
  if (R.supported === null) { refreshVault().then(render); return `<div class="loading"><span class="spinner"></span></div>`; }
  const list = resultsList().slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  let h = `<div class="spacer"></div>`;
  const manualRow = `<button type="button" class="row action" data-act="newResult">${icon("plus", "lead")}<span class="row-label">Type in values only</span></button>`;
  if (R.status === "unsupported") {
    h += group("Add a result", `<div class="row prose">This browser can't store encrypted files right now, for example in private browsing or with site storage blocked. You can still save results by typing the values.</div>${manualRow}`);
  } else if (R.status === "none") {
    h += group("Set up your private file vault", `<form data-act="vaultSetup">
        <label class="row field-row stack" for="vp1"><span class="row-label">Passphrase</span><input type="password" id="vp1" name="p1" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>
        <label class="row field-row stack" for="vp2"><span class="row-label">Type it again</span><input type="password" id="vp2" name="p2" autocomplete="new-password" minlength="8" required></label>
        <div class="row"><button class="btn filled" type="submit">Create vault</button></div></form>${manualRow}`,
      "Files are encrypted with this passphrase and never leave this device. It can't be reset: if you forget it, the files can't be opened. Values saved to your journal aren't affected.");
  } else if (R.status === "locked") {
    h += group("Vault locked", `<form data-act="vaultUnlock"><label class="row field-row stack" for="vpu"><span class="row-label">Passphrase</span><input type="password" id="vpu" name="p" autocomplete="current-password" required></label>
        <div class="row"><button class="btn filled" type="submit">Unlock</button></div></form>${manualRow}`,
      `${R.count} encrypted file${R.count === 1 ? "" : "s"} on this device. The vault locks after 10 minutes idle, or 5 minutes in the background.`);
  } else {
    h += group("Add a result", `<label class="row action" for="resfile">${icon("plus", "lead")}<span class="row-label">Upload a file or photo</span><input type="file" id="resfile" class="sr" accept="image/*,application/pdf" data-act="pickResult"></label>
        ${manualRow}<button type="button" class="row action" data-act="vaultLock"><span class="row-label">Lock vault</span></button>`,
      "Photos and PDFs are encrypted on this device before they're saved. Only the values you confirm go into your journal.");
  }
  h += group(`Your results <span class="gh-meta">${list.length}</span>`, list.length ? list.map(r => {
    const vals = Object.entries(r.values || {}).slice(0, 2).map(([k, v]) => `${LABMAP[k] ? LABMAP[k].name : k} ${LABMAP[k] && LABMAP[k].bool ? (v >= 1 ? "positive" : "negative") : v}`);
    const badge = !r.fileId ? "" : R.status !== "unlocked" ? "Locked" : R.files[r.fileId] ? "File" : "Not on this device";
    return navRow({ label: esc(r.label || typeName(r.type)), sub: esc([r.date && fmtDate(r.date, { month: "short", day: "numeric", year: "numeric" }), ...vals].filter(Boolean).join(" · ")), value: badge, act: "openResult", attrs: `data-id="${r.id}"` });
  }).join("") : `<div class="row"><span class="row-sub">No results yet.</span></div>`,
    list.length ? "Newer values replace older ones in History & labs, which the root-cause ranking reads." : "");
  if (R.status === "unlocked") {
    h += group("Encrypted backup", `<button type="button" class="row action" data-act="vaultExport"><span class="row-label">Export encrypted files</span></button>
      <label class="row action" for="vaultimport"><span class="row-label">Import encrypted files</span><input type="file" id="vaultimport" class="sr" accept=".json,application/json" data-act="vaultImportPick"></label>
      <button type="button" class="row action destructive" data-act="vaultDeleteAsk"><span class="row-label">Delete vault and all files</span></button>`,
      "Backups stay encrypted and need the passphrase they were made with. Your journal backup in Data holds the values, not the files.");
  }
  return h;
}

// ---------- result sheet ----------
function resultSheetParts(s) {
  if (s.k === "vaultImport") return { title: "Import files", submitLabel: "Import", body: `<p class="sheet-text">Enter the passphrase this backup was made with. Its files are decrypted on this device and re-encrypted with your current passphrase.</p>
    <div class="list"><label class="row field-row stack" for="vpi"><span class="row-label">Backup passphrase</span><input type="password" id="vpi" name="p" autocomplete="off" required></label></div>` };
  if (s.k === "vaultDelete") return { title: "Delete vault", form: false, body: `<p class="sheet-text">This permanently deletes every encrypted file on this device and the passphrase check. Values already saved to your journal stay. Export an encrypted backup first if you might need the files.</p>
    <button type="button" class="btn destructive block" data-act="vaultDelete">Delete vault and files</button><button type="button" class="btn tonal block" data-act="closeSheet">Keep it</button>` };
  const r = s.r, keys = RESULT_LABS[r.type] || RESULT_LABS.other;
  let preview = "";
  if (s.loading) preview = `<div class="res-preview"><span class="spinner"></span></div>`;
  else if (s.file) preview = `<div class="res-preview">${s.url ? `<img src="${s.url}" alt="Preview of ${esc(s.file.name)}">` : ""}
      <div class="res-file"><span class="row-main"><span class="row-label">${esc(s.file.name)}</span><span class="row-sub">${esc(s.file.type === "application/pdf" ? "PDF" : "Image")} · ${fmtSize(s.file.size)} · ${s.fileIsNew ? "encrypted when you save" : "encrypted on this device"}</span></span>
      ${s.fileIsNew ? "" : `<button type="button" class="btn small" data-act="saveCopy">Save a copy</button>`}</div></div>`;
  else if (r.fileId) preview = `<p class="sheet-text">${R.status === "unlocked" ? "The file for this result isn't on this device." : "Unlock your vault to see the file."}</p>`;
  const canRead = Store.sample && s.file;
  const body = `${preview}
    ${canRead ? `<div class="ai-read"><button type="button" class="btn filled" data-act="aiRead" ${s.aiBusy ? "disabled" : ""}>${icon("spark")}${s.aiBusy ? "Reading…" : "Read values with Claude"}</button>
      <p class="group-f" id="aistatus">${esc(s.aiMsg || `Sends ${s.file && s.file.type === "application/pdf" ? "this PDF's text (or page images if it has no text)" : "an image of this file"} to Claude to read the numbers. Nothing is saved until you check the values and tap Save.`)}</p></div>` : ""}
    <div class="list">
      <label class="row field-row" for="rs-type"><span class="row-label">Type</span><select id="rs-type" name="type" data-act="resType">${RESULT_TYPES.map(([k, n]) => `<option value="${k}" ${r.type === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="row field-row" for="rs-date"><span class="row-label">Test date</span><input type="date" id="rs-date" name="date" value="${esc(r.date || "")}" max="${todayStr()}"></label>
      <label class="row field-row stack" for="rs-label"><span class="row-label">Name</span><input id="rs-label" name="label" value="${esc(r.label || "")}" placeholder="e.g. Lactulose breath test, trio-smart"></label>
    </div>
    <h3 class="sheet-h3">Values</h3>
    <div class="list">${keys.map(k => { const l = LABMAP[k], v = r.values && r.values[k]; return `<label class="row lab-row" for="rv-${k}"><span class="row-main"><span class="row-label">${esc(l.name)}</span><span class="row-sub">${esc(l.hint)}</span></span>
      <span class="field-end"><input id="rv-${k}" type="number" step="any" inputmode="decimal" name="v_${k}" value="${v ?? ""}" placeholder="–" class="${s.filled && s.filled.includes(k) ? "filled" : ""}"><span class="unit">${esc(l.unit)}</span></span></label>`; }).join("")}</div>
    <div class="list"><div class="row"><textarea id="rs-notes" name="notes" rows="2" placeholder="Notes: lab, prep, what your clinician said">${esc(r.notes || "")}</textarea></div></div>`;
  const del = s.isNew ? "" : s.confirmDel
    ? `<p class="sheet-text">Delete this result${r.fileId ? " and its encrypted file" : ""}? Values already copied into History & labs stay.</p><button type="button" class="btn destructive block" data-act="delResult">Delete result</button><button type="button" class="btn tonal block" data-act="cancelDelResult">Keep it</button>`
    : `<button type="button" class="btn destructive block" data-act="askDelResult">Delete result</button>`;
  return { title: s.isNew ? "New result" : "Result", body, del, submitLabel: "Save" };
}
let sheetUrl = null;
function resultSheetClosed() { if (sheetUrl) { URL.revokeObjectURL(sheetUrl); sheetUrl = null; } }
function setPreviewUrl(s, blob) { resultSheetClosed(); sheetUrl = URL.createObjectURL(blob); s.url = sheetUrl; }

// Keep what's typed when the sheet re-renders (type change, Claude fill-in).
function captureForm() {
  const f = $("#sheetform"), s = UI.sheet;
  if (!f || !s || !s.r) return;
  const fd = new FormData(f);
  s.r.type = fd.get("type") || s.r.type; s.r.date = fd.get("date") || ""; s.r.label = String(fd.get("label") || ""); s.r.notes = String(fd.get("notes") || "");
  s.r.values = { ...(s.r.values || {}) };
  for (const [name, val] of fd.entries()) if (name.startsWith("v_")) { const v = num(val); if (v == null) delete s.r.values[name.slice(2)]; else s.r.values[name.slice(2)] = v; }
}

async function openResultSheet(r, file, isNew) {
  const s = { k: "result", r: clone(r), file: file || null, fileIsNew: !!file, isNew, loading: !file && !!r.fileId && Vault.isUnlocked() };
  openSheet(s);
  if (file) await makePreview(s, file);
  else if (s.loading) {
    try { s.file = await Vault.getFile(r.fileId); } catch (e) { s.file = null; }
    s.loading = false;
    if (s.file) await makePreview(s, s.file);
  }
  if (UI.sheet === s) renderSheet();
}
async function makePreview(s, file) {
  try {
    if (file.type.startsWith("image/")) setPreviewUrl(s, file);
    else if (file.type === "application/pdf") { const [img] = await pdfToImages(file, 1); if (img) setPreviewUrl(s, img); }
  } catch (e) { /* no preview; the file is still kept */ }
}

async function submitResultSheet(fd) {
  const s = UI.sheet;
  if (s.k === "vaultImport") {
    try { const n = await Vault.importAll(s.text, String(fd.get("p") || "")); closeSheet(); await refreshVault(); render(); toast(n ? `Imported ${n} encrypted file${n > 1 ? "s" : ""}` : "No new files in that backup"); }
    catch (e) { toast(e && e.code === "wrong" ? "That passphrase doesn't open this backup" : e && e.code === "format" ? "That file isn't an encrypted vault backup" : "Couldn't import that backup"); }
    return;
  }
  captureForm();
  const r = s.r;
  r.date ||= todayStr();
  r.label = r.label.trim();
  const keys = RESULT_LABS[r.type] || RESULT_LABS.other;
  r.values = Object.fromEntries(Object.entries(r.values || {}).filter(([k]) => keys.includes(k)));
  if (s.file && s.fileIsNew) {
    if (!Vault.isUnlocked()) { toast("Unlock the vault to save the file"); return; }
    try { r.fileId = await Vault.add(s.file, { resultId: r.id }); }
    catch (e) { toast(e && e.name === "QuotaExceededError" ? "This device is out of storage for files" : "Couldn't encrypt and save the file"); return; }
  }
  const list = resultsList(), i = list.findIndex(x => x.id === r.id);
  if (i >= 0) list[i] = r; else list.push(r);
  // the newest result for each value becomes the current lab value
  for (const k of Object.keys(r.values)) {
    const newest = list.filter(x => x.values && x.values[k] != null).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
    if (newest) S.profile.labs[k] = newest.values[k];
  }
  Store.saveProfile(); haptic(); closeSheet(); await refreshVault(); render();
  toast(Object.keys(r.values).length ? `Saved · ${Object.keys(r.values).length} value${Object.keys(r.values).length > 1 ? "s" : ""} added to History & labs` : "Result saved");
}

// ---------- Claude reads the values ----------
let pdfjsLoading = null, pdfWorker = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return (pdfjsLoading ||= new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = PDFJS + "pdf.min.js";
    sc.onload = () => {
      // A worker can't load straight from another host, so start it from a local blob that imports pdf.js's worker.
      const lib = window.pdfjsLib;
      // One long-lived worker that documents borrow, so closing a document doesn't shut it down.
      lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
      try { pdfWorker = new lib.PDFWorker({ port: new Worker(URL.createObjectURL(new Blob([`importScripts("${PDFJS}pdf.worker.min.js");`], { type: "text/javascript" }))) }); }
      catch (e) { pdfWorker = null; }
      resolve(lib);
    };
    sc.onerror = () => { pdfjsLoading = null; reject(new Error("pdf.js failed to load")); };
    document.head.appendChild(sc);
  }));
}
// Rendering happens on this device; the PDF itself is never uploaded anywhere.
async function openPdf(file) {
  const lib = await loadPdfJs();
  return lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, ...(pdfWorker ? { worker: pdfWorker } : {}) }).promise;
}
// Most lab-portal PDFs carry real text; reading it is more accurate than an image and sends less.
async function pdfText(file, maxPages = 4) {
  const doc = await openPdf(file);
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    text += `\n--- page ${i} ---\n` + tc.items.map(t => t.str + (t.hasEOL ? "\n" : " ")).join("");
  }
  await doc.destroy();
  return text.replace(/[ \t]+/g, " ").trim();
}
async function pdfToImages(file, max) {
  const doc = await openPdf(file);
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
    const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1.8 });
    const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp, intent: "print" }).promise; // print intent paints without waiting for animation frames
    out.push(await new Promise(res => c.toBlob(res, "image/jpeg", 0.88)));
  }
  await doc.destroy();
  return out;
}
async function shrinkImage(file, maxBytes) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.9, blob = await new Promise(res => c.toBlob(res, "image/jpeg", q));
  while (maxBytes && blob.size > maxBytes && q > 0.4) { q -= 0.15; blob = await new Promise(res => c.toBlob(res, "image/jpeg", q)); }
  return blob;
}
async function aiRead() {
  const s = UI.sheet;
  if (!s || !s.file || !Store.sample || s.aiBusy) return;
  captureForm();
  const say = msg => { s.aiMsg = msg; const el = $("#aistatus"); if (el) el.textContent = msg; };
  s.aiBusy = true; s.aiMsg = "Preparing the file on this device…"; renderSheet();
  try {
    const isPdf = s.file.type === "application/pdf";
    const text = isPdf ? await pdfText(s.file).catch(() => "") : "";
    let images = [];
    if (text.length < 60) {
      const caps = await Store.sample.limits().catch(() => null);
      if (!caps || !caps.images) throw { code: "no_images" };
      const max = caps.images.maxCount || 2, maxBytes = caps.images.maxBytes;
      images = isPdf ? await pdfToImages(s.file, Math.min(max, 3)) : [await shrinkImage(s.file, maxBytes)];
    }
    say("Claude is reading the values…");
    const keys = RESULT_LABS[s.r.type] || RESULT_LABS.other;
    const source = images.length ? `The attached image${images.length > 1 ? "s are pages of" : " is"}` : "The text below is extracted from";
    const prompt = `${source} a person's own medical test report (${typeName(s.r.type)}). They asked you to read the result values so they can save them to their private symptom journal.
Reply with only JSON in this shape:
{"date": "YYYY-MM-DD or null", "label": "short test name or null", "values": {${keys.map(k => `"${k}": number or null`).join(", ")}}}
Field meanings: ${keys.map(k => `${k} = ${LABMAP[k].name} in ${LABMAP[k].unit}`).join("; ")}.
For breath tests: breath_ch4 is the highest methane ppm at any time point; breath_h2 is the rise in hydrogen ppm from the lowest baseline reading to the highest reading at or before 90 minutes; breath_h2s is the highest hydrogen sulfide ppm. For positive/negative tests use 1 for positive and 0 for negative.
Use null for anything not clearly shown. Never estimate or guess a number. If units differ from the ones listed, convert only when the conversion is standard; otherwise use null.${images.length ? "" : `\n\nReport text:\n${text.slice(0, 12000)}`}`;
    const out = await Store.sample.json(prompt, images.length ? { images, modelTier: "default", cache: false } : { modelTier: "default", cache: false });
    if (UI.sheet !== s) return;
    const vals = out && typeof out.values === "object" ? out.values : {};
    s.filled = [];
    s.r.values = { ...(s.r.values || {}) };
    for (const k of keys) if (typeof vals[k] === "number" && isFinite(vals[k])) { s.r.values[k] = vals[k]; s.filled.push(k); }
    if (!s.r.label && typeof out.label === "string") s.r.label = out.label.slice(0, 80);
    if (typeof out.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(out.date) && out.date <= todayStr() && (!s.r.date || s.r.date === todayStr())) s.r.date = out.date;
    s.aiMsg = s.filled.length ? `Filled ${s.filled.length} value${s.filled.length > 1 ? "s" : ""}, highlighted below. Check each one against the report before saving.` : "No matching values were found. Type them in, or try a different test type.";
  } catch (e) {
    s.aiMsg = e && e.code === "no_images" ? "Reading files with Claude isn't available here. Type the values instead."
      : e && e.code === "not_granted" ? "Claude access wasn't allowed for this page. Type the values instead."
      : e && e.code === "rate_limited" ? "Too many requests right now. Try again in a few minutes."
      : e && e.code === "invalid_json" ? "Couldn't read clear values from this file. Type them in instead."
      : s.file.type === "application/pdf" ? "Couldn't open this PDF here. Upload a screenshot or photo of the results page instead."
      : "Couldn't read this file. Type the values in instead.";
  }
  s.aiBusy = false;
  if (UI.sheet === s) renderSheet();
}

async function saveCopy() {
  const s = UI.sheet;
  if (!s || !s.file) return;
  if (Store.downloads) {
    try { await Store.downloads.save({ filename: s.file.name, data: s.file }); } catch (e) { if (!e || e.code !== "declined") toast("Couldn't save the file here"); }
  } else if (!IN_VIEWER) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(s.file); a.download = s.file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } else toast("Saving files isn't available here");
}

// ---------- events ----------
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act]");
  if (!t || t.tagName === "INPUT" || t.tagName === "SELECT") return;
  const s = UI.sheet;
  switch (t.dataset.act) {
    case "openResult": { const r = resultsList().find(x => x.id === t.dataset.id); if (r) openResultSheet(r, null, false); break; }
    case "newResult": openResultSheet({ id: newId(), type: "breath", date: todayStr(), label: "", values: {}, notes: "" }, null, true); break;
    case "vaultLock": Vault.lock(); break;
    case "aiRead": aiRead(); break;
    case "saveCopy": saveCopy(); break;
    case "askDelResult": captureForm(); s.confirmDel = true; renderSheet(); break;
    case "cancelDelResult": s.confirmDel = false; renderSheet(); break;
    case "delResult": {
      const r = s.r;
      if (r.fileId && !Vault.isUnlocked() && R.status !== "unsupported") { toast("Unlock the vault first so the file is deleted too"); break; }
      if (r.fileId) { try { await Vault.remove(r.fileId); } catch (err) { /* already gone */ } }
      S.profile.results = resultsList().filter(x => x.id !== r.id);
      Store.saveProfile(); closeSheet(); await refreshVault(); render(); toast("Result deleted"); break;
    }
    case "vaultExport": {
      const data = await Vault.exportAll();
      if (!data) break;
      const filename = `sibo-journal-files-${todayStr()}.json`;
      if (Store.downloads) { try { await Store.downloads.save({ filename, data }); } catch (err) { if (!err || err.code !== "declined") toast("Couldn't save the backup here"); } }
      else if (!IN_VIEWER) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "application/json" })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
      else toast("Saving files isn't available here");
      break;
    }
    case "vaultDeleteAsk": openSheet({ k: "vaultDelete" }); break;
    case "vaultDelete": await Vault.destroy(); closeSheet(); await refreshVault(); render(); toast("Vault deleted"); break;
  }
});

document.addEventListener("change", async e => {
  const t = e.target;
  if (t.dataset.act === "resType") { captureForm(); renderSheet(); return; }
  if (t.dataset.act === "pickResult") {
    const file = t.files && t.files[0]; t.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type) && file.type !== "application/pdf") { toast("Choose a photo or a PDF"); return; }
    if (file.size > MAX_FILE) { toast("That file is over 15 MB"); return; }
    openResultSheet({ id: newId(), type: /breath|lactulose|glucose|trio/i.test(file.name) ? "breath" : "blood", date: todayStr(), label: file.name.replace(/\.[^.]+$/, "").slice(0, 80), values: {}, notes: "" }, file, true);
  }
  if (t.dataset.act === "vaultImportPick") {
    const file = t.files && t.files[0]; t.value = "";
    if (file) openSheet({ k: "vaultImport", text: await file.text() });
  }
});

document.addEventListener("submit", async e => {
  const f = e.target, a = f.dataset.act;
  if (a !== "vaultSetup" && a !== "vaultUnlock") return;
  e.preventDefault();
  const fd = new FormData(f), btn = f.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    if (a === "vaultSetup") {
      const p1 = String(fd.get("p1") || ""), p2 = String(fd.get("p2") || "");
      if (p1.length < 8) { toast("Use at least 8 characters"); return; }
      if (p1 !== p2) { toast("The two passphrases don't match"); return; }
      await Vault.setup(p1); toast("Vault created and unlocked");
    } else {
      await Vault.unlock(String(fd.get("p") || ""));
    }
  } catch (err) {
    toast(err && err.code === "wrong" ? "That passphrase isn't right" : "Couldn't open the vault on this device");
  } finally { btn.disabled = false; f.reset(); }
});
