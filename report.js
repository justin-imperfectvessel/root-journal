/* Case File — report for AI: one self-contained plain-text (Markdown) report to paste into any AI chat.
   Part 1 tells the AI how to help and what its first reply should look like; Part 2 is the research
   behind the app, filtered to this person; Part 3 explains terms; Part 4 is the data.
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
  L.push(`#### ${date} (${fmtDate(date, { weekday: "short" })})${sc == null ? "" : ` · day score ${r1(sc)}`}`);
  if (typeof d.overall === "number") L.push(`- Overall gut day: ${d.overall}/10`);
  if (syms.length) L.push(`- Symptoms (0–10): ${syms.join(", ")}`);
  // food by meal, in the order eaten
  const amount = (e, it) => hasNutrition(it) ? ` (${fmtQU(entryQU(e, it).q, entryQU(e, it).u)})` : "";
  const foods = es => es.map(e => map[e.id] && map[e.id].name + amount(e, map[e.id])).filter(Boolean).join(", ");
  const ms = dayMeals(d), gaps = mealGapsOf(d), night = overnightFast(date);
  for (const m of ms) L.push(`- ${MEAL_ONE[m.type]}${m.time ? ` ${m.time}` : ""}: ${foods(mealFoods(d, m.id)) || "(no foods listed)"}`);
  const loose = d.items.filter(e => !e.mid && map[e.id] && map[e.id].cat === "food");
  if (loose.length) L.push(`- Food, no meal given: ${loose.map(e => map[e.id].name + amount(e, map[e.id]) + (e.time ? ` at ${e.time}` : "")).join(", ")}`);
  const lf = dayLfd(d, map);
  if (lf.avoid || lf.limit) L.push(`- Low Fermentation Diet: ${[lf.avoidNames.length ? `avoid: ${[...new Set(lf.avoidNames)].join(", ")}` : "", lf.limitNames.length ? `limit: ${[...new Set(lf.limitNames)].join(", ")}` : ""].filter(Boolean).join("; ")} (everything else fits or isn't rated)`);
  if (gaps.length || night != null) L.push(`- Meal timing: ${[gaps.length ? `gaps ${gaps.map(fmtGap).join(", ")}` : "", night != null ? `overnight fast ${fmtGap(night)}` : ""].filter(Boolean).join("; ")}`);
  const x = dayNutrition(d, map);
  if (x.ok) L.push(`- Nutrition (${Math.round(x.cover * 100)}% of foods measured): ${fmtN(x.tot.kcal)} kcal, protein ${fmtN(x.tot.p)} g, fat ${fmtN(x.tot.f)} g, carbs ${fmtN(x.tot.c)} g, fiber ${fmtN(x.tot.fib)} g`);
  for (const [cat, label] of [["supp", "Supplements"], ["tx", "Medications"], ["practice", "Practices"]]) {
    const es = d.items.filter(e => map[e.id] && map[e.id].cat === cat);
    if (es.length) L.push(`- ${label}: ${es.map(e => map[e.id].name + (doseLabel(e) ? ` ${doseLabel(e)}` : "") + (e.time ? ` at ${e.time}` : "")).join("; ")}`);
  }
  if (d.noBM) L.push("- Bowel movements: none");
  for (const b of d.bms) {
    const flags = bmFlagText(b);
    L.push(`- BM${b.time ? ` ${b.time}` : ""}: ${b.bristol ? `Bristol ${b.bristol} (${BRISTOL[b.bristol].toLowerCase()})` : "Bristol not given"}${b.size ? `, ${BM_SIZE[b.size][0].toLowerCase()} (${BM_SIZE[b.size][1].toLowerCase()})` : ""}${flags.length ? `, ${flags.join(", ")}` : ""}`);
  }
  const unit = S.profile.settings.unit === "ppm" ? "ppm" : "level";
  for (const r of d.breath) L.push(`- Breath${r.time ? ` ${r.time}` : ""}: ${r.ctx === "fasting" ? "fasting" : `after ${(r.ch || "food").toLowerCase()}${r.mins != null ? `, ${r.mins} min` : ""}`}; ${[r.h2 != null ? `H2 ${r.h2}` : "", r.ch4 != null ? `CH4 ${r.ch4}` : ""].filter(Boolean).join(", ")} ${unit}`);
  const sl = d.sleep || {}, life = [sl.hours != null && sl.hours !== "" ? `sleep ${sl.hours} h` : "", sl.quality ? `sleep quality ${sl.quality}/5` : "", sl.wakes != null && sl.wakes !== "" ? `${sl.wakes} night wakings` : "", typeof d.stress === "number" ? `stress ${d.stress}/10` : "", d.period ? "period day" : ""].filter(Boolean);
  if (life.length) L.push(`- ${life.join(", ").replace(/^\w/, c => c.toUpperCase())}`);
  if (d.notes && d.notes.trim()) L.push(`- Notes: ${d.notes.trim().replace(/\s*\n+\s*/g, " / ")}`);
  return L;
}

// Library protocols that match what the person has used, by name or items
const LIB_MATCH = [
  ["Rifaximin (Xifaxan)", /rifaximin|xifaxan/], ["Rifaximin + neomycin", /neomycin/], ["Rifaximin + PHGG", t => /rifaximin|xifaxan/.test(t) && /phgg|guar|sunfiber/.test(t)],
  ["Herbal antimicrobials", /berberine|oregano|neem|candibactin|dysbiocide|fc-?cidal|biocidin|herbal antimicrobial/], ["Allicin (stabilized garlic extract)", /allicin|allimed|garlic extract/],
  ["Atrantil", /atrantil/], ["Elemental diet", /elemental/], ["Low FODMAP / SIBO-specific diet", /fodmap|sibo[- ]specific|bi-?phasic|\bscd\b|fast tract/],
  ["Low-sulfur diet + bismuth", /low[- ]sulfur|bismuth|pepto/], ["Prucalopride", /prucalopride|motegrity|resotran/], ["Low-dose erythromycin", /erythromycin/],
  ["Low-dose naltrexone (LDN)", /naltrexone|\bldn\b/], ["Ginger + artichoke", /ginger|artichoke|motilpro|prokinecta/], ["Iberogast (STW 5)", /iberogast|stw ?5/],
  ["Meal spacing (MMC support)", /meal spacing|\bmmc\b|no snacking/], ["PHGG (partially hydrolyzed guar gum)", /phgg|guar|sunfiber/],
  ["Probiotics (S. boulardii, select strains)", /probiotic|boulardii|florastor|lactobac|bifido/], ["Gut-directed hypnotherapy", /hypno|nerva\b/],
  ["Vagal toning", /vagal|vagus|humming|gargl/], ["Digestive support (HCl, enzymes, bile)", /\bhcl\b|betaine|enzyme|ox bile|tudca|bitters/],
  ["Pelvic floor PT / biofeedback", /pelvic floor|biofeedback/], ["Visceral manipulation", /visceral/], ["Antifungal trial", /fluconazole|nystatin|antifungal|caprylic/],
  ["Mast cell support", /mast cell|ketotifen|cromolyn|quercetin|antihistamine/],
];
function reportLibProtocols() {
  const map = lib();
  const text = S.profile.protocols.filter(p => p.start).map(p => [p.name, p.notes || "", ...p.itemIds.map(id => map[id] ? map[id].name : "")].join(" ")).join(" ").toLowerCase();
  return LIB_MATCH.filter(([, m]) => typeof m === "function" ? m(text) : m.test(text)).map(([n]) => PROTOCOLS.find(x => x.name === n)).filter(Boolean);
}

// Parts 1-3 of the report: instructions for the AI, the research behind the app (filtered to this person), key terms
function reportBrief(P, T, ppm) {
  const H = (n, s) => P(`\n${"#".repeat(n)} ${s}\n`);
  const ranked = scoreDrivers(analyze().F).filter(r => ["strong", "likely", "possible"].includes(r.level)).slice(0, 5);
  const protos = reportLibProtocols();
  const driverIds = ranked.map(r => r.d.id), protoNames = protos.map(x => x.name);
  const experts = EXPERTS.map(e => ({ e, hits: e.drivers.filter(id => driverIds.includes(id)).length + e.protocols.filter(n => protoNames.includes(n)).length }))
    .filter(x => x.hits).sort((a, b) => b.hits - a.hits).slice(0, 6).map(x => x.e);

  H(2, "Part 1 · Instructions for the AI");
  P("I have SIBO/IMO (small intestinal bacterial or methanogen overgrowth) symptoms. I track my gut every day in Case File and work with a naturopath. Please act as my careful research partner.");
  P("");
  P("**Before you start:** this report is step one. After it, I'll upload the relevant testing I've had done so you can get the full picture. When you've read the report, don't analyse anything yet. Reply only with: \"Got it. Waiting for your tests. Upload them when you're ready, or say 'go' to start without them.\" Once I've uploaded them (or said \"go\"), read the tests alongside the report and give your first reply in the shape below.");
  P("");
  P("**What's in this report**");
  P("- Part 1 (this part): how to help me, and the shape of your first reply.");
  P("- Part 2: the research the app is built on: the experts and their approaches, my top-ranked root causes explained, the protocols I've used, and how the app reaches its conclusions.");
  P("- Part 3: key terms and how to read my numbers.");
  P("- Part 4: my data: where things stand now, health history, labs, a timeline of protocols (each with the app's own check), what the app's analysis found, then week-by-week and day-by-day logs, oldest first.");
  P("");
  P("**Sources, in this order:** (1) my data in Part 4, (2) the research in Part 2, (3) your own knowledge, only to add to those. Say when you go beyond Part 2, and flag anything newer, contested or weakly supported. Use Part 2's names for root causes and protocols so we're talking about the same things as the app.");
  P("");
  P("**How to answer**");
  P("- Be specific to my numbers: dates, day scores, symptom changes, breath readings, how often I followed a protocol. If something rests on only a few days, say so.");
  P("- Look for patterns across the daily log yourself (foods, meal timing, supplements, sleep, stress, the menstrual cycle, bowel movements), allowing for delays of 1-3 days. Weigh where things stand now and the most recent days most heavily.");
  P("- When you suggest an approach, say whose work it draws on, their lens (Conventional, Integrative MD, Naturopathic, Functional, Diet researcher) and how strong the evidence is (strong, moderate, emerging). Where experts disagree, show both sides briefly.");
  P("- Treat the app's protocol checks and insights as a second opinion: agree or disagree, and say why.");
  P("- Prefer one clear recommendation over a long menu, and say what would change your mind.");
  P("- Use plain language. Explain any medical term the first time you use it. Keep it short unless I ask for more.");
  P("");
  P("**Your first reply, once you have my tests (or I say \"go\"), in this shape:**");
  P("1. **My situation in plain words:** 4-6 sentences on where I am now and how I got here.");
  P("2. **What seems to be driving it:** my top 2-3 likely root causes, each with the evidence from my data and how sure you are.");
  P("3. **How my current protocol is going:** verdict (working / not yet / not working / came back) with the numbers, and whether you agree with the app's check. If nothing is running, what the last one taught us.");
  P("4. **Gaps and contradictions:** missing data or things that don't fit, and the one thing that would most sharpen the picture.");
  P("5. **Questions you could ask me next:** 6-8 numbered questions, written in my voice, that I'd get the most out of asking you based on this report (for example \"Should I switch from herbs to rifaximin?\"). I'll reply with a number.");
  P("6. **Questions for my naturopath:** 3-5 specific questions I can copy.");
  P("");
  P("**When I ask how a protocol is going later, use:** Verdict · What's helping or getting in the way · Options (stay, adjust or change course, with the one you'd pick and the expert approach behind each) · Questions for my naturopath · What to track next and for how long.");
  P("");
  P("**Safety first:** if anything in my data or messages includes blood in stool, black stools, repeated pale or clay-coloured stools, unintended weight loss, vomiting, fever, severe or worsening pain, trouble swallowing, or symptoms waking me at night, tell me to see a doctor promptly before anything else. Flag drug interactions and contraindications (for example magnesium with kidney disease, HCl with ulcers or NSAIDs, neomycin side effects) as needing my practitioner's sign-off. Doses in Part 2 are as studied, not recommendations.");

  H(2, "Part 2 · The research behind this report");
  const parts = [ranked.length ? `my top ${ranked.length} root cause${ranked.length > 1 ? "s" : ""}` : "", protos.length ? "the protocols I've used" : "", experts.length ? "the experts who work on them" : ""].filter(Boolean);
  P(`Case File's knowledge base draws on ${EXPERTS.length} clinicians and researchers, ${DRIVERS.length} root causes and ${PROTOCOLS.length} protocols. ${parts.length ? `Only the parts that matter for me are included here: ${parts.join(", ")}.` : "Nothing ranks for me yet, so only how the app reasons is included here."}`);
  H(3, "How the app reasons");
  P("- **Root-cause ranking:** each root cause has weighted signals from my health history (yes = full weight, unsure = about a third), lab values and patterns in my journal. A cause needs at least one strong signal (weight 2+) to rank. Strong match = 5+ points, likely = 3+, possible = 1.5+.");
  P("- **Day score:** my overall gut-day rating (0 best, 10 worst), or the average of my 3 worst symptoms if I didn't rate the day.");
  P("- **Protocol check:** compares the 2 weeks before a protocol with its latest week. Improved = day score down 1.5+; worse = up 1.5+ in the first 2 weeks; no clear change = within 1 point after 10+ days; came back = improved, then back near the starting level within 60 days of stopping. Adherence under 60% means the result can't be trusted. It also checks the protocol matches my gas type, its length, prokinetic follow-up, and timing for a retest.");
  P("- **Food and supplement effects:** compare a day (and the next 1-2 days) with the 2 weeks around it, so slow trends aren't mistaken for food reactions.");
  P(`- **Low Fermentation Diet ratings:** every food is rated fits, limit or avoid against Dr. Pimentel's Low Fermentation Diet (Cedars-Sinai). Avoid: beans and legumes, whole grains and oats, added fiber, cruciferous vegetables, lactose dairy, sugar alcohols and sucralose, xanthan/arabic/carrageenan gums. Limit: higher-fructose fruit, nuts and seeds, garlic and onion (guides disagree), soft cheese, alcohol, fizzy drinks, fermented foods. Packaged foods are rated from their ingredient list. The daily log names only foods to limit or avoid.`);
  P("- **Complete BMs per week:** bowel movements that felt fully emptied, without an enema. This is the main measure in constipation trials; 3+ a week is a common target.");
  H(3, "Approaches (lenses) used to label each expert");
  LENSES.forEach(([l, t]) => P(`- **${l}:** ${t}.`));
  if (experts.length) {
    H(3, "Experts most relevant to me");
    for (const e of experts) {
      P(`**${e.name}, ${e.creds}** · ${e.lens} · ${e.roles.join(", ")}`);
      P(`- How they approach SIBO/IMO: ${e.approach}`);
      P(`- Takeaways: ${e.takeaways.slice(0, 3).join(" ")}`);
      if (e.caveat) P(`- Keep in mind: ${e.caveat}`);
      P(`- Evidence behind it: ${e.basis}`);
      P("");
    }
  }
  if (ranked.length) {
    H(3, "My top root causes, explained");
    ranked.forEach((r, i) => {
      const d = r.d, who = EXPERTS.filter(e => e.drivers.includes(d.id)).map(e => e.name);
      P(`**${i + 1}. ${d.name}** · ${LEVEL_LABEL[r.level].toLowerCase()} (${r1(r.pts)} points) · evidence ${d.ev} · gas ${d.gas.length ? d.gas.join(", ") : "any"}`);
      P(`- Why the app ranks it: ${r.why.map(w => w.label).join("; ") || "no signals listed"}`);
      P(`- How it drives SIBO/IMO: ${d.mech}`);
      P(`- Why treatment may not stick: ${d.stuck}`);
      P(`- Tests to ask about: ${d.tests.join("; ")}`);
      P(`- Approaches people use: ${d.approach.join("; ")}`);
      if (who.length) P(`- Experts who work on it: ${who.join(", ")}`);
      P("");
    });
  }
  if (protos.length) {
    H(3, "Protocols I've used, from the research library");
    for (const x of protos) {
      const who = EXPERTS.filter(e => e.protocols.includes(x.name)).map(e => e.name);
      P(`**${x.name}** · ${x.type} · evidence ${x.ev} · gas ${x.gas.length ? x.gas.join(", ") : "any"}`);
      P(`- What it is: ${x.what}`);
      P(`- Best for: ${x.works}`);
      P(`- Where it falls short: ${x.fails}`);
      if (who.length) P(`- Experts who use or studied it: ${who.join(", ")}`);
      P("");
    }
  }

  H(2, "Part 3 · Key terms and how to read my numbers");
  [
    ["SIBO", "small intestinal bacterial overgrowth: too many bacteria in the small intestine, usually shown by hydrogen (H2) on a breath test."],
    ["IMO", "intestinal methanogen overgrowth: methane-making microbes (archaea), shown by methane (CH4). Often linked to constipation."],
    ["H2S", "hydrogen sulfide, a third gas some overgrowths make (rotten-egg smell, often loose stools). Home devices don't measure it."],
    ["Root cause (driver)", "why the overgrowth happened or keeps coming back, such as slow gut movement (motility), low stomach acid or a structural issue."],
    ["Prokinetic", "something that strengthens the gut's cleaning waves between meals (the migrating motor complex, MMC), used to prevent relapse."],
    ["Symptoms, stress, overall gut day", "0-10, where 0 is none or best."],
    ["Day score", "the overall gut day when given, otherwise the average of the 3 worst symptoms. 0 is best."],
    ["Bristol stool type", "1-7: 1-2 hard (constipated), 3-4 ideal, 5-7 loose."],
    ["BM size", "by volume; a cup is about the size of a fist."],
    ["Felt complete", "whether a BM felt fully emptied: yes, partly or no."],
    ["Low Fermentation Diet", "Dr. Pimentel's (Cedars-Sinai) diet that cuts the foods gut bacteria ferment most; foods are rated fits, limit or avoid."],
    ["Breath readings", `${ppm ? "ppm from a breath test" : "FoodMarble home device levels, 0-10"}. The app treats H2 ≥ ${T.h2} and CH4 ≥ ${T.ch4} as elevated.`],
    ["Adherence", "share of days every item in a protocol was ticked off."],
    ["Times", "24-hour clock."],
  ].forEach(([k, v]) => P(`- **${k}:** ${v}`));
}

