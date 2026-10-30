/* SIBO Root Journal — report for AI: everything in the journal as one plain-text (Markdown) report,
   with instructions at the top, to paste into any AI chat and look for patterns and root causes.
   Built on this device; nothing is sent anywhere unless the person copies, shares or saves it.
   Loaded after supplements.js; shares its global scope. */

const REPORT_RANGES = [["30", "30 days"], ["90", "90 days"], ["all", "All"]];

function reportDates(range) {
  const all = Object.keys(S.days).sort();
  if (range === "all" || !all.length) return all;
  const from = addDays(todayStr(), -(Number(range) - 1));
  return all.filter(d => d >= from);
}
const yn = { y: "Yes", n: "No", u: "Unsure" };
const kv = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join(", ");

function reportDayLines(date, map) {
  const d = S.days[date], L = [], sc = dayScore(d);
  const syms = S.profile.symptoms.filter(s => typeof d.symptoms[s.k] === "number").map(s => `${s.name} ${d.symptoms[s.k]}`);
  L.push(`### ${date} (${fmtDate(date, { weekday: "short" })})${sc == null ? "" : ` · day score ${r1(sc)}`}`);
  if (typeof d.overall === "number") L.push(`- Overall gut day: ${d.overall}/10`);
  if (syms.length) L.push(`- Symptoms (0–10): ${syms.join(", ")}`);
  // food by meal, in the order eaten
  const amount = (e, it) => hasNutrition(it) ? ` (${fmtQU(entryQU(e, it).q, entryQU(e, it).u)})` : "";
  const foods = es => es.map(e => map[e.id] && map[e.id].name + amount(e, map[e.id])).filter(Boolean).join(", ");
  const ms = dayMeals(d), gaps = mealGapsOf(d), night = overnightFast(date);
  for (const m of ms) L.push(`- ${MEAL_ONE[m.type]}${m.time ? ` ${m.time}` : ""}: ${foods(mealFoods(d, m.id)) || "(no foods listed)"}`);
  const loose = d.items.filter(e => !e.mid && map[e.id] && map[e.id].cat === "food");
  if (loose.length) L.push(`- Food, no meal given: ${loose.map(e => map[e.id].name + amount(e, map[e.id]) + (e.time ? ` at ${e.time}` : "")).join(", ")}`);
  if (gaps.length || night != null) L.push(`- Meal timing: ${[gaps.length ? `gaps ${gaps.map(fmtGap).join(", ")}` : "", night != null ? `overnight fast ${fmtGap(night)}` : ""].filter(Boolean).join("; ")}`);
  const x = dayNutrition(d, map);
  if (x.ok) L.push(`- Nutrition (${Math.round(x.cover * 100)}% of foods measured): ${fmtN(x.tot.kcal)} kcal, protein ${fmtN(x.tot.p)} g, fat ${fmtN(x.tot.f)} g, carbs ${fmtN(x.tot.c)} g, fiber ${fmtN(x.tot.fib)} g`);
  for (const [cat, label] of [["supp", "Supplements"], ["tx", "Medications"], ["practice", "Practices"]]) {
    const es = d.items.filter(e => map[e.id] && map[e.id].cat === cat);
    if (es.length) L.push(`- ${label}: ${es.map(e => map[e.id].name + (doseLabel(e) ? ` ${doseLabel(e)}` : "") + (e.time ? ` at ${e.time}` : "")).join("; ")}`);
  }
  if (d.noBM) L.push("- Bowel movements: none");
  for (const b of d.bms) {
    const flags = [["urgency", "urgent"], ["incomplete", "incomplete"], ["straining", "straining"], ["mucus", "mucus"], ["floating", "floating or oily"], ["blood", "blood"]].filter(([k]) => b[k]).map(f => f[1]);
    L.push(`- BM${b.time ? ` ${b.time}` : ""}: ${b.bristol ? `Bristol ${b.bristol} (${BRISTOL[b.bristol].toLowerCase()})` : "Bristol not given"}${b.size ? `, ${BM_SIZE[b.size][0].toLowerCase()} (${BM_SIZE[b.size][1].toLowerCase()})` : ""}${flags.length ? `, ${flags.join(", ")}` : ""}`);
  }
  const unit = S.profile.settings.unit === "ppm" ? "ppm" : "level";
  for (const r of d.breath) L.push(`- Breath${r.time ? ` ${r.time}` : ""}: ${r.ctx === "fasting" ? "fasting" : `after ${(r.ch || "food").toLowerCase()}${r.mins != null ? `, ${r.mins} min` : ""}`}; ${[r.h2 != null ? `H2 ${r.h2}` : "", r.ch4 != null ? `CH4 ${r.ch4}` : ""].filter(Boolean).join(", ")} ${unit}`);
  const sl = d.sleep || {}, life = [sl.hours != null && sl.hours !== "" ? `sleep ${sl.hours} h` : "", sl.quality ? `sleep quality ${sl.quality}/5` : "", sl.wakes != null && sl.wakes !== "" ? `${sl.wakes} night wakings` : "", typeof d.stress === "number" ? `stress ${d.stress}/10` : "", d.period ? "period day" : ""].filter(Boolean);
  if (life.length) L.push(`- ${life.join(", ").replace(/^\w/, c => c.toUpperCase())}`);
  if (d.notes && d.notes.trim()) L.push(`- Notes: ${d.notes.trim().replace(/\s*\n+\s*/g, " / ")}`);
  return L;
}

