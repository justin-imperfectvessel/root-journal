/* SIBO Root Journal — core: helpers, state, storage, streaks, insight engine, sample data.
   Top-level declarations are shared with ui.js (classic scripts share one global scope). */
const { INTAKE_GROUPS, INTAKE, LABS, FEATURES, DRIVERS, PROTOCOLS, GROUPS } = window.KB;
const LABMAP = Object.fromEntries(LABS.map(l => [l.k, l]));
const INTAKEMAP = Object.fromEntries(INTAKE.map(q => [q.k, q]));

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const newId = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const todayStr = () => ymd(new Date());
const fmtDate = (s, o) => parseD(s).toLocaleDateString(undefined, o || { weekday: "short", month: "short", day: "numeric" });
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const num = v => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
const r1 = v => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1));
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const hrs = t => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h + m / 60; };

const DEFAULT_SYMPTOMS = [
  { k: "bloating", name: "Bloating" }, { k: "distension", name: "Visible distension" }, { k: "pain", name: "Abdominal pain" },
  { k: "gas", name: "Gas" }, { k: "belching", name: "Belching" }, { k: "sulfur", name: "Sulfur / rotten-egg gas" },
  { k: "reflux", name: "Reflux / heartburn" }, { k: "nausea", name: "Nausea" }, { k: "early_satiety", name: "Full quickly" },
  { k: "urgency", name: "Urgency" }, { k: "fatigue", name: "Fatigue" }, { k: "brainfog", name: "Brain fog" },
  { k: "anxiety", name: "Anxiety / low mood" }, { k: "joint", name: "Joint pain" }, { k: "skin", name: "Skin flare" },
  { k: "flushing", name: "Flushing / itching" }, { k: "dizzy", name: "Dizzy on standing" }, { k: "headache", name: "Headache" },
];
const CATS = [
  { k: "food", name: "Food & drink", ph: "Add a food or drink" },
  { k: "supp", name: "Supplements", ph: "Add a supplement" },
  { k: "tx", name: "Medications & therapeutics", ph: "Add a medication or therapeutic" },
  { k: "practice", name: "Practices", ph: "Add a practice, e.g. walk after meals" },
];
const BRISTOL = ["", "Hard lumps", "Lumpy sausage", "Cracked sausage", "Smooth, soft", "Soft blobs", "Mushy", "Watery"];
// Stool amount by volume, as on clinical bowel records (a cup is about a fist)
const BM_SIZE = { s: ["Small", "Under ½ cup"], m: ["Medium", "½ to 1 cup"], l: ["Large", "Over 1 cup"] };
const PROTO_KINDS = [["antimicrobial", "Antimicrobial"], ["prokinetic", "Prokinetic"], ["diet", "Diet"], ["support", "Support / supplements"], ["lifestyle", "Lifestyle / nervous system"], ["other", "Other experiment"]];
const CHALLENGES = ["", "Meal", "Lactulose", "Glucose", "Inulin", "Fructose", "Lactose", "Sorbitol"];

// ---------- state ----------
const blankProfile = () => ({ intake: {}, labs: {}, library: [], protocols: [], symptoms: clone(DEFAULT_SYMPTOMS), settings: { unit: "level" } });
let S = { profile: blankProfile(), days: {} };
const UI = { tab: "today", stack: [], sheet: null, date: todayStr(), loading: true, libQuery: "", libCat: "all", range: 60, aiText: "", aiBusy: false, exportText: "", startedToday: false };

function getDay(date, create) {
  let d = S.days[date];
  if (!d && create) {
    d = S.days[date] = { date, items: [], symptoms: {}, bms: [], breath: [], sleep: {}, food: {} };
    if (date === todayStr()) UI.startedToday = true;
  }
  if (d) { d.items ||= []; d.symptoms ||= {}; d.bms ||= []; d.breath ||= []; d.sleep ||= {}; d.food ||= {}; }
  return d;
}
const lib = () => Object.fromEntries(S.profile.library.map(i => [i.id, i]));

