/* SIBO Root Journal — "Tell me about your day" and the "Still missing" card.
   Speech becomes text through the phone's own keyboard dictation; parser.js turns the
   text into proposals on this device; the person reviews them; only confirmed entries
   are saved. The transcript lives in memory while the sheet is open and is never stored. */

const VOICE_SECTIONS = [
  ["Food & drink", p => p.kind === "item" && p.cat === "food"], ["Supplements", p => p.kind === "item" && p.cat === "supp"],
  ["Medications & therapeutics", p => p.kind === "item" && p.cat === "tx"], ["Practices", p => p.kind === "item" && p.cat === "practice"],
  ["Symptoms", p => p.kind === "overall" || p.kind === "sym"], ["Bowel movements", p => p.kind === "bm" || p.kind === "nobm"],
  ["FoodMarble", p => p.kind === "breath"], ["Sleep, stress & cycle", p => p.kind === "sleep" || p.kind === "stress" || p.kind === "period"],
  ["Meal timing", p => p.kind === "food"],
];
const SLEEP_LABEL = { hours: "Sleep", quality: "Sleep quality", wakes: "Night wakings" };
const FOOD_LABEL = { first: "First bite", last: "Last bite", count: "Meals + snacks" };

function openVoice() {
  openSheet({ k: "voice", step: "input", text: "" });
  if (sttSupported()) { if (sttModelCached()) sttLoad(); return; } // keep the keyboard out of the way of the Talk button
  setTimeout(() => { const ta = $("#voice-text"); if (ta) ta.focus(); }, 320);
}

