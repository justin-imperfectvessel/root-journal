/* SIBO Root Journal — UI: app shell, navigation stack, screens, bottom sheets, events.
   Builds on core.js (state S, UI, Store, analysis engine). */

// ---------- primitives ----------
const ICON = {
  today: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="m9 15 2 2 4-4"/>',
  trends: '<path d="M4 4v16h16"/><path d="m7.5 14.5 3.5-4 3 2.5 5-6"/>',
  protocols: '<path d="M9.5 3h5M10.5 3v6.2L5.3 18a2 2 0 0 0 1.7 3h10a2 2 0 0 0 1.7-3l-5.2-8.8V3"/><path d="M7.6 15h8.8"/>',
  insights: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.9" fill="currentColor"/>',
  more: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  chevR: '<path d="m9.5 6 6 6-6 6"/>', chevL: '<path d="m15 5.5-6.5 6.5 6.5 6.5"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  check: '<path d="m5.5 12.5 4.2 4.2L18.5 7.5"/>', ellipsis: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  spark: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.5l-1.8-5.8-5.7-1.9L10.2 9z"/>',
};
const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const gasLabel = g => (g === "H2" ? "H₂" : g === "CH4" ? "CH₄" : "H₂S");
const gasTags = gs => gs.map(g => `<span class="gas ${g.toLowerCase()}">${gasLabel(g)}</span>`).join("");
const haptic = () => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.isActive)) navigator.vibrate(8); } catch (e) { /* unsupported */ } };

function group(title, inner, foot, cls = "", hue, id) {
  return `<section class="group ${cls}"${id ? ` id="${id}"` : ""}${hue != null ? ` style="--h:${hue}"` : ""}>${title ? `<h2 class="group-h">${title}</h2>` : ""}<div class="list">${inner}</div>${foot ? `<p class="group-f">${foot}</p>` : ""}</section>`;
}
function navRow({ label, sub = "", value = "", act, attrs = "", cls = "", lead = "" }) {
  return `<button type="button" class="row nav ${cls}" data-act="${act}" ${attrs}>${lead}<span class="row-main"><span class="row-label">${label}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span>${value ? `<span class="row-value">${value}</span>` : ""}${icon("chevR", "chev")}</button>`;
}
function actionRow(label, act, attrs = "", cls = "") {
  return `<button type="button" class="row action ${cls}" data-act="${act}" ${attrs}>${icon("plus", "lead")}<span class="row-label">${label}</span></button>`;
}
function switchRow(label, id, act, on, sub = "") {
  return `<label class="row" for="${id}"><span class="row-main"><span class="row-label">${label}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</span><input type="checkbox" role="switch" class="switch" id="${id}" data-act="${act}" ${on ? "checked" : ""}></label>`;
}
function seg(name, opts, cur, act, extra = "") {
  return `<span class="seg" role="group" aria-label="${esc(name)}">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" ${extra} aria-pressed="${String(cur) === String(v)}">${l}</button>`).join("")}</span>`;
}
function largeTitle(t, sub = "") {
  return `<div class="large-title" id="large-title"><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ""}</div>`;
}

// Line-drawn mood faces, as in a paper mood chart. value = the overall score a tap records.
const FACES = [
  { k: "great", name: "Great", value: 1, test: v => v <= 2, eyes: '<path d="M11 10q3-4 6 0M23 10q3-4 6 0"/>', mouth: '<path d="M11 15q9 9 18 0"/>' },
  { k: "good", name: "Good", value: 3, test: v => v >= 3 && v <= 4, eyes: '<circle cx="14" cy="9" r="1.6"/><circle cx="26" cy="9" r="1.6"/>', mouth: '<path d="M13 16q7 5 14 0"/>' },
  { k: "okay", name: "Okay", value: 5, test: v => v === 5, eyes: '<circle cx="14" cy="9" r="1.6"/><circle cx="26" cy="9" r="1.6"/>', mouth: '<path d="M13 17h14"/>' },
  { k: "rough", name: "Rough", value: 7, test: v => v >= 6 && v <= 7, eyes: '<circle cx="14" cy="9" r="1.6"/><circle cx="26" cy="9" r="1.6"/>', mouth: '<path d="M13 19q7-5 14 0"/>' },
  { k: "awful", name: "Awful", value: 9, test: v => v >= 8, eyes: '<path d="M10 6l6 3M30 6l-6 3"/><circle cx="14" cy="11" r="1.6"/><circle cx="26" cy="11" r="1.6"/>', mouth: '<path d="M12 20q8-6 16 0"/>' },
];
const faceSvg = f => `<svg class="face" viewBox="0 0 40 24" aria-hidden="true">${f.eyes}${f.mouth}</svg>`;
// A sprout above soil with roots below: the app's mark, drawn as a line illustration.
const SPROUT = `<svg class="illus" viewBox="0 0 200 160" aria-hidden="true"><path class="fill" d="M100 70c-4-28-26-46-56-48 2 30 24 48 56 48z"/><path class="fill2" d="M100 56c6-26 28-40 54-40-3 27-24 40-54 40z"/>
  <path d="M100 52v44M30 96h140M100 96v42M100 108c-8 22-30 26-40 44M100 114c8 18 28 24 36 38M78 130c-6 6-14 8-20 8M126 136c6 4 12 5 18 4"/><path d="M44 22c22 10 40 26 56 48M154 16c-20 10-38 22-54 40" class="thin"/></svg>`;

// ---------- navigation ----------
const TABS = [["today", "Today"], ["trends", "Trends"], ["protocols", "Protocols"], ["insights", "Insights"], ["more", "More"]];
let histOK = true;
function pushHist() { try { history.pushState({ app: 1 }, ""); } catch (e) { histOK = false; } }
function pushPage(p) { UI.stack.push(p); pushHist(); render(); window.scrollTo(0, 0); }
function goBack() {
  if (histOK) { try { history.back(); return; } catch (e) { histOK = false; } }
  onBack();
}
function onBack() {
  if (UI.sheet) { UI.sheet = null; renderSheet(); return; }
  if (UI.stack.length) { UI.stack.pop(); render(); }
}
window.addEventListener("popstate", onBack);
function openSheet(s) { UI.sheet = s; pushHist(); renderSheet(); }
function closeSheet() { if (UI.sheet) goBack(); }
const page = () => UI.stack[UI.stack.length - 1] || null;

function backLabel(p) { const l = p.from || pageTitle(null); return l.length > 9 ? "Back" : l; }
function pageTitle(p) {
  if (!p) return (TABS.find(t => t[0] === UI.tab) || [])[1] || "";
  if (p.k === "driver") { const d = DRIVERS.find(x => x.id === p.id); return d ? d.name : ""; }
  if (p.k === "tx") return PROTOCOLS[p.i] ? PROTOCOLS[p.i].name : "";
  if (p.k === "insight") return "Insight";
  if (p.k === "nutrition") return "Nutrition";
  return { history: "History & labs", research: "Research library", data: "Data & backup", reminder: "Daily reminder", nosignal: "No signal yet", color: "Color", results: "Test results", layout: "Layout check" }[p.k] || "";
}

// ---------- render ----------
function applyColor() {
  const w = UI.loading ? 0 : colorLevel();
  document.documentElement.style.setProperty("--w", w.toFixed(3));
  document.documentElement.classList.toggle("mono", w < 0.12);
  return w;
}
function render() {
  applyColor();
  const tb = $("#tabbar"), due = !UI.loading && reminderDue();
  tb.innerHTML = TABS.map(([k, n]) => `<button type="button" class="tabbtn" role="tab" aria-selected="${UI.tab === k}" data-act="tab" data-tab="${k}">
    <span class="tabicon">${icon(k)}${k === "today" && due ? `<span class="badge" aria-label="Not logged yet"></span>` : ""}</span><span class="tablabel">${n}</span></button>`).join("");
  const p = page();
  const right = !p && UI.tab === "today" ? `<label class="navbtn datebtn" aria-label="Pick a date">${icon("cal")}<input type="date" id="datepick" data-act="pickdate" value="${UI.date}" max="${todayStr()}"></label>`
    : !p && UI.tab === "protocols" ? `<button type="button" class="navbtn" data-act="newProto" aria-label="New protocol">${icon("plus")}</button>` : "";
  $("#navbar").innerHTML = `<div class="nav-side">${p ? `<button type="button" class="backbtn" data-act="back">${icon("chevL")}<span>${esc(backLabel(p))}</span></button>` : ""}</div>
    <div class="nav-title">${esc(pageTitle(p))}</div><div class="nav-side right">${right}</div>`;
  $("#navbar").classList.toggle("sub", !!p);
  const v = $("#view");
  if (UI.loading) { v.innerHTML = `<div class="loading"><span class="spinner"></span></div>`; return; }
  let html;
  if (p) html = ({ history: viewHistory, research: viewResearch, data: viewData, reminder: viewReminder, color: viewColor, results: viewResults, layout: viewLayout, driver: viewDriver, tx: viewTx, nosignal: viewNoSignal, insight: viewInsight, nutrition: viewNutrition })[p.k](p);
  else html = ({ today: viewToday, trends: viewTrends, protocols: viewProtocols, insights: viewInsights, more: viewMore })[UI.tab]();
  v.innerHTML = (Store.mode === "demo" && !p ? `<div class="demo-pill"><span>Sample data · nothing is saved</span><button type="button" class="textbtn" data-act="exitDemo">Exit</button></div>` : "") + html;
  if (UI.tab === "insights" && !p && UI.aiText) paintAI();
  onScroll();
  if (typeof queueLayoutCheck === "function") queueLayoutCheck();
}
function refreshStreak() {
  const tb = $("#tabbar .tabbtn .tabicon"); // first tab
  const due = reminderDue();
  if (tb) { const b = tb.querySelector(".badge"); if (due && !b) tb.insertAdjacentHTML("beforeend", `<span class="badge" aria-label="Not logged yet"></span>`); if (!due && b) b.remove(); }
  const el = $("#streak");
  if (el) el.outerHTML = streakRow();
  const ws = $("#weekstrip");
  if (ws) ws.outerHTML = weekStrip();
}

let scrollQueued = false;
function onScroll() {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    const lt = $("#large-title"), nb = $("#navbar");
    const past = lt ? lt.getBoundingClientRect().bottom < nb.getBoundingClientRect().bottom + 4 : true;
    nb.classList.toggle("compact", past);
    nb.classList.toggle("hairline", window.scrollY > 2);
  });
}
window.addEventListener("scroll", onScroll, { passive: true });

// ---------- Today ----------
function weekStrip() {
  const sel = parseD(UI.date), dow = (sel.getDay() + 6) % 7;
  const monday = addDays(UI.date, -dow), t = todayStr();
  let h = `<div class="weekstrip" id="weekstrip"><button type="button" class="wk-arrow" data-act="week" data-n="-7" aria-label="Previous week">${icon("chevL")}</button><div class="wk-days">`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i), future = d > t;
    h += `<button type="button" class="wk-day ${d === UI.date ? "sel" : ""} ${d === t ? "today" : ""}" data-act="pickday" data-d="${d}" ${future ? "disabled" : ""} aria-label="${esc(fmtDate(d))}${S.days[d] ? ", logged" : ""}">
      <span class="wk-l">${parseD(d).toLocaleDateString(undefined, { weekday: "narrow" })}</span><span class="wk-n">${parseD(d).getDate()}</span><span class="wk-dot ${S.days[d] ? "on" : ""}"></span></button>`;
  }
  return h + `</div><button type="button" class="wk-arrow" data-act="week" data-n="7" aria-label="Next week" ${addDays(monday, 7) > t ? "disabled" : ""}>${icon("chevR")}</button></div>`;
}
function streakRow() {
  const s = streakInfo(), r = reminder(), due = reminderDue();
  const status = s.loggedToday ? "Today is logged" : due ? `Past ${fmtTime(r.time)} and not logged yet` : s.cur ? "Log anything today to keep it going" : "Log anything today to start one";
  return `<button type="button" class="streak ${due ? "due" : ""} ${s.loggedToday ? "done" : ""}" id="streak" data-act="goReminder">
    <span class="streak-n">${s.cur}</span><span class="row-main"><span class="row-label">${s.cur === 1 ? "day" : "days"} in a row</span><span class="row-sub">${esc(status)}</span></span>
    <span class="row-value">Best ${s.best}<br>${s.month}/30</span></button>`;
}
function colorRow() {
  const w = colorLevel(), st = colorStage(w), r = recentAverage(), mode = S.profile.settings.color || "auto";
  const sub = mode === "mono" ? "Always black and white (change in More)" : mode === "full" ? "Always full color (change in More)"
    : r ? `7-day average ${r1(r.avg)}. Color comes back as it drops.` : "Log 3 days this week to start tracking.";
  return `<button type="button" class="streak colorrow" data-act="push" data-k="color"><span class="swatches" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<i class="${i < st ? "on" : ""}" style="--h:${[150, 230, 300, 40, 90][i]}"></i>`).join("")}</span>
    <span class="row-main"><span class="row-label">${COLOR_STAGES[st]}</span><span class="row-sub">${esc(sub)}</span></span>${icon("chevR", "chev")}</button>`;
}
function activeProtocols(date) { return S.profile.protocols.filter(p => p.start && p.start <= date && (!p.end || p.end >= date)); }
function usageCounts() { const c = {}; for (const d of Object.values(S.days)) for (const it of d.items) c[it.id] = (c[it.id] || 0) + 1; return c; }
function chip(i, on) {
  return `<button type="button" class="chip ${on ? "on" : ""}" aria-pressed="${on}" data-act="toggle" data-id="${i.id}">${on ? icon("check", "chk") : ""}${esc(i.name)}</button>`;
}

