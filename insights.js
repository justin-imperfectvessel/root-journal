/* SIBO Root Journal — insight engine.
   Cross-references the research (KB), health history, labs, protocols and day-to-day logs into findings,
   each with its evidence, a confidence level, questions for a clinician, and a self-test that closes the loop.
   Loaded after ui.js; shares its global scope. */

// ---------- statistics on your own days ----------
const variance = a => { const m = mean(a); return a.length > 1 ? a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) : 0; };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
function compare(on, off) {
  if (on.length < 4 || off.length < 4) return null;
  const diff = mean(on) - mean(off);
  // floor the standard error so a handful of identical scores can't look certain
  const se = Math.max(0.3, Math.sqrt(variance(on) / on.length + variance(off) / off.length));
  return { diff, t: diff / se, n: on.length, nOff: off.length, on: mean(on), off: mean(off) };
}
function confidence(c, penalty = 0) {
  if (!c) return null;
  const t = Math.abs(c.t) - penalty, n = Math.min(c.n, c.nOff);
  return t >= 2.5 && n >= 6 ? "high" : t >= 1.8 && n >= 4 ? "moderate" : t >= 1.2 ? "low" : null;
}
function pearson(xs, ys) {
  if (xs.length < 6) return null;
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  xs.forEach((x, i) => { a += (x - mx) * (ys[i] - my); b += (x - mx) ** 2; c += (ys[i] - my) ** 2; });
  return b && c ? { r: a / Math.sqrt(b * c), n: xs.length } : null;
}
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
const LAG_TEXT = ["the same day", "the next day", "two days later"];
const CONF_LABEL = { high: "Strong pattern", moderate: "Moderate pattern", low: "Early hint" };
const fxText = fx => `${fx.diff > 0 ? "+" : ""}${r1(fx.diff)} on your day score ${LAG_TEXT[fx.lag]} (${fx.n} days with, ${fx.nOff} without)`;

function dayStats() {
  const map = lib(), dates = Object.keys(S.days).sort(), t = todayStr();
  const score = {};
  dates.forEach(d => { const s = dayScore(S.days[d]); if (s != null) score[d] = s; });
  // residual: a day compared with the two weeks around it, so a slow change (a protocol working) isn't mistaken for a food effect
  const res = {};
  for (const d of Object.keys(score)) {
    const near = [];
    for (let i = -7; i <= 7; i++) if (i) { const v = score[addDays(d, i)]; if (v != null) near.push(v); }
    if (near.length >= 5) res[d] = score[d] - median(near);
  }
  // pred returns true / false, or null when the day says nothing either way
  const effect = (pred, lags = [0, 1, 2], penalty = 0) => {
    let best = null;
    for (const lag of lags) {
      const on = [], off = [];
      for (const d of dates) {
        const p = pred(S.days[d]), v = res[addDays(d, lag)];
        if (p == null || v == null) continue;
        (p ? on : off).push(v);
      }
      const c = compare(on, off);
      if (c && (!best || Math.abs(c.t) > Math.abs(best.t))) best = { ...c, lag };
    }
    // trying several lags makes a chance hit likelier, so ask a little more of the best one
    if (best) best.conf = confidence(best, (lags.length > 1 ? 0.3 : 0) + penalty);
    return best;
  };

  // items, with ones you always take together treated as one bundle
  const onSets = {};
  for (const it of S.profile.library) {
    const s = new Set(dates.filter(d => expandIds(S.days[d], map).includes(it.id)));
    if (s.size >= 4) onSets[it.id] = s;
  }
  const ids = Object.keys(onSets), used = new Set(), bundles = [];
  for (const id of ids) {
    if (used.has(id)) continue;
    const b = [id]; used.add(id);
    for (const o of ids) if (!used.has(o) && jaccard(onSets[id], onSets[o]) >= 0.85) { b.push(o); used.add(o); }
    bundles.push(b);
  }
  const protoItems = new Set(S.profile.protocols.flatMap(p => p.itemIds));
  const itemFx = bundles.map(b => {
    // many items are tested at once, so single items need a clearer signal than food groups
    // food reactions in SIBO usually show within hours or by the next day; supplements and medications get a longer window
    const items = b.map(id => map[id]), set = onSets[b[0]];
    const fx = effect(d => set.has(d.date), items.every(i => i.cat === "food") ? [0, 1] : [0, 1, 2], 0.5);
    const name = items.length > 3 ? `${items.slice(0, 2).map(i => i.name).join(" + ")} + ${items.length - 2} more` : items.map(i => i.name).join(" + ");
    return fx && { ids: b, items, name, inProtocol: b.some(id => protoItems.has(id)), ...fx };
  }).filter(Boolean);

  const groupFx = {}, groupFoods = {};
  for (const g of ["histamine", "fodmap", "sulfur", "fat", "alcohol"]) {
    groupFx[g] = effect(d => itemNames(d, map).some(i => i.cat === "food" && GROUPS[g].test(i.name)));
    groupFoods[g] = S.profile.library.filter(i => i.cat === "food" && GROUPS[g].test(i.name) && onSets[i.id]).map(i => i.name);
  }

  // recent two weeks against the two before
  const vals = (a, b, f) => { const v = []; for (let d = a; d <= b; d = addDays(d, 1)) { const x = f(d); if (x != null) v.push(x); } return v; };
  const recentW = [addDays(t, -13), t], priorW = [addDays(t, -27), addDays(t, -14)];
  const trend = compare(vals(...recentW, d => score[d] ?? null), vals(...priorW, d => score[d] ?? null));
  if (trend) trend.conf = confidence(trend);
  const symAt = k => d => { const v = S.days[d] && S.days[d].symptoms[k]; return typeof v === "number" ? v : null; };
  const symTrends = S.profile.symptoms.map(s => { const c = compare(vals(...recentW, symAt(s.k)), vals(...priorW, symAt(s.k))); return c && { k: s.k, name: s.name, ...c }; }).filter(Boolean);
  const avgOf = (w, f) => mean(vals(...w, d => S.days[d] ? f(S.days[d]) : null));
  const habits = {
    sleep: [avgOf(priorW, d => num(d.sleep.hours)), avgOf(recentW, d => num(d.sleep.hours))],
    stress: [avgOf(priorW, d => num(d.stress)), avgOf(recentW, d => num(d.stress))],
  };

  // what happened after starting something new (outside a protocol, which gets its own comparison)
  const onset = [];
  for (const it of S.profile.library) {
    if (protoItems.has(it.id) || !onSets[it.id]) continue;
    const first = [...onSets[it.id]][0];
    const before = vals(addDays(first, -10), addDays(first, -1), d => score[d] ?? null);
    const after = vals(first, addDays(first, 9), d => score[d] ?? null);
    if (before.length < 5) continue;
    const c = compare(after, before), conf = confidence(c);
    if (c && conf && conf !== "low" && Math.abs(c.diff) >= 1.5) onset.push({ it, first, conf, ...c });
  }

  const poorSleep = d => { const h = num(d.sleep.hours), q = num(d.sleep.quality); return h == null && q == null ? null : (h != null && h < 6.5) || (q != null && q <= 2); };
  const sleepFx = effect(poorSleep, [0, 1]);
  const stressFx = effect(d => num(d.stress) == null ? null : num(d.stress) >= 7, [0, 1]);
  const lateFx = effect(d => d.food.last ? hrs(d.food.last) >= 21 : null, [1]);

  // breath against how the day went
  const bd = dates.filter(d => S.days[d].breath.length && score[d] != null);
  const maxOf = (d, g) => { const v = S.days[d].breath.map(r => num(r[g])).filter(x => x != null); return v.length ? Math.max(...v) : null; };
  const pair = g => { const xs = [], ys = []; bd.forEach(d => { const v = maxOf(d, g); if (v != null) { xs.push(v); ys.push(score[d]); } }); return pearson(xs, ys); };
  const breathR = { ch4: pair("ch4"), h2: pair("h2") };
  const ch4Read = dates.flatMap(d => S.days[d].breath.map(r => ({ d, v: num(r.ch4) }))).filter(x => x.v != null);
  let ch4Trend = null;
  if (ch4Read.length >= 6) {
    const k = Math.max(2, Math.floor(ch4Read.length / 3));
    ch4Trend = { early: mean(ch4Read.slice(0, k).map(x => x.v)), late: mean(ch4Read.slice(-k).map(x => x.v)), from: ch4Read[0].d, to: ch4Read[ch4Read.length - 1].d, n: ch4Read.length };
  }

  // protocol adherence, and whether missed days run worse
  const adherence = {};
  for (const p of S.profile.protocols) {
    if (!p.start || p.start > t || !p.itemIds.length) continue;
    const end = p.end && p.end < t ? p.end : t, on = [], off = [];
    let total = 0, done = 0;
    for (let d = p.start; d <= end; d = addDays(d, 1)) {
      total++;
      const day = S.days[d], all = !!day && p.itemIds.every(id => day.items.some(x => x.id === id));
      if (all) done++;
      const v = [score[d], score[addDays(d, 1)]].filter(x => x != null);
      if (day && v.length) (all ? on : off).push(mean(v));
    }
    adherence[p.id] = { rate: total ? done / total : null, total, done, fx: compare(off, on) };
  }
  return { dates, score, res, itemFx, groupFx, groupFoods, trend, symTrends, habits, onset, sleepFx, stressFx, lateFx, breathR, ch4Trend, adherence, scoredDays: Object.keys(score).length };
}