function buildReport(range) {
  const map = lib(), dates = reportDates(range), T = thresholds(), ppmUnit = S.profile.settings.unit === "ppm";
  const out = [], P = s => out.push(s), H = s => out.push("", `### ${s}`, "");
  P("# Case File: SIBO / IMO report");
  P("");
  P(`Made ${fmtDate(todayStr(), { year: "numeric", month: "long", day: "numeric" })} with Case File, a private gut journal. ${dates.length ? `Covers ${dates.length} logged days, ${dates[0]} to ${dates[dates.length - 1]}.` : "No days logged yet."}`);
  P("");
  P("> **To use this:** paste the whole report into a new chat with Claude, ChatGPT or another AI. It will confirm and wait for your test results. Upload them (PDFs or photos of breath tests, stool tests, bloodwork), or type \"go\" if you have none to add. It then replies with a plain-language summary and a numbered list of questions you can ask next. Reply with a number, or ask your own.");
  reportBrief(P, T, ppmUnit);
  out.push("", "## Part 4 · My data");

  // where things stand now: the current picture first, so it isn't buried at the end of a long log
  const A = analyze(), sum = aiSummary();
  const checkOf = new Map(S.profile.protocols.filter(p => p.start).map(p => [p.id, protocolCheck(p)]));
  H("Where things stand now");
  const t0 = todayStr(), last14 = rangeMean(addDays(t0, -13), t0), prev14 = rangeMean(addDays(t0, -27), addDays(t0, -14));
  if (last14.n) P(`- **Last 14 days:** average day score ${r1(last14.mean)} (${last14.n} days logged)${prev14.n ? `, compared with ${r1(prev14.mean)} in the 14 days before (${prev14.n} days)` : ""}. 0 is best.`);
  else P("- **Last 14 days:** nothing logged.");
  const symNow = S.profile.symptoms.map(sy => { const v = []; for (let i = 0; i < 14; i++) { const d = S.days[addDays(t0, -i)]; const x = d && d.symptoms && d.symptoms[sy.k]; if (typeof x === "number") v.push(x); } return { name: sy.name, m: v.length >= 3 ? mean(v) : null }; })
    .filter(x => x.m != null && x.m >= 2).sort((a, b) => b.m - a.m).slice(0, 4);
  if (symNow.length) P(`- **Main symptoms lately:** ${symNow.map(x => `${x.name.toLowerCase()} ${r1(x.m)}`).join(", ")} (14-day averages, 0-10)`);
  const hardNow = constipationRate(addDays(t0, -13), t0);
  const cNow = completeBMs(addDays(t0, -13), t0), cPrev = completeBMs(addDays(t0, -27), addDays(t0, -14));
  if (hardNow != null || cNow) P(`- **Bowel movements lately:** ${[hardNow != null ? `hard stools or no BM on ${Math.round(hardNow * 100)}% of logged days` : "", cNow ? `${r1(cNow.perWeek)} complete BMs a week (felt fully emptied, no enema)${cPrev ? `, compared with ${r1(cPrev.perWeek)} the 2 weeks before` : ""}` : ""].filter(Boolean).join("; ")}`);
  { let n = 0, ok = 0; const av = {};
    for (let i = 0; i < 14; i++) { const c = dayLfd(S.days[addDays(t0, -i)], map); n += c.n; ok += c.ok; c.avoidNames.forEach(x => { av[x] = (av[x] || 0) + 1; }); }
    const top = Object.entries(av).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} (${v} day${v > 1 ? "s" : ""})`);
    if (n) P(`- **Low Fermentation Diet, last 14 days:** ${Math.round(ok / n * 100)}% of foods logged fit${top.length ? `; foods to avoid eaten: ${top.join(", ")}` : "; no foods to avoid"}`); }
  const current = S.profile.protocols.filter(p => p.start && ["active", "planned"].includes(protoStatus(p))).sort((a, b) => a.start.localeCompare(b.start));
  if (current.length) current.forEach(p => { const c = checkOf.get(p.id); P(`- **${protoStatus(p) === "planned" ? "Planned" : "Current"} protocol:** ${p.name}, ${protoStatus(p) === "planned" ? `starts ${p.start}` : `day ${c.days} (started ${p.start})`}. App's check: ${c.verdict.title}.`); });
  else P("- **Current protocols:** none running.");
  if (sum.topDrivers.length) P(`- **Top-ranked root causes:** ${sum.topDrivers.slice(0, 3).map(r => `${r.name} (${r.match.toLowerCase()})`).join("; ")}`);

  // health history
  const ans = INTAKE.filter(q => S.profile.intake[q.k]);
  H("Health history");
  if (!ans.length) P("Not answered yet.");
  for (const g of INTAKE_GROUPS) {
    const qs = ans.filter(q => q.g === g.id);
    if (qs.length) { P(`**${g.name}**`); qs.forEach(q => P(`- ${q.q} ${yn[S.profile.intake[q.k]] || S.profile.intake[q.k]}`)); P(""); }
  }
  const extra = (S.profile.historyNotes || "").trim();
  if (extra) { P("**Anything else, in their own words**"); P(extra); P(""); }

  // labs and tests
  H("Labs and test results");
  const labs = Object.entries(S.profile.labs).filter(([, v]) => num(v) != null);
  if (labs.length) { P("Latest values:"); labs.forEach(([k, v]) => { const l = LABMAP[k]; P(`- ${l ? l.name : k}: ${v}${l && l.unit ? ` ${l.unit}` : ""}${l && l.hint ? ` (${l.hint})` : ""}`); }); }
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

  // protocols as a timeline, oldest first, each followed by the app's check
  H("Protocol timeline");
  const timeline = [...A.protoStats].sort((a, b) => (a.p.start || "9999").localeCompare(b.p.start || "9999"));
  if (!timeline.length) P("None entered.");
  else P("Oldest first. Day scores are averages (0 best): before = the 2 weeks before it started, last 7 days = the final week on it, after = up to 60 days after it ended.");
  for (const { p, s } of timeline) {
    const st = p.start ? protoStatus(p) : "draft", c = checkOf.get(p.id);
    P("");
    P(`#### ${p.start || "No start date"} to ${p.end || (st === "planned" ? "?" : "ongoing")}: ${p.name}`);
    P(`- Type: ${(PROTO_KINDS.find(k => k[0] === p.kind) || ["", "Other"])[1]}. Status: ${st}. Items: ${p.itemIds.map(id => map[id] && `${map[id].name}${doseLabel(map[id]) ? ` ${doseLabel(map[id])}` : ""}`).filter(Boolean).join(", ") || "none"}.`);
    if (p.start && st !== "planned" && !s.during.n) P("- No logged days during it (before logging here, or entered from memory).");
    else if (p.start && st !== "planned") P(`- Day score before ${r1(s.base.mean)} (${s.base.n} d), during ${r1(s.during.mean)} (${s.during.n} d), last 7 days ${r1(s.late.mean)}${s.after.n ? `, after ${r1(s.after.mean)} (${s.after.n} d)` : ""}. Adherence ${s.adherence == null ? "unknown" : Math.round(s.adherence * 100) + "%"}.`);
    if (p.notes) P(`- My notes: ${p.notes}`);
    if (!c) continue;
    P(`- **App's check: ${c.verdict.title}.** ${c.verdict.text}`);
    c.facts.filter(([k]) => k === "Better" || k === "Worse" || k === "Breath").forEach(([k, v]) => P(`  - ${k}: ${v}`));
    c.findings.forEach(f => P(`  - Found: ${f.title}. ${f.text}`));
    c.next.forEach(n => P(`  - Way forward: ${n.t}. ${n.d}`));
    c.qs.forEach(q => P(`  - Question for my practitioner: ${q}`));
    const who = c.ex.map(id => (EXPERTS.find(e => e.id === id) || {}).name).filter(Boolean);
    if (who.length) P(`  - Draws on the work of: ${who.join(", ")}`);
  }

  // what the app already found
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
    P("| Week of | Days logged | Avg day score | BMs per day | Avg Bristol | Felt complete |");
    P("|---|---|---|---|---|---|");
    const weeks = {};
    for (const dt of dates) { const dd = parseD(dt); dd.setDate(dd.getDate() - ((dd.getDay() + 6) % 7)); (weeks[ymd(dd)] ||= []).push(S.days[dt]); }
    for (const [wk, ds] of Object.entries(weeks)) {
      const sc = ds.map(dayScore).filter(v => v != null), bms = ds.flatMap(x => x.bms), br = bms.map(b => b.bristol).filter(Boolean);
      const ans = bms.filter(b => bmComplete(b)), yes = ans.filter(b => bmComplete(b) === "y" && !b.enema).length;
      P(`| ${wk} | ${ds.length} | ${sc.length ? r1(mean(sc)) : "–"} | ${r1(bms.length / ds.length)} | ${br.length ? r1(mean(br)) : "–"} | ${ans.length ? `${yes} of ${ans.length} BMs` : "–"} |`);
    }
    H("Daily log");
    dates.forEach(dt => { out.push(...reportDayLines(dt, map), ""); });
  }
  out.push("", "## Next: my test results", "", "That's the end of the report. Next, I'll upload the relevant testing I've had done so you can get the full picture. For each test, note the date and compare it with what the report shows around that time. Please reply only \"Got it. Waiting for your tests.\" for now.");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------- page ----------