// ---------- streaks & reminder ----------
// A day counts as logged once it has any entry (empty days are pruned on save).
const MILESTONES = [3, 7, 14, 21, 30, 60, 90, 100, 180, 365];
function streakInfo() {
  const t = todayStr(), on = d => !!S.days[d];
  const loggedToday = on(t);
  let cur = 0;
  for (let d = loggedToday ? t : addDays(t, -1); on(d); d = addDays(d, -1)) cur++;
  let best = 0, run = 0, prev = null;
  for (const x of Object.keys(S.days).sort()) { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  const last14 = [];
  for (let i = 13; i >= 0; i--) { const x = addDays(t, -i); last14.push({ date: x, on: on(x) }); }
  let month = 0;
  for (let i = 0; i < 30; i++) if (on(addDays(t, -i))) month++;
  return { cur, best, loggedToday, last14, month };
}
const reminder = () => S.profile.settings.reminder || null;
const fmtTime = t => { const [h, m] = t.split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
function reminderDue() {
  const r = reminder();
  if (!r || !r.time || Store.mode === "demo" || S.days[todayStr()]) return false;
  const now = new Date();
  return hrs(`${pad(now.getHours())}:${pad(now.getMinutes())}`) >= hrs(r.time);
}
// Inside claude.ai the page runs in a frame, so link to the artifact itself; as an installed PWA, link to wherever it is hosted.
const IN_VIEWER = !!(window.claude && typeof window.claude.use === "function");
const JOURNAL_URL = IN_VIEWER ? "https://claude.ai/artifact/KwcEQ5zpR75Zhqbaam3fVm" : location.origin + location.pathname;
function calStamp(date, time) { return date.replace(/-/g, "") + "T" + time.replace(":", "") + "00"; }
function googleCalUrl(time) {
  const start = calStamp(todayStr(), time);
  const [h, m] = time.split(":").map(Number), endT = `${pad((h + (m + 10 >= 60 ? 1 : 0)) % 24)}:${pad((m + 10) % 60)}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: "Log today in SIBO Root Journal", details: "Takes a minute: tick today's items, rate symptoms, add BMs.\n" + JOURNAL_URL, dates: `${start}/${calStamp(todayStr(), endT)}`, recur: "RRULE:FREQ=DAILY" });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
function icsText(time) {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SIBO Root Journal//EN", "BEGIN:VEVENT", `UID:sibo-journal-reminder-${newId()}`, `DTSTAMP:${now}`,
    `DTSTART:${calStamp(todayStr(), time)}`, "DURATION:PT10M", "RRULE:FREQ=DAILY", "SUMMARY:Log today in SIBO Root Journal",
    `DESCRIPTION:Takes a minute: tick today's items\\, rate symptoms\\, add BMs.\\n${JOURNAL_URL}`, `URL:${JOURNAL_URL}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0M", "DESCRIPTION:Log today in SIBO Root Journal", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n") + "\r\n";
}

// ---------- storage ----------
const LOCAL_KEY = "sibo-root-journal-v1";
const Store = {
  mode: "starting", db: null, uid: null, timers: {}, chains: {}, status: "", sampleBackup: null, downloads: null, sample: null,
  profRef() { return this.db.doc(`data/users/${this.uid}/profile`); },
  daysCol() { return this.db.doc(`data/users/${this.uid}/journal`).collection("days"); },
  readLocal() { try { const raw = localStorage.getItem(LOCAL_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } },
  writeLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(S)); return true; } catch (e) { return false; } },
  async init() {
    let db = null, user = null;
    if (window.claude && typeof window.claude.use === "function") {
      try { [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); } catch (e) { /* absent */ }
      window.claude.use("downloads").then(d => { this.downloads = d; if (d) render(); }).catch(() => {});
      window.claude.use("sample").then(s => { this.sample = s; render(); }).catch(() => {});
    }
    if (db && user) { try { this.uid = await user.id(); } catch (e) { this.uid = null; } }
    if (db && this.uid) {
      this.db = db;
      try {
        const prof = await this.profRef().get();
        const snap = await this.daysCol().orderBy("date", "desc").limit(1000).get();
        const days = {};
        snap.docs.forEach(d => { const v = d.data(); if (v && v.date) days[v.date] = clone(v); });
        if (prof.exists) {
          S = { profile: Object.assign(blankProfile(), clone(prof.data())), days };
        } else {
          const local = this.readLocal();
          if (local && local.profile) S = local;
          await this.profRef().set(clone(S.profile));
          for (const d of Object.values(S.days)) await this.dayRef(d.date).set(clone(d));
        }
        this.mode = "cloud";
        return;
      } catch (e) {
        console.warn("Private cloud storage unavailable; using this browser.", e);
        this.db = null;
      }
    }
    const local = this.readLocal();
    if (local && local.profile) S = { profile: Object.assign(blankProfile(), local.profile), days: local.days || {} };
    this.mode = "local";
  },
  dayRef(date) { return this.daysCol().doc(date); },
  schedule(key, fn) {
    clearTimeout(this.timers[key]);
    this.setStatus("saving");
    this.timers[key] = setTimeout(() => {
      this.chains[key] = (this.chains[key] || Promise.resolve())
        .then(fn)
        .then(() => this.setStatus("saved"))
        .catch(e => this.fail(e));
    }, 600);
  },
  saveProfile() {
    if (this.mode === "demo") return;
    if (this.mode === "cloud") this.schedule("profile", () => this.profRef().set(clone(S.profile)));
    else this.schedule("local", () => { if (!this.writeLocal()) throw { code: "local" }; });
  },
  saveDay(date) {
    if (this.mode === "demo") return;
    if (this.mode === "cloud") this.schedule("day:" + date, () => S.days[date] ? this.dayRef(date).set(clone(S.days[date])) : this.dayRef(date).delete());
    else this.schedule("local", () => { if (!this.writeLocal()) throw { code: "local" }; });
  },
  async saveAll() {
    if (this.mode === "cloud") {
      await this.profRef().set(clone(S.profile));
      for (const d of Object.values(S.days)) await this.dayRef(d.date).set(clone(d));
      this.setStatus("saved");
    } else if (this.mode === "local") { this.writeLocal(); this.setStatus("saved"); }
  },
  fail(e) {
    console.warn("save failed", e);
    const msg = e && e.code === "quota_exceeded" ? "Storage is full. Export a backup, then delete old days in Data."
      : e && e.code === "local" ? "This browser blocked saving. Export a backup in Data so nothing is lost."
      : "Couldn't save the last change. Check your connection; it will retry on your next edit.";
    this.setStatus("error", msg);
  },
  setStatus(s, msg) {
    this.status = s;
    if (s === "error") toast(msg);
  },
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false; t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3600);
}