// ---------- self-tests ----------
// Checklist item names can't contain commas: the protocol sheet splits new items on them.
const EXPERIMENTS = {
  meal_spacing: { name: "Meal spacing", kind: "lifestyle", days: 21, items: ["3 meals spaced 4+ hours apart", "12-hour overnight fast"],
    notes: "Water, plain tea or black coffee between meals is fine. No snacks or sweet drinks between meals. Tick each item on the days you manage it." },
  early_dinner: { name: "Earlier last meal", kind: "lifestyle", days: 14, items: ["Last food 3+ hours before bed"],
    notes: "Finish eating at least 3 hours before bed, and keep the rest of your day as usual." },
  low_histamine: { name: "Low-histamine trial", kind: "diet", days: 14, items: ["Low-histamine eating"],
    notes: "Skip aged cheese, wine and beer, fermented foods, cured or smoked meats, leftovers over a day old, canned fish, spinach, tomato, avocado and chocolate. Fresh-cooked meat and fish, rice and most fresh vegetables are fine. Afterwards, bring foods back one at a time." },
  low_fodmap: { name: "Low-FODMAP phase", kind: "diet", days: 14, items: ["Low-FODMAP eating"],
    notes: "Swap garlic and onion for garlic-infused oil and green onion tops, and skip wheat bread, beans, apples, pears, honey and milk. After 2 weeks, bring back one group every 3 days to find your limits. This isn't meant long-term." },
  low_sulfur: { name: "Lower-sulfur trial", kind: "diet", days: 14, items: ["Lower-sulfur eating"],
    notes: "Cut back eggs, red meat, broccoli, cabbage, kale, cauliflower, garlic and onion, plus sulfur supplements such as NAC, MSM, whey and collagen. Ask before pausing anything prescribed." },
  lower_fat: { name: "Smaller fat portions", kind: "diet", days: 14, items: ["Small fat portions and no fried food"],
    notes: "Keep fat to small portions spread across meals, and skip fried and very rich foods." },
  sleep_window: { name: "Steady sleep window", kind: "lifestyle", days: 14, items: ["In bed within 30 min of target time", "7.5+ hours in bed"],
    notes: "Pick a bedtime you can keep every night, weekends included." },
  vagal: { name: "Vagus nerve practice", kind: "lifestyle", days: 21, items: ["Vagus practice 5 min twice a day"],
    notes: "Five minutes, twice a day: hum, gargle hard, or breathe in for 4 and out for 6. Before meals works well." },
  walk_after_meals: { name: "Walks after meals", kind: "lifestyle", days: 14, items: ["10-minute walk after meals"],
    notes: "A gentle 10-minute walk after each main meal." },
  no_alcohol: { name: "Alcohol pause", kind: "diet", days: 21, items: ["No alcohol"], notes: "No alcohol for 3 weeks, including hard seltzer and cider." },
};
const pauseTest = it => ({ name: `Pause ${it.name}`, kind: "other", days: 14, items: [`No ${it.name.replace(/,/g, "")}`],
  notes: `Leave out ${it.name} for 14 days and keep everything else as steady as you can. Then bring it back for 2 or 3 days and watch for the pattern.${it.cat === "supp" ? " If a clinician prescribed it, ask them first." : ""}` });
const measureName = k => !k || k === "score" ? "day score" : ((S.profile.symptoms.find(s => s.k === k) || {}).name || k).toLowerCase();

function experimentResult(p) {
  const x = p.experiment, t = todayStr();
  if (!x || !p.start) return null;
  const val = d => { const day = S.days[d]; if (!day) return null; if (!x.measure || x.measure === "score") return dayScore(day); const v = day.symptoms[x.measure]; return typeof v === "number" ? v : null; };
  const vals = (a, b) => { const v = []; for (let d = a; d <= b; d = addDays(d, 1)) { const s = val(d); if (s != null) v.push(s); } return v; };
  const length = p.end ? Math.round((parseD(p.end) - parseD(p.start)) / 864e5) + 1 : x.days;
  const end = p.end && p.end < t ? p.end : t;
  const day = p.start > t ? 0 : Math.round((parseD(end) - parseD(p.start)) / 864e5) + 1;
  const status = p.start > t ? "planned" : (p.end && p.end < t) || day >= length ? "done" : "running";
  // skip the first 3 days, while things settle
  const settle = addDays(p.start, 3) <= end ? addDays(p.start, 3) : p.start;
  const base = vals(addDays(p.start, -14), addDays(p.start, -1)), during = p.start > t ? [] : vals(settle, end);
  let done = 0;
  for (let d = p.start; d <= end && day; d = addDays(d, 1)) { const dd = S.days[d]; if (dd && p.itemIds.length && p.itemIds.every(id => dd.items.some(i => i.id === id))) done++; }
  const adherence = day ? done / day : null, c = compare(during, base), conf = confidence(c);
  let verdict = "running", text = `Day ${day} of ${length}`;
  if (status === "planned") text = `Starts ${fmtDate(p.start, { month: "short", day: "numeric" })}`;
  if (status === "done" || day >= 10) {
    if (base.length < 4) { verdict = "nobase"; text = "Not enough logged days before it started to compare"; }
    else if (during.length < 4) { verdict = "few"; text = "Too few logged days during the test"; }
    else if (adherence != null && adherence < 0.6) { verdict = "loose"; text = `Followed on ${done} of ${day} days, too few to judge`; }
    else if (c.diff <= -1 && conf && conf !== "low") { verdict = "helped"; text = `Your ${measureName(x.measure)} dropped from ${r1(c.off)} to ${r1(c.on)}`; }
    else if (c.diff >= 1 && conf && conf !== "low") { verdict = "worse"; text = `Your ${measureName(x.measure)} rose from ${r1(c.off)} to ${r1(c.on)}`; }
    else if (status === "done") { verdict = "nochange"; text = `No clear change in your ${measureName(x.measure)} (${r1(c.off)} before, ${r1(c.on)} during)`; }
  }
  return { status, day, length, adherence, done, base, during, c, verdict, text };
}

