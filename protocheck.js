/* Case File — protocol check.
   A rule-based review of one protocol: is it working, is it matched to your gas type, what's missing,
   which way to go next, and questions for your practitioner. Runs on the phone; nothing is sent anywhere.
   Rules draw on the expert library in knowledge.js (EXPERTS ids in each finding's `ex`). */

const HERBAL = /berberine|oregano|neem|allicin|allimed|candibactin|dysbiocide|fc-cidal|atrantil|biocidin|monolaurin|garlic/i;
const RX_ANTI = /rifaximin|xifaxan|neomycin|metronidazole|flagyl/i;
const ELEMENTAL = /elemental|physicians'? elemental|mbiota|absorb plus/i;
const RESTRICT = /fodmap|sibo diet|specific food|bi-?phasic|\bscd\b|specific carbohydrate|fast tract|low.?sulfur|low.?histamine|carnivore|gaps/i;
const BISMUTH = /bismuth|pepto/i;

function protoText(p, map) { return [p.name, ...p.itemIds.map(id => map[id] && map[id].name)].filter(Boolean).join(" "); }

// symptom-by-symptom change: 2 weeks before vs the latest 7 days of the protocol
function symptomShift(p) {
  const end = p.end && p.end < todayStr() ? p.end : todayStr();
  const lateStart = addDays(end, -6) > p.start ? addDays(end, -6) : p.start;
  const avg = (k, a, b) => { const v = []; for (let d = a; d <= b; d = addDays(d, 1)) { const x = S.days[d] && S.days[d].symptoms && S.days[d].symptoms[k]; if (typeof x === "number") v.push(x); } return v.length >= 3 ? mean(v) : null; };
  const out = [];
  for (const s of S.profile.symptoms) {
    const b = avg(s.k, addDays(p.start, -14), addDays(p.start, -1)), l = avg(s.k, lateStart, end);
    if (b != null && l != null && Math.abs(l - b) >= 1) out.push({ name: s.name, before: b, now: l, diff: l - b });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 4);
}

// share of days with hard stools or no BM, in a date range
function constipationRate(a, b) {
  let n = 0, c = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) {
    const day = S.days[d];
    if (!day || !(day.bms.length || day.noBM)) continue;
    n++; if (day.noBM || day.bms.some(x => (x.bristol && x.bristol <= 2) || x.enema)) c++;
  }
  return n >= 4 ? c / n : null;
}

function breathShift(p, gas) {
  const end = p.end && p.end < todayStr() ? p.end : todayStr();
  const vals = (a, b) => { const v = []; for (let d = a; d <= b; d = addDays(d, 1)) (S.days[d] ? S.days[d].breath : []).forEach(r => { const x = num(r[gas]); if (x != null) v.push(x); }); return v; };
  const before = vals(addDays(p.start, -21), addDays(p.start, -1)), late = vals(addDays(end, -13) > p.start ? addDays(end, -13) : p.start, end);
  return before.length >= 2 && late.length >= 2 ? { before: mean(before), now: mean(late), n: before.length + late.length } : null;
}