// ---------- analysis engine ----------
function dayScore(d) {
  if (!d) return null;
  if (typeof d.overall === "number") return d.overall;
  const vals = Object.values(d.symptoms || {}).filter(v => typeof v === "number").sort((a, b) => b - a);
  return vals.length ? mean(vals.slice(0, 3)) : null;
}
function thresholds() {
  return S.profile.settings.unit === "ppm" ? { h2: 20, ch4: 10, low: 4, rise: 20, max: 100 } : { h2: 4, ch4: 4, low: 1, rise: 3, max: 10 };
}
// a saved meal counts as each of its foods, so a trigger inside it still shows up
function expandIds(d, map) {
  const out = [];
  for (const e of d.items || []) { out.push(e.id); const it = map[e.id]; if (it && it.parts) it.parts.forEach(p => out.push(p.id)); }
  return [...new Set(out)];
}
function itemNames(d, map) { return expandIds(d, map).map(id => map[id]).filter(Boolean); }

function rangeMean(start, end) {
  const vals = [];
  for (let d = start; d <= end; d = addDays(d, 1)) { const s = dayScore(S.days[d]); if (s != null) vals.push(s); }
  return { mean: mean(vals), n: vals.length };
}

function protocolStats(p) {
  const end = p.end && p.end < todayStr() ? p.end : todayStr();
  const base = rangeMean(addDays(p.start, -14), addDays(p.start, -1));
  const during = rangeMean(p.start, end);
  const early = rangeMean(p.start, addDays(p.start, 13) < end ? addDays(p.start, 13) : end);
  const late = rangeMean(addDays(end, -6) > p.start ? addDays(end, -6) : p.start, end);
  let after = { mean: null, n: 0 };
  if (p.end && p.end < todayStr()) after = rangeMean(addDays(p.end, 1), addDays(p.end, 60) < todayStr() ? addDays(p.end, 60) : todayStr());
  let total = 0, done = 0;
  for (let d = p.start; d <= end; d = addDays(d, 1)) {
    total++;
    const day = S.days[d];
    if (day && p.itemIds.length && p.itemIds.every(id => day.items.some(it => it.id === id))) done++;
  }
  const adherence = total && p.itemIds.length ? done / total : null;
  const improved = base.mean != null && late.mean != null && late.mean <= base.mean - 1.5;
  const relapse = improved && after.n >= 5 && after.mean >= base.mean - 0.5;
  const worse = base.mean != null && early.n >= 4 && early.mean >= base.mean + 1.5;
  const flat = base.mean != null && late.n >= 4 && Math.abs(late.mean - base.mean) < 1 && during.n >= 10;
  let verdict = "Not enough data yet";
  if (base.mean == null) verdict = "Needs 2 weeks of logs before the start date to compare";
  else if (relapse) verdict = "Helped, then symptoms came back after stopping";
  else if (improved) verdict = "Symptoms improved";
  else if (worse) verdict = "Symptoms got worse in the first 2 weeks";
  else if (flat) verdict = "No clear change";
  else if (during.n >= 4) verdict = "Too early to call";
  return { base, during, early, late, after, adherence, improved, relapse, worse, flat, verdict };
}