function viewToday() {
  const date = UI.date, t = todayStr();
  const d = getDay(date) || { items: [], symptoms: {}, bms: [], breath: [], sleep: {}, food: {} };
  const map = lib(), checked = new Set(d.items.map(i => i.id)), uses = usageCounts();
  const prev = getDay(addDays(date, -1));
  const isToday = date === t;
  const empty = !S.profile.library.length && !Object.keys(S.days).length && Store.mode !== "demo";
  let h = largeTitle(isToday ? "Today" : esc(parseD(date).toLocaleDateString(undefined, { weekday: "long" })), esc(fmtDate(date, { month: "long", day: "numeric", year: date.slice(0, 4) === t.slice(0, 4) ? undefined : "numeric" })));
  h += weekStrip();
  h += `<button type="button" class="btn filled block voice-btn" data-act="voiceOpen">${icon("mic")}Tell me about your day</button>`;
  h += `<section class="moods" id="moods" aria-label="How is your gut today?"><h2 class="moods-h">How's your gut ${isToday ? "today" : "this day"}?</h2><div class="moods-row">${FACES.map(f => {
    const on = d.overall != null && f.test(d.overall);
    return `<button type="button" class="mood ${on ? "on" : ""}" data-act="face" data-v="${f.value}" aria-pressed="${on}" style="--h:${[150, 110, 85, 40, 10][FACES.indexOf(f)]}">${faceSvg(f)}<span>${f.name}</span></button>`;
  }).join("")}</div></section>`;
  if (empty) {
    h += `<section class="intro">${SPROUT}<h2>Start your journal</h2><p>Add what you eat, take and do. Each item becomes a tap-to-check button, so tomorrow you only tick what you repeated.</p>
      <p>Answer your health history once in More, and Insights starts ranking the drivers that fit you.</p>
      <button type="button" class="btn tonal" data-act="demo">Explore with sample data</button></section>`;
  } else h += `<div class="group streak-group">${streakRow()}${colorRow()}</div>`;
  h += missingCard(date);

  if (prev && prev.items.length) h += `<button type="button" class="btn tonal block" data-act="copyPrev">Repeat yesterday's items</button>`;

  // protocols
  for (const p of activeProtocols(date)) {
    const items = p.itemIds.map(id => map[id]).filter(Boolean);
    const dayN = Math.round((parseD(date) - parseD(p.start)) / 864e5) + 1, len = p.end ? Math.round((parseD(p.end) - parseD(p.start)) / 864e5) + 1 : null;
    const done = items.filter(i => checked.has(i.id)).length;
    const rows = items.map(i => `<button type="button" class="row checkrow ${checked.has(i.id) ? "on" : ""}" data-act="toggle" data-id="${i.id}" aria-pressed="${checked.has(i.id)}">
      <span class="row-main"><span class="row-label">${esc(i.name)}</span>${i.dose ? `<span class="row-sub">${esc(i.dose)}</span>` : ""}</span><span class="circle">${icon("check")}</span></button>`).join("");
    h += group(`${esc(p.name)} <span class="gh-meta">Day ${dayN}${len ? ` of ${len}` : ""} · ${done}/${items.length}</span>`,
      (rows || `<div class="row"><span class="row-sub">No items attached yet.</span></div>`) + (items.length && done < items.length ? `<button type="button" class="row action" data-act="checkAll" data-p="${p.id}">${icon("check", "lead")}<span class="row-label">Check all</span></button>` : ""), "", "proto-group", 300);
  }

  // item categories
  for (const c of CATS) {
    const items = S.profile.library.filter(i => i.cat === c.k && !i.hidden).sort((a, b) => (uses[b.id] || 0) - (uses[a.id] || 0) || a.name.localeCompare(b.name));
    const on = d.items.filter(it => map[it.id] && map[it.id].cat === c.k);
    let inner = "";
    if (c.k === "food") {
      inner += foodSummaryHtml(d);
      inner += `<div class="row fields3">
        <label><span>First bite</span><input type="time" id="food-first" data-act="food" data-f="first" value="${esc(d.food.first || "")}"></label>
        <label><span>Last bite</span><input type="time" id="food-last" data-act="food" data-f="last" value="${esc(d.food.last || "")}"></label>
        <label><span>Meals + snacks</span><input type="number" min="0" max="15" inputmode="numeric" id="food-count" data-act="food" data-f="count" value="${esc(d.food.count ?? "")}" placeholder="0"></label></div>`;
    }
    if (items.length) inner += `<div class="row chips-row"><div class="chips">${items.map(i => chip(i, checked.has(i.id))).join("")}</div></div>`;
    if (c.k === "food") inner += foodLogHtml(d);
    if (on.length && c.k !== "food") inner += on.map(it => `<div class="row dose-row"><span class="row-label">${esc(map[it.id].name)}</span>
      <input id="dose-${it.id}" data-act="dose" data-id="${it.id}" value="${esc(it.dose || "")}" placeholder="Dose" aria-label="Dose for ${esc(map[it.id].name)}">
      <input id="time-${it.id}" type="time" data-act="itime" data-id="${it.id}" value="${esc(it.time || "")}" aria-label="Time taken"></div>`).join("");
    if (c.k === "food") inner += actionRow("Add food", "foodAdd");
    else inner += `<form class="row add-row" data-act="addItem" data-cat="${c.k}"><input id="add-${c.k}" name="name" placeholder="${c.ph}" autocomplete="off" enterkeyhint="done"><button class="textbtn strong" type="submit">Add</button></form>`;
    h += group(`${c.name}${on.length ? ` <span class="gh-meta">${on.length}</span>` : ""}`, inner, c.k === "food" && !items.length ? "Search 5,000+ foods with USDA nutrition, or add your own. Each food remembers your usual portion." : "", "", { food: 145, supp: 265, tx: 220, practice: 75 }[c.k], "sec-" + c.k);
  }

  // symptoms
  const sc = dayScore(d);
  const symRow = (id, label, v, act, k = "") => `<div class="row sym-row"><label for="${id}" class="row-label">${label}</label><output id="${id}-val" class="sym-val ${v == null ? "unset" : ""}">${v ?? "–"}</output>
    <input type="range" min="0" max="10" step="1" id="${id}" data-act="${act}" ${k ? `data-k="${k}"` : ""} value="${v ?? 0}" class="${v == null ? "unset" : ""}" style="--p:${(v ?? 0) * 10}%"></div>`;
  h += group(`Symptoms <span class="gh-meta">0 none · 10 worst</span>`,
    symRow("overall", "<strong>Overall gut day</strong>", d.overall, "overall") + S.profile.symptoms.map(s => symRow("sym-" + s.k, esc(s.name), d.symptoms[s.k], "sym", s.k)).join("") +
    `<form class="row add-row" data-act="addSym"><input id="add-sym" name="name" placeholder="Track another symptom" autocomplete="off" enterkeyhint="done"><button class="textbtn strong" type="submit">Add</button></form>`,
    sc == null ? "Your day score uses your overall rating, or the average of your 3 worst symptoms." : `Day score ${r1(sc)}. It uses your overall rating, or the average of your 3 worst symptoms.`, "", 25, "sec-symptoms");

  // BMs
  const bmRows = d.bms.map(b => `<button type="button" class="row nav" data-act="editBM" data-id="${b.id}"><span class="bristol-badge b${b.bristol || 0}">${b.bristol || "?"}</span>
    <span class="row-main"><span class="row-label">${b.bristol ? `Type ${b.bristol} · ${BRISTOL[b.bristol]}` : "Type not set"}</span><span class="row-sub">${esc([b.time && fmtTime(b.time), b.urgency && "urgent", b.incomplete && "incomplete", b.straining && "straining", b.mucus && "mucus", b.floating && "floating", b.blood && "blood"].filter(Boolean).join(" · "))}</span></span>${icon("chevR", "chev")}</button>`).join("");
  h += group("Bowel movements", (d.bms.length ? "" : switchRow("No BM today", "nobm", "nobm", d.noBM)) + bmRows + actionRow("Add bowel movement", "addBM"), "", "", 60, "sec-bm");

  // breath
  const T = thresholds();
  const brRows = d.breath.map(r => `<button type="button" class="row nav" data-act="editBreath" data-id="${r.id}"><span class="row-main"><span class="row-label">${r.time ? esc(fmtTime(r.time)) : "No time"} · ${esc(r.ctx === "fasting" ? "Fasting" : (r.ch || "After food") + (r.mins != null && r.mins !== "" ? `, ${r.mins} min` : ""))}</span></span>
    <span class="readings"><span class="rd h2 ${num(r.h2) >= T.h2 ? "hi" : ""}">H₂ ${r.h2 ?? "–"}</span><span class="rd ch4 ${num(r.ch4) >= T.ch4 ? "hi" : ""}">CH₄ ${r.ch4 ?? "–"}</span></span>${icon("chevR", "chev")}</button>`).join("");
  h += group("FoodMarble AIRE 2", brRows + actionRow("Add breath reading", "addBreath"), d.breath.length ? "" : `Log a fasting reading, then readings 30 to 90 minutes after meals or a challenge test. Elevated is about ${T.h2} for H₂ and ${T.ch4} for CH₄ in ${S.profile.settings.unit === "ppm" ? "ppm" : "levels"}.`, "", 200);

  // sleep & body
  h += group("Sleep, stress & cycle",
    `<label class="row field-row" for="sl-h"><span class="row-label">Sleep</span><span class="field-end"><input type="number" id="sl-h" min="0" max="16" step="0.5" inputmode="decimal" data-act="sleep" data-f="hours" value="${esc(d.sleep.hours ?? "")}" placeholder="0"><span class="unit">hours</span></span></label>
     <div class="row field-row"><span class="row-label">Sleep quality</span>${seg("Sleep quality", [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]], d.sleep.quality, "quality")}</div>
     <label class="row field-row" for="sl-w"><span class="row-label">Night wakings</span><span class="field-end"><input type="number" id="sl-w" min="0" max="20" inputmode="numeric" data-act="sleep" data-f="wakes" value="${esc(d.sleep.wakes ?? "")}" placeholder="0"></span></label>
     ${symRow("stress", "Stress", d.stress, "stress")}
     ${switchRow("Period day", "period", "period", d.period)}`, "", "", 285, "sec-sleep");
  h += group("Notes", `<div class="row"><textarea id="notes" data-act="notes" rows="3" placeholder="Reactions, die-off, travel, how a new food went">${esc(d.notes || "")}</textarea></div>`);
  if (Store.mode === "local" && IN_VIEWER) h += `<p class="footnote">Saved in this browser only. Open this page signed in to claude.ai to keep it in your account, or export backups in More.</p>`;
  h += CATS.map(c => `<datalist id="dl-${c.k}">${S.profile.library.filter(i => i.cat === c.k && i.hidden).map(i => `<option value="${esc(i.name)}">`).join("")}</datalist>`).join("");
  return h;
}