// ---------- cross-reference rules ----------
// Each rule reads the context and returns null or a finding. kind: act (try something), ask (raise with a clinician),
// good (working for you), watch (keep an eye on), gap (data that would sharpen the picture).
const NON_ROOT = new Set(["methanogens", "h2s", "sifo", "biofilm", "treatment_mismatch", "parasites"]);
const pct = v => Math.round(v * 100) + "%";
const RULES = [
  function methaneMismatch(X) {
    const { F, B, T } = X;
    const high = (F.ch4_high || 0) >= 0.5 || X.labFlag("breath_ch4") >= 1;
    if (!high) return null;
    const miss = X.anti.filter(x => !targetsMethane(x.p, X.A.map));
    if (!miss.length && (!X.yes("rifaximin_only_methane") || X.protos.some(x => targetsMethane(x.p, X.A.map) && protoStatus(x.p) !== "planned"))) return null;
    const ev = [];
    if (B) ev.push(["Breath", `Methane at or over ${T.ch4} on ${pct(B.pctC)} of ${B.n} readings`]);
    if (X.labFlag("breath_ch4") >= 1) ev.push(["Lab", `Lab breath test methane peak ${S.profile.labs.breath_ch4} ppm`]);
    miss.forEach(x => ev.push(["Protocol", `${x.p.name} has no methane-targeting agent. Result: ${x.s.verdict.toLowerCase()}`]));
    if (X.yes("rifaximin_only_methane")) ev.push(["History", "You said rifaximin alone was used for methane"]);
    return { id: "methane-mismatch", kind: "ask", conf: miss.some(x => x.s.flat || x.s.relapse) ? "high" : "moderate", drivers: ["treatment_mismatch", "methanogens"],
      title: "Your treatment may not be reaching the methane producers",
      summary: "Methane-dominant readings, but the antimicrobials so far don't target methanogens.", evidence: ev,
      why: "Methane in IMO is made by archaea (mostly Methanobrevibacter smithii), not bacteria. Rifaximin on its own clears methane in a minority of people. Studies pairing it with neomycin, and herbal protocols that include allicin, show much higher methane clearance.",
      ask: ["Was my treatment matched to methane? Would rifaximin with neomycin, or an allicin-based protocol, fit me?", "Should we confirm the gas type with a lab breath test?"] };
  },
  function methaneDropping(X) {
    const m = X.st.ch4Trend, mp = X.protos.find(x => targetsMethane(x.p, X.A.map) && x.p.start && x.p.start <= todayStr());
    if (!m || !mp || m.early < X.T.ch4 * 0.75 || m.late > m.early * 0.7) return null;
    return { id: "methane-dropping", kind: "good", conf: m.n >= 10 ? "high" : "moderate", drivers: ["methanogens", "mmc_grazing"],
      title: "Your methane is coming down",
      summary: `Average methane fell from ${r1(m.early)} to ${r1(m.late)} since ${mp.p.name} began.`,
      evidence: [["Breath", `Earliest readings averaged ${r1(m.early)}, latest ${r1(m.late)} (${m.n} readings)`], ["Protocol", `${mp.p.name}: ${mp.s.verdict.toLowerCase()}`]],
      why: "Falling methane during a methane-targeting protocol suggests it's reaching the methanogens. Methane overgrowth tends to return when gut transit stays slow, so plans often add a prokinetic or meal spacing as a round ends.",
      ask: ["What's the plan for motility once this round ends?", "When should I retest?"] };
  },
  function protocolHelped(X) {
    const ok = X.protos.filter(x => x.s.improved && !x.s.relapse);
    if (!ok.length) return null;
    const root = X.ranked.find(r => r.pts > 0 && !NON_ROOT.has(r.d.id));
    return { id: "protocol-helped", kind: "good", conf: "high", drivers: root ? [root.d.id] : [],
      title: ok.length > 1 ? "Your protocols are helping" : `${ok[0].p.name} is helping`,
      summary: `Day score ${r1(ok[0].s.base.mean)} before, ${r1(ok[0].s.late.mean)} in the last week.`,
      evidence: ok.map(x => ["Protocol", `${x.p.name}: ${r1(x.s.base.mean)} in the 2 weeks before, ${r1(x.s.late.mean)} in the latest week`]).concat(root ? [["Research", `Your top-ranked underlying driver: ${root.d.name}`]] : []),
      why: `Clearing an overgrowth and keeping it gone are different jobs. Relapse is common within months when the reason it grew isn't addressed.${root ? ` For you, ${root.d.name.toLowerCase()} ranks highest, so that's where to look next.` : ""}`,
      ask: ["How long should I stay on this, and what's the plan for keeping it from coming back?"] };
  },
  function relapse(X) {
    const { F } = X;
    if (F.relapse !== 1 && !X.yes("relapse_fast")) return null;
    const ev = [];
    X.protos.filter(x => x.s.relapse).forEach(x => ev.push(["Protocol", `${x.p.name} helped (${r1(x.s.base.mean)} to ${r1(x.s.late.mean)}), then back to ${r1(x.s.after.mean)} after stopping`]));
    if (X.yes("relapse_fast")) ev.push(["History", "You said symptoms come back quickly after treatment"]);
    if ((F.constipation || 0) >= 0.5) ev.push(["Journal", FEATURES.constipation]);
    if ((F.grazing || 0) >= 0.5) ev.push(["Journal", FEATURES.grazing]);
    if (!X.protos.some(x => x.p.kind === "prokinetic")) ev.push(["Protocol", "No prokinetic logged after treatment"]);
    if (X.yes("foodpoisoning")) ev.push(["History", "Symptoms started after food poisoning or a stomach bug"]);
    return { id: "relapse", kind: "act", conf: F.relapse === 1 ? "high" : "moderate", drivers: ["mmc_grazing", "post_infectious"], test: "meal_spacing",
      title: "It keeps coming back: look at motility",
      summary: "Improvement that fades after treatment usually means the cause is still there.", evidence: ev,
      why: "The most common reason is a weak migrating motor complex, the cleaning wave that sweeps the small bowel between meals. Studies of prokinetics after treatment show longer remission. Spacing meals so the wave can run is a low-risk way to support it.",
      ask: ["Would a prokinetic after treatment make sense for me (for example low-dose naltrexone, prucalopride, low-dose erythromycin, or ginger with artichoke)?"] };
  },
  function grazing(X) {
    const { F } = X;
    if (F.relapse === 1 || X.yes("relapse_fast")) return null;
    const g = (F.grazing || 0) >= 0.5, gap = (F.overnight_gap_short || 0) >= 0.5, sn = X.yes("snacker");
    if (!g && !gap && !sn) return null;
    const ev = [];
    if (g) ev.push(["Journal", FEATURES.grazing]);
    if (gap) ev.push(["Journal", FEATURES.overnight_gap_short]);
    if (sn) ev.push(["History", "You said you snack or sip sweet drinks between meals"]);
    return { id: "grazing", kind: "act", conf: (g || gap) && sn ? "moderate" : "low", drivers: ["mmc_grazing"], test: "meal_spacing",
      title: "Frequent eating may be stopping your gut's cleaning wave",
      summary: "Spacing meals gives the migrating motor complex time to run.", evidence: ev,
      why: "The migrating motor complex only runs while fasting, roughly every 90 to 120 minutes once the stomach empties. Food or sweet drinks switch it off, so frequent snacking can mean it rarely gets a full cycle in.",
      ask: [] };
  },
  function lateEating(X) {
    const fx = X.st.lateFx;
    if (!fx || fx.diff < 0.8 || !fx.conf || fx.conf === "low") return null;
    return { id: "late-eating", kind: "act", conf: fx.conf, drivers: ["mmc_grazing", "sleep"], test: "early_dinner",
      title: "Late dinners come before worse days",
      summary: `Days after eating past 9 pm run ${r1(fx.diff)} points worse.`,
      evidence: [["Journal", `Last food at 9 pm or later: ${fxText(fx)}`]],
      why: "The strongest cleaning waves run overnight. A late last meal shortens the fast, and for some people it shows up as a worse next day.", ask: [] };
  },
  function histamine(X) {
    const fx = X.st.groupFx.histamine, { F } = X;
    const sup = [];
    if ((F.flushing || 0) >= 0.3) sup.push(["Journal", FEATURES.flushing]);
    if ((F.skin || 0) >= 0.3) sup.push(["Journal", FEATURES.skin]);
    ["wine_headache", "flushing", "mcas", "multiple_reactions"].filter(k => X.yes(k)).forEach(k => sup.push(["History", `You said yes: ${INTAKEMAP[k].q}`]));
    const strong = fx && fx.diff >= 0.8 && fx.conf && fx.conf !== "low";
    if (!strong && sup.length < 2) return null;
    const ev = [];
    if (strong) ev.push(["Journal", `High-histamine foods (${X.st.groupFoods.histamine.slice(0, 4).join(", ")}): ${fxText(fx)}`]);
    const measure = (F.flushing || 0) >= 0.3 ? "flushing" : (F.skin || 0) >= 0.3 ? "skin" : "score";
    return { id: "histamine", kind: "act", conf: strong ? (sup.length ? (fx.conf === "high" ? "high" : "moderate") : fx.conf) : "low", drivers: ["histamine", "mcas"], test: "low_histamine", measure,
      title: "Histamine may be part of your picture",
      summary: strong ? "Worse days follow high-histamine foods." : "Several histamine-type reactions in your history and log.", evidence: ev.concat(sup),
      why: "Some gut bacteria make histamine, and an inflamed gut lining makes less DAO, the enzyme that breaks down histamine from food. Flushing, itching, headaches, or worse days after aged, fermented or leftover foods point this way.",
      ask: ["Could histamine intolerance or mast cell activation be involved? Is a DAO or tryptase test worth doing?"] };
  },
  function fodmap(X) {
    const fx = X.st.groupFx.fodmap;
    if (!fx || fx.diff < 0.8 || !fx.conf || fx.conf === "low") return null;
    return { id: "fodmap", kind: "act", conf: fx.conf, drivers: ["restrictive_diet"], test: "low_fodmap", measure: "bloating",
      title: "Fermentable carbs line up with worse days",
      summary: `High-FODMAP foods: ${r1(fx.diff)} points worse ${LAG_TEXT[fx.lag]}.`,
      evidence: [["Journal", `High-FODMAP foods (${X.st.groupFoods.fodmap.slice(0, 4).join(", ")}): ${fxText(fx)}`]],
      why: "FODMAPs are carbohydrates that gut bacteria ferment. With bacteria higher up in the small bowel, they ferment early, causing gas and bloating within hours. A short low-FODMAP phase can calm symptoms, but it isn't a treatment and isn't meant long-term.",
      ask: [] };
  },
  function h2s(X) {
    const { F } = X, fx = X.st.groupFx.sulfur, lab = X.labFlag("breath_h2s") >= 1;
    const flat = (F.flat_breath || 0) >= 0.5, sym = (F.sulfur || 0) >= 0.3 || X.yes("sulfur_burps"), food = fx && fx.diff >= 0.8 && fx.conf && fx.conf !== "low";
    if (!lab && [flat, sym, food].filter(Boolean).length < 2) return null;
    const ev = [];
    if (lab) ev.push(["Lab", `Lab breath H₂S ${S.profile.labs.breath_h2s} ppm`]);
    if (flat) ev.push(["Breath", FEATURES.flat_breath]);
    if ((F.sulfur || 0) >= 0.3) ev.push(["Journal", FEATURES.sulfur]);
    if (X.yes("sulfur_burps")) ev.push(["History", "You said yes to rotten-egg burps or gas"]);
    if (food) ev.push(["Journal", `High-sulfur foods (${X.st.groupFoods.sulfur.slice(0, 4).join(", ")}): ${fxText(fx)}`]);
    return { id: "h2s", kind: "act", conf: lab ? "high" : food && flat ? "moderate" : "low", drivers: ["h2s"], test: "low_sulfur",
      title: "Signs of hydrogen sulfide overgrowth",
      summary: "Some overgrowths make a gas your FoodMarble can't see.", evidence: ev,
      why: "Some overgrowths make hydrogen sulfide instead of, or as well as, hydrogen and methane. Home devices like the FoodMarble don't measure it, so bad days with flat readings can be a clue. Rotten-egg gas, urgency, and reactions to high-sulfur foods are typical.",
      ask: ["Would a three-gas breath test that includes hydrogen sulfide help?"] };
  },
  function fat(X) {
    const fx = X.st.groupFx.fat, sup = ["fatty_stool", "gallbladder_removed", "pancreatitis"].filter(k => X.yes(k));
    const strong = fx && fx.diff >= 0.8 && fx.conf && fx.conf !== "low", el = X.labFlag("elastase") >= 0.7;
    if (!strong && !sup.length && !el) return null;
    if (!strong && sup.length + (el ? 1 : 0) < 1) return null;
    const ev = [];
    if (strong) ev.push(["Journal", `Fatty meals (${X.st.groupFoods.fat.slice(0, 4).join(", ")}): ${fxText(fx)}`]);
    sup.forEach(k => ev.push(["History", `You said yes: ${INTAKEMAP[k].q}`]));
    if (el) ev.push(["Lab", `Stool elastase ${S.profile.labs.elastase} µg/g`]);
    if (!strong && ev.length < 2) return null;
    return { id: "fat", kind: "ask", conf: strong && ev.length > 1 ? "moderate" : "low", drivers: ["bile", "pancreatic"], test: strong ? "lower_fat" : null,
      title: "Fat digestion may need a look",
      summary: "Bile and pancreatic enzymes help keep the small bowel clean, not just digest fat.", evidence: ev,
      why: "Bile acids and pancreatic enzymes are antimicrobial as well as digestive. When either runs low, fat is poorly absorbed and bacteria meet less resistance in the small bowel.",
      ask: ["Would a stool elastase test or a look at bile flow be useful?"] };
  },
  function itemTriggers(X) {
    const groupNames = new Set(["histamine", "fodmap", "sulfur", "fat", "alcohol"].flatMap(g => X.fired.has(g) ? X.st.groupFoods[g] : []));
    return X.st.itemFx.filter(f => !f.inProtocol && f.diff >= 0.8 && (f.conf === "high" || f.conf === "moderate") && !(f.items.length === 1 && groupNames.has(f.items[0].name)))
      .sort((a, b) => b.t - a.t).slice(0, 3).map(f => {
        const one = f.items.length === 1 ? f.items[0] : null;
        return { id: "item-" + f.ids[0], kind: one && one.cat === "tx" ? "ask" : "act", conf: f.conf, drivers: [], test: one && one.cat !== "tx" ? pauseTest(one) : null,
          title: `${f.name} comes before worse days`, summary: `${r1(f.diff)} points worse ${LAG_TEXT[f.lag]}.`,
          evidence: [["Journal", `${f.name}: ${fxText(f)}`]].concat(f.items.length > 1 ? [["Journal", "These are almost always logged together, so they're judged as one"]] : []),
          why: "A pattern this size could be the item itself, something usually eaten with it, or chance. Pausing it for two weeks, then bringing it back, is the cleanest way to tell.",
          ask: one && one.cat === "tx" ? [`Could ${one.name} be contributing to my symptoms? Is there an alternative?`] : [] };
      });
  },
  function itemHelpers(X) {
    return X.st.itemFx.filter(f => !f.inProtocol && f.diff <= -0.8 && (f.conf === "high" || f.conf === "moderate")).sort((a, b) => a.t - b.t).slice(0, 2).map(f => ({
      id: "help-" + f.ids[0], kind: "good", conf: f.conf, drivers: [],
      title: `${f.name} lines up with better days`, summary: `${r1(Math.abs(f.diff))} points better ${LAG_TEXT[f.lag]}.`,
      evidence: [["Journal", `${f.name}: ${fxText(f)}`]],
      why: "Worth keeping steady while you test other things, so each comparison stays clean.", ask: [] }));
  },
  function onsets(X) {
    return X.st.onset.slice(0, 2).map(o => {
      const worse = o.diff > 0, near = S.profile.library.filter(i => i.id !== o.it.id && X.st.dates.find(d => S.days[d].items.some(x => x.id === i.id)) >= addDays(o.first, -3) && X.st.dates.find(d => S.days[d].items.some(x => x.id === i.id)) <= addDays(o.first, 3));
      return { id: "onset-" + o.it.id, kind: worse ? "watch" : "good", conf: o.conf, drivers: [], test: worse && o.it.cat !== "tx" ? pauseTest(o.it) : null,
        title: worse ? `Things got worse after starting ${o.it.name}` : `Things improved after starting ${o.it.name}`,
        summary: `Day score ${r1(o.off)} in the 10 days before, ${r1(o.on)} in the 10 after.`,
        evidence: [["Journal", `First logged ${fmtDate(o.first, { month: "short", day: "numeric" })}. Day score ${r1(o.off)} before, ${r1(o.on)} after`]].concat(near.length ? [["Journal", `Also started that week: ${near.slice(0, 3).map(i => i.name).join(", ")}`]] : []),
        why: "A change right after starting something is a lead, not proof. Other things may have changed that week too. For a supplement or food, pausing it and watching is the clearest test.", ask: [] };
    });
  },
  function antimicrobialWorse(X) {
    const { F } = X;
    if (F.antimicrobial_worse !== 1 && !X.yes("antimicrobial_worse")) return null;
    const ev = X.anti.filter(x => x.s.worse).map(x => ["Protocol", `${x.p.name}: ${r1(x.s.base.mean)} before, ${r1(x.s.early.mean)} in the first 2 weeks`]);
    if (X.yes("antimicrobial_worse")) ev.push(["History", "You said antimicrobials have made you feel worse before"]);
    if (X.yes("antifungal_helped")) ev.push(["History", "You said an antifungal helped"]);
    return { id: "antimicrobial-worse", kind: "ask", conf: ev.length > 1 ? "moderate" : "low", drivers: X.yes("antifungal_helped") ? ["sifo", "histamine"] : ["histamine", "sifo"],
      title: "Antimicrobials make you feel worse",
      summary: "Worth working out why, rather than assuming it's die-off.", evidence: ev,
      why: "Feeling worse early in a round is often called die-off, but it can also be a reaction to the agent itself, a histamine response, or a sign that something else is involved. People who repeatedly feel worse on antibacterials and better on antifungals sometimes have fungal overgrowth (SIFO).",
      ask: ["Is this a reaction to push through, reduce, or stop?", "Could fungal overgrowth be part of this?"] };
  },
  function notTheBugs(X) {
    const { F } = X;
    if (F.antimicrobial_flat !== 1 && (!X.yes("multiple_failed") || X.protos.some(x => x.s.improved && !x.s.relapse))) return null;
    const roots = X.ranked.filter(r => r.pts > 0 && !NON_ROOT.has(r.d.id)).slice(0, 3);
    const ev = X.anti.filter(x => x.s.flat).map(x => ["Protocol", `${x.p.name}: no clear change (${r1(x.s.base.mean)} before, ${r1(x.s.late.mean)} latest)`]);
    if (X.yes("multiple_failed")) ev.push(["History", "You said several treatments haven't worked"]);
    roots.forEach(r => ev.push(["Research", `${r.d.name}: ${LEVEL_LABEL[r.level].toLowerCase()} for you`]));
    return { id: "not-the-bugs", kind: "ask", conf: roots.length && roots[0].pts >= 3 ? "moderate" : "low", drivers: roots.map(r => r.d.id),
      title: "Treatment isn't the missing piece",
      summary: roots.length ? `Your strongest underlying lead is ${roots[0].d.name.toLowerCase()}.` : "Something may keep recreating the overgrowth.", evidence: ev,
      why: "When rounds of treatment don't move symptoms, the overgrowth may not be the main problem, or something keeps recreating it. Your highest-ranked drivers are the places to look.",
      ask: roots.length ? roots[0].d.tests.slice(0, 2).map(x => `Should we check: ${x}?`) : [] };
  },
  function adherenceLow(X) {
    return X.protos.filter(x => protoStatus(x.p) === "active").map(x => ({ x, a: X.st.adherence[x.p.id] })).filter(({ a }) => a && a.total >= 7 && a.rate < 0.6).slice(0, 1).map(({ x, a }) => {
      const worse = a.fx && a.fx.diff >= 0.8;
      return { id: "adherence-" + x.p.id, kind: "watch", conf: worse ? confidence(a.fx) || "low" : "low", drivers: [],
        title: `${x.p.name} has been on and off`, summary: `All items checked on ${a.done} of ${a.total} days.`,
        evidence: [["Protocol", `Every item checked on ${a.done} of ${a.total} days (${pct(a.rate)})`]].concat(worse ? [["Journal", `Days you missed something ran ${r1(a.fx.diff)} points worse`]] : []),
        why: "A before-and-after comparison only means something if the protocol was actually followed. For antimicrobials, missed doses also lower the effect. If you are taking it and just not ticking it, use Check all on the Today screen.", ask: [] };
    });
  },
  function sleepLink(X) {
    const fx = X.st.sleepFx;
    if (!fx || fx.diff < 0.8 || !fx.conf || fx.conf === "low") return null;
    return { id: "sleep", kind: "act", conf: fx.conf, drivers: ["sleep"], test: "sleep_window",
      title: "Short or poor sleep comes before worse days", summary: `${r1(fx.diff)} points worse ${LAG_TEXT[fx.lag]}.`,
      evidence: [["Journal", `Under 6.5 hours or poor quality: ${fxText(fx)}`]].concat(X.yes("sleep_apnea") ? [["History", "You said yes to signs of sleep apnea"]] : []),
      why: "Sleep shapes gut motility and pain sensitivity, and the strongest cleaning waves happen at night. Short or broken nights often show up as a worse day.",
      ask: X.yes("sleep_apnea") ? ["Should I be tested for sleep apnea?"] : [] };
  },
  function stressLink(X) {
    const fx = X.st.stressFx;
    if (!fx || fx.diff < 0.8 || !fx.conf || fx.conf === "low") return null;
    return { id: "stress", kind: "act", conf: fx.conf, drivers: ["vagal_stress"], test: "vagal",
      title: "High-stress days run worse", summary: `${r1(fx.diff)} points worse ${LAG_TEXT[fx.lag]}.`,
      evidence: [["Journal", `Stress 7 or higher: ${fxText(fx)}`]].concat(X.yes("stress_onset") ? [["History", "Symptoms started around a stressful period"]] : []),
      why: "Stress slows the migrating motor complex and raises gut sensitivity through the gut–brain axis. Vagus nerve practices like humming, gargling and slow breathing are low-risk to try.", ask: [] };
  },
  function breathTracks(X) {
    const r = X.st.breathR.ch4, h = X.st.breathR.h2, { F } = X, out = [];
    if (r && r.r >= 0.4) out.push({ id: "ch4-tracks", kind: "watch", conf: r.n >= 10 ? "moderate" : "low", drivers: ["methanogens"],
      title: "Your methane tracks how you feel", summary: "Higher-methane days are your worse days.",
      evidence: [["Breath", `Methane and day score move together (r = ${r1(r.r)}, ${r.n} days)`]],
      why: "That supports methane as a main driver of your symptoms, so methane-targeting treatment and motility support are the right lens.", ask: [] });
    else if (r && r.n >= 8 && r.r <= 0.1 && (F.ch4_high || 0) >= 0.5) out.push({ id: "ch4-not-tracking", kind: "watch", conf: "low", drivers: ["h2s", "vagal_stress"],
      title: "Your methane doesn't track your bad days", summary: "Methane runs high, but your worst days aren't the high-methane ones.",
      evidence: [["Breath", `Little link between methane and day score (r = ${r1(r.r)}, ${r.n} days)`]],
      why: "Methane may still matter, but something else is likely shaping day-to-day symptoms: food reactions, hydrogen sulfide, sensitivity, or stress.", ask: [] });
    if (h && h.r >= 0.4) out.push({ id: "h2-tracks", kind: "watch", conf: h.n >= 10 ? "moderate" : "low", drivers: [],
      title: "Your hydrogen tracks how you feel", summary: "Higher-hydrogen days are your worse days.",
      evidence: [["Breath", `Hydrogen and day score move together (r = ${r1(h.r)}, ${h.n} days)`]],
      why: "That fits hydrogen-producing bacteria as a main driver. Logging what you ate before high readings can point to specific foods.", ask: [] });
    return out;
  },
  function methaneConstipation(X) {
    const { F } = X;
    if (X.fired.has("methane-mismatch") || (F.ch4_high || 0) < 0.5 || (F.constipation || 0) < 0.5) return null;
    const ev = [["Breath", FEATURES.ch4_high], ["Journal", FEATURES.constipation]];
    if ((F.incomplete || 0) >= 0.5) ev.push(["Journal", FEATURES.incomplete]);
    if (X.yes("digital_assist")) ev.push(["History", "You said you sometimes need help to empty"]);
    const tsh = num(S.profile.labs.tsh);
    if (tsh != null && tsh >= 2.5) ev.push(["Lab", `TSH ${tsh}`]);
    return { id: "methane-constipation", kind: "ask", conf: "moderate", drivers: ["methanogens", (F.incomplete || 0) >= 0.5 || X.yes("digital_assist") ? "pelvic_floor" : "hypothyroid"], test: "walk_after_meals",
      title: "Methane and constipation together", summary: "The classic IMO pattern: methane slows transit, and slow transit feeds methane.", evidence: ev,
      why: "Methane itself slows gut transit, and slow transit gives methanogens more time to grow, so the two feed each other. Thyroid function and pelvic floor coordination are common reasons the cycle won't break.",
      ask: ["Is my thyroid function optimal?", (F.incomplete || 0) >= 0.5 ? "Could pelvic floor dyssynergia be part of this? Would an anorectal test or pelvic floor physio help?" : "What can speed my transit safely?"] };
  },
  function cycle(X) {
    if ((X.F.cycle_flares || 0) < 0.5 && !X.yes("cycle_flares")) return null;
    const ev = [];
    if ((X.F.cycle_flares || 0) >= 0.5) ev.push(["Journal", FEATURES.cycle_flares]);
    if (X.yes("cycle_flares")) ev.push(["History", "You said symptoms change with your cycle"]);
    if (X.yes("painful_periods")) ev.push(["History", "You said yes to painful periods"]);
    return { id: "cycle", kind: "ask", conf: ev.length > 1 ? "moderate" : "low", drivers: X.yes("painful_periods") ? ["endometriosis", "hormones"] : ["hormones"],
      title: "Your symptoms follow your cycle", summary: "Flares cluster in the days before your period.", evidence: ev,
      why: "Progesterone in the second half of the cycle slows gut transit, and prostaglandins around the period speed it up, so cycle-linked flares are common. Painful periods alongside gut symptoms are worth raising, since endometriosis can involve the bowel.",
      ask: X.yes("painful_periods") ? ["Could endometriosis be involved?"] : ["Is there a way to support the days before my period?"] };
  },
  function thyroid(X) {
    const tsh = num(S.profile.labs.tsh), ft3 = num(S.profile.labs.ft3), { F } = X;
    const lab = (tsh != null && tsh >= 2.5) || (ft3 != null && ft3 < 3);
    if (!lab) return null;
    const ev = [];
    if (tsh != null && tsh >= 2.5) ev.push(["Lab", `TSH ${tsh} mIU/L (many clinicians aim under about 2.5)`]);
    if (ft3 != null && ft3 < 3) ev.push(["Lab", `Free T3 ${ft3} pg/mL`]);
    if ((F.constipation || 0) >= 0.5) ev.push(["Journal", FEATURES.constipation]);
    if (X.yes("cold_intol")) ev.push(["History", "You said you often feel cold"]);
    if ((F.ch4_high || 0) >= 0.5) ev.push(["Breath", FEATURES.ch4_high]);
    if (ev.length < 2) return null;
    return { id: "thyroid", kind: "ask", conf: ev.length >= 3 ? "moderate" : "low", drivers: ["hypothyroid"],
      title: "Thyroid may be slowing things down", summary: "Thyroid hormone sets the pace of gut motility.", evidence: ev,
      why: "Low or low-normal thyroid function is linked to slower transit and SIBO, especially methane. A TSH in range isn't always optimal.",
      ask: ["Is my thyroid function optimal, not just in range? Could we run a full panel (TSH, free T3, free T4, antibodies)?"] };
  },
  function nutrients(X) {
    const low = ["ferritin", "b12", "vitd", "zinc"].filter(k => X.labFlag(k) >= 0.5);
    if (!low.length) return null;
    return { id: "nutrients", kind: "ask", conf: low.some(k => X.labFlag(k) >= 1) ? "high" : "moderate", drivers: ["nutrients"],
      title: low.length > 1 ? "Some nutrient levels are low" : `${LABMAP[low[0]].name} is low`, summary: "Low nutrients slow healing and can feed fatigue and brain fog.",
      evidence: low.map(k => ["Lab", `${LABMAP[k].name}: ${S.profile.labs[k]} ${LABMAP[k].unit}. ${LABMAP[k].hint}`]),
      why: "Overgrowth can compete for B12 and iron, and inflammation lowers absorption. Low iron, zinc and vitamin D also affect gut lining repair and immune defense.",
      ask: ["Should these be repleted, and in what form?"] };
  },
  function acid(X) {
    if (X.F.ppi_logged !== 1 && !X.yes("ppi")) return null;
    return { id: "ppi", kind: "ask", conf: "moderate", drivers: ["ppi"],
      title: "Acid suppression lowers a key defense", summary: "Stomach acid helps keep bacteria out of the small bowel.",
      evidence: [X.F.ppi_logged === 1 ? ["Journal", FEATURES.ppi_logged] : ["History", "You said you take or took acid-reducing medication"]],
      why: "Stomach acid is one of the main barriers keeping bacteria out of the small bowel. Long-term acid suppression is linked to a higher SIBO risk in studies. Don't stop it on your own: stopping suddenly can cause rebound reflux.",
      ask: ["Do I still need acid suppression? If not, how should I taper it safely?"] };
  },
  function opioids(X) {
    if (X.F.opioid_logged !== 1 && !X.yes("opioids")) return null;
    return { id: "opioids", kind: "ask", conf: "moderate", drivers: ["opioids"],
      title: "A medication may be slowing your gut", summary: "Opioids and loperamide slow the cleaning wave.",
      evidence: [X.F.opioid_logged === 1 ? ["Journal", FEATURES.opioid_logged] : ["History", "You said you take an opioid or loperamide"]],
      why: "Opioids, including loperamide (Imodium), act directly on gut nerves and slow transit, which gives bacteria more time to build up.",
      ask: ["Are there alternatives that affect gut motility less?"] };
  },
  function postInfectious(X) {
    if (!X.yes("foodpoisoning") || X.labFlag("vinculin") >= 1 || X.labFlag("cdtb") >= 1) return null;
    if (X.F.relapse !== 1 && !X.yes("relapse_fast") && !X.yes("multiple_failed")) return null;
    if (S.profile.labs.vinculin != null && S.profile.labs.vinculin !== "") return null;
    return { id: "post-infectious", kind: "ask", conf: "moderate", drivers: ["post_infectious"],
      title: "A stomach bug may have started this", summary: "Post-infectious nerve damage would explain overgrowth that keeps returning.",
      evidence: [["History", "Symptoms started after food poisoning or a stomach bug"], X.F.relapse === 1 ? ["Protocol", FEATURES.relapse] : ["History", "Treatment hasn't held"]],
      why: "After some gut infections, the body makes antibodies (anti-CdtB and anti-vinculin) that also damage the nerves running the migrating motor complex. That can explain overgrowth that keeps coming back, and why ongoing motility support matters.",
      ask: ["Would an anti-CdtB and anti-vinculin blood test (ibs-smart) be useful for me?"] };
  },
  function dysautonomia(X) {
    const d = (X.F.dizzy || 0) >= 0.3 || X.yes("heart_racing_standing"), ctx = ["pots", "eds", "hypermobile"].some(k => X.yes(k));
    if (!d || !ctx) return null;
    return { id: "dysautonomia", kind: "ask", conf: "moderate", drivers: ["dysautonomia", "eds"],
      title: "Your nervous system may be slowing digestion", summary: "Dizziness on standing alongside hypermobility or POTS.",
      evidence: [(X.F.dizzy || 0) >= 0.3 ? ["Journal", FEATURES.dizzy] : ["History", "You said your heart races when you stand"]].concat(["pots", "eds", "hypermobile"].filter(k => X.yes(k)).map(k => ["History", `You said yes: ${INTAKEMAP[k].q}`])),
      why: "POTS and other dysautonomia affect the nerves that run digestion, often slowing the stomach and small bowel. It's common alongside hypermobility.",
      ask: ["Would a tilt-table or active stand test make sense?"] };
  },
  function alcohol(X) {
    const fx = X.st.groupFx.alcohol, strong = fx && fx.diff >= 0.8 && fx.conf && fx.conf !== "low";
    if (!strong && (X.F.alcohol_logged || 0) < 0.5) return null;
    return { id: "alcohol", kind: "act", conf: strong ? fx.conf : "low", drivers: ["alcohol"], test: "no_alcohol",
      title: strong ? "Alcohol comes before worse days" : "Alcohol is a regular part of your week", summary: strong ? `${r1(fx.diff)} points worse ${LAG_TEXT[fx.lag]}.` : "Even moderate drinking can affect gut motility.",
      evidence: [strong ? ["Journal", `Alcohol (${X.st.groupFoods.alcohol.slice(0, 3).join(", ")}): ${fxText(fx)}`] : ["Journal", FEATURES.alcohol_logged]],
      why: "Alcohol slows the migrating motor complex, irritates the gut lining and is linked to SIBO in studies, even at moderate amounts.", ask: [] };
  },
  function trend(X) {
    const tr = X.st.trend;
    if (!tr || !tr.conf || tr.conf === "low" || Math.abs(tr.diff) < 1) return null;
    const t = todayStr(), since = addDays(t, -27), better = tr.diff < 0;
    const started = X.protos.filter(x => x.p.start >= since && x.p.start <= t).map(x => x.p.name);
    const ended = X.protos.filter(x => x.p.end && x.p.end >= since && x.p.end <= t).map(x => x.p.name);
    const syms = X.st.symTrends.filter(s => better ? s.diff <= -1 : s.diff >= 1).sort((a, b) => better ? a.diff - b.diff : b.diff - a.diff).slice(0, 3);
    const ev = [["Trend", `Average day score ${r1(tr.off)} two weeks ago, ${r1(tr.on)} in the last 14 days`]];
    if (syms.length) ev.push(["Trend", `${better ? "Most improved" : "Rising most"}: ${syms.map(s => `${s.name.toLowerCase()} (${r1(s.off)} to ${r1(s.on)})`).join(", ")}`]);
    if (started.length) ev.push(["Protocol", `Started in this window: ${started.join(", ")}`]);
    if (ended.length) ev.push(["Protocol", `Ended in this window: ${ended.join(", ")}`]);
    const [s0, s1] = X.st.habits.sleep, [t0, t1] = X.st.habits.stress;
    if (s0 != null && s1 != null && Math.abs(s1 - s0) >= 0.7) ev.push(["Journal", `Sleep averaged ${r1(s0)} hours, now ${r1(s1)}`]);
    if (t0 != null && t1 != null && Math.abs(t1 - t0) >= 1.5) ev.push(["Journal", `Stress averaged ${r1(t0)}, now ${r1(t1)}`]);
    X.st.onset.filter(o => o.first >= since).forEach(o => ev.push(["Journal", `Started ${o.it.name} on ${fmtDate(o.first, { month: "short", day: "numeric" })}`]));
    return { id: better ? "trend-better" : "trend-worse", kind: better ? "good" : "watch", conf: tr.conf, drivers: [],
      title: better ? "You're doing better than two weeks ago" : "The last two weeks have been harder",
      summary: `Average day score ${r1(tr.off)} before, ${r1(tr.on)} now.`, evidence: ev,
      why: better ? "Whatever changed in this window is worth keeping steady while it settles." : (ev.length > 1 ? "These are the changes in the same window, the first places to look." : "Nothing else in your log changed in this window. Check things the journal doesn't capture: illness, travel, a new routine."),
      ask: [] };
  },
];