function proposalRow(p, s) {
  const on = !!s.keep[p.pid], d = getDay(UI.date) || { symptoms: {}, sleep: {}, food: {} };
  const num = (v, min, max, step = 1) => `<input type="number" class="vnum" name="val_${p.pid}" value="${v ?? ""}" min="${min}" max="${max}" step="${step}" inputmode="decimal" aria-label="Value">`;
  let label = "", sub = "", edit = "";
  switch (p.kind) {
    case "item":
      label = esc(p.id ? p.name : p.newName);
      sub = [p.qty && p.qty.text, p.time && fmtTime(p.time)].filter(Boolean).map(esc).join(" · ");
      edit = `${p.cat !== "food" ? `<input class="vdose" name="dose_${p.pid}" value="${esc(p.dose || "")}" placeholder="Dose" aria-label="Dose">` : ""}
        ${!p.id ? `<select name="cat_${p.pid}" aria-label="Category">${[["food", "Food"], ["supp", "Supplement"], ["tx", "Medication"], ["practice", "Practice"]].map(([k, n]) => `<option value="${k}" ${p.cat === k ? "selected" : ""}>${n}</option>`).join("")}</select>` : ""}`;
      break;
    case "sym": label = esc(p.name); edit = num(p.v, 0, 10); if (d.symptoms[p.k] != null && d.symptoms[p.k] !== p.v) sub = `replaces ${d.symptoms[p.k]}`; break;
    case "overall": label = "Overall gut day"; edit = num(p.v, 0, 10); if (d.overall != null && d.overall !== p.v) sub = `replaces ${d.overall}`; break;
    case "stress": label = "Stress"; edit = num(p.v, 0, 10); break;
    case "sleep": label = SLEEP_LABEL[p.f]; edit = num(p.v, 0, p.f === "quality" ? 5 : 16, p.f === "hours" ? 0.5 : 1) + (p.f === "hours" ? `<span class="unit">h</span>` : p.f === "quality" ? `<span class="unit">/5</span>` : ""); break;
    case "period": label = "Period day"; break;
    case "food": label = FOOD_LABEL[p.f]; edit = p.f === "count" ? num(p.v, 0, 15) : `<input type="time" class="vtime" name="val_${p.pid}" value="${esc(p.v)}" aria-label="Time">`; break;
    case "nobm": label = "No BM today"; break;
    case "bm": {
      const b = p.bm;
      label = b.bristol ? `Type ${b.bristol} · ${BRISTOL[b.bristol]}` : "Bowel movement";
      sub = [b.time && fmtTime(b.time), b.size && BM_SIZE[b.size] && BM_SIZE[b.size][0].toLowerCase(), b.urgency && "urgent", b.incomplete && "incomplete", b.straining && "straining", b.mucus && "mucus", b.floating && "floating", b.blood && "blood"].filter(Boolean).join(" · ");
      edit = `<select name="val_${p.pid}" aria-label="Bristol type"><option value="">Type?</option>${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${b.bristol === n ? "selected" : ""}>Type ${n}</option>`).join("")}</select>`;
      break;
    }
    case "breath": {
      const r = p.r;
      label = r.ctx === "fasting" ? "Fasting" : `${r.ch || "After food"}${r.mins != null ? `, ${r.mins} min` : ""}`;
      sub = r.time ? fmtTime(r.time) : "";
      edit = `<span class="readings">${r.h2 != null ? `<span class="rd h2">H₂ ${r.h2}</span>` : ""}${r.ch4 != null ? `<span class="rd ch4">CH₄ ${r.ch4}</span>` : ""}</span>`;
      break;
    }
  }
  if (p.uncertain && p.why) sub = [sub, p.why].filter(Boolean).join(" · ");
  return `<div class="row vrow ${on ? "on" : "off"} ${p.uncertain ? "unsure" : ""}">
    <button type="button" class="vcheck" data-act="voiceToggle" data-pid="${p.pid}" aria-pressed="${on}" aria-label="${on ? "Remove" : "Include"} ${label}">${icon("check")}</button>
    <span class="row-main"><span class="row-label">${label}${p.uncertain ? ` <span class="check-tag">Check</span>` : ""}</span>${sub ? `<span class="row-sub">${esc(sub)}</span>` : ""}</span>
    ${edit ? `<span class="vedit">${edit}</span>` : ""}</div>`;
}

function voiceSheetParts(s) {
  if (s.step === "input") return { title: "Your day", submitLabel: "Read it", body: `
    <p class="sheet-text">Talk through your day: food and drinks, supplements and meds, symptoms and how bad they were, BMs, sleep, stress and FoodMarble numbers. ${sttSupported() ? "Tap <strong>Talk</strong>, or the microphone on your keyboard." : "Tap the microphone on your keyboard to dictate."}</p>
    ${sttSupported() ? `<div id="stt-area">${sttHtml()}</div>` : ""}
    <div class="list"><div class="row"><textarea id="voice-text" name="text" rows="9" placeholder="Slept about 7 hours, woke up once. Eggs and toast with coffee at 8. Took berberine and magnesium. Bloating about a 4. BM around 9, type 4. Fasting methane 6. Stress was a 3.">${esc(s.text)}</textarea></div></div>
    <p class="group-f">Read on this phone. What you say isn't stored; only the entries you confirm are saved to ${UI.date === todayStr() ? "today" : esc(fmtDate(UI.date))}.</p>` };
  const groups = VOICE_SECTIONS.map(([name, test]) => [name, s.proposals.filter(test)]).filter(([, ps]) => ps.length);
  const kept = s.proposals.filter(p => s.keep[p.pid]).length, unsure = s.proposals.filter(p => p.uncertain && s.keep[p.pid]).length;
  let body = `<p class="sheet-text">${s.proposals.length ? `Found ${s.proposals.length} entr${s.proposals.length === 1 ? "y" : "ies"}.${unsure ? ` ${unsure} marked <strong>Check</strong> ${unsure === 1 ? "is a guess" : "are guesses"}; fix or untick ${unsure === 1 ? "it" : "them"}.` : ""}` : "Nothing recognisable yet. Go back and add a little more detail."}</p>`;
  for (const [name, ps] of groups) body += `<h3 class="sheet-h3">${name}</h3><div class="list">${ps.map(p => proposalRow(p, s)).join("")}</div>`;
  if (s.unparsed.length) body += `<h3 class="sheet-h3">Didn't catch these</h3><div class="list">${s.unparsed.map((u, i) => `<div class="row vrow ${s.notes[i] ? "on" : "off"}">
      <button type="button" class="vcheck" data-act="voiceNote" data-i="${i}" aria-pressed="${!!s.notes[i]}" aria-label="Add to notes">${icon("check")}</button>
      <span class="row-main"><span class="row-label">"${esc(u)}"</span><span class="row-sub">${s.notes[i] ? "Will be added to notes" : "Tick to add to notes"}</span></span></div>`).join("")}</div>`;
  body += `<button type="button" class="btn tonal block" data-act="voiceBack">Edit what I said</button>`;
  return { title: "Check your day", submitLabel: kept ? `Save ${kept}` : "Save", body };
}