// ---------- Trends ----------
function viewTrends() {
  const dates = Object.keys(S.days).sort();
  let h = largeTitle("Trends");
  if (!dates.length) return h + emptyState("No entries yet", "Your day score, breath readings and stool types chart here after a few days of logging.", "Log today", "tab", `data-tab="today"`);
  const end = todayStr(), start = UI.range === 0 ? dates[0] : addDays(end, -UI.range + 1);
  const span = []; for (let d = start; d <= end; d = addDays(d, 1)) span.push(d);
  const scores = span.map(d => dayScore(S.days[d])), valid = scores.filter(v => v != null);
  const half = Math.floor(span.length / 2);
  const a = mean(scores.slice(0, half).filter(v => v != null)), b = mean(scores.slice(half).filter(v => v != null));
  const delta = a != null && b != null ? b - a : null;
  const bmDays = span.filter(d => S.days[d] && (S.days[d].bms.length || S.days[d].noBM));
  h += `<div class="seg-wrap">${seg("Range", [[30, "30D"], [60, "60D"], [90, "90D"], [0, "All"]], UI.range, "range")}</div>
    <div class="tiles">
      <div class="tile"><span class="tile-k">Average score</span><span class="tile-v">${r1(mean(valid))}</span><span class="tile-s">0 best · 10 worst</span></div>
      <div class="tile"><span class="tile-k">Trend</span><span class="tile-v ${delta == null ? "" : delta < -0.3 ? "good" : delta > 0.3 ? "bad" : ""}">${delta == null ? "–" : (delta > 0 ? "+" : "") + r1(delta)}</span><span class="tile-s">2nd half vs 1st</span></div>
      <div class="tile"><span class="tile-k">Days logged</span><span class="tile-v">${span.filter(d => S.days[d]).length}<small>/${span.length}</small></span><span class="tile-s">in this range</span></div>
      <div class="tile"><span class="tile-k">BMs per day</span><span class="tile-v">${r1(mean(bmDays.map(d => S.days[d].bms.length)))}</span><span class="tile-s">${bmDays.length} days tracked</span></div>
    </div>`;
  h += group("Day score", `<div class="row chart-row">${lineChart(span, scores)}</div>`, S.profile.protocols.length ? "Shaded bands are protocols." : "");
  const breath = span.map(d => { const bb = S.days[d] ? S.days[d].breath : []; return { h2: bb.length ? Math.max(...bb.map(r => num(r.h2) || 0)) : null, ch4: bb.length ? Math.max(...bb.map(r => num(r.ch4) || 0)) : null }; });
  if (breath.some(x => x.h2 != null)) h += group(`Breath peaks <span class="gh-meta"><i class="sw h2"></i>H₂ <i class="sw ch4"></i>CH₄ <i class="sw thr"></i>elevated</span>`, `<div class="row chart-row">${breathChart(span, breath, thresholds())}</div>`);
  h += group("Stool form", `<div class="row chart-row">${bristolChart(span)}</div>`, "Bristol type for each BM. Types 3 and 4 are the target band.");
  h += trendsNutritionHtml();
  h += group("Recent days", dates.slice(-10).reverse().map(dt => { const d = S.days[dt]; return navRow({ label: esc(fmtDate(dt)), sub: esc([`${d.items.length} items`, d.noBM ? "no BM" : d.bms.length ? `BM ${d.bms.map(x => x.bristol || "?").join(", ")}` : "", d.breath.length ? `${d.breath.length} breath` : ""].filter(Boolean).join(" · ")), value: dayScore(d) == null ? "" : `<span class="score-chip">${r1(dayScore(d))}</span>`, act: "openDay", attrs: `data-d="${dt}"` }); }).join(""));
  return h;
}
function emptyState(title, text, btn, act, attrs = "") {
  return `<div class="empty">${SPROUT}<h2>${title}</h2><p>${text}</p>${btn ? `<button type="button" class="btn filled" data-act="${act}" ${attrs}>${btn}</button>` : ""}</div>`;
}