// data that would sharpen everything else
function gapInsights(X) {
  const out = [], answered = INTAKE.filter(q => S.profile.intake[q.k]).length;
  // unanswered history questions carrying the most weight across the drivers that already have some signal
  const pool = X.ranked.filter(r => r.pts > 0).length ? X.ranked.filter(r => r.pts > 0) : X.ranked;
  const w = {};
  pool.forEach(r => r.d.signals.forEach(s => { if (s.k[0] === "i" && !S.profile.intake[s.k.slice(2)]) w[s.k.slice(2)] = (w[s.k.slice(2)] || 0) + s.w; }));
  // with nothing to go on yet, start where the history form starts: how it began
  const qs = (X.ranked.some(r => r.pts > 0) ? Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k]) => INTAKEMAP[k]) : INTAKE.filter(q => !S.profile.intake[q.k])).filter(Boolean).slice(0, 3);
  if (qs.length) out.push({ id: "gap-history", kind: "gap", drivers: [], link: "history",
    title: answered < 20 ? `Answer your health history (${answered} of ${INTAKE.length})` : "A few history questions would sharpen this",
    summary: `Most useful next: ${qs[0].q}`, evidence: qs.map(q => ["History", q.q]),
    why: "Many drivers can only be judged from your history. These questions carry the most weight for the drivers that already show a signal.", ask: [] });
  if (X.st.scoredDays < 14) out.push({ id: "gap-days", kind: "gap", drivers: [],
    title: `Log ${14 - X.st.scoredDays} more days to unlock food patterns`, summary: "Comparing days needs about two weeks of ratings.",
    evidence: [["Journal", `${X.st.scoredDays} days with a rating or symptom scores so far`]],
    why: "Each pattern compares days with and without something, against the two weeks around them. Below about two weeks, chance looks like a pattern.", ask: [] });
  if (!X.B && X.st.scoredDays >= 5) out.push({ id: "gap-breath", kind: "gap", drivers: [],
    title: "Add a few breath readings", summary: "Your gas type changes which drivers and treatments fit.",
    evidence: [["Breath", "No FoodMarble readings logged yet"]],
    why: "Hydrogen, methane and flat-line patterns point to different drivers and different treatments. A fasting reading plus readings 30, 60 and 90 minutes after a meal, on a few days, is enough to start.", ask: [] });
  if (X.st.scoredDays >= 7 && Object.values(S.days).filter(d => d.bms.length || d.noBM).length < 5) out.push({ id: "gap-bm", kind: "gap", drivers: [],
    title: "Log bowel movements", summary: "Stool form is one of the clearest motility signals.",
    evidence: [["Journal", "Fewer than 5 days with BMs logged"]],
    why: "Hard stools, missed days or loose stools separate methane and motility drivers from hydrogen-type and digestive ones.", ask: [] });
  return out;
}