// Keep edits when the review re-renders (ticks, category changes).
function captureVoice(fd) {
  const s = UI.sheet;
  if (!s || s.k !== "voice" || s.step !== "review") return;
  fd = fd || new FormData($("#sheetform"));
  for (const p of s.proposals) {
    const v = fd.get("val_" + p.pid), dose = fd.get("dose_" + p.pid), cat = fd.get("cat_" + p.pid);
    if (dose != null) p.dose = String(dose);
    if (cat) p.cat = cat;
    if (v == null) continue;
    if (p.kind === "bm") { p.bm.bristol = v ? Number(v) : null; if (v) p.uncertain = false; }
    else if (p.kind === "food" && p.f !== "count") p.v = String(v);
    else if (v !== "" && !isNaN(Number(v))) p.v = Number(v);
  }
}

function submitVoiceSheet(fd) {
  const s = UI.sheet;
  if (s.step === "input") {
    s.text = String(fd.get("text") || "");
    if (!s.text.trim()) { toast("Say or type a little about your day first"); return; }
    const res = parseDay(s.text, { library: S.profile.library, symptoms: S.profile.symptoms });
    s.proposals = res.proposals; s.unparsed = res.unparsed; s.notes = {};
    s.keep = Object.fromEntries(res.proposals.map(p => [p.pid, true]));
    s.step = "review"; renderSheet();
    const body = $(".sheet-body"); if (body) body.scrollTop = 0;
    return;
  }
  captureVoice(fd);
  const date = UI.date, d = touchDay(date), map = lib();
  let n = 0;
  for (const p of s.proposals) {
    if (!s.keep[p.pid]) continue;
    n++;
    switch (p.kind) {
      case "item": {
        const it = p.id ? map[p.id] : addLibraryItem(p.newName, p.cat);
        if (!it) break;
        if (p.dose) it.dose = p.dose;
        const ex = d.items.find(x => x.id === it.id && !x.mid), qu = it.cat === "food" ? resolveQty(it, p.qty) : {};
        // a food with a time goes into the meal at that time
        const ml = it.cat === "food" && p.time ? mealFor(d, mealAt(hrs(p.time)), p.time) : null;
        if (ml && !d.items.some(x => x.id === it.id && x.mid === ml.id)) { if (ex) d.items.splice(d.items.indexOf(ex), 1); d.items.push({ ...newFoodEntry(it, date, { ...qu, meal: ml.type }), mid: ml.id }); }
        else if (ml) break;
        else if (ex) { if (p.dose) ex.dose = p.dose; if (p.time) ex.time = p.time; Object.assign(ex, qu); }
        else if (it.cat === "food") d.items.push(newFoodEntry(it, date, { time: p.time || "", ...qu }));
        else d.items.push({ id: it.id, dose: p.dose || it.dose || "", time: p.time || "" });
        break;
      }
      case "sym": d.symptoms[p.k] = p.v; break;
      case "overall": d.overall = p.v; break;
      case "stress": d.stress = p.v; break;
      case "sleep": d.sleep[p.f] = p.v; break;
      case "period": d.period = true; break;
      case "food": d.food[p.f] = p.v; break;
      case "nobm": if (!d.bms.length) d.noBM = true; break;
      case "bm": d.bms.push({ id: newId(), ...p.bm }); d.noBM = false; break;
      case "breath": d.breath.push({ id: newId(), ...p.r }); break;
    }
  }
  const notes = s.unparsed.filter((u, i) => s.notes[i]);
  if (notes.length) { d.notes = [d.notes, ...notes.map(x => x.charAt(0).toUpperCase() + x.slice(1))].filter(Boolean).join("\n"); n += notes.length; }
  syncMealTiming(d);
  d.bms.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  d.breath.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  s.text = ""; s.proposals = []; s.unparsed = [];
  Store.saveProfile(); haptic(); commitDay(date); closeSheet();
  UI.tab = "today"; UI.stack = []; render(); window.scrollTo(0, 0);
  toast(n ? `Added ${n} entr${n === 1 ? "y" : "ies"} to your journal` : "Nothing was added");
}