function viewReport() {
  const range = UI.reportRange || "all", text = buildReport(range), n = reportDates(range).length;
  const words = text.split(/\s+/).length;
  UI.reportText = text;
  return `<div class="spacer"></div>` +
    group("", `<div class="row prose">One report with everything an AI needs: instructions, the research behind the app (filtered to your top root causes and protocols), key terms, then your history, tests, protocols and every logged day. Paste it into Claude, ChatGPT or another AI. It confirms and waits for you to upload your test results, then replies with a plain summary and numbered questions you can ask next.</div>
      <div class="row field-row"><span class="row-label">Include</span>${seg("Range", REPORT_RANGES, range, "reportRange")}</div>
      <div class="row"><span class="row-sub">${n} days · about ${words.toLocaleString()} words</span></div>`) +
    group("", `<button type="button" class="row action" data-act="reportCopy">${icon("check", "lead")}<span class="row-label">Copy report</span></button>` +
      (navigator.share ? `<button type="button" class="row action" data-act="reportShare">${icon("chevR", "lead")}<span class="row-label">Share…</span></button>` : "") +
      (Store.downloads || !IN_VIEWER ? `<button type="button" class="row action" data-act="reportSave">${icon("plus", "lead")}<span class="row-label">Save as a file (.md)</span></button>` : ""),
      "The report is made on this device. It leaves only when you copy, share or save it, and whatever AI you paste it into will see your health details and notes.") +
    group("Preview", `<div class="row"><textarea id="report-text" rows="14" readonly>${esc(text)}</textarea></div>`);
}
async function reportSave() {
  const data = UI.reportText || buildReport(UI.reportRange || "all"), filename = `case-file-report-${todayStr()}.md`;
  if (Store.downloads) { try { await Store.downloads.save({ filename, data }); return; } catch (e) { if (e && e.code === "declined") return; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "text/markdown" })); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function reportShare() {
  const text = UI.reportText || buildReport(UI.reportRange || "all"), filename = `case-file-report-${todayStr()}.md`;
  try {
    // a file keeps long reports intact in apps that cut off shared text
    const file = new File([text], filename, { type: "text/markdown" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "Case File report" });
    else await navigator.share({ title: "Case File report", text });
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