function isAntimicrobial(p, map) {
  return p.kind === "antimicrobial" || GROUPS.antimicrobial.test(p.name) || p.itemIds.some(id => map[id] && GROUPS.antimicrobial.test(map[id].name));
}
function targetsMethane(p, map) {
  return GROUPS.methaneTx.test(p.name) || p.itemIds.some(id => map[id] && GROUPS.methaneTx.test(map[id].name));
}

function lift(predicate) {
  // average day+next-day score on days where predicate holds vs days it doesn't
  const withV = [], without = [];
  for (const d of Object.values(S.days)) {
    const s0 = dayScore(d), s1 = dayScore(S.days[addDays(d.date, 1)]);
    const vals = [s0, s1].filter(v => v != null);
    if (!vals.length) continue;
    (predicate(d) ? withV : without).push(mean(vals));
  }
  if (withV.length < 3 || without.length < 3) return null;
  return { lift: mean(withV) - mean(without), n: withV.length, nOff: without.length, on: mean(withV), off: mean(without) };
}

function analyze() {
  const map = lib();
  const days = Object.values(S.days).sort((a, b) => (a.date < b.date ? -1 : 1));
  const F = {};
  const scored = days.filter(d => dayScore(d) != null);
  // symptoms
  const symDays = days.filter(d => Object.keys(d.symptoms || {}).length);
  const symF = k => {
    const v = symDays.map(d => d.symptoms[k]).filter(x => typeof x === "number");
    return v.length >= 3 ? clamp((mean(v) - 1.5) / 3.5) : null;
  };
  ["reflux", "nausea", "early_satiety", "brainfog", "flushing", "dizzy", "joint", "skin", "anxiety", "fatigue", "sulfur"].forEach(k => { F[k] = symF(k); });
  // BMs
  const bmDays = days.filter(d => d.bms.length || d.noBM);
  if (bmDays.length >= 5) {
    F.constipation = clamp(bmDays.filter(d => d.noBM || d.bms.some(b => b.bristol && b.bristol <= 2)).length / bmDays.length / 0.5);
    F.diarrhea = clamp(bmDays.filter(d => d.bms.some(b => b.bristol >= 6)).length / bmDays.length / 0.4);
    const bms = bmDays.flatMap(d => d.bms);
    if (bms.length >= 5) F.incomplete = clamp(bms.filter(b => b.incomplete || b.straining).length / bms.length / 0.5);
  }
  // breath
  const T = thresholds();
  const readings = days.flatMap(d => d.breath.map(r => ({ ...r, date: d.date })));
  let breathSummary = null;
  if (readings.length >= 3) {
    const h2v = readings.map(r => num(r.h2)).filter(v => v != null);
    const chv = readings.map(r => num(r.ch4)).filter(v => v != null);
    F.ch4_high = chv.length >= 3 ? clamp(chv.filter(v => v >= T.ch4).length / chv.length / 0.5) : null;
    F.h2_high = h2v.length >= 3 ? clamp(h2v.filter(v => v >= T.h2).length / h2v.length / 0.5) : null;
    let postDays = 0, earlyDays = 0, flatDays = 0, badBreathDays = 0;
    const breathDays = days.filter(d => d.breath.length);
    for (const d of breathDays) {
      const h = d.breath.map(r => num(r.h2)).filter(v => v != null);
      const base = d.breath.filter(r => r.ctx === "fasting").map(r => num(r.h2)).filter(v => v != null);
      const b0 = base.length ? Math.min(...base) : (h.length ? Math.min(...h) : 0);
      const post = d.breath.filter(r => r.ctx !== "fasting" && num(r.mins) != null && num(r.mins) <= 90);
      if (post.length) { postDays++; if (post.some(r => num(r.h2) != null && num(r.h2) - b0 >= T.rise)) earlyDays++; }
      const sc = dayScore(d);
      if (sc != null && sc >= 6) {
        badBreathDays++;
        const mh = Math.max(0, ...h), mc = Math.max(0, ...d.breath.map(r => num(r.ch4) || 0));
        if (mh <= T.low && mc <= T.low) flatDays++;
      }
    }
    F.h2_early = postDays >= 2 ? clamp(earlyDays / postDays / 0.5) : null;
    F.flat_breath = badBreathDays >= 2 ? clamp(flatDays / badBreathDays / 0.5) : null;
    const avgH = mean(h2v), avgC = mean(chv);
    breathSummary = {
      n: readings.length, days: breathDays.length, avgH, avgC,
      maxH: h2v.length ? Math.max(...h2v) : null, maxC: chv.length ? Math.max(...chv) : null,
      pctC: chv.length ? chv.filter(v => v >= T.ch4).length / chv.length : 0,
      pctH: h2v.length ? h2v.filter(v => v >= T.h2).length / h2v.length : 0,
      early: postDays ? earlyDays / postDays : null, flat: badBreathDays ? flatDays / badBreathDays : null,
    };
  }
  // eating pattern
  const counts = days.map(d => num(d.food.count)).filter(v => v != null);
  if (counts.length >= 3) { const a = mean(counts); F.grazing = a >= 5 ? 1 : a >= 4 ? 0.5 : 0; }
  const lasts = days.filter(d => d.food.last);
  if (lasts.length >= 3) F.late_eating = clamp(lasts.filter(d => hrs(d.food.last) >= 21).length / lasts.length / 0.5);
  const gaps = [];
  for (const d of lasts) { const n = S.days[addDays(d.date, 1)]; if (n && n.food && n.food.first) gaps.push(24 - hrs(d.food.last) + hrs(n.food.first)); }
  if (gaps.length >= 3) F.overnight_gap_short = clamp(gaps.filter(g => g < 12).length / gaps.length / 0.6);
  // sleep & stress
  const sh = days.map(d => num(d.sleep.hours)).filter(v => v != null);
  const sq = days.map(d => num(d.sleep.quality)).filter(v => v != null);
  if (sh.length >= 5 || sq.length >= 5) {
    const a = mean(sh), q = mean(sq);
    F.poor_sleep = Math.max(a == null ? 0 : a < 6 ? 1 : a < 7 ? 0.5 : 0, q == null ? 0 : q <= 2 ? 1 : q <= 3 ? 0.4 : 0);
  }
  const st = days.map(d => num(d.stress)).filter(v => v != null);
  if (st.length >= 5) { const a = mean(st); F.high_stress = a >= 7 ? 1 : a >= 5 ? 0.5 : 0; }
  // logged items
  if (days.length >= 5) {
    const any = re => days.some(d => itemNames(d, map).some(i => re.test(i.name)));
    F.ppi_logged = any(GROUPS.ppi) ? 1 : 0;
    F.opioid_logged = any(GROUPS.opioid) ? 1 : 0;
    F.alcohol_logged = clamp(days.filter(d => itemNames(d, map).some(i => i.cat === "food" && GROUPS.alcohol.test(i.name))).length / days.length / 0.4);
  }
  // food group triggers
  const groupLift = {};
  for (const g of ["histamine", "fodmap", "sulfur", "fat"]) {
    const l = lift(d => itemNames(d, map).some(i => i.cat === "food" && GROUPS[g].test(i.name)));
    groupLift[g] = l;
    F[g + "_trigger"] = l ? (l.lift >= 0.8 ? clamp(l.lift / 2) : 0) : null;
  }
  // protocols
  const protoStats = S.profile.protocols.map(p => ({ p, s: protocolStats(p) }));
  const anti = protoStats.filter(x => isAntimicrobial(x.p, map));
  if (protoStats.some(x => x.s.base.mean != null)) F.relapse = protoStats.some(x => x.s.relapse) ? 1 : 0;
  if (anti.some(x => x.s.base.mean != null)) {
    F.antimicrobial_worse = anti.some(x => x.s.worse) ? 1 : 0;
    F.antimicrobial_flat = anti.some(x => x.s.flat) ? 1 : 0;
  }
  if (F.ch4_high != null && F.ch4_high >= 0.5 && anti.length) F.ch4_untargeted = anti.some(x => targetsMethane(x.p, map)) ? 0 : 1;
  // cycle
  const periodDays = days.filter(d => d.period);
  if (periodDays.length) {
    const near = new Set();
    periodDays.forEach(d => { for (let i = -5; i <= 0; i++) near.add(addDays(d.date, i)); });
    const on = scored.filter(d => near.has(d.date)).map(dayScore), off = scored.filter(d => !near.has(d.date)).map(dayScore);
    if (on.length >= 3 && off.length >= 5) { const l = mean(on) - mean(off); F.cycle_flares = l >= 1.5 ? 1 : l >= 1 ? 0.5 : 0; }
  }
  // item correlations
  const correlations = [];
  for (const it of S.profile.library) {
    const l = lift(d => expandIds(d, map).includes(it.id));
    if (l) correlations.push({ it, ...l });
  }
  correlations.sort((a, b) => b.lift - a.lift);
  return { F, days, scored, breathSummary, groupLift, protoStats, correlations, map };
}