const KIND_W = { act: 1, ask: 0.95, good: 0.8, watch: 0.7, gap: 0.35 };
const CONF_W = { high: 1, moderate: 0.8, low: 0.5 };
let insightMemo = null;
function buildInsights() {
  if (insightMemo) return insightMemo;
  const A = analyze(), ranked = scoreDrivers(A.F), map = A.map;
  const protos = A.protoStats.map(x => ({ ...x, anti: isAntimicrobial(x.p, map) }));
  const X = { A, F: A.F, B: A.breathSummary, T: thresholds(), ranked, st: dayStats(), protos, anti: protos.filter(x => x.anti && x.s.base.mean != null), fired: new Set(),
    yes: k => S.profile.intake[k] === "y", labFlag: k => { const l = LABMAP[k], v = num(S.profile.labs[k]); return l && v != null ? l.flag(v) : 0; } };
  const all = [];
  for (const rule of RULES) {
    let r = null;
    try { r = rule(X); } catch (e) { console.warn("insight rule failed", rule.name, e); }
    for (const x of [].concat(r || [])) { all.push(x); X.fired.add(x.id); }
  }
  all.push(...gapInsights(X));
  // a food-group finding already covers single foods from that group
  const covered = new Set(["histamine", "fodmap", "sulfur", "fat", "alcohol"].filter(g => X.fired.has(g)).flatMap(g => X.st.groupFoods[g]));
  for (let i = all.length - 1; i >= 0; i--) if (/^item-/.test(all[i].id) && covered.has(all[i].title.replace(/ comes before worse days$/, ""))) all.splice(i, 1);
  // a test keeps its insight on the list even after the pattern that prompted it fades (often because of the test itself)
  const have = new Set(all.map(x => x.id));
  for (const p of S.profile.protocols) {
    const e = p.experiment;
    if (!e || have.has(e.insight)) continue;
    have.add(e.insight);
    all.push({ id: e.insight, kind: "watch", conf: null, drivers: [], title: e.title || p.name, summary: p.name, evidence: [["Protocol", `You started ${p.name} on ${fmtDate(p.start, { month: "short", day: "numeric" })} to test this`]],
      why: "The pattern that prompted this test no longer stands out in your recent data. Your test result is now the best evidence.", ask: [],
      test: { name: p.name, kind: p.kind, days: e.days, items: p.itemIds.map(id => map[id] && map[id].name).filter(Boolean), notes: p.notes || "" }, measure: e.measure });
  }
  const hidden = new Set(S.profile.hiddenInsights || []);
  for (const x of all) {
    x.spec = typeof x.test === "string" ? EXPERIMENTS[x.test] : x.test || null;
    if (x.spec) x.spec = { ...x.spec, measure: x.measure || "score" };
    // the latest self-test for this insight, if any, confirms or weakens it
    x.exp = [...S.profile.protocols].filter(p => p.experiment && p.experiment.insight === x.id).sort((a, b) => (b.start || "").localeCompare(a.start || ""))[0] || null;
    x.result = x.exp ? experimentResult(x.exp) : null;
    let s = KIND_W[x.kind] * (CONF_W[x.conf] || 0.7);
    if (x.result && x.result.verdict === "helped") { x.kind = "good"; x.confirmed = true; s = 0.9; }
    if (x.result && (x.result.verdict === "nochange" || x.result.verdict === "worse")) { x.weakened = true; s *= 0.4; }
    if (x.result && x.result.status === "running") s = Math.max(s, 0.85);
    x.score = s;
    x.hidden = hidden.has(x.id);
  }
  all.sort((a, b) => b.score - a.score);
  insightMemo = { list: all, X };
  setTimeout(() => { insightMemo = null; }, 0); // one computation per render pass
  return insightMemo;
}

