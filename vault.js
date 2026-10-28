/* SIBO Root Journal — encrypted on-device vault for test result files.

   What it protects: the uploaded file and its name/type are encrypted before they
   are written, and only ever stored in this browser's IndexedDB. Nothing in here
   is sent to any server.

   How: the passphrase is stretched with PBKDF2-SHA-256 (600,000 iterations, random
   16-byte salt) into a non-extractable AES-GCM 256-bit key that lives only in
   memory while unlocked. Each record gets a fresh random 12-byte IV. A small known
   value encrypted at setup lets unlock() tell a wrong passphrase from a right one.
   There is no recovery: without the passphrase the files cannot be decrypted.

   Stores: "meta" (salt, iterations, check value), "items" (id, created, encrypted
   metadata) and "blobs" (id, encrypted file bytes), so listing never decrypts files. */
const Vault = (() => {
  const DB_NAME = "root-journal-vault", VERSION = 1, ITERATIONS = 600000, CHECK = "root-journal-vault-ok";
  const IDLE_MS = 10 * 60 * 1000, HIDDEN_MS = 5 * 60 * 1000;
  const te = new TextEncoder(), td = new TextDecoder();
  let key = null, idleTimer = null, hiddenAt = 0;
  const listeners = new Set();

  // ---------- IndexedDB ----------
  function open() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function run(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const out = fn(...[].concat(stores).map(s => t.objectStore(s)));
      t.oncomplete = () => { db.close(); resolve(out && "result" in out ? out.result : undefined); };
      t.onerror = t.onabort = () => { db.close(); reject(t.error); };
    });
  }

  // ---------- crypto ----------
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  async function derive(pass, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function seal(k, bytes) { const iv = rand(12); return { iv, ct: await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, bytes) }; }
  const open_ = (k, box) => crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv }, k, box.ct);
  const sealJSON = (k, obj) => seal(k, te.encode(JSON.stringify(obj)));
  const openJSON = async (k, box) => JSON.parse(td.decode(await open_(k, box)));

  // ---------- lock state ----------
  function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { /* listener error */ } }); }
  function touch() {
    clearTimeout(idleTimer);
    if (key) idleTimer = setTimeout(() => lock(), IDLE_MS);
  }
  function lock() { if (!key) return; key = null; clearTimeout(idleTimer); notify(); }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (key && hiddenAt && Date.now() - hiddenAt > HIDDEN_MS) lock();
  });
  function need() { if (!key) throw Object.assign(new Error("Vault is locked"), { code: "locked" }); touch(); return key; }

  // ---------- public API ----------
  async function supported() {
    if (!window.indexedDB || !window.crypto || !crypto.subtle) return false;
    try { await run("meta", "readonly", s => s.get("config")); return true; } catch (e) { return false; }
  }
  async function status() {
    const cfg = await run("meta", "readonly", s => s.get("config"));
    return !cfg ? "none" : key ? "unlocked" : "locked";
  }
  async function setup(pass) {
    if (await run("meta", "readonly", s => s.get("config"))) throw Object.assign(new Error("A vault already exists"), { code: "exists" });
    const salt = rand(16), k = await derive(pass, salt, ITERATIONS);
    const check = await seal(k, te.encode(CHECK));
    await run("meta", "readwrite", s => s.put({ v: 1, salt, iterations: ITERATIONS, check }, "config"));
    key = k; touch(); notify();
  }
  async function unlock(pass) {
    const cfg = await run("meta", "readonly", s => s.get("config"));
    if (!cfg) throw Object.assign(new Error("No vault"), { code: "none" });
    const k = await derive(pass, cfg.salt, cfg.iterations);
    try { if (td.decode(await open_(k, cfg.check)) !== CHECK) throw 0; }
    catch (e) { throw Object.assign(new Error("Wrong passphrase"), { code: "wrong" }); }
    key = k; touch(); notify();
  }
  async function add(file, meta) {
    const k = need(), id = "f" + Array.from(rand(8), b => b.toString(16).padStart(2, "0")).join("");
    const m = await sealJSON(k, { name: file.name, type: file.type, size: file.size, ...meta });
    const f = await seal(k, await file.arrayBuffer());
    await run(["items", "blobs"], "readwrite", (items, blobs) => { items.put({ id, created: Date.now(), m }); blobs.put({ id, f }); });
    return id;
  }
  async function list() {
    const k = need(), rows = await run("items", "readonly", s => s.getAll());
    const out = [];
    for (const r of rows) { try { out.push({ id: r.id, created: r.created, ...(await openJSON(k, r.m)) }); } catch (e) { out.push({ id: r.id, created: r.created, broken: true }); } }
    return out;
  }
  async function has(id) { return !!(await run("items", "readonly", s => s.get(id))); }
  async function getFile(id) {
    const k = need();
    const [item, blob] = await Promise.all([run("items", "readonly", s => s.get(id)), run("blobs", "readonly", s => s.get(id))]);
    if (!item || !blob) return null;
    const meta = await openJSON(k, item.m);
    return new File([await open_(k, blob.f)], meta.name || "result", { type: meta.type || "application/octet-stream" });
  }
  async function remove(id) { await run(["items", "blobs"], "readwrite", (items, blobs) => { items.delete(id); blobs.delete(id); }); }
  async function count() { return run("items", "readonly", s => s.count()); }

  // Backups stay encrypted: the export holds the salt and ciphertext, never the key or passphrase.
  const b64 = buf => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  const boxOut = b => ({ iv: b64(b.iv), ct: b64(b.ct) });
  const boxIn = b => ({ iv: unb64(b.iv), ct: unb64(b.ct).buffer });
  async function exportAll() {
    const [cfg, items, blobs] = await Promise.all([run("meta", "readonly", s => s.get("config")), run("items", "readonly", s => s.getAll()), run("blobs", "readonly", s => s.getAll())]);
    if (!cfg) return null;
    const byId = Object.fromEntries(blobs.map(b => [b.id, b]));
    return JSON.stringify({ app: "sibo-root-journal", kind: "encrypted-vault", v: 1, exported: new Date().toISOString(),
      salt: b64(cfg.salt), iterations: cfg.iterations, check: boxOut(cfg.check),
      items: items.map(i => ({ id: i.id, created: i.created, m: boxOut(i.m), f: byId[i.id] ? boxOut(byId[i.id].f) : null })) });
  }
  // Import needs the backup's passphrase. Files are decrypted with it and re-encrypted with this vault's key.
  async function importAll(text, backupPass) {
    const k = need(), j = JSON.parse(text);
    if (j.kind !== "encrypted-vault") throw Object.assign(new Error("Not a vault backup"), { code: "format" });
    const bk = await derive(backupPass, unb64(j.salt), j.iterations);
    try { if (td.decode(await open_(bk, boxIn(j.check))) !== CHECK) throw 0; }
    catch (e) { throw Object.assign(new Error("Wrong passphrase for this backup"), { code: "wrong" }); }
    let n = 0;
    for (const it of j.items) {
      if (!it.f || await has(it.id)) continue;
      const m = await seal(k, await open_(bk, boxIn(it.m))), f = await seal(k, await open_(bk, boxIn(it.f)));
      await run(["items", "blobs"], "readwrite", (items, blobs) => { items.put({ id: it.id, created: it.created, m }); blobs.put({ id: it.id, f }); });
      n++;
    }
    return n;
  }
  // Deleting the vault removes every stored file and the passphrase check. Values already saved to the journal stay.
  async function destroy() {
    key = null;
    await run(["meta", "items", "blobs"], "readwrite", (meta, items, blobs) => { meta.clear(); items.clear(); blobs.clear(); });
    notify();
  }

  return { supported, status, setup, unlock, lock, add, list, has, getFile, remove, count, exportAll, importAll, destroy, touch,
    isUnlocked: () => !!key, onChange: fn => listeners.add(fn) };
})();