// ---------- Still missing ----------
function missingFor(date) {
  const d = S.days[date];
  if (!d) return [];
  const skip = new Set(d.skip || []), map = lib(), out = [], have = new Set(d.items.map(i => i.id));
  for (const p of activeProtocols(date)) for (const id of p.itemIds) {
    if (map[id] && !have.has(id)) out.push({ key: "item:" + id, label: esc(map[id].name), sub: `${esc(p.name)} checklist`, buttons: [["Check", "toggle", `data-id="${id}"`]] });
  }
  // what you usually log, from the 14 days before this one
  const prior = []; for (let i = 1; i <= 14; i++) { const x = S.days[addDays(date, -i)]; if (x) prior.push(x); }
  if (prior.length >= 4) {
    const cnt = {};
    prior.forEach(x => x.items.forEach(it => { cnt[it.id] = (cnt[it.id] || 0) + 1; }));
    Object.entries(cnt).filter(([id, c]) => c / prior.length >= 0.6 && map[id] && !map[id].hidden && !have.has(id) && !out.some(o => o.key === "item:" + id))
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .forEach(([id, c]) => out.push({ key: "item:" + id, label: esc(map[id].name), sub: `Logged ${c} of the last ${prior.length} days`, buttons: [["Check", "toggle", `data-id="${id}"`]] }));
  }
  if (d.overall == null) out.push({ key: "overall", label: "Overall gut day", sub: "Tap a face at the top", buttons: [["Rate", "jump", `data-to="moods"`]] });
  if (!d.bms.length && !d.noBM) out.push({ key: "bm", label: "Bowel movements", sub: "Nothing logged yet", buttons: [["Add", "addBM", ""], ["None", "missNoBM", ""]] });
  if (!d.items.some(it => map[it.id] && map[it.id].cat === "food")) out.push({ key: "food", label: "Food & drink", sub: "No food logged", buttons: [["Add", "jump", `data-to="sec-food"`]] });
  if (d.sleep.hours == null) out.push({ key: "sleep", label: "Sleep", sub: "Hours not logged", buttons: [["Add", "jump", `data-to="sec-sleep"`]] });
  if (d.stress == null) out.push({ key: "stress", label: "Stress", sub: "Not rated", buttons: [["Rate", "jump", `data-to="sec-sleep"`]] });
  if (prior.length >= 4) {
    const usual = S.profile.symptoms.filter(sy => prior.filter(x => x.symptoms[sy.k] != null).length / prior.length >= 0.6 && d.symptoms[sy.k] == null);
    if (usual.length) out.push({ key: "syms", label: "Symptoms you usually rate", sub: esc(usual.map(x => x.name).slice(0, 4).join(", ") + (usual.length > 4 ? "…" : "")), buttons: [["Rate", "jump", `data-to="sec-symptoms"`]] });
    if (prior.filter(x => x.breath.length).length / prior.length >= 0.5 && !d.breath.length) out.push({ key: "breath", label: "FoodMarble reading", sub: "You usually log one", buttons: [["Add", "addBreath", ""]] });
  }
  return out.filter(o => !skip.has(o.key));
}
function missingCard(date) {
  const list = missingFor(date);
  if (!list.length) return "";
  return group(`Still missing <span class="gh-meta">${list.length}</span>`, list.map(m => `<div class="row miss-row"><span class="row-main"><span class="row-label">${m.label}</span><span class="row-sub">${m.sub}</span></span>
      <span class="miss-btns">${m.buttons.map(([l, act, attrs]) => `<button type="button" class="btn small" data-act="${act}" ${attrs}>${l}</button>`).join("")}
      <button type="button" class="iconbtn sm" data-act="missSkip" data-key="${m.key}" aria-label="Skip ${m.label} today">${icon("close")}</button></span></div>`).join(""),
    `<button type="button" class="textbtn strong" data-act="missSkipAll">Skip all for ${date === todayStr() ? "today" : "this day"}</button>`, "missing-group", 40, "missing");
}