function protocolCheck(p) {
  const map = lib(), A = analyze(), F = A.F, s = protocolStats(p), st = protoStatus(p);
  const txt = protoText(p, map), anti = isAntimicrobial(p, map), T = thresholds();
  const isPk = p.kind === "prokinetic" || GROUPS.prokinetic.test(txt);
  const isDiet = p.kind === "diet" || RESTRICT.test(txt) || ELEMENTAL.test(txt);
  const end = p.end && p.end < todayStr() ? p.end : todayStr();
  const days = p.start ? Math.max(0, Math.round((parseD(end) - parseD(p.start)) / 864e5) + 1) : 0;
  const since = p.end && p.end < todayStr() ? Math.round((parseD(todayStr()) - parseD(p.end)) / 864e5) : null;
  const methane = (F.ch4_high || 0) >= 0.5 || (num(S.profile.labs.breath_ch4) || 0) >= 10;
  const h2sSigns = (num(S.profile.labs.breath_h2s) || 0) >= 3 || (F.sulfur || 0) >= 0.5 || S.profile.intake.sulfur_burps === "y";
  const others = S.profile.protocols.filter(q => q !== p && q.start && protoStatus(q) !== "draft");
  const overlaps = q => q.start <= end && (!q.end || q.end >= p.start);
  const pkAlongside = others.some(q => overlaps(q) && (q.kind === "prokinetic" || GROUPS.prokinetic.test(protoText(q, map))));
  const pkAfter = p.end ? others.some(q => (q.kind === "prokinetic" || GROUPS.prokinetic.test(protoText(q, map))) && (!q.end || q.end >= p.end))
    || Object.values(S.days).some(d => d.date > p.end && itemNames(d, map).some(i => GROUPS.prokinetic.test(i.name))) : false;
  const bowelAlongside = others.some(q => overlaps(q) && (q.kind === "prokinetic" || moves(protoText(q, map)))) || moves(txt);
  const roots = scoreDrivers(F).filter(r => r.pts > 0 && !NON_ROOT.has(r.d.id)).slice(0, 3);

  const facts = [], findings = [], next = [], qs = [];
  const add = (tone, title, text, ex = []) => findings.push({ tone, title, text, ex });
  const ask = q => { if (!qs.includes(q)) qs.push(q); };

  if (!p.start) return { p, s, st, draft: true, facts, findings, next, qs, verdict: { tone: "", title: "Not started", text: "Give this protocol a start date to check it." }, roots, ex: [] };

  // ---- facts
  facts.push(["Timing", st === "planned" ? `Starts ${fmtDate(p.start, { month: "short", day: "numeric" })}` : `Day ${days}${p.end && st !== "ended" ? ` of ${Math.round((parseD(p.end) - parseD(p.start)) / 864e5) + 1}` : ""}${st === "ended" ? `, ended ${since === 0 ? "today" : since + " day" + (since === 1 ? "" : "s") + " ago"}` : ""}`]);
  if (s.base.mean != null) facts.push(["Day score", `${r1(s.base.mean)} before → ${r1(s.late.mean)} latest week${s.after.n ? ` → ${r1(s.after.mean)} since it ended` : ""} (0 is best)`]);
  if (s.adherence != null) facts.push(["Followed", `${Math.round(s.adherence * 100)}% of days with every item ticked`]);
  const shifts = symptomShift(p);
  shifts.forEach(x => facts.push([x.diff < 0 ? "Better" : "Worse", `${x.name}: ${r1(x.before)} → ${r1(x.now)}`]));
  const cb = constipationRate(addDays(p.start, -14), addDays(p.start, -1)), cl = constipationRate(addDays(end, -13) > p.start ? addDays(end, -13) : p.start, end);
  if (cb != null && cl != null && Math.abs(cl - cb) >= 0.15) facts.push([cl < cb ? "Better" : "Worse", `Hard or missed BMs: ${Math.round(cb * 100)}% of days → ${Math.round(cl * 100)}%`]);
  const kb = completeBMs(addDays(p.start, -14), addDays(p.start, -1)), kl = completeBMs(addDays(end, -13) > p.start ? addDays(end, -13) : p.start, end);
  if (kb && kl && Math.abs(kl.perWeek - kb.perWeek) >= 1) facts.push([kl.perWeek > kb.perWeek ? "Better" : "Worse", `Complete BMs: ${r1(kb.perWeek)} a week → ${r1(kl.perWeek)}`]);
  const bc = breathShift(p, "ch4"), bh = breathShift(p, "h2");
  if (bc) facts.push(["Breath", `Methane ${r1(bc.before)} → ${r1(bc.now)} (FoodMarble ${S.profile.settings.unit === "ppm" ? "ppm" : "level"})`]);
  if (bh) facts.push(["Breath", `Hydrogen ${r1(bh.before)} → ${r1(bh.now)}`]);

  if (st === "planned") {
    if (s.base.n < 7) add("warn", "Log daily before it starts", `Only ${s.base.n} of the 14 days before the start have a score. With fewer than about 7, the before-and-after comparison will be weak.`);
  } else if (s.during.n === 0) {
    // entered from memory, or from before logging started: only judge what doesn't need daily data
  } else {
    if (s.base.mean == null) add("warn", "No baseline to compare against", "There are too few logged days in the 2 weeks before it started, so the app can't say whether it's working. Symptom and breath changes below are still worth reading.");
    if (!p.itemIds.length) add("info", "No checklist items", "Add the supplements or practices to this protocol so the app can track how consistently you follow it.");
    else if (s.adherence != null && s.adherence < 0.6 && days >= 7) add("warn", "Followed on too few days to judge", `Every item was ticked on ${Math.round(s.adherence * 100)}% of days. Either it's being missed, or the checklist isn't being ticked. Results are hard to trust below about 60%.`);
  }

  // ---- antimicrobials
  if (anti) {
    const herbal = HERBAL.test(txt) && !RX_ANTI.test(txt);
    if (methane && !targetsMethane(p, map) && bc && bc.now <= bc.before * 0.7) {
      add("info", "Not methane-targeted, but methane is falling", `Nothing in this protocol targets methanogens directly, yet your FoodMarble methane dropped from ${r1(bc.before)} to ${r1(bc.now)}. Worth confirming with a retest when it ends.`, ["jacobi"]);
    } else if (methane && !targetsMethane(p, map)) {
      add("bad", "Not aimed at methane", "Your breath data shows methane, which is made by archaea rather than bacteria. This protocol has no methane-targeting agent (such as neomycin with rifaximin, allicin or Atrantil), so it may not reach the main problem.", ["pimentel", "siebecker", "jacobi"]);
      ask("My breath tests show methane. Is this protocol targeted at methanogens, or should we add something like allicin or neomycin?");
    }
    if (h2sSigns && !BISMUTH.test(txt) && (num(S.profile.labs.breath_h2s) || 0) >= 3) {
      add("info", "Hydrogen sulfide isn't specifically covered", "Your lab test shows hydrogen sulfide. Bismuth and a temporary lower-sulfur diet are the options most often added for it.", ["rezaie"]);
      ask("Should bismuth or a lower-sulfur phase be part of this for my hydrogen sulfide?");
    }
    if (methane && (num(S.profile.labs.breath_ch4) || 0) >= 35) add("info", "Expect more than one round", `From a methane peak of ${S.profile.labs.breath_ch4} ppm, several rounds with retests between them is typical. Specialists see methane fall roughly 20-30 ppm per 4-6 week course.`, ["jacobi", "siebecker"]);
    if (s.worse) {
      const mast = ["mcas", "histamine"].some(id => roots.some(r => r.d.id === id)) || S.profile.intake.mcas === "y" || S.profile.intake.antimicrobial_worse === "y";
      add("bad", "Worse in the first 2 weeks", `Symptoms rose from ${r1(s.base.mean)} to ${r1(s.early.mean)} early on. This can be a reaction to the product, die-off, or a mast cell response.${mast ? " Your history points to mast cell or histamine sensitivity, which some clinicians calm first before antimicrobials." : ""}`, mast ? ["weinstock"] : []);
      ask("I felt worse in the first two weeks. Should we lower the dose, go slower, or add mast cell support first?");
    }
    if ((F.constipation || 0) >= 0.5 && !bowelAlongside && st !== "ended") {
      add("warn", "Nothing here moves the bowels", "You're often constipated, and this protocol has no prokinetic or bowel support alongside it. Some integrative clinicians get the bowels moving first so the antimicrobial works in a gut that empties.", ["nambudripad"]);
      ask("What should I add for constipation during this round: magnesium, PHGG or a prokinetic?");
    }
    if (st === "active" && herbal && days > 42 && !s.improved) add("warn", "Past the usual herbal course length", `Herbal rounds usually run 4-6 weeks, and this is day ${days} without clear improvement. Longer isn't usually better. It's a point to retest or change course.`, ["siebecker", "jacobi"]);
    if (st === "active" && RX_ANTI.test(txt) && days > 16) add("info", "Longer than a usual rifaximin course", "Rifaximin was studied as a 14-day course. Check the planned end date with your prescriber.", ["pimentel"]);
    if (st === "ended") {
      if (!pkAfter && !s.relapse) {
        add("warn", "No relapse prevention after it ended", "No prokinetic is logged since this ended. Several specialists start one as soon as antimicrobials stop and continue it for at least 3 months, with 4-5 hour gaps between meals.", ["siebecker", "pimentel"]);
        ask("Which prokinetic should I start now to protect this result, and for how long?");
      }
      if (since != null && since >= 10 && since <= 60) {
        add("info", "Retest window", `It ended ${since} days ago. A breath test 2-4 weeks after a round shows whether the gas you treated has normalized.`, ["siebecker", "jacobi"]);
        ask("Should I do a follow-up breath test now, and the same type as before?");
      }
    }
  }

  // ---- prokinetics
  if (isPk) {
    if (st === "ended" && days < 84) {
      add("warn", "Stopped earlier than usual", `It ran ${days} days. After treatment, prokinetics are usually kept going for at least 3 months, sometimes much longer after food poisoning.`, ["siebecker", "pimentel"]);
      ask("Should I have stayed on the prokinetic longer, or restart it?");
    }
    if (s.relapse) add("bad", "Symptoms came back after stopping", "That suggests the cleaning wave still needs support. Long-term or indefinite prokinetic use is common in post-infectious cases.", ["pimentel"]);
    if (cb != null && cl != null && cl >= cb - 0.05 && cl >= 0.4 && days >= 21) {
      const pelvic = (F.incomplete || 0) >= 0.5 || S.profile.intake.digital_assist === "y" || S.profile.intake.straining === "y";
      add("warn", "Constipation hasn't eased", pelvic ? "Hard or missed BMs haven't changed, and you strain or feel incomplete. A pelvic floor that doesn't coordinate often hides behind constipation and doesn't respond to prokinetics." : "Hard or missed BMs haven't changed. A different prokinetic, a dose change, or added bowel support may be needed.", pelvic ? ["rao"] : ["nambudripad"]);
      ask(pelvic ? "Could pelvic floor dyssynergia be part of this? Would an anorectal test or pelvic floor physio help?" : "Would a different prokinetic or dose work better for my constipation?");
    }
  }

  // ---- diets
  if (isDiet) {
    if (ELEMENTAL.test(txt) && days > 21) add("info", "Longer than a usual elemental course", "Elemental diets are usually run for 2-3 weeks in studies. Plan the reintroduction and a retest.", ["rezaie", "pimentel"]);
    else if (RESTRICT.test(txt) && days > 42 && st !== "ended") {
      add("warn", "Time to plan reintroduction", `This restrictive diet is at day ${days}. These diets ease symptoms but don't clear overgrowth, and staying on them for months can narrow the microbiome. Bring foods back one group at a time.`, ["chutkan", "ruscio", "siebecker"]);
      ask("Is it time to start reintroducing foods, and in what order?");
    }
    if (s.flat) add("info", "Diet isn't moving symptoms much", "No clear change suggests diet isn't the main lever for you right now. That points to motility or another root cause.");
  }

  // ---- verdict and course options
  let verdict;
  const topRoot = roots[0];
  if (st !== "planned" && s.during.n === 0) {
    verdict = { tone: "", title: "No logged days during it", text: "It ran before you logged here, or those days weren't logged, so the app can't judge how it went. Your own notes on it matter most." };
    if (p.notes) facts.push(["Notes", p.notes]);
  } else if (st === "planned") verdict = { tone: "", title: "Not started yet", text: "The check fills in once it's running. Log daily before it starts so there's a clear baseline." };
  else if (s.relapse) {
    verdict = { tone: "warn", title: "It worked, then it came back", text: "The protocol helped, but symptoms returned after it ended. The overgrowth was probably cleared and then regrew, so the question is why." };
    next.push({ t: "Fix why it came back", d: `A prokinetic and meal spacing to protect the cleaning wave${topRoot ? `, and a look at your top-ranked cause: ${topRoot.d.name.toLowerCase()}` : ""}.` });
    next.push({ t: "Repeat what worked, with prevention this time", d: "If it cleared once, the same approach often works again. Start prevention the day it ends." });
    ask("This helped but symptoms came back after stopping. What should we do to prevent that next time?");
  } else if (s.improved) {
    verdict = { tone: "good", title: "It's working", text: `Your day score dropped from ${r1(s.base.mean)} to ${r1(s.late.mean)}.` };
    next.push(st === "ended" ? { t: "Hold the gains", d: "Keep up prevention (prokinetic, meal gaps), and watch the after-score for any slide back." } : { t: "Stay the course", d: "Finish as planned, and line up prevention for the day it ends." });
    ask(st === "ended" ? "This worked. What's my maintenance plan, and when should I retest?" : "This is working. What's the plan for when it ends?");
  } else if (s.worse) {
    verdict = { tone: "bad", title: "It made things worse early on", text: "Talk to your practitioner before continuing as is." };
    next.push({ t: "Pause or slow down", d: "Lower the dose or space out the products, with your practitioner's input." });
    if (anti) next.push({ t: "Calm things first", d: "If you react to many things, mast cell or histamine support before antimicrobials is one option." });
  } else if (s.flat) {
    verdict = { tone: "warn", title: "No clear change", text: `Your day score is about the same (${r1(s.base.mean)} before, ${r1(s.late.mean)} now) after ${days} days.` };
    if (anti) {
      if (methane && !targetsMethane(p, map)) next.push({ t: "Match the treatment to methane", d: "A methane-targeted protocol is the most direct change." });
      next.push(HERBAL.test(txt) && !RX_ANTI.test(txt) ? { t: "Switch class", d: "If herbs didn't work, a prescription option (rifaximin, with neomycin for methane) or an elemental diet are the usual next steps." }
        : { t: "Switch class", d: "In one Johns Hopkins study, more than half of people who didn't respond to rifaximin cleared with herbal antimicrobials. An elemental diet is another option." });
      next.push({ t: "Check it's really overgrowth", d: `When rounds don't move symptoms, the overgrowth may not be the main problem.${topRoot ? ` Your top-ranked cause is ${topRoot.d.name.toLowerCase()}.` : ""}` });
      ask("This round didn't change much. Should we retest, switch class, or look at what's driving it?");
    } else {
      next.push({ t: "Give it a fair end date, then drop it", d: "If nothing changes by the planned end, it's probably not your main lever. Fewer products make the rest easier to read." });
      ask("This hasn't changed much. Is it worth continuing?");
    }
  } else {
    verdict = { tone: "", title: s.base.mean == null ? "Can't compare yet" : "Too early to call", text: s.base.mean == null ? "There's no baseline from before it started." : `Day ${days}. Most protocols need about 2 weeks before the comparison means much.` };
    next.push(st === "ended" ? { t: "Watch the weeks after", d: "Keep logging. The check compares the weeks after it ended with before, which shows whether the effect held." }
      : { t: "Keep logging daily", d: "A day score and BMs each day are enough for the check to fill in." });
  }
  if (topRoot && !next.some(n => /cause/.test(n.d))) next.push({ t: "Keep the root cause in view", d: `Your top-ranked cause is ${topRoot.d.name.toLowerCase()}. Treatment works best when that's addressed too.` });

  const ex = [...new Set(findings.flatMap(f => f.ex))];
  return { p, s, st, days, facts, findings, next, qs, verdict, roots, ex };
}

