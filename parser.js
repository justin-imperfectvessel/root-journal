/* SIBO Root Journal — turns a spoken or typed day into journal proposals, entirely on this device.

   parseDay(text, ctx) -> { proposals, unparsed }
     ctx = { library: [{id, name, cat, dose}], symptoms: [{k, name}] }
     proposals: [{ pid, kind, ...fields, uncertain?, why? }] where kind is one of
       item (id or newName + cat, dose, time) · sym (k, v) · overall (v) · bm (bm) · nobm
       breath (r) · sleep (f, v) · stress (v) · period · food (f, v)
     unparsed: sentences nothing was found in, offered as notes.

   It works because the vocabulary is narrow: the person's own item names, symptom
   names, Bristol types, hours, ppm and 0-10 ratings. Anything it guesses at is marked
   uncertain so the review step can highlight it. Pure function: no DOM, no storage. */
(function (root) {
  const NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 };
  const ONES = "one|two|three|four|five|six|seven|eight|nine";

  function normalize(text) {
    let t = " " + String(text || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ") + " ";
    t = t.replace(new RegExp(`\\b(twenty|thirty|forty|fifty|sixty|ninety)[\\s-](${ONES})\\b`, "g"), (m, a, b) => NUM[a] + NUM[b]);
    t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety)\b/g, m => NUM[m]);
    t = t.replace(/\b(\d+)\s+and\s+(?:a\s+)?half\b/g, (m, n) => `${n}.5`).replace(/\bhalf an hour\b/g, "0.5 hours").replace(/\ban hour\b/g, "1 hour");
    t = t.replace(/\btwice\b/g, "2 times").replace(/\bonce\b/g, "1 times").replace(/\bthree times\b/g, "3 times");
    t = t.replace(/\b(\d+)\s*(?:out of|outta|\/)\s*10\b/g, "$1");
    t = t.replace(/\b(?:[b-hj-z]\.?\s){2,}[a-z]\b\.?/g, m => m.replace(/[\s.]/g, "") + " "); // "p h g g" -> "phgg"
    t = t.replace(/\bb\.?m\.?s\b/g, "bms").replace(/\bb\.\s?m\.?\b/g, "bm").replace(/\bc\s?h\s?4\b/g, "ch4").replace(/\bh\s?2\s?s\b/g, "h2s");
    return t;
  }

  const SENT = /(?<=[.!?;\n])\s+|\s+(?:and then|after that|later on|later)\s+/;
  const sentences = t => t.split(SENT).map(s => s.trim()).filter(Boolean);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pad = n => String(n).padStart(2, "0");

  // "at 8", "8:30am", "around 9 pm", "noon". Bare numbers only count as times after at/around/by.
  function findTime(s, hint) {
    if (/\bnoon\b|\blunchtime\b/.test(s) && !/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(s)) return "12:00";
    if (/\bmidnight\b/.test(s)) return "00:00";
    const m = s.match(/\b(?:at|around|about|by|@|before|after)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?!\s*(?:hours?|hrs?|min|minutes|mg|ppm|g\b|%|times|out))/) ||
      s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/) || s.match(/\b(\d{1,2}):(\d{2})\b()/);
    if (!m) return null;
    let h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0, ap = (m[3] || "").replace(/\./g, "");
    if (h > 23 || min > 59) return null;
    if (ap === "pm" && h < 12) h += 12;
    else if (ap === "am" && h === 12) h = 0;
    else if (!ap && h < 12) {
      const ctx = s + " " + (hint || "");
      if (/\b(dinner|supper|evening|tonight|night|bed)\b/.test(ctx)) { if (h < 12 && h >= 1) h += 12; }
      else if (/\b(breakfast|morning|woke)\b/.test(ctx)) { /* keep am */ }
      else if (h >= 1 && h <= 6) h += 12;
    }
    return `${pad(h)}:${pad(min)}`;
  }

  // Symptom vocabulary: the app's keys plus how people say them.
  const SYM_WORDS = {
    bloating: "bloat(?:ing|ed)?", distension: "distend(?:ed|ing)?|distension|swollen belly|looked pregnant", pain: "(?:abdominal |stomach |belly |tummy )?(?:pain|cramp(?:s|ing|y)?|ache)",
    gas: "gas(?:sy)?|flatulence|fart(?:ing|s)?|wind", belching: "belch(?:ing|y)?|burp(?:ing|s|y)?", sulfur: "sulfur|sulphur|rotten egg",
    reflux: "reflux|heartburn|acid", nausea: "nause(?:a|ous|ated)|queasy", early_satiety: "full (?:quickly|fast|early)|early satiety|filled up fast",
    urgency: "urgen(?:cy|t)", fatigue: "fatigue(?:d)?|tired(?:ness)?|exhausted|low energy|wiped out", brainfog: "brain fog|foggy|fog",
    anxiety: "anxi(?:ety|ous)|low mood|depress(?:ed|ion)|down in the dumps|mood", joint: "joint(?:s)? (?:pain|ache)|achy joints", skin: "skin|rash|eczema|acne|hives",
    flushing: "flush(?:ing|ed)?|itch(?:y|ing)?", dizzy: "dizz(?:y|iness)|lightheaded|light-headed", headache: "headache|migraine|head ache",
  };
  const SEVERITY = [[/\b(no|zero|none|not|without)\b/, 0], [/\b(barely|hardly|tiny bit)\b/, 1], [/\b(mild|slight(?:ly)?|a (?:little|bit)|bit of|minor)\b/, 3],
    [/\b(some|moderate|medium|noticeable)\b/, 5], [/\b(bad|pretty bad|strong|quite|a lot)\b/, 7], [/\b(severe|terrible|awful|horrible|really bad|so bad|unbearable|worst)\b/, 9]];

  function aliasesFor(name, cat) {
    const n = name.toLowerCase().trim(), out = new Set([n]);
    const noParen = n.replace(/\s*\(.*?\)\s*/g, " ").trim(); if (noParen) out.add(noParen);
    (n.match(/\(([^)]+)\)/g) || []).forEach(p => out.add(p.slice(1, -1).trim()));
    // "&" and "+" are said as "and" or "plus"
    [...out].forEach(x => { if (/[&+]/.test(x)) { out.add(x.replace(/\s*[&+]\s*/g, " and ")); out.add(x.replace(/\s*[&+]\s*/g, " plus ")); } });
    // "Ginger + artichoke" can be said as either part; a dish like "Chicken & rice" can't
    if (cat !== "food") n.split(/\s*(?:\+|&|\/)\s*/).forEach(p => { if (p.length >= 4) out.add(p.trim()); });
    return [...out].filter(a => a.length >= 3);
  }
  const NEGATE = /\b(didn't|did not|didnt|no|skipped|skip|without|forgot|missed|not|avoided|stopped|none of)\b(?:\s+\w+){0,3}\s*$/;

  // Words that end a food or supplement list, and words that are never an item.
  const LIST_END = /\b(for (?:breakfast|lunch|dinner|a snack)|at|around|about|by|but|because|which|that|so|after|before|this|today|tonight|this morning|this afternoon|this evening|last night|yesterday|in the|felt|feeling|and felt|it|which made|was|were)\b|[.;!?]/;
  const NOT_ITEM = /^(it|that|this|them|the|a|an|my|your|some|nothing|a lot|lots|much|food|stuff|something|anything|everything|breakfast|lunch|dinner|snack|snacks|meal|meals|a meal|my meal|my supplements|my meds|supplements|meds|medication|bm|a bm|bms|sleep|stress|pain|gas|bloating|period|my period|\d+.*|fun|time|day|enough|a good day|a bad day|a rough day|a great day)$/;
  const CLEAN = /^(?:(?:a|an|the|some|my|of|more|another|bit of|little|small|large|big|bowl of|cup of|cups of|glass of|slice of|slices of|piece of|pieces of|handful of|plate of|serving of|scoop of|few|couple(?: of)?|\d+(?:\.\d+)?|half|extra)\s+)+/;
  const DOSE = /(\d+(?:\.\d+)?)\s?(mg|mcg|µg|g|grams?|iu|ml|caps?|capsules?|tablets?|tabs?|pills?|drops?|scoops?|tsp|tbsp)\b/;

  // Near-miss matching for names speech-to-text gets slightly wrong ("allison" for allicin, "phg" for PHGG).
  // Compares rough sound-alike keys and allows about one wrong letter per four.
  const COMMON = new Set(("about after again also always and another around back because been before being both breakfast but came come could day did dinner does done down each even every feel felt few first for from gave get good got great had has have having here how into just know last later like little lunch made make many maybe more morning most much night not now off once only other our out over really right same said see should since slept some still such take than that the their them then there these they thing think this those time today took very want was way well went were what when where which while who will with would yeah yes you your pretty kind sort felt feeling stomach gut belly also around").split(" "));
  const SYM_ANY = new RegExp(`^(?:${Object.values({ bloating: "bloat(?:ing|ed)?", f: "fog(?:gy)?|brain fog", g: "gas(?:sy)?", p: "pain|cramps?|ache" }).join("|")})$`);
  const soundKey = s => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/ph/g, "f").replace(/c(?=[eiy])/g, "s").replace(/ck|c|q/g, "k").replace(/z/g, "s").replace(/y/g, "i").replace(/(.)\1+/g, "$1");
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 9;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }

  function parseDay(text, ctx) {
    const library = (ctx && ctx.library) || [], symptoms = (ctx && ctx.symptoms) || [];
    const t = normalize(text), sents = sentences(t);
    const proposals = [], used = new Set(), sentHit = new Array(sents.length).fill(false);
    let pid = 0;
    const add = p => { p.pid = "p" + (++pid); proposals.push(p); return p; };
    const sentIndexAt = pos => { let acc = 0; for (let i = 0; i < sents.length; i++) { const at = t.indexOf(sents[i], acc); if (at <= pos && pos < at + sents[i].length) return i; acc = at >= 0 ? at : acc; } return -1; };
    const markSent = s => { const i = sents.indexOf(s); if (i >= 0) sentHit[i] = true; };

    // ---- known items (food, supplements, medications, practices) ----
    const aliasList = [];
    library.filter(i => !i.hidden).forEach(it => aliasesFor(it.name, it.cat).forEach(a => aliasList.push({ a, it })));
    aliasList.sort((x, y) => y.a.length - x.a.length);
    let masked = t;
    const foundItems = new Map();
    for (const { a, it } of aliasList) {
      const re = new RegExp(`\\b${esc(a)}(?:e?s)?\\b`, "g");
      let m;
      while ((m = re.exec(masked))) {
        const before = masked.slice(Math.max(0, m.index - 30), m.index);
        masked = masked.slice(0, m.index) + "§".repeat(m[0].length) + masked.slice(m.index + m[0].length);
        const si = sentIndexAt(m.index), sent = sents[si] || "";
        if (si >= 0) sentHit[si] = true;
        if (NEGATE.test(before)) { foundItems.set(it.id, { negated: true }); continue; }
        if (foundItems.has(it.id)) continue;
        // a dose belongs to an item only when it sits right next to it: "berberine 500 mg" or "300 mg magnesium"
        const after = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
        const da = after.match(new RegExp("^\\W{0,3}" + DOSE.source)), db = before.match(new RegExp(DOSE.source + "\\s*(?:of\\s+)?$"));
        const dose = (da ? da[0].replace(/^\W+/, "") : db ? db[0].trim() : "");
        foundItems.set(it.id, { it, time: findTime(sent, it.cat === "food" ? sent : ""), dose });
      }
    }
    for (const [id, f] of foundItems) if (!f.negated) { add({ kind: "item", id, cat: f.it.cat, name: f.it.name, dose: f.dose || "", time: f.time || "" }); used.add(f.it.name.toLowerCase()); }

    // ---- near misses for known items ----
    {
      const words = []; const wre = /[a-z0-9]+/g; let w;
      while ((w = wre.exec(masked))) words.push({ s: w[0], i: w.index, e: w.index + w[0].length });
      const targets = aliasList.filter(x => !foundItems.has(x.it.id) && x.a.replace(/[^a-z0-9]/g, "").length >= 4).map(x => ({ ...x, key: soundKey(x.a), n: x.a.split(/\s+/).length }));
      const taken = new Set();
      for (const tg of targets) {
        if (taken.has(tg.it.id)) continue;
        const tol = Math.min(3, Math.max(1, Math.floor(tg.key.length / 4)));
        for (let k = 0; k < words.length && !taken.has(tg.it.id); k++) {
          for (const n of [tg.n, tg.n + 1, tg.n + 2, tg.n + 3, tg.n - 1].filter(x => x >= 1 && x <= 4)) { // spelled-out speech: "pro cal o pride"
            const span = words.slice(k, k + n);
            if (span.length < n) continue;
            const heard = span.map(x => x.s).join(" ");
            if (span.some(x => COMMON.has(x.s) || /^\d+$/.test(x.s)) || heard.replace(/ /g, "").length < 3) continue;
            if (SYM_ANY.test(heard)) continue;
            // short names like PHGG sound like too many words, so compare their letters exactly instead
            const raw = heard.replace(/[^a-z0-9]/g, ""), rawT = tg.a.replace(/[^a-z0-9]/g, "");
            const close = tg.key.length < 4 ? raw[0] === rawT[0] && lev(raw, rawT) <= 1 : (() => { const hk = soundKey(heard); return hk[0] === tg.key[0] && lev(hk, tg.key) <= tol; })();
            if (!close) continue;
            const start = span[0].i, end = span[n - 1].e, before = masked.slice(Math.max(0, start - 30), start);
            masked = masked.slice(0, start) + "§".repeat(end - start) + masked.slice(end);
            const si = sentIndexAt(start); if (si >= 0) sentHit[si] = true;
            taken.add(tg.it.id);
            if (NEGATE.test(before)) break;
            add({ kind: "item", id: tg.it.id, cat: tg.it.cat, name: tg.it.name, dose: "", time: findTime(sents[si] || "", tg.it.cat === "food" ? sents[si] : "") || "", uncertain: true, why: `Heard "${heard}"` });
            used.add(tg.it.name.toLowerCase());
            break;
          }
        }
      }
    }

    // ---- new items from "ate / had / drank / took ..." ----
    const knownNames = new Set(aliasList.map(x => x.a));
    // scan the masked text so names already matched above can't turn into "new" items
    const maskedSents = []; { let acc = 0; for (const s of sents) { const at = t.indexOf(s, acc); maskedSents.push(at >= 0 ? masked.slice(at, at + s.length) : s); if (at >= 0) acc = at + s.length; } }
    let lastCat = null;
    for (let si = 0; si < sents.length; si++) {
      const s = maskedSents[si];
      const verbs = [[/\b(?:i\s+)?(?:ate|eaten|had|drank|drinking|eating|having|snacked on|(?:breakfast|lunch|dinner|supper|snack) was|for (?:breakfast|lunch|dinner)(?: i had| was)?)\s+(.+)/, "food"], [/\b(?:i\s+)?(?:took|take|taking|used)\s+(?:my\s+)?(.+)/, "supp"]];
      // "…ate oatmeal with banana and later a turkey sandwich": a short verbless clause continues the last list
      if (lastCat && !verbs.some(([re]) => re.test(s)) && /^(?:a|an|some|the|more)\s+[a-z]/.test(s) && s.split(" ").length <= 7 && !/\b(was|is|felt|slept|woke|took|bm|poop|stress)\b/.test(s)) verbs.unshift([/^(.+)/, lastCat]);
      let hitVerb = false;
      for (const [re, cat] of verbs) {
        const m = s.match(re);
        if (!m) continue;
        hitVerb = true; lastCat = cat;
        // "chicken and rice around 12:30 then almonds": a time phrase separates items instead of ending the list
        const listTxt = m[1].replace(/\b(?:at|around|about|by)\s+\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?/g, ",").split(LIST_END)[0];
        for (let part of listTxt.split(/,|\band\b|\bwith\b|\bplus\b|\balong with\b|\bor\b|\bthen\b/)) {
          const dose = (part.match(DOSE) || [])[0] || "";
          part = part.replace(DOSE, "").replace(/§+/g, "").trim().replace(CLEAN, "").replace(/\b(?:today|this morning|tonight|again|too|as well|also|first|then)\b/g, "").replace(/[^a-z0-9 \-&]/g, "").replace(/\s+/g, " ").trim();
          if (!part || part.length < 3 || part.length > 32 || part.split(" ").length > 4 || NOT_ITEM.test(part) || knownNames.has(part) || used.has(part)) continue;
          if (Object.values(SYM_WORDS).some(w => new RegExp(`^(?:${w})$`).test(part))) continue;
          used.add(part);
          sentHit[si] = true;
          // "toast" when you already have "Sourdough toast": use the one existing item that contains the word
          const partial = library.filter(it => !it.hidden && !foundItems.has(it.id) && part.length >= 4 && !part.includes(" ") && it.name.toLowerCase().split(/[^a-z0-9]+/).includes(part));
          if (partial.length === 1 && !proposals.some(p => p.id === partial[0].id)) {
            const it = partial[0];
            add({ kind: "item", id: it.id, cat: it.cat, name: it.name, dose, time: it.cat === "food" ? findTime(s, s) || "" : "", uncertain: true, why: `Heard "${part}"` });
            continue;
          }
          add({ kind: "item", newName: part.replace(/\b\w/g, c => c.toUpperCase()), cat, dose, time: cat === "food" ? findTime(s, s) || "" : "", uncertain: true, why: "New item" });
        }
        break;
      }
      if (!hitVerb) lastCat = null;
    }

    // ---- symptoms with a 0-10 rating or a severity word nearby ----
    const symDefs = symptoms.map(s => ({ k: s.k, re: SYM_WORDS[s.k] || esc(s.name.toLowerCase()) }));
    const allSymRe = new RegExp(`\\b(?:${symDefs.map(d => d.re).join("|")})\\b`, "g");
    for (const d of symDefs) {
      const re = new RegExp(`\\b(?:${d.re})\\b`, "g");
      let m;
      while ((m = re.exec(t))) {
        const si = sentIndexAt(m.index), sent = sents[si] || "";
        if (d.k === "reflux" && /\bacid\b/.test(m[0]) && !/\b(reflux|burn|stomach)\b/.test(sent)) continue;
        if (d.k === "anxiety" && m[0] === "mood" && !/\b(low|bad|down|anxious|depressed|poor)\b/.test(sent)) continue;
        if (d.k === "skin" && !/\b(skin|rash|eczema|acne|hives)\b.{0,20}\b(flare|bad|itch|break|\d)|\b(rash|eczema|hives|acne)\b/.test(sent)) continue;
        if (/\bstress/.test(sent.slice(Math.max(0, m.index - 0)))) { /* stress handled below */ }
        // window after the word, stopping at the next symptom word
        let after = t.slice(m.index + m[0].length, m.index + m[0].length + 34);
        allSymRe.lastIndex = 0;
        const nx = after.search(new RegExp(`\\b(?:${symDefs.filter(x => x.k !== d.k).map(x => x.re).join("|")})\\b|[.;!?]`));
        if (nx >= 0) after = after.slice(0, nx);
        const before = t.slice(Math.max(0, m.index - 22), m.index).split(/[,.;!?]/).pop();
        let v = null, uncertain = false;
        const na = after.match(/^\D{0,16}?\b(\d{1,2}(?:\.5)?)\b(?!\s*(?:am|pm|hours?|hrs?|min|minutes|mg|ppm|times|:))/);
        const nb = before.match(/\b(\d{1,2})\b\D{0,10}$/);
        if (na && Number(na[1]) <= 10) v = Math.round(Number(na[1]));
        else if (nb && Number(nb[1]) <= 10 && !/\b(at|around|by)\s+\d/.test(before)) v = Number(nb[1]);
        else {
          const win = before + " " + after;
          for (const [w, val] of SEVERITY) if (w.test(win)) { v = val; }
          if (v == null) { v = 5; uncertain = true; }
          else if (/\b(no|not|without|zero)\b/.test(before)) v = 0;
        }
        if (si >= 0) sentHit[si] = true;
        if (!proposals.some(p => p.kind === "sym" && p.k === d.k)) add({ kind: "sym", k: d.k, name: (symptoms.find(x => x.k === d.k) || {}).name || d.k, v, uncertain, why: uncertain ? "No rating heard, guessed 5" : "" });
        break;
      }
    }

    // ---- overall day ----
    {
      const words = { amazing: 1, great: 1, excellent: 1, good: 3, decent: 4, fine: 5, ok: 5, okay: 5, alright: 5, meh: 5, rough: 7, bad: 7, poor: 7, hard: 7, awful: 9, terrible: 9, horrible: 9, miserable: 9 };
      let m = t.match(/\boverall\D{0,24}?\b(\d{1,2})\b/);
      if (m && Number(m[1]) <= 10) { add({ kind: "overall", v: Number(m[1]) }); markSent(sents.find(s => s.includes("overall")) || ""); }
      else if ((m = t.match(/\b(?:gut|stomach|tummy|belly|day|digestion)\s+(?:was|felt|is|has been|feels)\s+(?:pretty |really |very |quite |mostly |kind of |a )?(\w+)/) || t.match(/\b(\w+)\s+(?:gut )?day\b/))) {
        if (words[m[1]] != null) { add({ kind: "overall", v: words[m[1]], uncertain: m[0].includes(" day") && !/gut/.test(m[0]), why: "From how you described the day" }); markSent(sents.find(s => s.includes(m[0].trim())) || ""); }
      }
    }

    // ---- bowel movements ----
    const BMW = /\b(bms?|bowel movements?|poop(?:ed|s)?|pooped|stools?|went to the bathroom|number two|movement)\b/;
    if (/\b(no|didn't have (?:a|any)|didn't|did not|haven't had (?:a|any)?|zero)\s+(?:\w+\s+)?(bms?|bowel movements?|poop|poo)\b|\bdidn't (?:go|poop)\b/.test(t)) {
      add({ kind: "nobm" });
      sents.forEach((s, i) => { if (BMW.test(s) || /didn't (?:go|poop)/.test(s)) sentHit[i] = true; });
    } else {
      const BRISTOL = [[/\bwatery|diarrh?ea|liquid\b/, 7], [/\bmushy|loose|mush\b/, 6], [/\bsoft blobs?|blobs\b/, 5], [/\bsmooth|normal|perfect|soft sausage|banana\b/, 4], [/\bcracked\b/, 3], [/\blumpy\b/, 2], [/\bhard (?:lumps?|pellets?|balls)|pellets|rabbit\b/, 1]];
      const bmSents = sents.filter(s => BMW.test(s));
      const bmParts = [];
      bmSents.forEach(s => s.split(/\b(?:and )?another\b|\b(?:and )?a second\b/).forEach((p, i) => bmParts.push({ s: p, whole: s, extra: i > 0 })));
      for (const { s, whole, extra } of bmParts) {
        const cnt = s.match(/\b(\d)\s+(?:bms|bowel movements|poops|stools|times)\b/);
        const n = cnt ? Math.min(5, Number(cnt[1])) : 1;
        let bristol = null;
        const ty = s.match(/\b(?:type|bristol)\s*(\d)\b/);
        if (ty && Number(ty[1]) >= 1 && Number(ty[1]) <= 7) bristol = Number(ty[1]);
        else for (const [re, v] of BRISTOL) if (re.test(s)) { bristol = v; break; }
        const flags = { urgency: /\burgen(?:t|cy)|rushed|had to run\b/.test(s), incomplete: /\bincomplete|not complete|didn't feel (?:empty|done|finished)|unfinished\b/.test(s),
          straining: /\bstrain(?:ed|ing)?|pushing|hard to go\b/.test(s), mucus: /\bmucus\b/.test(s), floating: /\bfloat(?:ing|ed|y)?|oily|greasy\b/.test(s), blood: /\bblood(?:y)?\b/.test(s) };
        const time = findTime(s);
        if (extra && !/\b(one|1|bm|poop|movement|stool)\b/.test(s)) continue;
        for (let i = 0; i < n; i++) add({ kind: "bm", bm: { time: i === 0 ? time || "" : "", bristol, ...flags }, uncertain: bristol == null, why: bristol == null ? "Type not heard" : "" });
        markSent(whole);
      }
    }

    // ---- FoodMarble readings ----
    for (const s of sents.filter(x => /\b(methane|ch4|hydrogen|h2|foodmarble|breath)\b/.test(x))) {
      const segs = s.split(/,|;|\bthen\b|\band (?=(?:after|later|at|before|fasting))/);
      let cur = null;
      const flush = () => { if (cur && (cur.h2 != null || cur.ch4 != null)) add({ kind: "breath", r: cur }); cur = null; };
      for (const seg of segs) {
        const ch4 = seg.match(/\b(?:methane|ch4)\D{0,12}?(\d+(?:\.\d+)?)/), h2 = seg.match(/\b(?:hydrogen|h2)(?!s)\D{0,12}?(\d+(?:\.\d+)?)/);
        const hasCtx = /\b(fasting|baseline|first thing|before (?:eating|breakfast)|after|minutes|post|lactulose|glucose|inulin|fructose|lactose|sorbitol)\b/.test(seg);
        if (!ch4 && !h2) continue;
        if (cur && (hasCtx || (ch4 && cur.ch4 != null) || (h2 && cur.h2 != null))) flush();
        if (!cur) {
          const ctxSrc = hasCtx ? seg : s;
          const fasting = /\b(fasting|baseline|first thing|before (?:eating|breakfast)|empty stomach)\b/.test(ctxSrc) || (!/\bafter|post|minutes\b/.test(ctxSrc) && /\bmorning\b/.test(ctxSrc));
          const hrsAfter = ctxSrc.match(/\b(\d(?:\.\d+)?)\s*hours?\s+(?:after|later|post)\b/);
          const mins = (ctxSrc.match(/\b(\d{1,3})\s*(?:min|minutes|mins)\b/) || [])[1] ?? (hrsAfter ? Math.round(Number(hrsAfter[1]) * 60) : undefined);
          const ch = (ctxSrc.match(/\b(lactulose|glucose|inulin|fructose|lactose|sorbitol)\b/) || [])[1];
          cur = { time: findTime(seg) || findTime(s) || "", ctx: fasting ? "fasting" : "post", ch: fasting ? "" : ch ? ch[0].toUpperCase() + ch.slice(1) : "Meal", mins: mins != null ? Number(mins) : null, h2: null, ch4: null };
        }
        if (ch4) cur.ch4 = Number(ch4[1]);
        if (h2) cur.h2 = Number(h2[1]);
      }
      flush();
      markSent(s);
    }

    // ---- sleep ----
    {
      let m = t.match(/\b(?:slept|sleep|got|had)\D{0,14}?(\d{1,2}(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/) || t.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of\s+)?sleep/);
      if (m && Number(m[1]) <= 16) add({ kind: "sleep", f: "hours", v: Number(m[1]) });
      const q = t.match(/\bsleep quality\D{0,10}(\d)\b/);
      const qw = t.match(/\b(?:slept|sleep was|sleep)\s+(?:really |pretty |very |so |super |kind of )?(great|amazing|well|good|ok|okay|fine|alright|poorly|badly|bad|terribly|terrible|awful|restless|horribly|light)\b/);
      const qmap = { great: 5, amazing: 5, well: 4, good: 4, ok: 3, okay: 3, fine: 3, alright: 3, light: 2, restless: 2, poorly: 2, badly: 2, bad: 2, terribly: 1, terrible: 1, awful: 1, horribly: 1 };
      if (q && Number(q[1]) >= 1 && Number(q[1]) <= 5) add({ kind: "sleep", f: "quality", v: Number(q[1]) });
      else if (qw) add({ kind: "sleep", f: "quality", v: qmap[qw[1]], uncertain: true, why: `From "${qw[0].trim()}"` });
      const w = t.match(/\bwo(?:ke|ken)(?: up)?\D{0,10}?(\d{1,2})\s*times\b/) || t.match(/\b(\d{1,2})\s*times\D{0,12}(?:night|woke|waking)/);
      if (w) add({ kind: "sleep", f: "wakes", v: Number(w[1]) });
      else if (/\b(slept through|didn't wake|did not wake|no wak)/.test(t)) add({ kind: "sleep", f: "wakes", v: 0 });
      sents.forEach((s, i) => { if (/\b(slept|sleep|woke|bed|night)\b/.test(s) && (m || q || qw || w)) sentHit[i] = true; });
    }

    // ---- stress ----
    {
      const m = t.match(/\bstress(?:ed|ful)?(?: level)?\D{0,16}?\b(\d{1,2})\b/);
      if (m && Number(m[1]) <= 10) add({ kind: "stress", v: Number(m[1]) });
      else if (/\b(not|wasn't|no|never) (?:very |too |that |really |at all )?stress(ed|ful)?\b|\bcalm day|\brelaxed\b/.test(t)) add({ kind: "stress", v: 2, uncertain: true, why: "From how you described it" });
      else if (/\b(very|really|super|so|extremely) stress(ed|ful)\b/.test(t)) add({ kind: "stress", v: 8, uncertain: true, why: "From how you described it" });
      else if (/\b(a bit|a little|somewhat|kind of) stress(ed)?\b|\bstressed\b/.test(t)) add({ kind: "stress", v: 5, uncertain: true, why: "From how you described it" });
      sents.forEach((s, i) => { if (/\bstress/.test(s) && proposals.some(p => p.kind === "stress")) sentHit[i] = true; });
    }

    // ---- period ----
    if (/\b(on my period|period (?:started|day|today)|started my period|menstruat\w*|got my period|cycle day 1)\b/.test(t) && !/\bno period|not on my period\b/.test(t)) {
      add({ kind: "period" }); sents.forEach((s, i) => { if (/period|menstruat/.test(s)) sentHit[i] = true; });
    }

    // ---- meal timing and count ----
    {
      const meals = t.match(/\b(\d{1,2})\s*meals?\b/), snacks = t.match(/\b(\d{1,2})\s*snacks?\b/) || t.match(/\bsnacked\s+(\d{1,2})\s*times\b/);
      if (meals || snacks) { add({ kind: "food", f: "count", v: (meals ? Number(meals[1]) : 0) + (snacks ? Number(snacks[1]) : 0) }); sents.forEach((s, i) => { if (/\b\d{1,2}\s*(meals?|snacks?)\b|snacked/.test(s)) sentHit[i] = true; }); }
      const firstS = sents.find(s => /\b(first (?:bite|meal|ate|thing i ate)|breakfast|broke my fast)\b/.test(s) && findTime(s, "breakfast"));
      const lastS = sents.find(s => /\b(last (?:bite|meal|ate)|stopped eating|dinner|supper|finished eating)\b/.test(s) && findTime(s, "dinner"));
      const foodTimes = proposals.filter(p => p.kind === "item" && p.cat === "food" && p.time).map(p => p.time).sort();
      const first = firstS ? findTime(firstS, "breakfast") : foodTimes[0], last = lastS ? findTime(lastS, "dinner") : foodTimes.length > 1 ? foodTimes[foodTimes.length - 1] : null;
      if (first) add({ kind: "food", f: "first", v: first, uncertain: !firstS, why: firstS ? "" : "Earliest food time you mentioned" });
      if (last && last !== first) add({ kind: "food", f: "last", v: last, uncertain: !lastS, why: lastS ? "" : "Latest food time you mentioned" });
      if (firstS) markSent(firstS); if (lastS) markSent(lastS);
    }

    // anything with no recognised content is offered as a note
    const unparsed = sents.filter((s, i) => !sentHit[i] && s.replace(/[^a-z]/g, "").length > 6).map(s => s.replace(/^\s*(and|so|also|um|uh)\s+/, "").replace(/\s+$/, ""));
    return { proposals, unparsed };
  }

  root.parseDay = parseDay;
  root.parserNormalize = normalize;
  if (typeof module !== "undefined") module.exports = { parseDay, normalize };
})(typeof window !== "undefined" ? window : globalThis);