// ---------- events ----------
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t || t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
  const s = UI.sheet;
  switch (t.dataset.act) {
    case "voiceOpen": openVoice(); break;
    case "voiceToggle": captureVoice(); s.keep[t.dataset.pid] = !s.keep[t.dataset.pid]; haptic(); { const top = $(".sheet-body").scrollTop; renderSheet(); $(".sheet-body").scrollTop = top; } break;
    case "voiceNote": captureVoice(); s.notes[t.dataset.i] = !s.notes[t.dataset.i]; { const top = $(".sheet-body").scrollTop; renderSheet(); $(".sheet-body").scrollTop = top; } break;
    case "voiceBack": captureVoice(); s.step = "input"; renderSheet(); break;
    case "jump": { const el = document.getElementById(t.dataset.to); if (el) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); break; }
    case "missNoBM": { const d = touchDay(UI.date); d.noBM = true; haptic(); commitDay(UI.date, true); break; }
    case "missSkip": { const d = touchDay(UI.date); d.skip = [...new Set([...(d.skip || []), t.dataset.key])]; commitDay(UI.date, true); break; }
    case "missSkipAll": { const d = touchDay(UI.date); d.skip = [...new Set([...(d.skip || []), ...missingFor(UI.date).map(m => m.key)])]; commitDay(UI.date, true); break; }
  }
});


// ---------- on-device speech to text (Moonshine, in stt-worker.js) ----------
// Only in the installed app: claude.ai doesn't give pages the microphone.
const STT = { worker: null, state: "idle", ready: false, loaded: 0, total: 0, startedAt: 0, rec: null, stream: null, parts: [], ctx: null, timer: null, wake: null, msg: "", job: 0, chunk: "" };
const STT_FLAG = "root-journal-voice-model";
const MAX_REC_S = 300;
function sttSupported() { return !IN_VIEWER && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && window.Worker && window.WebAssembly && window.OfflineAudioContext); }
function sttModelCached() { try { return localStorage.getItem(STT_FLAG) === "1"; } catch (e) { return false; } }
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function sttHtml() {
  const st = STT.state, pct = STT.total ? Math.round(STT.loaded / STT.total * 100) : 0;
  if (st === "loading") return `<div class="stt stt-load"><span class="row-label">${STT.total && pct < 100 ? `Downloading voice model · ${pct}%` : "Loading voice model…"}</span><span class="bar"><i style="width:${STT.total ? pct : 8}%"></i></span>
    <span class="row-sub">${STT.total ? `${(STT.loaded / 1e6).toFixed(0)} of ${(STT.total / 1e6).toFixed(0)} MB. ` : ""}Keep the app open. This happens once.</span></div>`;
  if (st === "recording") return `<div class="stt"><button type="button" class="talk rec" data-act="sttStop" aria-label="Stop recording"><span class="dot"></span>Stop</button>
    <span class="row-main"><span class="row-label" id="stt-time">${mmss((Date.now() - STT.startedAt) / 1000)}</span><span class="row-sub">Listening. Tap Stop when you're done.</span></span></div>`;
  if (st === "transcribing") return `<div class="stt"><span class="spinner"></span><span class="row-main"><span class="row-label">Turning speech into text…</span><span class="row-sub">${esc(STT.chunk || "On this phone")}</span></span></div>`;
  if (!STT.ready && !sttModelCached()) return `<div class="stt stt-first"><span class="row-main"><span class="row-label">Talk instead of typing</span>
    <span class="row-sub">Downloads a 63 MB speech model once (Wi-Fi is best). After that it works offline, and your voice never leaves this phone.</span></span>
    <button type="button" class="btn filled small" data-act="sttDownload">Download</button></div>${STT.msg ? `<p class="group-f">${esc(STT.msg)}</p>` : ""}`;
  return `<div class="stt"><button type="button" class="talk" data-act="sttStart">${icon("mic")}Talk</button>
    <span class="row-main"><span class="row-sub">${esc(STT.msg || "Speak for as long as you like, up to 5 minutes. Text appears below to check before reading it.")}</span></span></div>`;
}
function sttPaint() { const el = $("#stt-area"); if (el) el.innerHTML = sttHtml(); }