// charts (SVG, styled from CSS tokens)
function protoBands(span, x, top, height) {
  const s = span[0], e = span[span.length - 1];
  return S.profile.protocols.filter(p => p.start && p.start <= e && (!p.end || p.end >= s)).map((p, i) => {
    const a = Math.max(0, span.indexOf(p.start < s ? s : p.start)), b = span.indexOf(!p.end || p.end > e ? e : p.end);
    const x0 = x(a) - 3, x1 = x(b) + 3, right = x0 > 420;
    return `<rect x="${x0}" y="${top}" width="${Math.max(2, x1 - x0)}" height="${height}" class="band b${i % 3}"></rect><text x="${right ? x1 - 4 : x0 + 4}" y="${top + 12 + (i % 3) * 13}" text-anchor="${right ? "end" : "start"}" class="bandlabel">${esc(p.name)}</text>`;
  }).join("");
}
function axisDates(span, x, y) {
  const step = Math.max(1, Math.ceil(span.length / 5));
  return span.map((d, i) => (i % step === 0 ? `<text x="${x(i)}" y="${y}" class="tick" text-anchor="middle">${esc(fmtDate(d, { month: "short", day: "numeric" }))}</text>` : "")).join("");
}
function lineChart(span, vals) {
  const W = 640, H = 210, L = 26, R = 8, Tp = 8, B = 24;
  const x = i => L + (span.length <= 1 ? 0 : (i * (W - L - R)) / (span.length - 1));
  const y = v => Tp + (1 - v / 10) * (H - Tp - B);
  let path = "", started = false, last = null;
  vals.forEach((v, i) => { if (v == null) { started = false; return; } path += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; started = true; last = i; });
  const valid = vals.map((v, i) => [v, i]).filter(([v]) => v != null);
  const area = valid.length > 1 ? `M${x(valid[0][1])},${y(0)} ` + valid.map(([v, i]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ") + ` L${x(valid[valid.length - 1][1])},${y(0)} Z` : "";
  const grid = [0, 5, 10].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"></line><text x="${L - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Day score over time">${protoBands(span, x, Tp, H - Tp - B)}${grid}
    <path d="${area}" class="area"></path><path d="${path}" class="line"></path>
    ${last != null ? `<circle cx="${x(last)}" cy="${y(vals[last])}" r="4.5" class="enddot"></circle>` : ""}${axisDates(span, x, H - 5)}</svg>`;
}
function breathChart(span, vals, T) {
  const W = 640, H = 170, L = 26, R = 8, Tp = 8, B = 24;
  const max = Math.max(T.max, ...vals.map(v => Math.max(v.h2 || 0, v.ch4 || 0)));
  const bw = Math.max(1.5, Math.min(7, (W - L - R) / span.length / 2.6));
  const x = i => L + bw + (span.length <= 1 ? 0 : (i * (W - L - R - 2 * bw)) / (span.length - 1));
  const y = v => Tp + (1 - v / max) * (H - Tp - B);
  const ticks = [0, max].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"></line><text x="${L - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${Math.round(v)}</text>`).join("");
  const bars = vals.map((v, i) => v.h2 == null ? "" : `<rect x="${x(i) - bw}" y="${y(v.h2)}" width="${bw}" height="${y(0) - y(v.h2)}" rx="1" class="bh2"></rect><rect x="${x(i)}" y="${y(v.ch4)}" width="${bw}" height="${y(0) - y(v.ch4)}" rx="1" class="bch4"></rect>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily breath peaks">${ticks}<line x1="${L}" x2="${W - R}" y1="${y(T.ch4)}" y2="${y(T.ch4)}" class="thr"></line>${bars}${axisDates(span, x, H - 5)}</svg>`;
}
function bristolChart(span) {
  const W = 640, H = 150, L = 26, R = 8, Tp = 8, B = 24;
  const x = i => L + 4 + (span.length <= 1 ? 0 : (i * (W - L - R - 8)) / (span.length - 1));
  const y = v => Tp + ((v - 1) / 6) * (H - Tp - B);
  let dots = "";
  span.forEach((d, i) => { const day = S.days[d]; if (day) day.bms.forEach((b, j) => { if (b.bristol) dots += `<circle cx="${x(i) + j * 3}" cy="${y(b.bristol)}" r="3.4" class="bsdot b${b.bristol}"></circle>`; }); });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bristol stool types over time"><rect x="${L}" y="${y(3) - 6}" width="${W - L - R}" height="${y(4) - y(3) + 12}" rx="4" class="target"></rect>
    ${[1, 4, 7].map(v => `<text x="${L - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}</text>`).join("")}${dots}${axisDates(span, x, H - 5)}</svg>`;
}

// ---------- Protocols ----------
function protoStatus(p) { return !p.start ? "draft" : p.start > todayStr() ? "planned" : p.end && p.end < todayStr() ? "ended" : "active"; }
function viewProtocols() {
  const map = lib();
  const ps = [...S.profile.protocols].sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  let h = largeTitle("Protocols");
  if (!ps.length) return h + emptyState("No protocols yet", "A protocol is anything you try for a stretch of time: an antimicrobial round, a prokinetic, a diet or meal spacing. Its items become a daily checklist, and the app compares how you did before, during and after.", "New protocol", "newProto");
  for (const p of ps) {
    const s = protocolStats(p), st = protoStatus(p);
    const items = p.itemIds.map(id => map[id]).filter(Boolean);
    const tone = s.relapse ? "warn" : s.improved ? "good" : s.worse ? "bad" : "";
    h += `<section class="group"><div class="list">
      <div class="row proto-head"><span class="row-main"><span class="row-label strong">${esc(p.name)}</span><span class="row-sub">${esc((PROTO_KINDS.find(k => k[0] === p.kind) || ["", "Other"])[1])} · ${p.start ? esc(fmtDate(p.start, { month: "short", day: "numeric" })) : "no start"} – ${p.end ? esc(fmtDate(p.end, { month: "short", day: "numeric" })) : "ongoing"}</span></span>
        <span class="status ${st}">${st}</span><button type="button" class="iconbtn" data-act="protoMenu" data-id="${p.id}" aria-label="Options for ${esc(p.name)}">${icon("ellipsis")}</button></div>
      ${items.length ? `<div class="row chips-row"><div class="chips">${items.map(i => `<span class="chip static">${esc(i.name)}${i.dose ? ` <em>${esc(i.dose)}</em>` : ""}</span>`).join("")}</div></div>` : ""}
      <div class="row compare">
        ${[["Before", s.base], ["During", s.during], ["Last 7d", s.late], ["After", s.after]].map(([k, v]) => `<div><span class="cmp-k">${k}</span><span class="cmp-v">${r1(v.mean)}</span><span class="cmp-n">${v.n}d</span></div>`).join("")}
        <div><span class="cmp-k">Adherence</span><span class="cmp-v">${s.adherence == null ? "–" : Math.round(s.adherence * 100) + "%"}</span><span class="cmp-n">all items</span></div>
      </div>
      ${p.experiment ? (() => { const r = experimentResult(p); return `<div class="row verdict ${r.verdict === "helped" ? "good" : r.verdict === "worse" ? "bad" : ""}"><span class="row-label">Test: ${esc(r.text)}</span></div>` + navRow({ label: "See the insight it's testing", sub: esc(p.experiment.title || ""), act: "push", attrs: `data-k="insight" data-id="${esc(p.experiment.insight)}"` }); })()
        : `<div class="row verdict ${tone}"><span class="row-label">${esc(s.verdict)}</span></div>`}
      ${p.notes ? `<div class="row"><span class="row-sub">${esc(p.notes)}</span></div>` : ""}
    </div></section>`;
  }
  return h + `<p class="footnote">Scores are day scores (0 best, 10 worst). "Before" is the 2 weeks before the start; "After" is up to 60 days after the end.</p>`;
}

// ---------- Insights ----------
function viewNoSignal() {
  const A = analyze(), rest = scoreDrivers(A.F).filter(r => r.pts <= 0);
  return `<div class="spacer"></div>` + group("", rest.map(r => navRow({ label: esc(r.d.name), sub: r.unknown.length ? `${r.unknown.length} signal${r.unknown.length > 1 ? "s" : ""} not answered yet` : "No specific signals", act: "push", attrs: `data-k="driver" data-id="${r.d.id}"` })).join(""));
}
function viewDriver(p) {
  const d = DRIVERS.find(x => x.id === p.id);
  const r = scoreDrivers(analyze().F).find(x => x.d.id === d.id);
  const unans = r.unknown.filter(k => k[0] === "i").map(k => INTAKEMAP[k.slice(2)]).filter(Boolean);
  const list = a => a.map(t => `<div class="row"><span class="row-label">${esc(t)}</span></div>`).join("");
  let h = `<div class="detail-head" id="large-title"><h1>${esc(d.name)}</h1><div class="tagline"><span class="tag">${esc(d.cat)}</span><span class="ev ${d.ev}">${d.ev} evidence</span>${gasTags(d.gas)}</div></div>`;
  if (r.why.length) h += group(`For you · ${LEVEL_LABEL[r.level]}`, r.why.map(w => `<div class="row why-row"><span class="src">${w.src}</span><span class="row-label">${esc(w.label)}</span></div>`).join(""), unans.length ? `Still unanswered: ${unans.slice(0, 3).map(q => esc(q.q)).join(" ")}` : "");
  else if (unans.length) h += group("For you", navRow({ label: "No signals yet", sub: `${unans.length} related history question${unans.length > 1 ? "s" : ""} unanswered`, act: "push", attrs: `data-k="history"` }));
  h += group("How it drives SIBO/IMO", `<div class="row prose">${esc(d.mech)}</div>`);
  h += group("Why treatment may not stick", `<div class="row prose">${esc(d.stuck)}</div>`);
  h += group("Ask your clinician about", list(d.tests));
  h += group("Approaches people use", list(d.approach), "Summaries of published research and clinical consensus. Work with a clinician before starting or stopping anything.");
  return h;
}

// ---------- More ----------
function viewMore() {
  const answered = INTAKE.filter(q => S.profile.intake[q.k]).length, r = reminder();
  return largeTitle("More") +
    group("Your profile", navRow({ label: "History & labs", value: `${answered}/${INTAKE.length}`, act: "push", attrs: `data-k="history"` }) +
      navRow({ label: "Nutrition & targets", sub: S.profile.body && S.profile.body.w ? `About ${fmtN(nutritionTargets().T.kcal)} kcal · ${fmtN(nutritionTargets().T.p)} g protein` : "Set targets for eating enough", act: "push", attrs: `data-k="nutrition"` }) +
      navRow({ label: "Test results", sub: "Encrypted on this device", value: String((S.profile.results || []).length || ""), act: "push", attrs: `data-k="results"` }) +
      navRow({ label: "Daily reminder", value: r ? fmtTime(r.time) : "Off", act: "push", attrs: `data-k="reminder"` }) +
      `<div class="row field-row"><span class="row-label">FoodMarble units</span>${seg("Units", [["level", "Levels"], ["ppm", "ppm"]], S.profile.settings.unit, "unit")}</div>` +
      navRow({ label: "Color", value: { auto: "Follows how you feel", mono: "Black and white", full: "Full color" }[S.profile.settings.color || "auto"], act: "push", attrs: `data-k="color"` })) +
    group("Learn", navRow({ label: "Research library", sub: `${DRIVERS.length} root causes · ${PROTOCOLS.length} protocols`, act: "push", attrs: `data-k="research"` })) +
    group("Data", navRow({ label: "Data & backup", sub: Store.mode === "cloud" ? "Saved to your private account" : Store.mode === "demo" ? "Viewing sample data" : "Saved on this device", act: "push", attrs: `data-k="data"` }) +
      (Store.mode === "demo" ? `<button type="button" class="row action" data-act="exitDemo"><span class="row-label">Exit sample data</span></button>` : `<button type="button" class="row action" data-act="demo"><span class="row-label">Explore with sample data</span></button>`)) +
    group("Help", navRow({ label: "Layout check", sub: "Measures this screen if the page slides sideways", value: window.APP_BUILD ? window.APP_BUILD.slice(5) : "", act: "push", attrs: `data-k="layout"` })) +
    `<p class="footnote">SIBO Root Journal is a self-tracking tool. Rankings combine your answers, labs and journal patterns with published research to organize what you bring to your clinician. It isn't medical advice. If you have blood in your stool, unintended weight loss, vomiting, fever or severe pain, see a doctor promptly.</p>`;
}

function viewHistory() {
  const ans = S.profile.intake;
  let h = `<p class="intro-text">Answer once and update when things change. "Unsure" counts as a partial signal.</p>`;
  for (const g of INTAKE_GROUPS) {
    const qs = INTAKE.filter(q => q.g === g.id), done = qs.filter(q => ans[q.k]).length;
    h += group(`${g.name} <span class="gh-meta">${done}/${qs.length}</span>`, qs.map(q => `<div class="row q-row"><span class="row-label">${esc(q.q)}</span>${seg("Answer", [["y", "Yes"], ["n", "No"], ["u", "Unsure"]], ans[q.k] || "", "ans", `data-k="${q.k}"`)}</div>`).join(""));
  }
  h += group("Lab results", LABS.map(l => `<label class="row lab-row" for="lab-${l.k}"><span class="row-main"><span class="row-label">${esc(l.name)}</span><span class="row-sub">${esc(l.hint)}</span></span>
    <span class="field-end"><input id="lab-${l.k}" type="number" step="any" inputmode="decimal" data-act="lab" data-k="${l.k}" value="${esc(S.profile.labs[l.k] ?? "")}" placeholder="–"><span class="unit">${esc(l.unit)}</span></span></label>`).join(""), "Enter your most recent value. For yes/no tests, 1 means positive and 0 negative.");
  return h;
}

function viewResearch() {
  const q = UI.libQuery.toLowerCase();
  const cats = ["all", ...new Set(DRIVERS.map(d => d.cat))];
  const ds = DRIVERS.filter(d => (UI.libCat === "all" || d.cat === UI.libCat) && (!q || (d.name + d.mech + d.stuck + d.cat).toLowerCase().includes(q)));
  const ps = PROTOCOLS.map((p, i) => ({ p, i })).filter(({ p }) => !q || (p.name + p.what + p.type + p.works + p.fails).toLowerCase().includes(q));
  return `<div class="searchbar">${icon("search")}<input type="search" id="libq" data-act="libq" placeholder="Search causes and protocols" value="${esc(UI.libQuery)}" aria-label="Search"></div>
    <div class="scroller"><div class="filter">${cats.map(c => `<button type="button" class="fchip" data-act="libCat" data-c="${esc(c)}" aria-pressed="${UI.libCat === c}">${c === "all" ? "All" : esc(c)}</button>`).join("")}</div></div>` +
    group(`Root causes <span class="gh-meta">${ds.length}</span>`, ds.map(d => navRow({ label: esc(d.name), sub: `${esc(d.cat)} · <span class="ev-t ${d.ev}">${d.ev}</span> ${gasTags(d.gas)}`, act: "push", attrs: `data-k="driver" data-id="${d.id}"` })).join("") || `<div class="row"><span class="row-sub">No causes match.</span></div>`) +
    group(`Protocols <span class="gh-meta">${ps.length}</span>`, ps.map(({ p, i }) => navRow({ label: esc(p.name), sub: `${esc(p.type)} · <span class="ev-t ${p.ev}">${p.ev}</span> ${gasTags(p.gas)}`, act: "push", attrs: `data-k="tx" data-i="${i}"` })).join("") || `<div class="row"><span class="row-sub">No protocols match.</span></div>`,
      "Evidence: strong = consistent clinical studies; moderate = supportive studies; emerging = early research or clinical observation.");
}
function viewTx(p) {
  const t = PROTOCOLS[p.i];
  return `<div class="detail-head" id="large-title"><h1>${esc(t.name)}</h1><div class="tagline"><span class="tag">${esc(t.type)}</span><span class="ev ${t.ev}">${t.ev} evidence</span>${gasTags(t.gas)}</div></div>` +
    group("What it is", `<div class="row prose">${esc(t.what)}</div>`) + group("Best for", `<div class="row prose">${esc(t.works)}</div>`) +
    group("Where it falls short", `<div class="row prose">${esc(t.fails)}</div>`, "Doses are as studied, not recommendations. Work with a clinician before starting or stopping anything.");
}

function viewData() {
  const n = Object.keys(S.days).length, hidden = S.profile.library.filter(i => i.hidden);
  const where = Store.mode === "cloud" ? "Saved to your private space on this page. Only you can read it; whoever shared the page can't see it."
    : Store.mode === "demo" ? "You're looking at sample data. Nothing is saved."
    : IN_VIEWER ? "Saved in this browser only. Clearing site data or switching devices loses it, so export backups." : "Saved on this device. Export backups regularly, since uninstalling or clearing site data removes it.";
  return `<div class="spacer"></div>` +
    group("Storage", `<div class="row prose">${where}</div><div class="row"><span class="row-sub">${n} days · ${S.profile.library.length} items · ${S.profile.protocols.length} protocols</span></div>`) +
    group("Backup", `<button type="button" class="row action" data-act="export"><span class="row-label">Export backup (.json)</span></button>
      <label class="row action" for="importfile"><span class="row-label">Import backup</span><input type="file" id="importfile" accept="application/json,.json" data-act="import" class="sr"></label>
      ${UI.exportText ? `<div class="row"><textarea id="exporttext" rows="5" readonly>${esc(UI.exportText)}</textarea></div><button type="button" class="row action" data-act="copyExport"><span class="row-label">Copy backup text</span></button>` : ""}`,
      UI.exportText ? "Saving files isn't available here. Copy this text and keep it somewhere safe." : "Importing replaces what's here with the backup.") +
    group("Your checkbox items", CATS.map(c => { const its = S.profile.library.filter(i => i.cat === c.k && !i.hidden); return its.length ? `<div class="row chips-row"><span class="row-sub">${c.name}</span><div class="chips">${its.map(i => `<span class="chip static">${esc(i.name)}<button type="button" class="chip-x" data-act="hideItem" data-id="${i.id}" aria-label="Hide ${esc(i.name)}">${icon("close")}</button></span>`).join("")}</div></div>` : ""; }).join("") || `<div class="row"><span class="row-sub">No items yet.</span></div>`,
      "Hidden items stay in past entries.") +
    (hidden.length ? group("Hidden", `<div class="row chips-row"><div class="chips">${hidden.map(i => `<button type="button" class="chip" data-act="unhideItem" data-id="${i.id}">${icon("plus", "chk")}${esc(i.name)}</button>`).join("")}</div></div>`) : "");
}

function viewColor() {
  const mode = S.profile.settings.color || "auto", r = recentAverage(), w = colorLevel(), st = colorStage(w);
  const opt = (v, label, sub) => `<button type="button" class="row checkrow ${mode === v ? "on" : ""}" data-act="colorMode" data-v="${v}" aria-pressed="${mode === v}"><span class="row-main"><span class="row-label">${label}</span><span class="row-sub">${sub}</span></span><span class="circle">${icon("check")}</span></button>`;
  return `<div class="spacer"></div><div class="stage-hero"><span class="swatches big" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<i class="${i < st ? "on" : ""}" style="--h:${[150, 230, 300, 40, 90][i]}"></i>`).join("")}</span>
      <h2>${COLOR_STAGES[st]}</h2><p>${mode !== "auto" ? "Set manually." : r ? `Your 7-day average day score is ${r1(r.avg)}.` : "Log at least 3 days this week to start."}</p></div>` +
    group("Color", opt("auto", "Follows how you feel", "Starts black and white. Color fades in as your 7-day average improves.") + opt("mono", "Always black and white", "Calm and plain, whatever your scores") + opt("full", "Always full color", "Every color, all the time")) +
    group("The stages", COLOR_STAGES.map((n, i) => `<div class="row"><span class="row-label">${n}</span><span class="row-value">${["6.5 or worse", "5.5 to 6.5", "4.5 to 5.5", "3.5 to 4.5", "2.5 to 3.5", "1.5 or better"][i]}</span></div>`).join(""), "Based on your 7-day average day score, where 0 is no symptoms and 10 is the worst. Between stages, color shifts gradually.");
}
function viewReminder() {
  const r = reminder(), time = r ? r.time : "20:00";
  return `<div class="spacer"></div>` +
    group("", switchRow("Daily reminder", "rem-on", "remToggle", !!r, "Flags Today when you haven't logged by this time") +
      `<label class="row field-row" for="rem-time"><span class="row-label">Time</span><input type="time" id="rem-time" data-act="remTime" value="${esc(time)}"></label>`,
      "Works while the app is open: the Today tab gets a dot and your streak turns orange.") +
    group("When the app is closed", `<a class="row nav" href="${esc(googleCalUrl(time))}" target="_blank" rel="noopener"><span class="row-main"><span class="row-label">Add to Google Calendar</span><span class="row-sub">Repeats daily at ${esc(fmtTime(time))}</span></span>${icon("chevR", "chev")}</a>` +
      (Store.downloads ? `<button type="button" class="row nav" data-act="ics"><span class="row-main"><span class="row-label">Add to Apple or Outlook Calendar</span><span class="row-sub">Downloads a .ics file</span></span>${icon("chevR", "chev")}</button>` : ""),
      "A calendar event is the most reliable nudge on both iPhone and Android. Its alert links back to your journal.");
}

// ---------- sheets ----------
function renderSheet() {
  const root = $("#sheet-root"), s = UI.sheet;
  document.documentElement.classList.toggle("sheet-open", !!s);
  if (!s) { root.innerHTML = ""; resultSheetClosed(); return; }
  let title = "", body = "", form = true, del = "", submitLabel = "";
  if (RESULT_SHEETS.includes(s.k)) ({ title, body, form = true, del = "", submitLabel = "" } = resultSheetParts(s));
  else if (s.k === "voice") ({ title, body, submitLabel } = voiceSheetParts(s));
  else if (FOOD_SHEETS.includes(s.k)) ({ title, body, form = true, del = "", submitLabel = "" } = foodSheetParts(s));
  else if (s.k === "bm") {
    const b = s.bm || { time: new Date().toTimeString().slice(0, 5), bristol: null };
    title = s.bm ? "Bowel movement" : "Add bowel movement";
    body = `<div class="list"><label class="row field-row" for="sh-time"><span class="row-label">Time</span><input type="time" id="sh-time" name="time" value="${esc(b.time || "")}"></label></div>
      <h3 class="sheet-h3">Bristol type</h3>
      <div class="bristol-grid" role="radiogroup" aria-label="Bristol type">${[1, 2, 3, 4, 5, 6, 7].map(n => `<label class="bt b${n}"><input type="radio" name="bristol" value="${n}" ${b.bristol === n ? "checked" : ""}><span class="bt-n">${n}</span><span class="bt-l">${BRISTOL[n]}</span></label>`).join("")}</div>
      <p class="bristol-key">1–2 hard · 3–4 ideal · 5–7 loose</p>
      <div class="list">${[["urgency", "Urgent"], ["incomplete", "Incomplete"], ["straining", "Straining"], ["mucus", "Mucus"], ["floating", "Floating or oily"], ["blood", "Blood"]].map(([f, n]) => `<label class="row" for="sh-${f}"><span class="row-label">${n}</span><input type="checkbox" role="switch" class="switch" id="sh-${f}" name="${f}" ${b[f] ? "checked" : ""}></label>`).join("")}</div>`;
    if (s.bm) del = `<button type="button" class="btn destructive block" data-act="delBM" data-id="${s.bm.id}">Delete bowel movement</button>`;
  } else if (s.k === "breath") {
    const r = s.r || { time: new Date().toTimeString().slice(0, 5), ctx: "fasting" };
    title = s.r ? "Breath reading" : "Add breath reading";
    const unit = S.profile.settings.unit === "ppm" ? "ppm" : "level";
    body = `<div class="list">
      <label class="row field-row" for="sh-time"><span class="row-label">Time</span><input type="time" id="sh-time" name="time" value="${esc(r.time || "")}"></label>
      <div class="row field-row"><span class="row-label">When</span><span class="seg" role="radiogroup"><label><input type="radio" name="ctx" value="fasting" ${r.ctx === "fasting" ? "checked" : ""}><span>Fasting</span></label><label><input type="radio" name="ctx" value="post" ${r.ctx !== "fasting" ? "checked" : ""}><span>After food</span></label></span></div>
      <label class="row field-row" for="sh-ch"><span class="row-label">Food or test</span><select id="sh-ch" name="ch">${CHALLENGES.map(c => `<option ${r.ch === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label class="row field-row" for="sh-mins"><span class="row-label">Minutes after</span><input type="number" id="sh-mins" name="mins" min="0" max="300" inputmode="numeric" value="${esc(r.mins ?? "")}" placeholder="–"></label>
    </div><div class="list"><label class="row field-row" for="sh-h2"><span class="row-label"><span class="gas h2">H₂</span> Hydrogen</span><span class="field-end"><input type="number" id="sh-h2" name="h2" min="0" step="0.1" inputmode="decimal" value="${esc(r.h2 ?? "")}" placeholder="–"><span class="unit">${unit}</span></span></label>
      <label class="row field-row" for="sh-ch4"><span class="row-label"><span class="gas ch4">CH₄</span> Methane</span><span class="field-end"><input type="number" id="sh-ch4" name="ch4" min="0" step="0.1" inputmode="decimal" value="${esc(r.ch4 ?? "")}" placeholder="–"><span class="unit">${unit}</span></span></label></div>`;
    if (s.r) del = `<button type="button" class="btn destructive block" data-act="delBreath" data-id="${s.r.id}">Delete reading</button>`;
  } else if (s.k === "proto") {
    const ed = s.ed; title = ed.id ? "Edit protocol" : "New protocol";
    const groups = [...CATS.filter(c => c.k !== "food"), CATS[0]].map(c => ({ c, items: S.profile.library.filter(i => i.cat === c.k && !i.hidden) })).filter(g => g.items.length);
    body = `<div class="list"><label class="row field-row stack" for="pf-name"><span class="row-label">Name</span><input id="pf-name" name="name" required value="${esc(ed.name || "")}" placeholder="e.g. Rifaximin + neomycin, round 2"></label>
      <label class="row field-row" for="pf-kind"><span class="row-label">Type</span><select id="pf-kind" name="kind">${PROTO_KINDS.map(([k, n]) => `<option value="${k}" ${ed.kind === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="row field-row" for="pf-start"><span class="row-label">Starts</span><input id="pf-start" type="date" name="start" required value="${esc(ed.start || todayStr())}"></label>
      <label class="row field-row" for="pf-end"><span class="row-label">Ends</span><input id="pf-end" type="date" name="end" value="${esc(ed.end || "")}"></label></div>
      <h3 class="sheet-h3">Daily checklist items</h3>
      <div class="list">${groups.map(g => `<div class="row chips-row"><span class="row-sub">${g.c.name}</span><div class="chips">${g.items.map(i => `<label class="chip ${ed.itemIds.includes(i.id) ? "on" : ""}"><input type="checkbox" class="sr" name="items" value="${i.id}" ${ed.itemIds.includes(i.id) ? "checked" : ""}>${icon("check", "chk")}${esc(i.name)}</label>`).join("")}</div></div>`).join("")}
        <div class="row add-row"><input id="pf-newitem" name="newitem" placeholder="New items, separated by commas" autocomplete="off" value="${esc(ed.newitem || "")}"><select id="pf-newcat" name="newcat" aria-label="Category for new items">${CATS.map(c => `<option value="${c.k}" ${c.k === (ed.newcat || "supp") ? "selected" : ""}>${c.name}</option>`).join("")}</select></div></div>
      <div class="list"><div class="row"><textarea id="pf-notes" name="notes" rows="3" placeholder="Notes: dosing plan, who prescribed it, what you're testing">${esc(ed.notes || "")}</textarea></div></div>`;
  } else if (s.k === "menu") {
    form = false;
    const p = S.profile.protocols.find(x => x.id === s.id);
    title = p.name;
    body = s.confirm
      ? `<p class="sheet-text">Delete "${esc(p.name)}"? Your daily logs stay, but the protocol and its comparison are removed.</p><button type="button" class="btn destructive block" data-act="delProto" data-id="${p.id}">Delete protocol</button><button type="button" class="btn tonal block" data-act="closeSheet">Keep it</button>`
      : `<div class="list"><button type="button" class="row action" data-act="editProto" data-id="${p.id}"><span class="row-label">Edit</span></button>
        ${protoStatus(p) === "active" ? `<button type="button" class="row action" data-act="endProto" data-id="${p.id}"><span class="row-label">End today</span></button>` : ""}
        <button type="button" class="row action destructive" data-act="askDel" data-id="${p.id}"><span class="row-label">Delete</span></button></div>`;
  }
  const head = form
    ? `<header class="sheet-head"><button type="button" class="textbtn" data-act="closeSheet">Cancel</button><h2 id="sheet-title">${esc(title)}</h2><button type="submit" form="sheetform" class="textbtn strong">${submitLabel || (s.k === "proto" || s.bm || s.r ? "Save" : "Add")}</button></header>`
    : `<header class="sheet-head"><span></span><h2 id="sheet-title">${esc(title)}</h2><button type="button" class="textbtn" data-act="closeSheet">Done</button></header>`;
  root.innerHTML = `<div class="backdrop" data-act="closeSheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1"><div class="grabber" aria-hidden="true"></div>${head}
      <div class="sheet-body">${form ? `<form id="sheetform" data-act="sheetSubmit">${body}</form>` : body}${del}</div></div>`;
  $(".sheet", root).focus({ preventScroll: true });
}

// ---------- mutations ----------
function touchDay(date) { return getDay(date, true); }
function pruneDay(date) {
  const d = S.days[date];
  if (!d) return;
  const empty = !d.items.length && !Object.keys(d.symptoms).length && !d.bms.length && !d.breath.length && d.overall == null && !d.notes && !d.noBM && !d.period && d.stress == null && !Object.values(d.sleep).some(v => v !== "" && v != null) && !Object.values(d.food).some(v => v !== "" && v != null);
  if (empty) delete S.days[date];
}
function commitDay(date, rerender) { pruneDay(date); Store.saveDay(date); if (rerender) render(); celebrateStart(); }
function celebrateStart() {
  if (!UI.startedToday) return;
  UI.startedToday = false;
  if (!S.days[todayStr()] || Store.mode === "demo") return;
  const { cur } = streakInfo();
  toast(MILESTONES.includes(cur) ? `${cur} days in a row. That's a milestone.` : cur > 1 ? `Today's logged · ${cur} days in a row` : "Today's logged. Your streak starts now.");
  refreshStreak();
}
function addLibraryItem(name, cat) {
  name = name.trim();
  if (!name) return null;
  let it = S.profile.library.find(i => i.name.toLowerCase() === name.toLowerCase() && i.cat === cat);
  if (it) { it.hidden = false; return it; }
  it = { id: newId(), name, cat, dose: "" };
  S.profile.library.push(it);
  return it;
}

// ---------- events ----------
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t || t.tagName === "FORM" || (t.tagName === "INPUT" && t.type !== "button") || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
  const a = t.dataset.act, date = UI.date, map = lib();
  switch (a) {
    case "tab":
      if (UI.tab === t.dataset.tab && UI.stack.length) { UI.stack = []; render(); window.scrollTo(0, 0); break; }
      UI.tab = t.dataset.tab; UI.stack = []; render(); window.scrollTo(0, 0); break;
    case "back": goBack(); break;
    case "push": pushPage({ k: t.dataset.k, id: t.dataset.id, i: t.dataset.i != null ? Number(t.dataset.i) : undefined, from: pageTitle(page()) }); break;
    case "week": { const n = addDays(UI.date, Number(t.dataset.n)); UI.date = n > todayStr() ? todayStr() : n; render(); break; }
    case "pickday": UI.date = t.dataset.d; render(); break;
    case "openDay": UI.date = t.dataset.d; UI.tab = "today"; UI.stack = []; render(); window.scrollTo(0, 0); break;
    case "toggle": {
      const d = touchDay(date), id = t.dataset.id, i = d.items.findIndex(x => x.id === id);
      if (i >= 0) d.items.splice(i, 1); else d.items.push(map[id] && map[id].cat === "food" ? newFoodEntry(map[id], date) : { id, dose: (map[id] && map[id].dose) || "", time: "" });
      haptic(); commitDay(date, true); break;
    }
    case "checkAll": {
      const p = S.profile.protocols.find(x => x.id === t.dataset.p), d = touchDay(date);
      p.itemIds.forEach(id => { if (map[id] && !d.items.some(x => x.id === id)) d.items.push({ id, dose: map[id].dose || "", time: "" }); });
      haptic(); commitDay(date, true); break;
    }
    case "copyPrev": {
      const prev = getDay(addDays(date, -1)), d = touchDay(date); let added = 0;
      prev.items.forEach(it => { if (!d.items.some(x => x.id === it.id) && map[it.id] && !map[it.id].hidden) { d.items.push({ id: it.id, dose: it.dose || "", time: "", ...(it.q != null ? { q: it.q, u: it.u, meal: it.meal } : {}) }); added++; } });
      commitDay(date, true); toast(added ? `Added ${added} item${added > 1 ? "s" : ""} from yesterday` : "Everything from yesterday is already checked"); break;
    }
    case "quality": { const d = touchDay(date); d.sleep.quality = d.sleep.quality === Number(t.dataset.v) ? null : Number(t.dataset.v); commitDay(date, true); break; }
    case "addBM": openSheet({ k: "bm" }); break;
    case "editBM": openSheet({ k: "bm", bm: clone(getDay(date).bms.find(b => b.id === t.dataset.id)) }); break;
    case "delBM": { const d = touchDay(date); d.bms = d.bms.filter(b => b.id !== t.dataset.id); commitDay(date); closeSheet(); render(); break; }
    case "addBreath": openSheet({ k: "breath" }); break;
    case "editBreath": openSheet({ k: "breath", r: clone(getDay(date).breath.find(r => r.id === t.dataset.id)) }); break;
    case "delBreath": { const d = touchDay(date); d.breath = d.breath.filter(r => r.id !== t.dataset.id); commitDay(date); closeSheet(); render(); break; }
    case "closeSheet": closeSheet(); break;
    case "unit": S.profile.settings.unit = t.dataset.v; Store.saveProfile(); render(); break;
    case "range": UI.range = Number(t.dataset.v); render(); break;
    case "newProto": openSheet({ k: "proto", ed: { name: "", kind: "antimicrobial", start: todayStr(), end: "", itemIds: [], notes: "" } }); break;
    case "protoMenu": openSheet({ k: "menu", id: t.dataset.id }); break;
    case "editProto": UI.sheet = { k: "proto", ed: clone(S.profile.protocols.find(p => p.id === t.dataset.id)) }; renderSheet(); break;
    case "endProto": { const p = S.profile.protocols.find(x => x.id === t.dataset.id); p.end = todayStr(); Store.saveProfile(); closeSheet(); render(); toast("Protocol ended today"); break; }
    case "askDel": UI.sheet = { ...UI.sheet, confirm: true }; renderSheet(); break;
    case "delProto": S.profile.protocols = S.profile.protocols.filter(p => p.id !== t.dataset.id); Store.saveProfile(); closeSheet(); render(); toast("Protocol deleted"); break;
    case "libCat": UI.libCat = t.dataset.c; render(); break;
    case "ans": { const k = t.dataset.k, v = t.dataset.v; if (S.profile.intake[k] === v) delete S.profile.intake[k]; else S.profile.intake[k] = v; haptic(); Store.saveProfile(); t.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(S.profile.intake[k] === b.dataset.v))); break; }
    case "askAI": askAI(); break;
    case "demo": Store.sampleBackup = { S, mode: Store.mode }; S = sampleState(); Store.mode = "demo"; UI.date = todayStr(); UI.tab = "today"; UI.stack = []; render(); window.scrollTo(0, 0); break;
    case "exitDemo": S = Store.sampleBackup.S; Store.mode = Store.sampleBackup.mode; Store.sampleBackup = null; UI.aiText = ""; UI.stack = []; render(); break;
    case "export": doExport(); break;
    case "copyExport": { const ta = $("#exporttext"); navigator.clipboard.writeText(UI.exportText).then(() => toast("Copied"), () => { ta.select(); toast("Press Ctrl or Cmd + C to copy"); }); break; }
    case "hideItem": { const it = S.profile.library.find(i => i.id === t.dataset.id); it.hidden = true; Store.saveProfile(); render(); break; }
    case "unhideItem": { const it = S.profile.library.find(i => i.id === t.dataset.id); it.hidden = false; Store.saveProfile(); render(); break; }
    case "goReminder": UI.tab = "more"; UI.stack = []; pushPage({ k: "reminder", from: "More" }); break;
    case "ics": downloadIcs(); break;
    case "copyLayout": { const txt = layoutReport(); navigator.clipboard.writeText(txt).then(() => toast("Report copied"), () => { const el = $("#layout-report"); const rg = document.createRange(); rg.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); toast("Selected: tap Copy"); }); break; }
    case "colorMode": S.profile.settings.color = t.dataset.v; Store.saveProfile(); haptic(); render(); break;
    case "face": {
      const d = touchDay(date), v = Number(t.dataset.v);
      d.overall = d.overall != null && FACES.find(f => f.value === v).test(d.overall) ? undefined : v;
      if (d.overall === undefined) delete d.overall;
      haptic(); commitDay(date, true); break;
    }
  }
});

document.addEventListener("input", e => {
  const t = e.target, a = t.dataset.act, date = UI.date;
  if (a === "sym" || a === "overall" || a === "stress") {
    const d = touchDay(date), v = Number(t.value);
    if (a === "sym") d.symptoms[t.dataset.k] = v; else if (a === "overall") d.overall = v; else d.stress = v;
    t.classList.remove("unset"); t.style.setProperty("--p", v * 10 + "%");
    const out = document.getElementById(t.id + "-val"); out.textContent = v; out.classList.remove("unset");
    Store.saveDay(date); celebrateStart(); applyColor();
  } else if (a === "libq") {
    UI.libQuery = t.value; const pos = t.selectionStart; render(); const n = $("#libq"); n.focus(); n.setSelectionRange(pos, pos);
  } else if (a === "notes") { touchDay(date).notes = t.value; commitDay(date); }
});

document.addEventListener("change", e => {
  const t = e.target, a = t.dataset.act, date = UI.date;
  if (!a) {
    if (t.name === "items" && t.closest("#sheetform")) { const l = t.closest("label"); l.classList.toggle("on", t.checked); }
    return;
  }
  const d = () => touchDay(date);
  switch (a) {
    case "pickdate": if (t.value && t.value <= todayStr()) { UI.date = t.value; render(); } break;
    case "dose": { const it = d().items.find(x => x.id === t.dataset.id); it.dose = t.value; const li = S.profile.library.find(i => i.id === t.dataset.id); if (li) { li.dose = t.value; Store.saveProfile(); } commitDay(date); break; }
    case "itime": { d().items.find(x => x.id === t.dataset.id).time = t.value; commitDay(date); break; }
    case "food": { d().food[t.dataset.f] = t.dataset.f === "count" ? num(t.value) : t.value; commitDay(date); break; }
    case "sleep": { d().sleep[t.dataset.f] = num(t.value); commitDay(date); break; }
    case "period": { d().period = t.checked; haptic(); commitDay(date); break; }
    case "nobm": { const day = d(); day.noBM = t.checked; haptic(); commitDay(date); break; }
    case "lab": { const v = num(t.value); if (v == null) delete S.profile.labs[t.dataset.k]; else S.profile.labs[t.dataset.k] = v; Store.saveProfile(); break; }
    case "remToggle": if (t.checked) S.profile.settings.reminder = { time: ($("#rem-time") || {}).value || "20:00" }; else delete S.profile.settings.reminder; Store.saveProfile(); render(); break;
    case "remTime": if (t.value) { S.profile.settings.reminder = { time: t.value }; Store.saveProfile(); render(); } break;
    case "import": doImport(t.files && t.files[0]); t.value = ""; break;
  }
});

document.addEventListener("submit", e => {
  const f = e.target, a = f.dataset.act;
  if (!a) return;
  e.preventDefault();
  const fd = new FormData(f), date = UI.date;
  if (a === "addItem") {
    const names = String(fd.get("name") || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    const day = touchDay(date);
    names.forEach(n => { const it = addLibraryItem(n, f.dataset.cat); if (!day.items.some(x => x.id === it.id)) day.items.push({ id: it.id, dose: it.dose || "", time: "" }); });
    Store.saveProfile(); haptic(); commitDay(date, true);
  } else if (a === "addSym") {
    const name = String(fd.get("name") || "").trim();
    if (!name) return;
    const k = "c_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30);
    if (!S.profile.symptoms.some(s => s.k === k)) S.profile.symptoms.push({ k, name });
    Store.saveProfile(); render();
  } else if (a === "sheetSubmit") submitSheet(fd);
});

function submitSheet(fd) {
  const s = UI.sheet, date = UI.date;
  if (RESULT_SHEETS.includes(s.k)) { submitResultSheet(fd); return; }
  if (s.k === "voice") { submitVoiceSheet(fd); return; }
  if (FOOD_SHEETS.includes(s.k)) { submitFoodSheet(fd); return; }
  if (s.k === "bm") {
    const day = touchDay(date), b = s.bm || { id: newId() };
    Object.assign(b, { time: fd.get("time") || "", bristol: fd.get("bristol") ? Number(fd.get("bristol")) : null });
    ["urgency", "incomplete", "straining", "mucus", "floating", "blood"].forEach(k => { b[k] = fd.get(k) === "on"; });
    const i = day.bms.findIndex(x => x.id === b.id);
    if (i >= 0) day.bms[i] = b; else day.bms.push(b);
    day.bms.sort((x, y) => (x.time || "").localeCompare(y.time || ""));
    day.noBM = false;
  } else if (s.k === "breath") {
    const h2 = num(fd.get("h2")), ch4 = num(fd.get("ch4"));
    if (h2 == null && ch4 == null) { toast("Enter an H₂ or CH₄ value"); return; }
    const day = touchDay(date), ctx = fd.get("ctx") === "fasting" ? "fasting" : "post";
    const r = { id: (s.r && s.r.id) || newId(), time: fd.get("time") || "", ctx, ch: ctx === "fasting" ? "" : fd.get("ch") || "", mins: num(fd.get("mins")), h2, ch4 };
    const i = day.breath.findIndex(x => x.id === r.id);
    if (i >= 0) day.breath[i] = r; else day.breath.push(r);
    day.breath.sort((x, y) => (x.time || "").localeCompare(y.time || ""));
  } else if (s.k === "proto") {
    const ids = fd.getAll("items");
    String(fd.get("newitem") || "").split(",").map(x => x.trim()).filter(Boolean).forEach(n => { const it = addLibraryItem(n, fd.get("newcat")); if (!ids.includes(it.id)) ids.push(it.id); });
    const p = { id: s.ed.id || newId(), name: String(fd.get("name")).trim(), kind: fd.get("kind"), start: fd.get("start"), end: fd.get("end") || "", itemIds: ids, notes: String(fd.get("notes") || "") };
    if (s.ed.experiment) p.experiment = s.ed.experiment;
    if (p.end && p.end < p.start) { toast("The end date is before the start date"); return; }
    const i = S.profile.protocols.findIndex(x => x.id === p.id);
    if (i >= 0) S.profile.protocols[i] = p; else S.profile.protocols.push(p);
    Store.saveProfile(); closeSheet(); render(); toast("Protocol saved"); return;
  }
  haptic(); commitDay(date); closeSheet(); render();
}

document.addEventListener("keydown", e => { if (e.key === "Escape" && UI.sheet) closeSheet(); });

// ---------- Ask Claude, backup, calendar ----------
function aiSummary() {
  const A = analyze(), ranked = scoreDrivers(A.F).filter(r => r.pts > 0).slice(0, 8), T = thresholds();
  return {
    daysLogged: A.days.length,
    avgScoreLast14: r1(rangeMean(addDays(todayStr(), -13), todayStr()).mean),
    breath: A.breathSummary && { unit: S.profile.settings.unit, elevatedAt: { h2: T.h2, ch4: T.ch4 }, ...Object.fromEntries(Object.entries(A.breathSummary).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 100) / 100 : v])) },
    historyYes: INTAKE.filter(q => S.profile.intake[q.k] === "y").map(q => q.q),
    historyUnsure: INTAKE.filter(q => S.profile.intake[q.k] === "u").map(q => q.q),
    labs: Object.fromEntries(Object.entries(S.profile.labs).filter(([, v]) => num(v) != null).map(([k, v]) => [LABMAP[k] ? LABMAP[k].name : k, v])),
    topDrivers: ranked.map(r => ({ name: r.d.name, match: LEVEL_LABEL[r.level], points: Math.round(r.pts * 10) / 10, evidence: r.why.map(w => w.label) })),
    beforeWorseDays: A.correlations.filter(c => c.lift >= 0.7).slice(0, 6).map(c => `${c.it.name} (+${r1(c.lift)})`),
    beforeBetterDays: A.correlations.filter(c => c.lift <= -0.7).slice(-6).map(c => `${c.it.name} (${r1(c.lift)})`),
    nutrition14d: (() => { const a = nutritionAverage(14), { T } = nutritionTargets(); return a && { measuredDays: a.days, average: Object.fromEntries(NUT_KEYS.map(k => [NUT_INFO[k][0] + " (" + NUT_INFO[k][1] + ")", Math.round(a.avg[k] * 10) / 10])), targets: Object.fromEntries(MACROS.map(k => [NUT_INFO[k][0], T[k]])) }; })(),
    insights: buildInsights().list.filter(x => x.kind !== "gap").slice(0, 8).map(x => ({ finding: x.title, type: x.kind, confidence: x.conf || "", evidence: x.evidence.map(e => e[1]), test: x.result ? x.result.text : undefined })),
    protocols: A.protoStats.map(({ p, s }) => ({ name: p.name, type: p.kind, start: p.start, end: p.end || "ongoing", items: p.itemIds.map(id => A.map[id] && A.map[id].name).filter(Boolean), before: r1(s.base.mean), during: r1(s.during.mean), last7: r1(s.late.mean), after: r1(s.after.mean), verdict: s.verdict })),
  };
}
async function askAI() {
  if (!Store.sample || UI.aiBusy) return;
  UI.aiBusy = true; UI.aiText = ""; render();
  const prompt = `You are helping someone investigate the underlying drivers of their SIBO/IMO using their own symptom journal. You are not their doctor and must not diagnose or prescribe; frame everything as things to discuss with a clinician.

Their data (JSON; day scores are 0-10, lower is better):
${JSON.stringify(aiSummary(), null, 1)}

Write a plain-language read, under 380 words, with these short bolded labels:
**What stands out** (2-4 bullets tying specific data points to likely drivers)
**What's missing or contradictory** (1-3 bullets: data that would change the picture)
**Questions for your clinician** (3-5 bullets: specific tests or treatment-matching questions)
**Experiments to try in the journal** (1-2 bullets: what to change, for how long, what to track)
Use "- " bullets. No other headings. Be direct and specific to their numbers.`;
  try {
    const res = await Store.sample(prompt, { onText: ({ text }) => { UI.aiText = text; paintAI(); }, modelTier: "default", cache: false });
    UI.aiText = res.text;
  } catch (e) {
    UI.aiText = e && e.code === "not_granted" ? "Claude access wasn't allowed for this page." : e && e.code === "rate_limited" ? "Too many requests right now. Try again in a few minutes." : "Couldn't get an answer. Try again shortly.";
  }
  UI.aiBusy = false; render();
}
function paintAI() {
  const el = $("#aiout"); if (!el) return;
  el.hidden = false;
  const lines = esc(UI.aiText).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n");
  let out = "", inList = false;
  for (const ln of lines) {
    if (/^\s*[-•]\s+/.test(ln)) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${ln.replace(/^\s*[-•]\s+/, "")}</li>`; }
    else { if (inList) { out += "</ul>"; inList = false; } if (ln.trim()) out += `<p>${ln}</p>`; }
  }
  if (inList) out += "</ul>";
  el.innerHTML = out;
}
async function doExport() {
  const data = JSON.stringify({ app: "sibo-root-journal", version: 1, exported: new Date().toISOString(), ...S }, null, 1);
  const filename = `sibo-journal-${todayStr()}.json`;
  if (Store.downloads) {
    try { await Store.downloads.save({ filename, data }); UI.exportText = ""; render(); return; } catch (e) { if (e && e.code === "declined") return; }
  } else if (!IN_VIEWER) {
    // installed PWA / plain browser: a normal download works
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "application/json" })); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); return;
  }
  UI.exportText = data; render();
}
function doImport(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const j = JSON.parse(r.result);
      if (!j.profile || !j.days) throw new Error("bad");
      if (Store.mode === "demo") { toast("Exit sample data first, then import"); return; }
      S = { profile: Object.assign(blankProfile(), j.profile), days: j.days };
      await Store.saveAll();
      render(); toast(`Imported ${Object.keys(S.days).length} days`);
    } catch (e) { toast("That file isn't a SIBO Root Journal backup."); }
  };
  r.readAsText(file);
}
async function downloadIcs() {
  const time = (reminder() || { time: ($("#rem-time") || {}).value || "20:00" }).time;
  try { await Store.downloads.save({ filename: "sibo-journal-reminder.ics", data: icsText(time) }); toast("Open the file to add the reminder to your calendar"); }
  catch (e) { if (!e || e.code !== "declined") toast("Couldn't save the file here. Use Google Calendar instead."); }
}