function buildReport(range) {
  const map = lib(), dates = reportDates(range), T = thresholds(), unit = S.profile.settings.unit === "ppm" ? "ppm" : "FoodMarble levels (0–10)";
  const out = [], P = s => out.push(s), H = s => out.push("", `## ${s}`, "");
  P("# SIBO / IMO journal report");
  P("");
  P(`Made ${fmtDate(todayStr(), { year: "numeric", month: "long", day: "numeric" })} with SIBO Root Journal. ${dates.length ? `Covers ${dates.length} logged days, ${dates[0]} to ${dates[dates.length - 1]}.` : "No days logged yet."}`);

  H("Instructions for the AI");
  P(`I have SIBO/IMO symptoms and keep a daily journal. Below is my health history, my test results and my journal. Please act as a careful research assistant, not a doctor. Don't diagnose or prescribe; frame what you find as things for me to discuss with my clinician.

1. Look for patterns across the daily log: foods, meals and meal timing, supplements and medications, sleep, stress, the menstrual cycle and bowel movements, against symptoms and day scores. Allow for delays of 1–3 days, and for things that change together.
2. Rank the most likely underlying drivers (root causes) of my SIBO/IMO. For each, cite the specific evidence from my history, labs and log, and say what would make it more or less likely.
3. Say how each protocol I tried seems to have gone, and why it might have worked or not.
4. List what's missing or contradictory: data that would change the picture.
5. Suggest specific tests and questions for my clinician, and 1–2 journal experiments (what to change, for how long, what to track).

Use both Western (conventional) medicine and alternative and integrative approaches, such as functional medicine, naturopathy, herbal medicine, Traditional Chinese Medicine and Ayurveda, in how you explain what's going on and in what you suggest. For each idea, say which tradition it comes from and how strong the evidence behind it is.

Be specific to my numbers. If a pattern rests on only a few days, say so.

How to read the data: symptoms, the overall gut day and stress are 0–10, where 0 is none or best. The day score is the overall gut day when given, or else the average of the 3 worst symptoms. Bristol stool type runs 1–7: 1–2 hard, 3–4 ideal, 5–7 loose. BM size is by volume (a cup is about a fist). Breath readings are ${unit}; the app treats H2 ≥ ${T.h2} and CH4 ≥ ${T.ch4} as elevated. Times are 24-hour.`);

  // health history
  const ans = INTAKE.filter(q => S.profile.intake[q.k]);
  H("Health history");
  if (!ans.length) P("Not answered yet.");
  for (const g of INTAKE_GROUPS) {
    const qs = ans.filter(q => q.g === g.id);
    if (qs.length) { P(`**${g.name}**`); qs.forEach(q => P(`- ${q.q} ${yn[S.profile.intake[q.k]] || S.profile.intake[q.k]}`)); P(""); }
  }

  // labs and tests
  H("Labs and test results");
  const labs = Object.entries(S.profile.labs).filter(([, v]) => num(v) != null);
  if (labs.length) { P("Latest values:"); labs.forEach(([k, v]) => { const l = LABMAP[k]; P(`- ${l ? l.name : k}: ${v}${l && l.unit ? ` ${l.unit}` : ""}`); }); }
  const res = (S.profile.results || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (res.length) {
    if (labs.length) P("");
    P("Tests on file:");
    for (const r of res) {
      const vals = Object.entries(r.values || {}).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${LABMAP[k] ? LABMAP[k].name : k} ${v}${LABMAP[k] && LABMAP[k].unit ? ` ${LABMAP[k].unit}` : ""}`);
      P(`- ${r.date || "no date"} · ${typeName(r.type)}${r.label ? ` (${r.label})` : ""}${vals.length ? `: ${vals.join(", ")}` : ""}${r.notes ? `. Notes: ${r.notes.replace(/\s*\n+\s*/g, " / ")}` : ""}`);
    }
  }
  if (!labs.length && !res.length) P("None entered.");

  // protocols
  const A = analyze();
  H("Protocols and treatments tried");
  if (!A.protoStats.length) P("None entered.");
  for (const { p, s } of A.protoStats) {
    P(`- **${p.name}** (${(PROTO_KINDS.find(k => k[0] === p.kind) || ["", "Other"])[1]}), ${p.start || "no start"} to ${p.end || "ongoing"}. Items: ${p.itemIds.map(id => map[id] && `${map[id].name}${doseLabel(map[id]) ? ` ${doseLabel(map[id])}` : ""}`).filter(Boolean).join(", ") || "none"}.`);
    P(`  Average day score before ${r1(s.base.mean)} (${s.base.n} d), during ${r1(s.during.mean)} (${s.during.n} d), last 7 days ${r1(s.late.mean)}${s.after.n ? `, after ${r1(s.after.mean)} (${s.after.n} d)` : ""}. Adherence ${s.adherence == null ? "unknown" : Math.round(s.adherence * 100) + "%"}. App's verdict: ${s.verdict}.${p.notes ? ` Notes: ${p.notes}` : ""}`);
  }

  // what the app already found
  const sum = aiSummary();
  H("What the app's own analysis found");
  P("These come from simple rules and correlations in the app. Treat them as leads to check against the raw log, not conclusions.");
  P("");
  if (sum.topDrivers.length) { P("**Root causes ranked by how well they fit**"); sum.topDrivers.forEach(r => P(`- ${r.name} (${r.match.toLowerCase()}). Evidence: ${r.evidence.join("; ") || "none listed"}`)); P(""); }
  if (sum.insights.length) { P("**Insights**"); sum.insights.forEach(x => P(`- ${x.finding}${x.confidence ? ` (${x.confidence} confidence)` : ""}${x.evidence.length ? `: ${x.evidence.join("; ")}` : ""}${x.test ? ` Test result: ${x.test}` : ""}`)); P(""); }
  if (sum.beforeWorseDays.length) P(`**Logged before worse days** (change in day score): ${sum.beforeWorseDays.join(", ")}`);
  if (sum.beforeBetterDays.length) P(`**Logged before better days**: ${sum.beforeBetterDays.join(", ")}`);
  if (sum.breath) P(`**Breath pattern**: ${kv(Object.fromEntries(Object.entries(sum.breath).filter(([, v]) => typeof v !== "object")))}`);
  if (sum.mealTiming14d) P(`**Meal timing, last 14 days**: ${kv(sum.mealTiming14d)}`);
  if (sum.nutrition14d) P(`**Nutrition, last 14 days** (${sum.nutrition14d.measuredDays} measured days): ${kv(sum.nutrition14d.average)}. Targets: ${kv(sum.nutrition14d.targets)}`);

  // weekly overview, then every day
  if (dates.length) {
    H("Week by week");
    P("| Week of | Days logged | Avg day score | BMs per day | Avg Bristol |");
    P("|---|---|---|---|---|");
    const weeks = {};
    for (const dt of dates) { const dd = parseD(dt); dd.setDate(dd.getDate() - ((dd.getDay() + 6) % 7)); (weeks[ymd(dd)] ||= []).push(S.days[dt]); }
    for (const [wk, ds] of Object.entries(weeks)) {
      const sc = ds.map(dayScore).filter(v => v != null), bms = ds.flatMap(x => x.bms), br = bms.map(b => b.bristol).filter(Boolean);
      P(`| ${wk} | ${ds.length} | ${sc.length ? r1(mean(sc)) : "–"} | ${r1(bms.length / ds.length)} | ${br.length ? r1(mean(br)) : "–"} |`);
    }
    H("Daily log");
    dates.forEach(dt => { out.push(...reportDayLines(dt, map), ""); });
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------- page ----------
function viewReport() {
  const range = UI.reportRange || "all", text = buildReport(range), n = reportDates(range).length;
  const words = text.split(/\s+/).length;
  UI.reportText = text;
  return `<div class="spacer"></div>` +
    group("", `<div class="row prose">One report with your history, test results, protocols, the app's findings and every logged day, with instructions at the top. Paste it into ChatGPT, Claude, Gemini or another AI and ask it to look for patterns and likely root causes.</div>
      <div class="row field-row"><span class="row-label">Include</span>${seg("Range", REPORT_RANGES, range, "reportRange")}</div>
      <div class="row"><span class="row-sub">${n} days · about ${words.toLocaleString()} words</span></div>`) +
    group("", `<button type="button" class="row action" data-act="reportCopy">${icon("check", "lead")}<span class="row-label">Copy report</span></button>` +
      (navigator.share ? `<button type="button" class="row action" data-act="reportShare">${icon("chevR", "lead")}<span class="row-label">Share…</span></button>` : "") +
      (Store.downloads || !IN_VIEWER ? `<button type="button" class="row action" data-act="reportSave">${icon("plus", "lead")}<span class="row-label">Save as a file (.md)</span></button>` : ""),
      "The report is made on this device. It leaves only when you copy, share or save it, and whatever AI you paste it into will see your health details and notes.") +
    group("Preview", `<div class="row"><textarea id="report-text" rows="14" readonly>${esc(text)}</textarea></div>`);
}
async function reportSave() {
  const data = UI.reportText || buildReport(UI.reportRange || "all"), filename = `sibo-journal-report-${todayStr()}.md`;
  if (Store.downloads) { try { await Store.downloads.save({ filename, data }); return; } catch (e) { if (e && e.code === "declined") return; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "text/markdown" })); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function reportShare() {
  const text = UI.reportText || buildReport(UI.reportRange || "all"), filename = `sibo-journal-report-${todayStr()}.md`;
  try {
    // a file keeps long reports intact in apps that cut off shared text
    const file = new File([text], filename, { type: "text/markdown" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "SIBO journal report" });
    else await navigator.share({ title: "SIBO journal report", text });
  } catch (e) { if (e && e.name !== "AbortError") toast("Couldn't share. Try Copy report instead."); }
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  switch (t.dataset.act) {
    case "reportCopy": {
      const text = UI.reportText || buildReport(UI.reportRange || "all");
      navigator.clipboard.writeText(text).then(() => toast("Report copied. Paste it into your AI chat."), () => { const ta = $("#report-text"); if (ta) { ta.focus(); ta.select(); } toast("Selected: tap Copy"); });
      break;
    }
    case "reportShare": reportShare(); break;
    case "reportSave": reportSave(); break;
  }
});