function sttWorker() {
  if (STT.worker) return STT.worker;
  STT.worker = new Worker("stt-worker.js", { type: "module" });
  STT.worker.onmessage = ({ data }) => {
    if (data.type === "progress") { STT.loaded = data.loaded; STT.total = data.total; if (STT.state === "loading") sttPaint(); }
    else if (data.type === "ready") { STT.ready = true; try { localStorage.setItem(STT_FLAG, "1"); } catch (e) { /* convenience only */ } if (STT.state === "loading") { STT.state = "idle"; STT.msg = ""; sttPaint(); } }
    else if (data.type === "partial") { if (data.n > 1) { STT.chunk = `Part ${data.i} of ${data.n}`; sttPaint(); } }
    else if (data.type === "result") { if (data.id === STT.job) sttInsert(data.text); }
    else if (data.type === "error") {
      STT.state = "idle"; STT.ready = false;
      STT.msg = /fetch|network|load/i.test(data.message) ? "Couldn't download the voice model. Check your connection and try again." : "Something went wrong turning speech into text. Try again, or use the keyboard microphone.";
      sttPaint();
    }
  };
  STT.worker.onerror = () => { STT.state = "idle"; STT.msg = "The voice model couldn't start on this phone. The keyboard microphone still works."; STT.worker = null; sttPaint(); };
  return STT.worker;
}
function sttLoad() { if (STT.ready || STT.state === "loading") return; STT.state = "loading"; STT.loaded = STT.total = 0; sttPaint(); sttWorker().postMessage({ type: "load" }); }

async function sttStart() {
  if (!STT.ready) { sttLoad(); return; }
  try {
    STT.ctx = STT.ctx || new (window.AudioContext || window.webkitAudioContext)(); // created on the tap, as iOS requires
    STT.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    STT.msg = e && e.name === "NotAllowedError" ? "Microphone access is off. Allow it in Settings → Safari → Microphone (or for this app), then try again." : "Couldn't start the microphone.";
    sttPaint(); return;
  }
  STT.parts = [];
  STT.rec = new MediaRecorder(STT.stream);
  STT.rec.ondataavailable = e => { if (e.data && e.data.size) STT.parts.push(e.data); };
  STT.rec.onstop = sttFinish;
  STT.rec.start(1000);
  STT.state = "recording"; STT.startedAt = Date.now(); STT.msg = "";
  try { STT.wake = await navigator.wakeLock.request("screen"); } catch (e) { STT.wake = null; }
  haptic(); sttPaint();
  clearInterval(STT.timer);
  STT.timer = setInterval(() => {
    const s = (Date.now() - STT.startedAt) / 1000, el = $("#stt-time");
    if (el) el.textContent = mmss(s);
    if (s >= MAX_REC_S) sttStop();
  }, 500);
}
function sttStop() {
  clearInterval(STT.timer);
  if (STT.rec && STT.rec.state !== "inactive") STT.rec.stop();
  if (STT.stream) STT.stream.getTracks().forEach(t => t.stop());
  if (STT.wake) { STT.wake.release().catch(() => {}); STT.wake = null; }
  haptic();
}
async function sttFinish() {
  STT.state = "transcribing"; STT.chunk = ""; sttPaint();
  try {
    const blob = new Blob(STT.parts, { type: STT.rec.mimeType || "audio/mp4" });
    STT.parts = [];
    const decoded = await STT.ctx.decodeAudioData(await blob.arrayBuffer());
    // resample to 16 kHz mono, the rate the model expects
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const audio = (await off.startRendering()).getChannelData(0);
    if (audio.length < 16000 * 0.5) { STT.state = "idle"; STT.msg = "That was too short to hear. Try again."; sttPaint(); return; }
    STT.job++;
    sttWorker().postMessage({ type: "transcribe", id: STT.job, audio }, [audio.buffer]);
  } catch (e) {
    STT.state = "idle"; STT.msg = "Couldn't read that recording. Try again, or use the keyboard microphone."; sttPaint();
  }
}
function sttInsert(text) {
  STT.state = "idle";
  const ta = $("#voice-text"), s = UI.sheet;
  if (!text) { STT.msg = "Didn't catch any words. Try again a little closer to the phone."; sttPaint(); return; }
  STT.msg = "Added below. Talk again to add more, or tap Read it.";
  if (ta) { ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + text; if (s && s.k === "voice") s.text = ta.value; ta.scrollTop = ta.scrollHeight; }
  haptic(); sttPaint();
}
// Closing the sheet mid-recording stops the microphone and throws the audio away.
function sttCancel() { if (STT.state === "recording") { STT.rec.onstop = null; sttStop(); STT.parts = []; STT.state = "idle"; } }

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  if (t.dataset.act === "sttDownload") sttLoad();
  else if (t.dataset.act === "sttStart") sttStart();
  else if (t.dataset.act === "sttStop") sttStop();
  else if (t.dataset.act === "closeSheet") sttCancel();
});
window.addEventListener("popstate", sttCancel);