// ---------- layout check ----------
// Watches for the page getting wider than the screen, or zooming, and remembers what caused it,
// so More → Layout check can report it from the phone itself.
const LAYOUT = { maxScale: 1, maxScrollX: 0, worst: null, checks: 0 };
function describeEl(el) { return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.classList.length ? "." + [...el.classList].slice(0, 3).join(".") : ""); }
function checkLayout() {
  const de = document.documentElement, W = de.clientWidth, SW = Math.max(de.scrollWidth, document.body.scrollWidth), vv = window.visualViewport;
  LAYOUT.checks++;
  if (vv && vv.scale > LAYOUT.maxScale + 0.01) LAYOUT.maxScale = vv.scale;
  LAYOUT.maxScrollX = Math.max(LAYOUT.maxScrollX, window.scrollX || 0, vv ? vv.offsetLeft : 0);
  const wide = [];
  document.querySelectorAll("body *").forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || (r.right <= W + 1 && r.left >= -1)) return;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox !== "visible" && p.id !== "screen") return; }
    wide.push(`${describeEl(el)} (${Math.round(r.left)} to ${Math.round(r.right)})`);
  });
  if (SW > W + 1 || wide.length) LAYOUT.worst = { at: new Date().toLocaleTimeString(), where: pageTitle(page()), W, SW, wide: wide.slice(0, 8) };
}
let layoutTimer = null;
const queueLayoutCheck = () => { clearTimeout(layoutTimer); layoutTimer = setTimeout(checkLayout, 400); };
window.addEventListener("scroll", queueLayoutCheck, { passive: true });
if (window.visualViewport) { visualViewport.addEventListener("resize", queueLayoutCheck); visualViewport.addEventListener("scroll", queueLayoutCheck); }