function sigInfo(k, F) {
  const t = k[0], key = k.slice(2);
  if (t === "i") {
    const a = S.profile.intake[key], q = INTAKEMAP[key];
    const v = a === "y" ? 1 : a === "u" ? 0.35 : a === "n" ? 0 : null;
    return { v, label: q ? (a === "u" ? "Unsure: " : "You said yes: ") + q.q : key, src: "History" };
  }
  if (t === "l") {
    const lab = LABMAP[key], raw = num(S.profile.labs[key]);
    if (!lab || raw == null) return { v: null };
    return { v: lab.flag(raw), label: `${lab.name}: ${lab.bool ? (raw >= 1 ? "positive" : "negative") : raw + " " + lab.unit}. ${lab.hint}.`, src: "Lab" };
  }
  const v = F[key];
  return { v: v == null ? null : v, label: FEATURES[key] || key, src: "Journal" };
}

function scoreDrivers(F) {
  return DRIVERS.map(d => {
    let pts = 0, known = 0, total = 0;
    const why = [], unknown = [];
    for (const s of d.signals) {
      total += s.w;
      const info = sigInfo(s.k, F);
      if (info.v == null) { unknown.push(s.k); continue; }
      known += s.w;
      pts += s.w * info.v;
      if (info.v > 0) why.push({ ...info, w: s.w * info.v });
    }
    why.sort((a, b) => b.w - a.w);
    // a shared, low-weight symptom alone (e.g. constipation) isn't enough to surface a driver
    const specific = d.signals.some(s => s.w >= 2 && (sigInfo(s.k, F).v || 0) > 0);
    if (!specific) pts = Math.min(pts, 0);
    const level = pts >= 5 ? "strong" : pts >= 3 ? "likely" : pts >= 1.5 ? "possible" : pts > 0 ? "weak" : "none";
    return { d, pts, known, total, why, unknown, level, coverage: total ? known / total : 0 };
  }).sort((a, b) => b.pts - a.pts || b.coverage - a.coverage);
}
const LEVEL_LABEL = { strong: "Strong match", likely: "Likely", possible: "Possible", weak: "Weak signal", none: "No signal yet" };