function viewProtoCheck(pg) {
  const p = S.profile.protocols.find(x => x.id === pg.id);
  if (!p) return `<div class="spacer"></div>` + group("", `<div class="row"><span class="row-sub">This protocol no longer exists.</span></div>`);
  const c = protocolCheck(p);
  const kind = (PROTO_KINDS.find(k => k[0] === p.kind) || ["", "Other"])[1];
  let h = `<div class="detail-head" id="large-title"><h1>${esc(p.name)}</h1><div class="tagline"><span class="tag">${esc(kind)}</span><span class="status ${c.st}">${c.st}</span></div></div>`;
  h += group("Verdict", `<div class="row verdict ${c.verdict.tone}"><span class="row-main"><span class="row-label strong">${esc(c.verdict.title)}</span><span class="row-sub">${esc(c.verdict.text)}</span></span></div>`);
  if (c.facts.length) h += group("What your data shows", c.facts.map(([k, v]) => `<div class="row why-row"><span class="src">${esc(k)}</span><span class="row-label">${esc(v)}</span></div>`).join(""));
  if (c.findings.length) h += group("What the check found", c.findings.map(f => `<div class="row check-row ${f.tone}"><span class="row-main"><span class="row-label strong">${esc(f.title)}</span><span class="row-sub">${esc(f.text)}</span></span></div>`).join(""));
  if (c.next.length) h += group("Ways forward", c.next.map(n => `<div class="row"><span class="row-main"><span class="row-label strong">${esc(n.t)}</span><span class="row-sub">${esc(n.d)}</span></span></div>`).join(""));
  if (c.qs.length) h += group("Questions for your naturopath", c.qs.map(q => `<div class="row"><span class="row-label">${esc(q)}</span></div>`).join("") +
    `<button type="button" class="row action" data-act="copyCheck" data-id="${esc(p.id)}">${icon("plus", "lead")}<span class="row-label">Copy summary and questions</span></button>`);
  if (c.roots.length) h += group("Your top-ranked root causes", c.roots.map(r => navRow({ label: esc(r.d.name), sub: `${esc(r.d.cat)} · ${LEVEL_LABEL[r.level]}`, act: "push", attrs: `data-k="driver" data-id="${r.d.id}"` })).join(""));
  const ex = c.ex.map(id => EXPERTS.find(e => e.id === id)).filter(Boolean);
  if (ex.length) h += group("Whose work this draws on", ex.map(expertRow).join(""));
  h += `<p class="footnote">Worked out on this phone from your journal and the research library. It points to questions for your practitioner and isn't medical advice.</p>`;
  return h;
}

function protoCheckText(id) {
  const p = S.profile.protocols.find(x => x.id === id);
  if (!p) return "";
  const c = protocolCheck(p), L = [];
  L.push(`Protocol: ${p.name} (${p.start || "no start"} to ${p.end || "ongoing"})`);
  L.push(`Verdict: ${c.verdict.title}. ${c.verdict.text}`);
  c.facts.forEach(([k, v]) => L.push(`- ${k}: ${v}`));
  if (c.findings.length) { L.push("", "What the check found:"); c.findings.forEach(f => L.push(`- ${f.title}: ${f.text}`)); }
  if (c.qs.length) { L.push("", "My questions:"); c.qs.forEach((q, i) => L.push(`${i + 1}. ${q}`)); }
  return L.join("\n");
}