function layoutReport() {
  const de = document.documentElement, vv = window.visualViewport, w = LAYOUT.worst;
  return [
    `Version: ${window.APP_BUILD || "claude.ai preview"}`,
    `Screen width: ${de.clientWidth}px · page width now: ${Math.max(de.scrollWidth, document.body.scrollWidth)}px`,
    `Zoom now: ${vv ? vv.scale.toFixed(2) : "n/a"} · highest seen: ${LAYOUT.maxScale.toFixed(2)}`,
    `Sideways offset seen: ${Math.round(LAYOUT.maxScrollX)}px`,
    w ? `Too wide at ${w.at} on ${w.where}: page ${w.SW}px on a ${w.W}px screen${w.wide.length ? "\n  " + w.wide.join("\n  ") : ""}` : "Nothing wider than the screen found yet",
    `Standalone: ${matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "yes" : "no"} · ${navigator.userAgent.match(/OS [\d_]+/) ? navigator.userAgent.match(/OS [\d_]+/)[0].replace(/_/g, ".") : ""}`,
  ].join("\n");
}
function viewLayout() {
  checkLayout();
  return `<div class="spacer"></div>` + group("What this phone reports", `<div class="row"><pre class="report" id="layout-report">${esc(layoutReport())}</pre></div>
      <button type="button" class="row action" data-act="copyLayout"><span class="row-label">Copy report</span></button>`,
    "To test: go to Today, scroll up and down until the page slides sideways, then come back here and copy the report. It only measures the screen; nothing is sent anywhere.");
}

// ---------- boot ----------
// Wait for every script (results.js, voice.js load after this one) before the first full render.
function boot() { render(); Store.init().then(() => { UI.loading = false; render(); }); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else setTimeout(boot, 0);
let lastDue = null;
setInterval(() => { if (UI.loading) return; const due = reminderDue(); if (due !== lastDue) { lastDue = due; refreshStreak(); } }, 60000);
// Installed-app mode only: inside claude.ai the artifact host serves the page and service workers aren't available.
const PWA_HOST = location.protocol === "https:" || location.hostname === "localhost";
if ("serviceWorker" in navigator && !IN_VIEWER && PWA_HOST && document.querySelector('link[rel="manifest"]')) navigator.serviceWorker.register("sw.js").catch(() => {});
// Ask the browser not to clear this app's storage (the journal and the encrypted vault) when space runs low.
if (!IN_VIEWER && navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