// ---------- sample data ----------
function sampleState() {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const p = blankProfile();
  const L = (name, cat, dose) => { const it = { id: newId(), name, cat, dose: dose || "" }; p.library.push(it); return it; };
  const foods = ["Eggs", "Sourdough toast", "Chicken & rice", "Salmon", "Zucchini", "Blueberries", "Oats", "Coffee", "Garlic", "Onion", "Red wine", "Aged cheddar", "Banana", "Spinach salad"].map(n => L(n, "food"));
  const [mag, phgg, alli, berb, ginger] = [L("Magnesium citrate", "supp", "300 mg"), L("PHGG", "supp", "5 g"), L("Allicin (Allimed)", "supp", "2 caps 3x/day"), L("Berberine", "supp", "500 mg 2x/day"), L("Ginger + artichoke", "supp", "bedtime")];
  const walk = L("Walk after meals", "practice"), hum = L("Humming / gargling", "practice");
  const start = addDays(todayStr(), -41);
  const protoStart = addDays(start, 15), proki = addDays(start, 34);
  p.protocols.push({ id: newId(), name: "Methane herbal round", kind: "antimicrobial", start: protoStart, end: "", itemIds: [alli.id, berb.id, phgg.id], notes: "Allicin + berberine, PHGG daily" });
  p.protocols.push({ id: newId(), name: "Bedtime prokinetic", kind: "prokinetic", start: proki, end: "", itemIds: [ginger.id], notes: "" });
  Object.assign(p.intake, { foodpoisoning: "y", snacker: "y", lifelong_constipation: "u", straining: "y", hypothyroid: "n", ppi: "n", abd_surgery: "n", cold_intol: "u", stress_onset: "n", rifaximin_only_methane: "y", multiple_failed: "y" });
  Object.assign(p.labs, { tsh: 2.9, ferritin: 38, vitd: 31 });
  const days = {};
  for (let i = 0; i <= 41; i++) {
    const date = addDays(start, i), onP = date >= protoStart, onK = date >= proki;
    const d = { date, items: [], symptoms: {}, bms: [], breath: [], sleep: {}, food: {}, sample: true };
    const add = it => d.items.push({ id: it.id, dose: it.dose || "", time: "" });
    [foods[0], foods[7], foods[2]].forEach(add);
    for (let j = 0; j < 3; j++) add(foods[3 + Math.floor(rnd() * 11)]);
    add(mag); if (rnd() > 0.4) add(walk); if (onP) { add(alli); add(berb); add(phgg); } if (onK) add(ginger); if (rnd() > 0.6) add(hum);
    const trig = d.items.some(x => [foods[8].id, foods[9].id, foods[10].id].includes(x.id));
    const base = onP ? Math.max(2.5, 7 - (i - 15) * 0.13) : 7;
    const b = clamp(Math.round(base + (trig ? 1.5 : 0) + (rnd() - 0.5) * 2), 0, 10);
    d.symptoms = { bloating: b, distension: clamp(b - 1, 0, 10), gas: clamp(b - 2 + Math.round(rnd() * 2), 0, 10), pain: clamp(b - 3, 0, 10), fatigue: 4 + Math.round(rnd() * 3), brainfog: 3 + Math.round(rnd() * 3) };
    const bristol = onK ? 3 + Math.round(rnd()) : onP && rnd() > 0.5 ? 3 : 2 - Math.round(rnd());
    if (rnd() > 0.2) d.bms.push({ id: newId(), time: "08:15", bristol: Math.max(1, bristol), size: onK ? "m" : rnd() > 0.5 ? "s" : "m", incomplete: !onK && rnd() > 0.4, straining: !onK && rnd() > 0.5, urgency: false }); else d.noBM = true;
    if (i % 2 === 0) {
      const c = onP ? Math.max(2, 7 - (i - 15) * 0.18) : 7;
      d.breath.push({ id: newId(), time: "07:30", ctx: "fasting", mins: "", ch: "", h2: Math.round(rnd() * 2), ch4: Math.round(c + rnd()) });
      d.breath.push({ id: newId(), time: "13:30", ctx: "meal", mins: 60, ch: "Meal", h2: 1 + Math.round(rnd() * 3), ch4: Math.round(c + 1 + rnd()) });
    }
    d.food = { first: "08:00", last: rnd() > 0.5 ? "21:30" : "19:30", count: 4 + Math.round(rnd() * 2) };
    d.sleep = { hours: 6 + Math.round(rnd() * 2 * 2) / 2, quality: 2 + Math.round(rnd() * 2) };
    d.stress = 4 + Math.round(rnd() * 4);
    if (i >= 22 && i <= 26) d.period = true;
    days[date] = d;
  }
  return { profile: p, days };
}

// ---------- color that returns as you recover ----------
// 0 = black and white, 1 = full color. Driven by the 7-day average day score (0 best, 10 worst):
// an average of 6.5 or worse stays monochrome, 1.5 or better is fully vibrant.
const COLOR_STAGES = ["Black and white for now", "First hints of color", "Pastels", "Soft color", "Brighter color", "Full color"];
function recentAverage() {
  const t = todayStr(), vals = [];
  for (let i = 0; i < 7; i++) { const s = dayScore(S.days[addDays(t, -i)]); if (s != null) vals.push(s); }
  return vals.length >= 3 ? { avg: mean(vals), n: vals.length } : null;
}
function colorLevel() {
  const mode = S.profile.settings.color || "auto";
  if (mode === "mono") return 0;
  if (mode === "full") return 1;
  const r = recentAverage();
  return r ? clamp((6.5 - r.avg) / 5) : 0;
}
const colorStage = w => Math.min(5, Math.ceil(w * 5 - 0.001));