// ---------- screens ----------
const INSIGHT_SECTIONS = [["act", "Try next"], ["ask", "Ask your clinician"], ["good", "Working for you"], ["watch", "Keep an eye on"], ["gap", "Sharpen the picture"]];
function insightSub(x) {
  if (x.result && x.result.status !== "done" && x.result.verdict === "running") return `Testing now · ${x.result.text}`;
  if (x.confirmed) return `Your test confirmed it · ${esc(x.result.text)}`;
  if (x.weakened) return `Your test didn't support it · ${esc(x.result.text)}`;
  return `${x.conf ? `<span class="conf ${x.conf}">${CONF_LABEL[x.conf]}</span> · ` : ""}${esc(x.summary)}`;
}
const insightRow = x => navRow({ label: esc(x.title), sub: insightSub(x), act: "push", attrs: `data-k="insight" data-id="${esc(x.id)}"`, cls: `insight-row k-${x.kind}` });

function viewInsights() {
  const { list, X } = buildInsights(), A = X.A, ranked = X.ranked;
  const answered = INTAKE.filter(q => S.profile.intake[q.k]).length, T = X.T;
  const vis = list.filter(x => !x.hidden), hiddenN = list.length - vis.length;
  let h = largeTitle("Insights", `From ${answered} of ${INTAKE.length} history answers, ${A.days.length} journal day${A.days.length === 1 ? "" : "s"} and ${S.profile.protocols.length} protocol${S.profile.protocols.length === 1 ? "" : "s"}`);

  // this week: the three most useful things right now
  const top = vis.filter(x => x.kind !== "gap").slice(0, 3);
  const tr = X.st.trend;
  const line = tr ? `<div class="row week-line"><span class="row-main"><span class="row-label strong">${tr.diff <= -1 ? "Better than two weeks ago" : tr.diff >= 1 ? "Harder than two weeks ago" : "About the same as two weeks ago"}</span><span class="row-sub">Average day score ${r1(tr.off)} then, ${r1(tr.on)} now (0 is best)</span></span></div>` : "";
  if (top.length || line) h += group("This week", line + top.map(insightRow).join(""), "Each insight shows the evidence behind it. Open one to see why it matters and how to test it.", "week-group");
  else h += group("This week", `<div class="row"><span class="row-sub">Insights appear as your journal, history and protocols build up. A week of logging plus your health history is enough for the first ones.</span></div>`);

  const shown = new Set(top.map(x => x.id));
  for (const [k, name] of INSIGHT_SECTIONS) {
    const xs = vis.filter(x => x.kind === k && !shown.has(x.id));
    if (xs.length) h += group(name, xs.map(insightRow).join(""));
  }
  if (hiddenN) h += group("", `<button type="button" class="row action" data-act="unhideInsights"><span class="row-label">Show ${hiddenN} hidden insight${hiddenN > 1 ? "s" : ""}</span></button>`);

  // drivers
  const drv = ranked.filter(r => r.pts > 0), rest = ranked.filter(r => r.pts <= 0);
  h += group("Likely drivers", drv.length ? drv.map(r => `<button type="button" class="row nav driver-row lvl-${r.level}" data-act="push" data-k="driver" data-id="${r.d.id}">
      <span class="meter" aria-hidden="true"><i style="height:${Math.max(8, clamp(r.pts / 8) * 100)}%"></i></span>
      <span class="row-main"><span class="row-label">${esc(r.d.name)}</span><span class="row-sub"><span class="lvl">${LEVEL_LABEL[r.level]}</span> · ${esc(r.d.cat)} ${gasTags(r.d.gas)}</span></span>${icon("chevR", "chev")}</button>`).join("")
    : `<div class="row"><span class="row-sub">No drivers have signals yet. Answer your history and log for a week or two.</span></div>`,
    "This points you to questions for a clinician. It isn't a diagnosis.");
  if (rest.length) h += group("", navRow({ label: `${rest.length} drivers with no signal yet`, act: "push", attrs: `data-k="nosignal"` }));

  // breath
  const B = X.B;
  if (B) {
    const dom = B.pctC >= 0.4 ? "Methane-dominant (IMO pattern)" : B.early != null && B.early >= 0.4 ? "Early hydrogen rise (SIBO pattern)" : B.flat != null && B.flat >= 0.4 ? "Flat line on bad days (possible hydrogen sulfide)" : B.pctH >= 0.4 ? "Hydrogen often elevated" : "No dominant pattern yet";
    h += group("Breath pattern", `<div class="row"><span class="row-label strong">${dom}</span></div>
      <div class="row gas-tiles"><div class="gt h2"><span class="cmp-k">H₂ avg / peak</span><span class="cmp-v">${r1(B.avgH)} / ${r1(B.maxH)}</span><span class="cmp-n">${Math.round(B.pctH * 100)}% at or over ${T.h2}</span></div>
        <div class="gt ch4"><span class="cmp-k">CH₄ avg / peak</span><span class="cmp-v">${r1(B.avgC)} / ${r1(B.maxC)}</span><span class="cmp-n">${Math.round(B.pctC * 100)}% at or over ${T.ch4}</span></div></div>`,
      `${B.n} readings over ${B.days} days.${B.early != null ? ` Early H₂ rise on ${Math.round(B.early * 100)}% of after-meal tests.` : ""} A home device is a guide, not a lab test.`);
  }

  // item patterns, adjusted for slow trends and for things taken together
  const fx = X.st.itemFx.filter(f => f.conf);
  const trig = fx.filter(f => f.diff >= 0.5).sort((a, b) => b.t - a.t).slice(0, 5), help = fx.filter(f => f.diff <= -0.5).sort((a, b) => a.t - b.t).slice(0, 5);
  const liftRow = (f, cls) => `<div class="row lift-row"><span class="row-main"><span class="row-label">${esc(f.name)}</span><span class="row-sub">${LAG_TEXT[f.lag]} · ${CONF_LABEL[f.conf].toLowerCase()}</span></span><span class="liftbar ${cls}"><i style="width:${clamp(Math.abs(f.diff) / 4) * 100}%"></i></span><span class="lift-v ${cls}">${f.diff > 0 ? "+" : ""}${r1(f.diff)}</span></div>`;
  if (X.st.scoredDays >= 14) {
    h += group("Before worse days", trig.map(f => liftRow(f, "bad")).join("") || `<div class="row"><span class="row-sub">Nothing stands out yet</span></div>`);
    h += group("Before better days", help.map(f => liftRow(f, "good")).join("") || `<div class="row"><span class="row-sub">Nothing stands out yet</span></div>`,
      "Change in day score when an item is logged, compared with the two weeks around it, at the delay where it shows most. Items you always log together are judged as one.");
  }
  if (Store.sample) h += group("Ask Claude", `<div class="row ai-row"><span class="row-sub">Sends a summary of your history, insights, rankings, breath pattern and protocol results, and asks for a plain-language read plus questions for your clinician.</span>
      <button type="button" class="btn filled" data-act="askAI" ${UI.aiBusy ? "disabled" : ""}>${icon("spark")}${UI.aiBusy ? "Reading your journal…" : UI.aiText ? "Ask again" : "Read my journal"}</button>
      <div id="aiout" class="aiout" ${UI.aiText ? "" : "hidden"}></div></div>`);
  return h;
}

