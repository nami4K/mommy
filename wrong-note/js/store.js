'use strict';
/*
 * 저장: 이 기기의 IndexedDB에 먼저 저장하고(인터넷이 없어도 됨),
 * 가족 저장 공간(Supabase)이 연결되어 있으면 Sync가 주고받습니다.
 *
 * 문서(doc) 종류
 *   settings/main   가족 설정(아이, 학년 바뀌는 달, 하루 문제 수, 복습 간격, 보관 기간, 엄마 비밀번호 해시)
 *   book/{id}       문제집(이름, 과목, 학년, 학기, 단원별 쪽 범위, 쪽 이미지)
 *   problem/{id}    문제 내용(엄마·아이·Claude가 넣음)
 *   progress/{id}   그 문제의 풀이 기록과 다음 날짜(아이 기기가 씀). id는 문제 id와 같음
 *   card/{id}       엄마의 깜짝 카드
 *   pref/{kidId}    아이가 고른 테마
 *   archive/{kidId} 2년 지나 지운 문제의 성장 숫자(지워도 남김)
 */
const Store = (() => {
  let idb = null;
  const docs = new Map();
  const listeners = new Set();
  const urls = new Map();
  const K = (kind, id) => kind + '/' + id;
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const os = (name, mode = 'readwrite') => idb.transaction(name, mode).objectStore(name);

  async function open() {
    idb = await new Promise((res, rej) => {
      const r = indexedDB.open('dasibom', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('docs', { keyPath: 'k' });
        db.createObjectStore('images', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'k' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    (await req(os('docs', 'readonly').getAll())).forEach(d => docs.set(d.k, d));
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
  }

  let emitT = 0;
  const emit = () => { cancelAnimationFrame(emitT); emitT = requestAnimationFrame(() => listeners.forEach(f => f())); };
  const on = f => listeners.add(f);

  const list = kind => { const out = []; for (const d of docs.values()) if (d.kind === kind && !d.deleted) out.push(d.data); return out; };
  const get = (kind, id) => { const d = docs.get(K(kind, id)); return d && !d.deleted ? d.data : null; };
  function write(d, silent) {
    docs.set(d.k, d);
    os('docs').put(d);
    if (!silent) emit();
    if (typeof Sync !== 'undefined') Sync.soon();
  }
  const put = (kind, id, data, { silent = false } = {}) => {
    const d = { k: K(kind, id), kind, id, data: { ...data, id }, ts: Date.now(), deleted: false, dirty: 1 };
    write(d, silent);
    return d.data;
  };
  const del = (kind, id) => write({ k: K(kind, id), kind, id, data: null, ts: Date.now(), deleted: true, dirty: 1 });

  /* 이 기기에만 있는 값(누구 기기인지, 연결 정보 등) */
  const meta = async k => { const r = await req(os('meta', 'readonly').get(k)); return r ? r.v : undefined; };
  const setMeta = (k, v) => req(os('meta').put({ k, v }));

  /* 사진 */
  async function putImage(blob) {
    const id = 'img_' + uid();
    await req(os('images').put({ id, blob, mime: blob.type || 'image/jpeg', dirty: 1 }));
    if (typeof Sync !== 'undefined') Sync.soon();
    return id;
  }
  async function imageRecord(id) {
    let r = await req(os('images', 'readonly').get(id));
    if (!r && typeof Sync !== 'undefined') r = await Sync.fetchImage(id);
    return r || null;
  }
  async function imageURL(id) {
    if (!id) return null;
    if (urls.has(id)) return urls.get(id);
    const r = await imageRecord(id);
    if (!r) return null;
    const u = URL.createObjectURL(r.blob);
    urls.set(id, u);
    return u;
  }
  async function saveRemoteImage(id, mime, b64) {
    const rec = { id, blob: b64ToBlob(b64, mime), mime, dirty: 0 };
    await req(os('images').put(rec));
    return rec;
  }
  async function delImages(ids) {
    ids = ids.filter(Boolean);
    if (!ids.length) return;
    for (const id of ids) { await req(os('images').delete(id)); const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } }
    const q = (await meta('imgDel')) || [];
    await setMeta('imgDel', [...new Set([...q, ...ids])]);
    if (typeof Sync !== 'undefined') Sync.soon();
  }

  /* 동기화용 */
  const dirtyDocs = () => [...docs.values()].filter(d => d.dirty);
  function markClean(sent) {
    for (const s of sent) {
      const d = docs.get(s.k);
      if (d && d.ts === s.ts) { d.dirty = 0; os('docs').put(d); }
    }
  }
  function applyRemote(remote) {
    let changed = false;
    for (const r of remote) {
      const k = K(r.kind, r.id);
      const mine = docs.get(k);
      if (mine && mine.dirty && mine.ts > r.ts) continue; // 이 기기에서 더 나중에 고친 것은 지키기
      if (mine && !mine.dirty && mine.ts === r.ts && mine.deleted === !!r.deleted) continue;
      const d = { k, kind: r.kind, id: r.id, data: r.deleted ? null : { ...(r.data || {}), id: r.id }, ts: +r.ts || 0, deleted: !!r.deleted, dirty: 0 };
      docs.set(k, d); os('docs').put(d); changed = true;
    }
    if (changed) emit();
    return changed;
  }
  async function dirtyImages() {
    const all = await req(os('images', 'readonly').getAll());
    return all.filter(r => r.dirty);
  }
  async function markImageClean(id) {
    const r = await req(os('images', 'readonly').get(id));
    if (r) { r.dirty = 0; await req(os('images').put(r)); }
  }
  async function wipe() {
    for (const n of ['docs', 'images', 'meta']) await req(os(n).clear());
    docs.clear();
  }

  return { open, on, emit, list, get, put, del, meta, setMeta, putImage, imageURL, imageRecord, saveRemoteImage, delImages, dirtyDocs, markClean, applyRemote, dirtyImages, markImageClean, wipe };
})();

/* 사진 한 장을 <img>로. 저장소에서 꺼내는 동안은 빈 칸으로 둡니다. */
function imgEl(id, cls = '', alt = '문제 사진') {
  if (!id) return h('div', { class: cls + ' missing', 'aria-hidden': 'true' });
  const el = h('img', { class: cls, alt, decoding: 'async' });
  Store.imageURL(id).then(u => { if (u) el.src = u; else el.replaceWith(h('div', { class: cls + ' missing', 'aria-hidden': 'true' })); });
  return el;
}

/*
 * 가족 저장 공간(Supabase) 주고받기.
 * 서버에는 가족 코드를 확인하는 함수(wn_*)만 열려 있고, 표는 직접 읽거나 쓸 수 없습니다(supabase.sql).
 */
const Sync = (() => {
  let cfg = { url: '', key: '', code: '' };
  let timer = 0, loop = 0, running = false, again = false;
  const status = { state: 'off', msg: '', at: 0 };
  const watchers = new Set();
  const setStatus = (state, msg = '') => { Object.assign(status, { state, msg, at: Date.now() }); watchers.forEach(f => f(status)); };

  async function init() {
    const c = window.WN_CONFIG || {};
    const m = (await Store.meta('sync')) || {};
    cfg = { url: (m.url || c.supabaseUrl || '').trim(), key: (m.key || c.supabaseKey || '').trim(), code: (m.code || '').trim() };
    setStatus(ready() ? 'idle' : 'off');
  }
  const hasServer = () => !!(cfg.url && cfg.key);
  const ready = () => hasServer() && !!cfg.code;

  async function rpc(fn, body, c = cfg) {
    const headers = { 'Content-Type': 'application/json', apikey: c.key };
    if (!c.key.startsWith('sb_')) headers.Authorization = 'Bearer ' + c.key; // 예전 anon 키(JWT)일 때만
    const r = await fetch(c.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) { const e = new Error(txt || String(r.status)); e.status = r.status; throw e; }
    return txt ? JSON.parse(txt) : null;
  }
  const friendly = e => {
    if (e && (e.status === 403 || /bad code/.test(e.message))) return '가족 코드가 맞지 않아요.';
    if (e && e.status === 404) return '저장 공간에 표가 아직 없어요(supabase.sql을 실행해 주세요).';
    if (e && e.status === 401) return '저장 공간 키가 맞지 않아요.';
    if (e instanceof TypeError) return '인터넷이나 패밀리 링크 허용 주소를 확인해 주세요.';
    return '잠시 연결이 안 돼요. 나중에 다시 할게요.';
  };

  async function run() {
    if (!ready()) { setStatus(hasServer() ? 'nocode' : 'off'); return; }
    if (running) { again = true; return; }
    if (!navigator.onLine) { setStatus('offline', '인터넷이 꺼져 있어요. 연결되면 맞출게요.'); return; }
    running = true; setStatus('busy');
    try {
      const dirty = Store.dirtyDocs();
      for (let i = 0; i < dirty.length; i += 40) {
        const chunk = dirty.slice(i, i + 40);
        await rpc('wn_push', { p_code: cfg.code, p_docs: chunk.map(d => ({ kind: d.kind, id: d.id, data: d.data, ts: d.ts, deleted: d.deleted })) });
        Store.markClean(chunk);
      }
      for (const im of await Store.dirtyImages()) {
        await rpc('wn_img_put', { p_code: cfg.code, p_id: im.id, p_mime: im.mime, p_b64: await blobToB64(im.blob) });
        await Store.markImageClean(im.id);
      }
      const dels = (await Store.meta('imgDel')) || [];
      if (dels.length) { await rpc('wn_img_del', { p_code: cfg.code, p_ids: dels }); await Store.setMeta('imgDel', []); }
      const since = (await Store.meta('since')) || '1970-01-01T00:00:00Z';
      const res = await rpc('wn_pull', { p_code: cfg.code, p_since: since });
      const got = (res && res.docs) || [];
      Store.applyRemote(got);
      if (got.length) {
        const max = Math.max(...got.map(d => Date.parse(d.at) || 0));
        if (max) await Store.setMeta('since', new Date(max - 15000).toISOString()); // 15초 겹쳐 받아 빠뜨리지 않기
      }
      setStatus('ok');
    } catch (e) {
      console.warn('sync', e);
      setStatus('error', friendly(e));
    } finally {
      running = false;
      if (again) { again = false; soon(800); }
    }
  }
  function soon(ms = 2500) { clearTimeout(timer); timer = setTimeout(run, ms); }
  function start() {
    run();
    clearInterval(loop);
    loop = setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(300); });
    window.addEventListener('online', () => soon(300));
  }
  async function fetchImage(id) {
    if (!ready() || !navigator.onLine) return null;
    try {
      const rows = await rpc('wn_img_get', { p_code: cfg.code, p_ids: [id] });
      const r = rows && rows[0];
      return r ? await Store.saveRemoteImage(r.id, r.mime, r.b64) : null;
    } catch (e) { return null; }
  }
  async function save(next) {
    cfg = { ...cfg, ...next };
    await Store.setMeta('sync', cfg);
    setStatus(ready() ? 'idle' : (hasServer() ? 'nocode' : 'off'));
  }
  /* 가족 코드가 서버에 있는지 확인 (없으면 false) */
  async function check(code, url = cfg.url, key = cfg.key) {
    return !!(await rpc('wn_join', { p_code: code }, { url, key }));
  }
  /* 처음 한 번: 가족 만들기. 서버에 가족이 이미 있으면 false */
  async function create(code, url = cfg.url, key = cfg.key) {
    return !!(await rpc('wn_create_family', { p_code: code }, { url, key }));
  }
  return { init, run, soon, start, fetchImage, save, check, create, friendly, ready, hasServer, status, watch: f => watchers.add(f), get cfg() { return { ...cfg }; } };
})();