const KIND_TAG = { act: "Try next", ask: "Ask your clinician", good: "Working for you", watch: "Keep an eye on", gap: "Sharpen the picture" };
function findInsight(id) { return buildInsights().list.find(x => x.id === id) || null; }
function viewInsight(p) {
  const x = findInsight(p.id);
  if (!x) return `<div class="spacer"></div>` + group("", `<div class="row"><span class="row-sub">This insight no longer applies to your latest data.</span></div>`);
  let h = `<div class="detail-head" id="large-title"><h1>${esc(x.title)}</h1><div class="tagline"><span class="tag">${KIND_TAG[x.kind]}</span>${x.conf ? `<span class="conf ${x.conf}">${CONF_LABEL[x.conf]}</span>` : ""}</div></div>`;
  h += group("What your data shows", x.evidence.map(([src, text]) => `<div class="row why-row"><span class="src">${esc(src)}</span><span class="row-label">${esc(text)}</span></div>`).join(""));
  h += group("Why it matters", `<div class="row prose">${esc(x.why)}</div>`, "Summaries of published research and clinical consensus.");
  if (x.spec) {
    const sp = x.spec, r = x.result;
    if (r && r.status !== "done" && r.verdict === "running") h += group("Your test", `<div class="row"><span class="row-main"><span class="row-label strong">${esc(x.exp.name)}</span><span class="row-sub">${esc(r.text)} · every item checked on ${r.done} day${r.done === 1 ? "" : "s"}</span></span></div>
        <div class="row"><span class="row-sub">Tick its items on Today each day. The result appears here after about 10 days.</span></div>`, "", "test-group");
    else if (r) h += group("Your test", `<div class="row verdict ${r.verdict === "helped" ? "good" : r.verdict === "worse" ? "bad" : ""}"><span class="row-main"><span class="row-label strong">${esc(x.exp.name)}</span><span class="row-sub">${esc(r.text)}</span></span></div>
        ${r.status === "done" ? `<button type="button" class="row action" data-act="startTest" data-id="${esc(x.id)}">${icon("plus", "lead")}<span class="row-label">Run it again</span></button>` : ""}`,
        r.verdict === "helped" ? "Bring things back one at a time to confirm. If symptoms return, that's your answer." : r.verdict === "nochange" ? "This lowers the chance it's a main driver for you, so the insight moves down the list." : "", "test-group");
    else h += group("Test it yourself", `<div class="row"><span class="row-main"><span class="row-label strong">${esc(sp.name)}, ${sp.days} days</span><span class="row-sub">${esc(sp.notes)}</span></span></div>
        <div class="row"><span class="row-sub">Daily checklist: ${esc(sp.items.join("; "))}</span></div>
        <div class="row ai-row"><button type="button" class="btn filled" data-act="startTest" data-id="${esc(x.id)}">Start this test</button></div>`,
      `It becomes a protocol with a daily checklist. The app compares your ${measureName(sp.measure)} in the 2 weeks before with the days during, skipping the first 3 days.${X_BASE_NOTE()}`, "test-group");
  }
  if (x.ask && x.ask.length) h += group("Ask your clinician", x.ask.map(q => `<div class="row"><span class="row-label">${esc(q)}</span></div>`).join(""));
  const ds = (x.drivers || []).map(id => DRIVERS.find(d => d.id === id)).filter(Boolean);
  if (ds.length) h += group("Related drivers", ds.map(d => navRow({ label: esc(d.name), sub: esc(d.cat), act: "push", attrs: `data-k="driver" data-id="${d.id}"` })).join(""));
  if (x.link === "history") h += group("", navRow({ label: "Open your health history", act: "push", attrs: `data-k="history"` }));
  h += group("", `<button type="button" class="row action" data-act="hideInsight" data-id="${esc(x.id)}"><span class="row-label">Hide this insight</span></button>`, "This points to things to test and questions for a clinician. It isn't a diagnosis.");
  return h;
}
function X_BASE_NOTE() {
  let n = 0;
  for (let i = 1; i <= 14; i++) if (dayScore(S.days[addDays(todayStr(), -i)]) != null) n++;
  return n < 4 ? " You have only a few logged days in the last 2 weeks, so the comparison will be weak. Logging for a few days first helps." : "";
}

function startTest(id) {
  const x = findInsight(id);
  if (!x || !x.spec) return;
  const sp = x.spec, start = todayStr();
  openSheet({ k: "proto", ed: { name: sp.name, kind: sp.kind, start, end: addDays(start, sp.days - 1), itemIds: [], notes: sp.notes, newitem: sp.items.join(", "), newcat: "practice",
    experiment: { insight: x.id, measure: sp.measure, days: sp.days, title: x.title } } });
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  switch (t.dataset.act) {
    case "startTest": startTest(t.dataset.id); break;
    case "hideInsight": S.profile.hiddenInsights = [...new Set([...(S.profile.hiddenInsights || []), t.dataset.id])]; Store.saveProfile(); goBack(); toast("Hidden. You can bring it back from Insights."); break;
    case "unhideInsights": S.profile.hiddenInsights = []; Store.saveProfile(); render(); break;
  }
});
