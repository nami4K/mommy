'use strict';
/* ================= 기본 도구 ================= */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const DAY = 864e5;
const INTERVAL = [0, 1, 2, 4, 8, 16]; // 단계별 다음 복습까지 날짜
const pad2 = n => String(n).padStart(2, '0');
const today = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const uid = () => Math.random().toString(36).slice(2, 9);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const svgNode = str => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstChild; };

/* ================= 저장 ================= */
const KEY = 'bwc.data.v1';
let DB = loadDB();
function loadDB() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 1) return d; } catch (e) { }
  return { v: 1, profiles: [], current: null, words: {}, log: {}, hist: {}, settings: {} };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch (e) { toast('저장 공간이 부족해요. 오래된 찾은 기록을 지워 주세요.'); }
}
const P = () => DB.profiles.find(p => p.id === DB.current);
const W = () => (DB.words[DB.current] ||= {});
const LOG = () => (DB.log[DB.current] ||= {});
const HIST = () => (DB.hist[DB.current] ||= []);
const ST = () => (DB.settings[DB.current] ||= { rate: 0.85, sfx: true, speak: true, size: 15, mode: 'choice', onlyWrong: false, flashSpeed: 1500, voice: '' });
const wordId = (term, lang) => lang + ':' + term.trim().toLowerCase();
const newSrs = () => ({ level: 0, due: 0, seen: 0, right: 0, nh: 0, wrong: 0, hints: 0, flash: 0, last: 0, hist: '', recovered: false });
const starred = () => Object.values(W()).filter(w => w.starred);
const inWrongNote = w => w.starred && w.s && w.s.wrong > 0 && w.s.level < 3;
const wrongScore = w => w.s ? w.s.wrong * 2 + w.s.hints - w.s.nh * 0.5 : 0;
/* 과목(영어·국어·한자) 나누기: 한 번에 한 과목씩 공부하고, '섞어서'는 복습용 */
const SUBJ = [['en', '🔤 영어'], ['ko', '📖 국어'], ['hanja', '漢 한자'], ['all', '🔀 섞어서']];
function subjCounts() { const c = { en: 0, ko: 0, hanja: 0 }; starred().forEach(w => { c[w.lang] = (c[w.lang] || 0) + 1; }); return c; }
function curSubj() {
  const s = ST();
  if (s.subj) return s.subj;
  const top = Object.entries(subjCounts()).sort((a, b) => b[1] - a[1])[0];
  if (top[1]) { s.subj = top[0]; save(); return s.subj; }
  return 'en';
}
const inSubj = w => curSubj() === 'all' || w.lang === curSubj();
function subjBar(onChange) {
  const c = subjCounts();
  return segmented(SUBJ.map(([v, l]) => [v, v === 'all' ? l : `${l} ${c[v]}`]), curSubj(), v => { ST().subj = v; save(); (onChange || render)(); }, 'subj');
}
function logDay(fn) { const l = LOG(), k = today(); fn(l[k] ||= { n: 0, c: 0, nh: 0, h: 0, s: 0, f: 0 }); }

/* ================= 통계 · 성장 · 열림 ================= */
function curStreak() {
  const log = LOG(); let n = 0; let d = new Date();
  if (!log[today(d)]) d = daysAgo(1);
  while (log[today(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function bestStreak() {
  const days = Object.keys(LOG()).sort(); let best = 0, run = 0, prev = null;
  for (const k of days) {
    const t = new Date(k + 'T12:00:00').getTime();
    run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  }
  return best;
}
function stats() {
  const ws = Object.values(W());
  let correct = 0, nohint = 0, bloom = 0, master = 0, recovered = 0, hints = 0;
  for (const w of ws) {
    const s = w.s; if (!s) continue;
    correct += s.right; nohint += s.nh; hints += s.hints;
    if (w.starred && s.level >= 4) bloom++;
    if (w.starred && s.level >= 5) master++;
    if (s.recovered) recovered++;
  }
  let sessions = 0; for (const e of Object.values(LOG())) sessions += (e.s || 0) + (e.f || 0);
  const sentences = ((DB.sentences || {})[DB.current] || []).length;
  return { words: ws.filter(w => w.starred).length, correct, nohint, hints, bloom, master, recovered, sessions, sentences, streak: curStreak(), bestStreak: bestStreak() };
}
const reqValue = (st, t) => t === 'streak' ? st.bestStreak : st[t];
const itemKey = it => it.cat + '.' + it.id;
const isUnlocked = it => !it.req || (P().unlocked || []).includes(itemKey(it));
function announceUnlocks(msg) {
  const nw = checkUnlocks();
  if (nw.length) { toast(`🎁 새 꾸미기가 열렸어요: ${nw.map(x => x.name).join(', ')}`, 3200); sfx('up'); }
  else if (msg) toast(msg);
}
function checkUnlocks() {
  const p = P(); p.unlocked ||= [];
  const st = stats(), newly = [];
  for (const it of CATALOG) {
    if (!it.req || p.unlocked.includes(itemKey(it))) continue;
    if (reqValue(st, it.req[0]) >= it.req[1]) { p.unlocked.push(itemKey(it)); newly.push(it); }
  }
  if (newly.length) save();
  return newly;
}

/* ================= 소리 ================= */
const Speech = {
  voices: [],
  init() {
    if (!('speechSynthesis' in window)) return;
    const load = () => { this.voices = speechSynthesis.getVoices(); };
    load(); speechSynthesis.onvoiceschanged = load;
  },
  pick(lang) {
    const want = lang === 'en' ? 'en' : 'ko';
    const vs = this.voices.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(want));
    if (lang === 'en' && ST().voice) { const v = vs.find(v => v.name === ST().voice); if (v) return v; }
    const pref = lang === 'en' ? ['en-us', 'en-gb'] : ['ko-kr'];
    for (const p of pref) {
      const list = vs.filter(v => v.lang.replace('_', '-').toLowerCase() === p);
      const v = list.find(v => /google/i.test(v.name)) || list[0];
      if (v) return v;
    }
    return vs[0] || null;
  },
  say(text, lang = 'en') {
    return new Promise(res => {
      if (!('speechSynthesis' in window) || !text) return res();
      let done = false; const fin = () => { if (!done) { done = true; res(); } };
      speechSynthesis.cancel();
      setTimeout(() => {
        const u = new SpeechSynthesisUtterance(text);
        const v = this.pick(lang); if (v) u.voice = v;
        u.lang = lang === 'en' ? 'en-US' : 'ko-KR';
        u.rate = ST().rate || 0.85;
        u.onend = fin; u.onerror = fin;
        speechSynthesis.speak(u);
        setTimeout(fin, 2500 + text.length * 120);
      }, 60);
    });
  },
  stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); },
};
function speakWord(w) {
  if (w.lang === 'en') return Speech.say(w.term, 'en');
  if (w.lang === 'ko') return Speech.say(w.term, 'ko');
  return Promise.resolve(); // 한자는 읽으면 답이 되어 버려서 읽지 않아요
}
let AC = null;
function sfx(kind) {
  if (!ST().sfx) return;
  try {
    AC ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime;
    const notes = kind === 'ok' ? [880, 1320] : kind === 'up' ? [660, 880, 1175, 1568] : [330, 247];
    notes.forEach((f, i) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === 'no' ? 'triangle' : 'sine'; o.frequency.value = f;
      const s = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.16, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.28);
      o.connect(g).connect(AC.destination); o.start(s); o.stop(s + 0.3);
    });
  } catch (e) { }
}

/* ================= 화면 공통 ================= */
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
function burst(el, n = 14) {
  const r = (el || document.body).getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const chars = ['✦', '★', '♥', '✿', '✧'], cols = ['#ff8fb8', '#ffd34d', '#a98bff', '#5ccfae', '#7cbcff'];
  for (let i = 0; i < n; i++) {
    const s = h('span', { class: 'particle' }, chars[i % chars.length]);
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 70;
    s.style.left = cx + 'px'; s.style.top = cy + 'px'; s.style.color = cols[i % cols.length];
    s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    document.body.append(s); setTimeout(() => s.remove(), 900);
  }
}
function segmented(opts, value, onChange, cls = '') {
  const box = h('div', { class: 'seg ' + cls, role: 'tablist' });
  for (const [v, label] of opts) {
    box.append(h('button', {
      class: v === value ? 'on' : '', type: 'button', role: 'tab', 'aria-selected': v === value ? 'true' : 'false',
      onclick: e => { [...box.children].forEach(b => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-selected', 'true'); onChange(v); },
    }, label));
  }
  return box;
}
function openSheet(title, ...content) {
  const o = $('#overlay'); o.className = 'sheet on'; o.innerHTML = '';
  const panel = h('div', { class: 'sheet-panel', role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: closeOverlay }, '✕')),
    h('div', { class: 'sheet-body' }, ...content));
  o.append(h('div', { class: 'backdrop', onclick: closeOverlay }), panel);
  return panel;
}
function openFull() { const o = $('#overlay'); o.className = 'full on'; o.innerHTML = ''; return o; }
function closeOverlay() { const o = $('#overlay'); o.className = ''; o.innerHTML = ''; }
function termRegex(w, flags = 'i') {
  if (w.lang === 'en') {
    const t = w.term.toLowerCase();
    const stem = t.length > 4 ? t.replace(/(e|y|ing|ed|es|s)$/, '') : t;
    return new RegExp('\\b(' + escRe(stem) + '[a-z]*)', flags);
  }
  const t = w.lang === 'ko' && w.term.length > 2 && /다$/.test(w.term) ? w.term.slice(0, -1) : w.term;
  return new RegExp('(' + escRe(t) + ')', flags);
}
function highlight(text, w) {
  const re = termRegex(w, 'gi');
  const out = []; let last = 0, m;
  while ((m = re.exec(text))) {
    out.push(text.slice(last, m.index), h('mark', {}, m[0])); last = m.index + m[0].length;
    if (!m[0].length) re.lastIndex++;
  }
  out.push(text.slice(last));
  return out;
}
function pickExample(w) {
  const exs = (w.examples || []).filter(Boolean);
  if (!exs.length) return null;
  const re = termRegex(w);
  const good = exs.filter(e => re.test(e));
  const list = (good.length ? good : exs).slice().sort((a, b) => a.length - b.length).slice(0, 3);
  return list[Math.floor(Math.random() * list.length)];
}

/* ================= 뼈대 ================= */
let TAB = 'search';
function go(tab) { TAB = tab; render(); }
function render() {
  if (!P()) return renderWelcome();
  renderTop(); renderNav();
  const m = $('#main'); m.innerHTML = ''; window.scrollTo(0, 0);
  ({ search: viewSearch, words: viewWords, test: viewTest, me: viewMe })[TAB](m);
}
function renderTop() {
  const p = P(), t = $('#top'); t.innerHTML = '';
  t.append(
    h('button', { class: 'who', onclick: openProfiles, 'aria-label': '공부하는 사람 바꾸기' }, h('span', { class: 'mini-av', html: avatarSVG(p.avatar) }), h('b', {}, p.name)),
    h('div', { class: 'brand' }, '반짝 단어카드'),
    h('div', { class: 'streak', title: '연속 공부한 날' }, '🔥', h('b', {}, curStreak()), '일'));
}
function renderNav() {
  const n = $('#nav'); n.innerHTML = '';
  const wrong = starred().filter(inWrongNote).length;
  for (const [id, ic, label] of [['search', '🔍', '찾기'], ['words', '⭐', '단어장'], ['test', '🃏', '테스트'], ['me', '🌸', '나']]) {
    n.append(h('button', { class: TAB === id ? 'on' : '', onclick: () => go(id), 'aria-label': label },
      h('span', { class: 'ic' }, ic), h('span', {}, label), id === 'words' && wrong ? h('i', { class: 'badge' }, wrong) : null));
  }
}

/* ================= 처음 시작 ================= */
function renderWelcome(isExtra) {
  $('#top').innerHTML = ''; $('#nav').innerHTML = '';
  const m = $('#main'); m.innerHTML = '';
  let pick = 0;
  const avs = h('div', { class: 'preset-row' });
  AV_PRESETS.forEach((a, i) => avs.append(h('button', {
    class: 'preset' + (i === 0 ? ' on' : ''), html: avatarSVG(a), 'aria-label': `캐릭터 ${i + 1}`,
    onclick: e => { pick = i; [...avs.children].forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); },
  })));
  const name = h('input', { class: 'input big', placeholder: '이름 (예: 하은, 엄마)', maxlength: 10 });
  m.append(h('section', { class: 'welcome' },
    h('div', { class: 'logo', html: '<span>★</span>' }),
    h('h1', {}, isExtra ? '새로 공부할 사람' : '반짝 단어카드'),
    h('p', { class: 'sub' }, '모르는 단어를 찾고, ★ 별을 누르고, 카드로 확인해요.', h('br'), '알게 된 단어는 정원에서 꽃으로 자라요.'),
    h('h3', {}, '나랑 닮은 친구를 골라요'), avs,
    h('h3', {}, '이름을 알려 줘요'), name,
    h('button', {
      class: 'btn primary wide', onclick: () => {
        const n = name.value.trim(); if (!n) { name.focus(); toast('이름을 적어 주세요'); return; }
        const p = { id: uid(), name: n, avatar: { ...AV_PRESETS[pick] }, unlocked: [], created: Date.now() };
        DB.profiles.push(p); DB.current = p.id; save(); TAB = 'search'; render(); checkPendingImport();
      },
    }, '시작하기'),
    isExtra ? h('button', { class: 'btn ghost wide', onclick: () => render() }, '돌아가기') :
      h('button', { class: 'btn ghost wide', onclick: () => openRestore() }, '백업 코드로 되살리기')));
}
function openProfiles() {
  const list = h('div', { class: 'profile-list' });
  for (const p of DB.profiles) {
    list.append(h('div', { class: 'profile-row' + (p.id === DB.current ? ' on' : '') },
      h('button', { class: 'profile-main', onclick: () => { DB.current = p.id; save(); closeOverlay(); TAB = 'search'; render(); } },
        h('span', { class: 'mini-av', html: avatarSVG(p.avatar) }), h('b', {}, p.name), p.id === DB.current ? h('small', {}, '지금 공부 중') : null),
      h('button', { class: 'icon-btn', 'aria-label': '이름 바꾸기', onclick: () => { const n = prompt('새 이름', p.name); if (n && n.trim()) { p.name = n.trim().slice(0, 10); save(); closeOverlay(); render(); } } }, '✏️'),
      DB.profiles.length > 1 ? h('button', {
        class: 'icon-btn', 'aria-label': '지우기', onclick: () => {
          if (!confirm(`${p.name}의 단어와 기록을 모두 지울까요? 되돌릴 수 없어요.`)) return;
          DB.profiles = DB.profiles.filter(x => x.id !== p.id);
          delete DB.words[p.id]; delete DB.log[p.id]; delete DB.hist[p.id]; delete DB.settings[p.id];
          if (DB.current === p.id) DB.current = DB.profiles[0].id;
          save(); closeOverlay(); render();
        },
      }, '🗑️') : null));
  }
  openSheet('누가 공부하나요?', list,
    h('button', { class: 'btn wide', onclick: () => { closeOverlay(); renderWelcome(true); } }, '+ 새로 공부할 사람'),
    h('p', { class: 'note' }, '한 기기에서 여러 사람이 따로 공부할 수 있어요. 기록은 이 기기에만 저장돼요.'));
}

/* ================= 찾기 (사전) ================= */
let lastResult = null, searchLang = 'auto';
function viewSearch(m) {
  const inp = h('input', { type: 'search', id: 'q', class: 'input', placeholder: '영어 · 한글 · 한자 단어', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', value: lastResult ? lastResult.term : '' });
  m.append(h('section', { class: 'pad' },
    h('form', { class: 'search-box', onsubmit: e => { e.preventDefault(); inp.blur(); doSearch(inp.value); } }, inp, h('button', { class: 'btn primary', type: 'submit' }, '찾기')),
    segmented([['auto', '자동'], ['en', '영어'], ['ko', '국어'], ['hanja', '한자']], searchLang, v => { searchLang = v; }, 'small'),
    h('div', { id: 'result' })));
  if (lastResult) showResult(lastResult); else showRecent();
}
function showRecent() {
  const box = $('#result'); if (!box) return;
  box.innerHTML = '';
  const hs = HIST().slice(0, 16);
  if (!hs.length) {
    box.append(h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, '📖'),
      h('p', {}, '책을 읽다가 모르는 단어가 나오면 여기에 적어 봐요.'),
      h('p', { class: 'note' }, '예: brave · 성실 · 學校  (한자는 음으로도 찾을 수 있어요: 한자 → "학")')));
    return;
  }
  box.append(h('h4', { class: 'label' }, '최근에 찾은 단어'),
    h('div', { class: 'chips' }, hs.map(x => h('button', { class: 'chip', onclick: () => { $('#q').value = x.term; doSearch(x.term, x.lang); } }, x.term))));
}
function addHist(term, lang) {
  const hs = HIST(); const i = hs.findIndex(x => x.term === term && x.lang === lang);
  if (i >= 0) hs.splice(i, 1);
  hs.unshift({ term, lang, t: Date.now() }); hs.length = Math.min(hs.length, 60); save();
}
async function doSearch(term, forced) {
  term = (term || '').trim(); if (!term) return;
  const lang = forced || (searchLang === 'auto' ? Dict.detect(term) : searchLang);
  const box = $('#result'); if (!box) return;
  box.innerHTML = ''; box.append(h('div', { class: 'loading' }, h('span', { class: 'spin' }), '사전을 찾고 있어요…'));
  if (lang === 'hanja' && !Dict.HANJA_RE.test(term)) return showHanjaByReading(term);
  let r;
  try { r = await Dict.lookup(term, lang); }
  catch (e) { r = { term, lang, found: false, meanings: [], defs: [], examples: [], parts: [], sources: [], errors: ['사전에 연결하지 못했어요'] }; }
  lastResult = r; addHist(term, lang);
  if ($('#result')) showResult(r);
}
async function showHanjaByReading(text) {
  const box = $('#result'); if (!box) return;
  const syls = [...text].filter(c => /[가-힣]/.test(c)).slice(0, 4);
  box.innerHTML = ''; box.append(h('div', { class: 'loading' }, h('span', { class: 'spin' }), '한자를 찾고 있어요…'));
  const lists = await Promise.all(syls.map(sy => Dict.hanjaByReading(sy)));
  if (!$('#result')) return;
  box.innerHTML = '';
  if (!syls.length) { box.append(h('p', { class: 'note' }, '한글 음(예: 학)이나 한자를 넣어 주세요.')); return; }
  const multi = syls.length > 1, pick = syls.map(() => null);
  const wordBtn = h('button', { class: 'btn primary wide', disabled: true }, '글자를 하나씩 골라요');
  const updateWord = () => {
    const ok = pick.every(Boolean);
    wordBtn.disabled = !ok;
    wordBtn.textContent = ok ? `「${pick.join('')}」(${syls.join('')}) 찾기` : `${syls.map((s, i) => pick[i] || s).join('')} — 글자를 하나씩 골라요`;
  };
  wordBtn.onclick = () => { const wd = pick.join(''); $('#q').value = wd; doSearch(wd, 'hanja'); };
  const card = h('div', { class: 'card' });
  if (multi) card.append(h('p', { class: 'note' }, `한자어 '${syls.join('')}': 글자마다 맞는 한자를 하나씩 눌러 골라요.`));
  syls.forEach((sy, i) => {
    const list = lists[i];
    const grid = h('div', { class: 'hanja-grid' });
    const cell = x => h('button', {
      class: 'hanja-cell' + (x.grade8 ? ' g8' : ''), title: x.hun, onclick: e => {
        if (!multi) { $('#q').value = x.ch; doSearch(x.ch, 'hanja'); return; }
        pick[i] = x.ch; [...grid.children].forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); updateWord();
      },
    }, h('b', {}, x.ch), h('small', {}, x.hun), x.grade8 ? h('i', { class: 'g8-tag' }, '8급') : null);
    list.slice(0, 9).forEach(x => grid.append(cell(x)));
    card.append(h('h4', { class: 'label' }, `'${sy}' 음을 가진 한자 `, h('small', {}, list.length ? `${list.length}개 · 자주 쓰는 순` : '')));
    if (!list.length) card.append(h('p', { class: 'note' }, '찾지 못했어요. 받침까지 맞게 적었는지 확인해 주세요.'));
    else {
      card.append(grid);
      if (list.length > 9) {
        const more = h('button', { class: 'btn small ghost', onclick: () => { list.slice(9).forEach(x => grid.append(cell(x))); more.remove(); } }, `더 보기 (${list.length - 9})`);
        card.append(more);
      }
    }
  });
  if (multi) { card.append(wordBtn); updateWord(); }
  card.append(extLinks(syls.join(''), 'hanja'), h('p', { class: 'source' }, '출처: 앱에 들어 있는 한자 8급 50자 · libhangul 한자 사전 (BSD-3)'));
  box.append(card);
}
function extLinks(term, lang) {
  const q = encodeURIComponent(term);
  const url = lang === 'en' ? `https://en.dict.naver.com/#/search?query=${q}` : lang === 'hanja' ? `https://hanja.dict.naver.com/#/search?query=${q}` : `https://ko.dict.naver.com/#/search?query=${q}`;
  return h('div', { class: 'ext' }, h('a', { href: url, target: '_blank', rel: 'noopener' }, '네이버 사전에서 더 보기 ↗'));
}
function showResult(r) {
  const box = $('#result'); if (!box) return;
  box.innerHTML = '';
  const id = wordId(r.term, r.lang), ex = W()[id];
  const meanInput = h(r.lang === 'en' ? 'input' : 'textarea', { class: 'input mean-input', rows: r.lang === 'en' ? null : 2, value: (ex && ex.meaning) || (r.lang === 'en' && !r.machine ? r.meanings.join(', ') : r.meanings[0]) || '', placeholder: '카드 뒷면에 적을 뜻 (예: 용감한)' });
  meanInput.addEventListener('change', () => { const w = W()[id]; if (w && meanInput.value.trim()) { w.meaning = meanInput.value.trim(); save(); toast('뜻을 고쳤어요'); } });
  const starBtn = h('button', { class: 'star-btn' + (ex && ex.starred ? ' on' : ''), 'aria-label': '별 단어로 저장', onclick: () => toggleStar(r, meanInput, starBtn) }, '★');
  const w = { term: r.term, lang: r.lang };

  const head = h('div', { class: 'res-head' },
    h('div', {},
      h('div', { class: 'res-term lang-' + r.lang }, r.term),
      h('div', { class: 'res-sub' }, h('span', { class: 'tag t-' + r.lang }, LANG_LABEL[r.lang]), r.pron ? h('span', { class: 'pron' }, r.pron) : null,
        r.hanja && r.lang === 'ko' ? h('span', { class: 'pron' }, r.hanja) : null, r.reading && r.lang === 'hanja' ? h('span', { class: 'pron' }, '읽기: ' + r.reading) : null)),
    h('div', { class: 'res-actions' },
      r.lang !== 'hanja' ? h('button', { class: 'icon-btn big', 'aria-label': '읽어 주기', onclick: () => Speech.say(r.term, r.lang === 'en' ? 'en' : 'ko') }, '🔊') :
        r.reading ? h('button', { class: 'icon-btn big', 'aria-label': '음 읽어 주기', onclick: () => Speech.say(r.reading, 'ko') }, '🔊') : null,
      starBtn));

  const parts = [head];
  if (r.note) parts.push(h('p', { class: 'note' }, r.note));
  if (!r.found) parts.push(h('div', { class: 'warn' }, '사전에서 찾지 못했어요. ', [...new Set(r.errors || [])].join(' · '), h('br'), '아래에 뜻을 직접 적고 ★를 눌러도 단어장에 들어가요.'));

  if (r.parts && r.parts.length) parts.push(h('div', { class: 'hanja-parts' }, r.parts.map(p => h('div', { class: 'hanja-part' }, h('b', {}, p.ch), h('span', {}, p.hun || '?')))));

  // 뜻 칩: 누르면 카드 뜻에 넣었다 뺐다 해요
  const chipReg = [];
  const multi = r.lang === 'en'; // 영어는 여러 뜻을 골라 넣고, 국어·한자는 뜻풀이 하나를 골라요
  const picked = () => multi ? meanInput.value.split(/\s*[,;]\s*/).filter(Boolean) : [meanInput.value.trim()];
  const syncChips = () => { const p = picked(); chipReg.forEach(([b, t]) => b.classList.toggle('on', p.includes(t))); };
  meanInput.addEventListener('input', syncChips);
  const chip = (t, title) => {
    const b = h('button', {
      class: 'chip mean', title: title || null, onclick: () => {
        if (multi) { let p = picked(); p = p.includes(t) ? p.filter(x => x !== t) : [...p, t]; meanInput.value = p.join(', '); }
        else meanInput.value = t;
        meanInput.dispatchEvent(new Event('change')); syncChips();
      },
    }, t);
    chipReg.push([b, t]); return b;
  };
  const posRows = groups => h('div', { class: 'pos-groups' }, groups.filter(g => g.ko.length).map(g =>
    h('div', { class: 'pos-row' }, h('span', { class: 'pos big' }, g.label), h('div', { class: 'chips' }, g.ko.map((t, i) => chip(t, (g.glosses || [])[i]))))));
  parts.push(h('h4', { class: 'label' }, '카드에 적을 뜻 ', h('small', {}, '(뜻을 눌러 넣었다 뺐다 하거나 직접 고쳐요)')));
  if (r.aiGroups && r.aiGroups.length) {
    const x = r.aiExtra || {};
    parts.push(h('div', { class: 'ai-dict' }, h('small', { class: 'ai-tag' }, '🤖 AI 선생님이 정리한 뜻 (틀릴 수도 있어요)'), posRows(r.aiGroups),
      x.hanja || x.similar || x.opposite ? h('div', { class: 'ai-extra' },
        x.hanja ? h('span', {}, '한자 ', h('b', { class: 'lang-hanja' }, x.hanja)) : null,
        x.similar ? h('span', {}, '비슷한 말 ', h('b', {}, x.similar)) : null,
        x.opposite ? h('span', {}, '반대말 ', h('b', {}, x.opposite)) : null) : null));
  }
  if (r.lang === 'en' && r.posGroups && r.posGroups.some(g => g.ko.length)) parts.push(posRows(r.posGroups));
  else if (r.meanings.length) parts.push(h('div', { class: 'chips' }, r.meanings.map(t => chip(t))), r.machine ? h('p', { class: 'note' }, '⚠️ 사전에 한국어 뜻이 없어 기계 번역으로 찾았어요. 틀릴 수 있어요.') : null);
  if (aiReady() && !(r.aiGroups && r.aiGroups.length)) {
    const aiBtn = h('button', {
      class: 'btn small ai-btn', onclick: async () => {
        aiBtn.disabled = true; aiBtn.textContent = '🤖 AI가 찾는 중…';
        try {
          const a = await aiDictionary(r.term, r.lang, r.reading);
          r.aiGroups = a.groups; r.aiExamples = a.examples; r.aiExtra = a.extra || null; r.found = true;
          if (!r.sources.includes('AI 선생님 (Claude)')) r.sources.push('AI 선생님 (Claude)');
          Dict.remember(r); lastResult = r; showResult(r);
        } catch (e) { aiBtn.disabled = false; aiBtn.textContent = '🤖 AI에게 쉬운 뜻 물어보기'; toast(aiErrorText(e), 3500); }
      },
    }, '🤖 AI에게 쉬운 뜻 물어보기');
    parts.push(h('div', { class: 'row-tools' }, aiBtn, h('small', { class: 'note' }, `사전에 없는 뜻까지 쉽게 정리해 줘요 · 1번 ${won(usd(taskModel('dict'), 400, 600))}`)));
  }
  parts.push(meanInput);

  if (r.defs.length) {
    const title = r.lang === 'en' ? `영어로 된 뜻풀이 (${r.defs.length})` : `국어사전 뜻풀이 (${r.defs.length})`;
    const list = h('ol', { class: 'defs' }, r.defs.map(d => h('li', {}, d.pos ? h('span', { class: 'pos' }, d.pos) : null, d.text,
      r.lang !== 'en' ? h('button', { class: 'mini', onclick: () => { meanInput.value = d.text; meanInput.dispatchEvent(new Event('change')); } }, '이걸로') : null)));
    parts.push(h('details', { class: 'more', open: r.lang !== 'en' || !r.meanings.length }, h('summary', {}, title), list));
  }
  const exs = [...(r.aiExamples || []), ...r.examples].slice(0, 3); // 예문은 3개만 (품사마다 하나씩)
  if (exs.length) {
    parts.push(h('h4', { class: 'label' }, '예문'));
    parts.push(h('ul', { class: 'examples' }, exs.map(e => exampleItem(e.text, w, e.pos, e.ko))));
  }
  if (r.lang === 'ko' && /^[가-힣]{1,4}$/.test(r.term)) parts.push(h('div', { class: 'row-tools' }, h('button', { class: 'btn small', onclick: () => { searchLang = 'hanja'; lastResult = null; render(); $('#q').value = r.term; showHanjaByReading(r.term); } }, `漢 '${r.term}' 음으로 한자 찾기`)));
  parts.push(extLinks(r.term, r.lang));
  if (r.sources && r.sources.length) parts.push(h('p', { class: 'source' }, '출처: ', r.sources.join(' · ')));
  box.append(h('div', { class: 'card result' }, parts));
  syncChips(); // 이미 카드에 들어간 뜻은 눌린 모양으로
}
function exampleItem(text, w, pos, ko) {
  const tr = h('div', { class: 'ex-tr' }, ko || '');
  return h('li', {},
    h('div', { class: 'ex-text' }, pos ? h('span', { class: 'pos' }, pos) : null, highlight(text, w)),
    h('div', { class: 'ex-tools' },
      h('button', { class: 'mini', onclick: () => Speech.say(text, w.lang === 'en' ? 'en' : 'ko') }, '🔊 듣기'),
      w.lang === 'en' && !ko ? h('button', {
        class: 'mini', onclick: async e => {
          e.currentTarget.disabled = true; tr.textContent = '해석 중…';
          try { const j = await Dict.translate(text); tr.textContent = j ? j.responseData.translatedText + '  (기계 번역)' : '해석하지 못했어요'; }
          catch (err) { tr.textContent = '번역에 연결하지 못했어요'; }
        },
      }, '해석 보기') : null),
    tr);
}
function toggleStar(r, meanInput, btn) {
  const id = wordId(r.term, r.lang), ws = W();
  const w = ws[id];
  if (w && w.starred) { w.starred = false; save(); btn.classList.remove('on'); toast('별을 뺐어요 (기록은 남아 있어요)'); renderNav(); return; }
  const meaning = meanInput.value.trim() || r.meanings[0] || '';
  if (!meaning) { meanInput.focus(); toast('카드 뒷면에 적을 뜻을 먼저 적어 주세요'); return; }
  ws[id] = Object.assign(w || { id, created: Date.now(), s: newSrs() }, {
    term: r.term, lang: r.lang, meaning, pron: r.pron || '', audio: r.audio || '',
    examples: [...new Set([...(w && w.examples || []), ...(r.aiExamples || []).map(e => e.text), ...r.examples.slice(0, 6).map(e => e.text)])].slice(0, 8),
    parts: (r.parts || []).map(p => ({ ch: p.ch, hun: p.hun })), starred: true,
  });
  save(); btn.classList.add('on'); burst(btn, 10); sfx('ok');
  toast(`⭐ ${LANG_LABEL[r.lang]} 단어장에 넣었어요!` + (curSubj() !== 'all' && curSubj() !== r.lang ? ` (위에서 '${LANG_LABEL[r.lang]}'를 고르면 보여요)` : ''));
  announceUnlocks(); renderNav();
}

/* ================= 단어장 ================= */
let wordsTab = 'star';
function viewWords(m) {
  const list = h('div', { id: 'wlist' });
  m.append(h('section', { class: 'pad' },
    subjBar(() => render()),
    segmented([['star', '⭐ 별 단어'], ['sets', '📚 엄마 세트'], ['wrong', '🔁 오답노트'], ['hist', '🕘 찾은 기록']], wordsTab, v => { wordsTab = v; fillWords(list); }),
    h('div', { class: 'row-tools' },
      h('button', { class: 'btn small', onclick: openAddWord }, '+ 직접 넣기'),
      h('button', { class: 'btn small', onclick: openShare }, '💌 단어 나누기')),
    list));
  fillWords(list);
}
function wordRow(w, extra) {
  const lv = w.s ? w.s.level : 0;
  return h('button', { class: 'word-row', onclick: () => openWord(w.id) },
    h('span', { class: 'row-plant', html: plantSVG(lv) }),
    h('span', { class: 'row-main' }, h('b', { class: 'lang-' + w.lang }, w.term), h('small', {}, w.meaning)),
    extra || h('span', { class: 'row-stage' }, STAGES[lv]));
}
function fillWords(box) {
  box.innerHTML = '';
  if (wordsTab === 'sets') return viewSets(box);
  if (wordsTab === 'hist') {
    const hs = HIST();
    if (!hs.length) { box.append(h('p', { class: 'empty-line' }, '아직 찾은 단어가 없어요.')); return; }
    box.append(...hs.map(x => {
      const w = W()[wordId(x.term, x.lang)];
      return h('button', { class: 'word-row', onclick: () => { lastResult = null; searchLang = 'auto'; go('search'); $('#q').value = x.term; doSearch(x.term, x.lang); } },
        h('span', { class: 'tag t-' + x.lang }, LANG_LABEL[x.lang]),
        h('span', { class: 'row-main' }, h('b', {}, x.term), h('small', {}, new Date(x.t).toLocaleDateString('ko-KR'))),
        h('span', { class: 'row-star' + (w && w.starred ? ' on' : '') }, '★'));
    }));
    return;
  }
  if (wordsTab === 'wrong') {
    const ws = starred().filter(w => inSubj(w) && inWrongNote(w)).sort((a, b) => wrongScore(b) - wrongScore(a));
    const rec = Object.values(W()).filter(w => w.s && w.s.recovered).length;
    box.append(h('div', { class: 'info-box' },
      h('b', {}, '자주 틀린 단어일수록 테스트에 더 자주 나와요.'), h('br'),
      '힌트 없이 맞혀서 꽃봉오리(3단계)까지 키우면 오답노트에서 졸업해요.',
      h('div', { class: 'recovered' }, '🏅 지금까지 이겨낸 단어 ', h('b', {}, rec), '개')));
    if (!ws.length) { box.append(h('p', { class: 'empty-line' }, '오답노트가 비어 있어요. 멋져요!')); return; }
    const max = Math.max(...ws.map(wrongScore), 1);
    box.append(h('button', { class: 'btn primary wide', onclick: () => startTest({ onlyWrong: true, setId: null, lang: curSubj(), mode: testMode() }) }, '🔁 오답노트만 테스트하기'));
    box.append(...ws.map(w => wordRow(w, h('span', { class: 'row-wrong' },
      h('small', {}, `✗${w.s.wrong} · 💡${w.s.hints}`), h('i', { class: 'freq' }, h('i', { style: { width: Math.max(8, wrongScore(w) / max * 100) + '%' } }))))));
    return;
  }
  const ws = starred().filter(inSubj).sort((a, b) => b.created - a.created);
  if (!ws.length) {
    box.append(h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, '⭐'), h('p', {}, '사전에서 단어를 찾고 ★를 누르면 여기에 모여요.'),
      h('button', { class: 'btn primary', onclick: () => go('search') }, '단어 찾으러 가기')));
    return;
  }
  box.append(h('p', { class: 'count-line' }, `${curSubj() === 'all' ? '모든 과목' : LANG_LABEL[curSubj()]} 별 단어 ${ws.length}개`), ...ws.map(w => wordRow(w)));
}
function openWord(id) {
  const w = W()[id]; if (!w) return;
  const s = w.s || newSrs();
  const mean = h('input', { class: 'input', value: w.meaning });
  const exList = h('ul', { class: 'examples' });
  const fillEx = () => {
    exList.innerHTML = '';
    (w.examples || []).forEach((e, i) => exList.append(h('li', {}, h('div', { class: 'ex-text' }, highlight(e, w)),
      h('div', { class: 'ex-tools' }, h('button', { class: 'mini', onclick: () => Speech.say(e, w.lang === 'en' ? 'en' : 'ko') }, '🔊'),
        h('button', { class: 'mini', onclick: () => { w.examples.splice(i, 1); save(); fillEx(); } }, '지우기')))));
  };
  fillEx();
  const newEx = h('input', { class: 'input', placeholder: '예문 직접 넣기 (힌트로 나와요)' });
  const dots = h('div', { class: 'dots' }, [...(s.hist || '')].map(c => h('i', { class: 'd-' + c, title: c === 'o' ? '힌트 없이 맞힘' : c === 'h' ? '힌트 보고 맞힘' : '틀림' })));
  openSheet('단어 카드',
    h('div', { class: 'word-detail' },
      h('div', { class: 'wd-plant', html: plantSVG(s.level) }),
      h('div', {}, h('div', { class: 'res-term lang-' + w.lang }, w.term), h('div', { class: 'res-sub' }, h('span', { class: 'tag t-' + w.lang }, LANG_LABEL[w.lang]), w.pron ? h('span', { class: 'pron' }, w.pron) : null),
        h('div', { class: 'stage-name' }, `${STAGES[s.level]} (${s.level}/5단계)`)),
      w.lang !== 'hanja' ? h('button', { class: 'icon-btn big', onclick: () => speakWord(w) }, '🔊') : null),
    (w.parts && w.parts.length) ? h('div', { class: 'hanja-parts' }, w.parts.map(p => h('div', { class: 'hanja-part' }, h('b', {}, p.ch), h('span', {}, p.hun || '?')))) : null,
    h('h4', { class: 'label' }, '뜻'), mean,
    h('div', { class: 'mini-stats' }, h('span', {}, `본 횟수 ${s.seen}`), h('span', {}, `맞힘 ${s.right}`), h('span', {}, `힌트 ${s.hints}`), h('span', {}, `틀림 ${s.wrong}`)),
    s.hist ? h('div', {}, h('h4', { class: 'label' }, '최근 기록 ', h('small', {}, '🟢 혼자 맞힘 · 🟡 힌트 · 🔴 틀림')), dots) : null,
    h('h4', { class: 'label' }, '예문 (힌트)'), exList,
    h('form', { class: 'inline-form', onsubmit: e => { e.preventDefault(); const t = newEx.value.trim(); if (!t) return; (w.examples ||= []).unshift(t); newEx.value = ''; save(); fillEx(); } }, newEx, h('button', { class: 'btn small' }, '넣기')),
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn primary', onclick: () => { if (mean.value.trim()) w.meaning = mean.value.trim(); save(); closeOverlay(); render(); toast('저장했어요'); } }, '저장'),
      h('button', { class: 'btn', onclick: () => { w.starred = !w.starred; save(); closeOverlay(); render(); toast(w.starred ? '⭐ 별을 달았어요' : '별을 뺐어요'); } }, w.starred ? '별 빼기' : '⭐ 별 달기'),
      h('button', { class: 'btn ghost', onclick: () => { lastResult = null; closeOverlay(); go('search'); $('#q').value = w.term; doSearch(w.term, w.lang); } }, '사전 보기'),
      h('button', { class: 'btn danger', onclick: () => { if (!confirm(`'${w.term}' 단어와 기록을 지울까요?`)) return; delete W()[id]; save(); closeOverlay(); render(); } }, '지우기')));
}
function openAddWord() {
  const term = h('input', { class: 'input', placeholder: '단어 (예: brave)' });
  const mean = h('input', { class: 'input', placeholder: '뜻 (예: 용감한)' });
  const ex = h('input', { class: 'input', placeholder: '예문 (없어도 돼요)' });
  const bulk = h('textarea', { class: 'input', rows: 5, placeholder: '여러 개 한꺼번에: 한 줄에 하나씩\nbrave = 용감한\nhonest = 정직한' });
  const add = (t, mn, e) => {
    t = t.trim(); mn = mn.trim(); if (!t || !mn) return false;
    const lang = Dict.detect(t), id = wordId(t, lang), ws = W();
    ws[id] = Object.assign(ws[id] || { id, created: Date.now(), s: newSrs(), examples: [], parts: [] }, { term: t, lang, meaning: mn, starred: true });
    if (e && e.trim()) ws[id].examples.unshift(e.trim());
    return true;
  };
  openSheet('단어 직접 넣기',
    h('p', { class: 'note' }, '엄마가 단어 목록을 넣어 주거나, 사전에 없는 단어를 넣을 때 써요.'),
    term, mean, ex,
    h('button', { class: 'btn primary wide', onclick: () => { if (!add(term.value, mean.value, ex.value)) { toast('단어와 뜻을 적어 주세요'); return; } save(); announceUnlocks('⭐ 넣었어요'); term.value = mean.value = ex.value = ''; term.focus(); renderNav(); } }, '⭐ 넣기'),
    h('h4', { class: 'label' }, '여러 개 한꺼번에'), bulk,
    h('button', {
      class: 'btn wide', onclick: () => {
        let n = 0;
        for (const line of bulk.value.split('\n')) { const m = line.split(/\s*[=:\t]\s*|\s+-\s+/); if (m.length >= 2 && add(m[0], m.slice(1).join(', '), '')) n++; }
        save(); checkUnlocks(); toast(n ? `⭐ ${n}개 넣었어요` : '"단어 = 뜻" 모양으로 적어 주세요'); if (n) { closeOverlay(); render(); }
      },
    }, '한꺼번에 넣기'));
}

/* ================= 테스트 ================= */
function viewTest(m) {
  const st = starred().filter(inSubj), now = Date.now(), s = ST();
  m.append(h('section', { class: 'pad subj-pad' }, subjBar()));
  const due = st.filter(w => !w.s || w.s.due <= now).length, wr = st.filter(inWrongNote).length;
  if (!st.length) {
    m.append(h('section', { class: 'pad' }, h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, '🃏'),
      h('p', {}, curSubj() === 'all' || !starred().length ? '별 단어가 아직 없어요.' : `${LANG_LABEL[curSubj()]} 별 단어가 아직 없어요.`), h('p', { class: 'note' }, '사전에서 단어를 찾고 ★를 누르거나, 위에서 다른 과목을 골라 보세요.'),
      h('button', { class: 'btn primary', onclick: () => go('search') }, '단어 찾으러 가기'))));
    return;
  }
  const modes = [['choice', '🎯', '뜻 고르기', '영어를 듣고 4개 중에서 뜻을 골라요'], ['listen', '👂', '듣고 고르기', '단어는 숨기고 소리만 들려줘요. 듣고 뜻을 골라요'], ['flip', '🃏', '말하고 넘기기', '뜻을 소리 내어 말하고, 눌러서 확인하고, 밀어서 넘겨요'], ['flash', '⚡', '반짝 플래시', '카드가 자동으로 휙휙 넘어가요. 보고 듣기만!'], ['sentence', '🎤', '말로 문장 만들기', '단어를 넣어 문장을 말하면 AI 선생님이 봐 주고 더 좋은 표현을 알려줘요']];
  const sets = mySets().filter(x => curSubj() === 'all' || x.words.some(y => y[1] === curSubj()));
  if (s.scope && s.scope !== 'all' && !sets.some(x => x.id === s.scope)) s.scope = 'all';
  const countLine = h('p', { class: 'note' });
  const updCount = () => { const n = testPool({ setId: s.scope !== 'all' ? s.scope : null, lang: curSubj(), onlyWrong: s.onlyWrong }).length; countLine.textContent = `지금 고른 조건의 단어: ${n}개`; };
  const modeBox = h('div', { class: 'modes' });
  modes.forEach(([id, ic, name, desc]) => modeBox.append(h('button', {
    class: 'mode' + (s.mode === id ? ' on' : ''), onclick: e => { s.mode = id; save(); [...modeBox.children].forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); },
  }, h('span', { class: 'mode-ic' }, ic), h('span', {}, h('b', {}, name), h('small', {}, desc)))));
  const onlyWrong = h('input', { type: 'checkbox', checked: !!s.onlyWrong, onchange: e => { s.onlyWrong = e.target.checked; save(); updCount(); } });
  const speak = h('input', { type: 'checkbox', checked: s.speak !== false, onchange: e => { s.speak = e.target.checked; save(); } });
  m.append(h('section', { class: 'pad' },
    curSubj() === 'all' ? h('p', { class: 'note' }, '🔀 섞어서는 여러 과목이 익숙해진 뒤 한꺼번에 복습할 때 써요. 처음 외울 때는 과목 하나씩이 좋아요.') : null,
    h('div', { class: 'tiles' }, tile('⭐', st.length, '별 단어'), tile('📅', due, '오늘 볼 단어'), tile('🔁', wr, '오답노트')),
    h('h4', { class: 'label' }, '무엇으로 할까요?'),
    sets.length ? segmented([['all', '⭐ 내 별 단어 전체'], ...sets.map(x => [x.id, '📚 ' + x.name])], s.scope || 'all', v => { s.scope = v; save(); updCount(); }) : null,
    countLine,
    h('h4', { class: 'label' }, '어떻게 할까요?'), modeBox,
    h('h4', { class: 'label' }, '오늘은 몇 장?'),
    segmented([[10, '10장'], [15, '15장'], [20, '20장'], [30, '30장'], ['all', '전부']].map(([v, l]) => [String(v), l]), String(s.size), v => { s.size = v === 'all' ? 'all' : +v; save(); }),
    h('label', { class: 'toggle' }, speak, h('span', {}, '🔊 영어로 읽어 주기')),
    h('label', { class: 'toggle' }, onlyWrong, h('span', {}, '🔁 오답노트 단어만')),
    h('button', { class: 'btn primary wide big-start', onclick: () => startTest() }, '시작! ✨'),
    (() => { updCount(); return null; })(),
    h('p', { class: 'note center' }, '자주 틀린 단어와 복습할 때가 된 단어가 더 자주 나와요.')));
}
const tile = (ic, n, label) => h('div', { class: 'tile' }, h('span', { class: 'tile-ic' }, ic), h('b', {}, n), h('small', {}, label));

function testPool(f = {}) {
  let pool = f.setId && SETS()[f.setId] ? setWordsOf(f.setId) : starred();
  if (f.lang && f.lang !== 'all') pool = pool.filter(w => w.lang === f.lang);
  if (f.onlyWrong) pool = pool.filter(inWrongNote);
  return pool;
}
function buildQueue(n, f) {
  const now = Date.now();
  const pool = testPool(f);
  const items = pool.map(w => {
    const s = w.s || newSrs(); let wt = 1;
    if (!s.seen) wt = 2.5;
    if (s.due <= now) wt *= 2.5;
    wt *= 1 + ((s.wrong * 2 + s.hints) / (s.seen + 1)) * 2.5; // 자주 틀릴수록·힌트를 많이 볼수록 더 자주
    if (s.hist.slice(-1) === 'x') wt *= 2;
    if (s.level >= 5 && s.due > now) wt *= 0.25;
    return { id: w.id, k: Math.pow(Math.random(), 1 / wt) }; // 가중치 무작위 뽑기
  }).sort((a, b) => b.k - a.k);
  return items.slice(0, n).map(x => x.id);
}
let T = null;
const testMode = () => (ST().mode === 'sentence' ? 'choice' : ST().mode);
function startTest(opts = {}) {
  const s = ST();
  const n = s.size === 'all' ? 9999 : (+s.size || 15);
  const mode = opts.mode || s.mode;
  const f = { setId: opts.setId !== undefined ? opts.setId : (s.scope !== 'all' ? s.scope : null), lang: opts.lang || curSubj(), onlyWrong: opts.onlyWrong ?? s.onlyWrong };
  if (mode === 'sentence' && !opts.mode) return startSentences(f);
  const ids = buildQueue(n, f);
  if (!ids.length) { toast(f.onlyWrong ? '오답노트가 비어 있어요!' : '이 조건으로 테스트할 단어가 없어요'); return; }
  const before = {}; ids.forEach(id => { before[id] = (W()[id].s || newSrs()).level; });
  T = { mode, filter: f, queue: ids.map(id => ({ id })), i: 0, res: [], retries: {}, before, timer: null, token: 0, paused: false };
  Speech.stop(); openFull(); renderCard();
}
function renderCard() {
  const o = $('#overlay'); o.innerHTML = '';
  if (T.i >= T.queue.length) return finishTest();
  const q = T.queue[T.i], w = W()[q.id];
  if (!w) { T.i++; return renderCard(); }
  T.hinted = false; T.answered = false;
  o.append(h('div', { class: 't-top' },
    h('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: quitTest }, '✕'),
    h('div', { class: 'bar' }, h('i', { style: { width: (T.i / T.queue.length * 100) + '%' } })),
    h('span', { class: 'count' }, `${T.i + 1}/${T.queue.length}`)));
  if (T.mode === 'flash') return renderFlash(o, w, q);
  if (T.mode === 'flip') return renderFlip(o, w, q);
  return renderChoice(o, w, q);
}
function cardFront(w, q) {
  return h('div', { class: 'face front' },
    q.retry ? h('span', { class: 'retry-tag' }, '다시 도전!') : null,
    h('span', { class: 'tag t-' + w.lang }, LANG_LABEL[w.lang]),
    h('div', { class: 'term lang-' + w.lang + (w.term.length > 9 ? ' long' : '') }, w.term),
    w.pron ? h('div', { class: 'pron' }, w.pron) : null);
}
function hintArea(w) {
  const box = h('div', { class: 'hint-box' });
  const btn = h('button', {
    class: 'tool hint', onclick: () => {
      if (T.answered) return;
      T.hinted = true; btn.classList.add('used'); box.innerHTML = '';
      const ex = pickExample(w);
      if (ex) {
        box.append(h('div', { class: 'hint-title' }, '💡 이 단어가 들어간 예문'), h('div', { class: 'ex-text' }, highlight(ex, w)));
        if (ST().speak !== false) Speech.say(ex, w.lang === 'en' ? 'en' : 'ko');
      } else if (w.parts && w.parts.length > 1 && w.parts.every(p => p.hun)) {
        box.append(h('div', { class: 'hint-title' }, '💡 한 글자씩 보면'), h('div', {}, w.parts.map(p => `${p.ch} ${p.hun}`).join('  ·  ')));
      } else {
        box.append(h('div', { class: 'hint-title' }, '💡 첫 글자 힌트'), h('div', {}, `뜻은 '${[...w.meaning][0]}'(으)로 시작해요`));
      }
      box.classList.add('on');
    },
  }, '💡 힌트');
  return { box, btn };
}
function renderChoice(o, w, q) {
  const { box, btn } = hintArea(w);
  const listen = T.mode === 'listen' && w.lang !== 'hanja';
  const front = listen ? h('div', { class: 'face front' }, h('span', { class: 'tag t-' + w.lang }, LANG_LABEL[w.lang]), q.retry ? h('span', { class: 'retry-tag' }, '다시 도전!') : null,
    h('button', { class: 'listen-btn', 'aria-label': '다시 듣기', onclick: () => speakWord(w) }, '🔊'), h('div', { class: 'pron' }, '잘 듣고 뜻을 골라요')) : cardFront(w, q);
  const card = h('div', { class: 'flash-card in' }, front);
  if (listen) card.reveal = () => { card.innerHTML = ''; card.append(cardFront(w, q)); };
  const grid = h('div', { class: 'choices' });
  for (const t of makeChoices(w)) grid.append(h('button', { class: 'choice', 'data-v': t, onclick: e => answerChoice(w, q, t, e.currentTarget, grid, card) }, t));
  o.append(h('div', { class: 'card-stage' }, card), box, grid,
    h('div', { class: 't-tools' }, btn,
      w.lang !== 'hanja' ? h('button', { class: 'tool', onclick: () => speakWord(w) }, '🔊 다시 듣기') : null,
      h('button', { class: 'tool', onclick: () => answerChoice(w, q, null, null, grid, card) }, '🤔 모르겠어')));
  if (ST().speak !== false || listen) speakWord(w);
}
function makeChoices(w) {
  const right = w.meaning, out = [];
  const add = t => { if (t && t !== right && !out.includes(t) && out.length < 3) out.push(t); };
  const others = Object.values(W()).filter(x => x.id !== w.id && x.meaning);
  shuffle(others.filter(x => x.lang === w.lang)).forEach(x => add(x.meaning));
  shuffle(FALLBACK_MEANINGS[w.lang] || FALLBACK_MEANINGS.en).forEach(add);
  return shuffle([right, ...out]);
}
function answerChoice(w, q, pick, btn, grid, card) {
  if (T.answered) return; T.answered = true;
  const ok = pick !== null && pick === w.meaning;
  [...grid.children].forEach(b => { if (b.dataset.v === w.meaning) b.classList.add('ok'); else if (b === btn) b.classList.add('no'); b.disabled = true; });
  record(w, q, ok ? (T.hinted ? 'h' : 'o') : 'x');
  if (card.reveal) card.reveal();
  if (ok) { burst(btn || card); sfx('ok'); setTimeout(next, card.reveal ? 1300 : 800); }
  else {
    sfx('no'); card.classList.add('shake');
    const ex = pickExample(w);
    grid.after(h('div', { class: 'answer-box' }, h('div', {}, '정답은 ', h('b', {}, w.meaning), ' 이에요'), ex ? h('div', { class: 'ex-text' }, highlight(ex, w)) : null,
      h('div', { class: 'again-note' }, '조금 있다가 다시 나와요 💪'), h('button', { class: 'btn primary', onclick: next }, '다음 ▶')));
  }
}
function renderFlip(o, w, q) {
  const { box, btn } = hintArea(w);
  const ex = pickExample(w);
  const back = h('div', { class: 'face back' }, h('span', { class: 'tag t-' + w.lang }, w.term), h('div', { class: 'meaning' }, w.meaning), ex ? h('div', { class: 'ex-text small' }, highlight(ex, w)) : null);
  const flipper = h('div', { class: 'flipper' }, cardFront(w, q), back);
  const card = h('div', { class: 'flash-card swipe in' }, flipper);
  let flipped = false;
  const judge = h('div', { class: 'judge hidden' },
    h('button', { class: 'judge-btn no', onclick: () => decide(false) }, '😅 몰랐어'),
    h('button', { class: 'judge-btn yes', onclick: () => decide(true) }, '😊 알았어'));
  const flip = () => { if (flipped) return; flipped = true; flipper.classList.add('flipped'); judge.classList.remove('hidden'); if (w.lang === 'hanja') Speech.say(w.meaning, 'ko'); };
  function decide(ok) {
    if (T.answered) return; T.answered = true;
    card.style.transition = 'transform .3s ease, opacity .3s'; card.style.transform = `translateX(${ok ? 140 : -140}%) rotate(${ok ? 18 : -18}deg)`; card.style.opacity = '0';
    record(w, q, ok ? (T.hinted ? 'h' : 'o') : 'x');
    if (ok) { sfx('ok'); burst(judge, 8); } else sfx('no');
    setTimeout(next, 320);
  }
  attachSwipe(card, dir => { if (!flipped) { flip(); return false; } decide(dir > 0); return true; }, flip);
  o.append(h('div', { class: 'card-stage' }, h('div', { class: 'swipe-hint left' }, '← 몰랐어'), card, h('div', { class: 'swipe-hint right' }, '알았어 →')), box, judge,
    h('div', { class: 't-tools' }, btn, w.lang !== 'hanja' ? h('button', { class: 'tool', onclick: () => speakWord(w) }, '🔊 다시 듣기') : null),
    h('p', { class: 'note center' }, '뜻을 소리 내어 말해 보고, 카드를 눌러 확인해요'));
  if (ST().speak !== false) speakWord(w);
}
function attachSwipe(el, onSwipe, onTap) {
  let x0 = null, y0 = 0, dx = 0, id = null;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; dx = 0; id = e.pointerId; el.setPointerCapture(id); el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    if (Math.abs(dx) > 6) el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    el.classList.toggle('lean-right', dx > 50); el.classList.toggle('lean-left', dx < -50);
  });
  const end = e => {
    if (x0 === null) return;
    const moved = Math.abs(dx), dy = Math.abs(e.clientY - y0);
    x0 = null; el.classList.remove('lean-right', 'lean-left');
    el.style.transition = 'transform .25s ease';
    if (moved > 90) { if (onSwipe(dx > 0 ? 1 : -1)) return; }
    el.style.transform = '';
    if (moved < 8 && dy < 8 && e.type === 'pointerup') onTap();
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function renderFlash(o, w, q) {
  const meaning = h('div', { class: 'flash-meaning' }, w.meaning);
  const card = h('div', { class: 'flash-card in flash' }, cardFront(w, q), meaning);
  const s = ST();
  const pauseBtn = h('button', { class: 'tool', onclick: () => { T.paused = !T.paused; pauseBtn.textContent = T.paused ? '▶ 계속' : '⏸ 잠깐'; if (!T.paused) { T.i++; renderCard(); } } }, T.paused ? '▶ 계속' : '⏸ 잠깐');
  o.append(h('div', { class: 'card-stage' }, card),
    h('div', { class: 't-tools' }, pauseBtn, h('button', { class: 'tool', onclick: () => { T.token++; T.i++; renderCard(); } }, '⏭ 넘기기')),
    h('div', { class: 'speed' }, h('span', {}, '빠르기'), segmented([['2400', '천천히'], ['1500', '보통'], ['900', '빠르게']], String(s.flashSpeed || 1500), v => { s.flashSpeed = +v; save(); }, 'small')));
  const tok = ++T.token, d = s.flashSpeed || 1500;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    const sp = s.speak !== false ? speakWord(w) : Promise.resolve();
    await Promise.race([sp, wait(d + 800)]);
    await wait(Math.max(200, d * 0.4));
    if (!T || tok !== T.token) return;
    meaning.classList.add('on');
    if (w.lang === 'hanja' && s.speak !== false) Speech.say(w.meaning, 'ko');
    const ws = w.s ||= newSrs(); ws.flash = (ws.flash || 0) + 1; T.res.push({ id: w.id, r: 'f' });
    await wait(d);
    if (!T || tok !== T.token || T.paused) return;
    T.i++; renderCard();
  })();
}
function record(w, q, r) {
  const s = w.s ||= newSrs();
  s.seen++; s.last = Date.now();
  if (T.hinted) s.hints++;
  if (!q.retry) {
    if (r === 'o') { s.right++; s.nh++; s.level = Math.min(5, s.level + 1); }
    else if (r === 'h') { s.right++; } // 힌트를 보고 맞히면 단계는 그대로
    else { s.wrong++; s.level = s.level >= 3 ? s.level - 2 : 0; }
    const days = r === 'x' ? 0 : r === 'h' ? Math.min(1, INTERVAL[s.level]) : INTERVAL[s.level];
    s.due = Date.now() + days * DAY;
  } else if (r === 'x') s.wrong++;
  if (s.wrong > 0 && s.level >= 3) s.recovered = true;
  s.hist = (s.hist + r).slice(-12);
  T.res.push({ id: w.id, r, retry: !!q.retry, hinted: T.hinted });
  if (r === 'x' && (T.retries[w.id] || 0) < 2) { // 틀린 단어는 3장 뒤에 다시
    T.retries[w.id] = (T.retries[w.id] || 0) + 1;
    T.queue.splice(Math.min(T.i + 4, T.queue.length), 0, { id: w.id, retry: true });
  }
  logDay(e => { e.n++; if (r !== 'x') e.c++; if (r === 'o') e.nh++; if (T.hinted) e.h++; });
  save();
}
function next() { if (!T) return; T.i++; renderCard(); }
function quitTest() {
  if (!T) return closeOverlay();
  T.token++; Speech.stop();
  if (T.res.length) finishTest(); else { T = null; closeOverlay(); render(); }
}
function finishTest() {
  T.token++; Speech.stop();
  const t = T;
  if (t.res.length) logDay(e => { if (t.mode === 'flash') e.f++; else e.s++; });
  save();
  const newly = checkUnlocks();
  const o = openFull(); o.classList.add('result');
  const p = P();
  if (t.mode === 'flash') {
    const n = t.res.filter(x => x.r === 'f').length;
    o.append(h('div', { class: 'result-wrap' },
      h('div', { class: 'result-av', html: avatarSVG(p.avatar) }),
      h('h2', {}, `⚡ ${n}장 반짝 플래시 끝!`), h('p', { class: 'sub' }, '눈과 귀로 익혔어요. 이제 진짜 알고 있는지 확인해 볼까요?'),
      unlockBlock(newly),
      h('div', { class: 'result-btns' },
        h('button', { class: 'btn primary', onclick: () => startTest({ ...t.filter, mode: 'choice' }) }, '🎯 뜻 고르기로 확인'),
        h('button', { class: 'btn', onclick: () => { T = null; closeOverlay(); render(); } }, '닫기'))));
    T = null; renderNav(); renderTop(); return;
  }
  const first = t.res.filter(x => !x.retry && x.r !== 'f');
  const nh = first.filter(x => x.r === 'o').length, hint = first.filter(x => x.r === 'h').length, wrong = first.filter(x => x.r === 'x').length;
  const comeback = t.res.filter(x => x.retry && x.r !== 'x').length;
  const grew = Object.keys(t.before).map(id => W()[id]).filter(w => w && w.s && w.s.level > t.before[w.id]);
  const ratio = first.length ? nh / first.length : 0;
  const title = ratio >= 0.8 ? '반짝반짝! 거의 다 알아요' : ratio >= 0.5 ? '쑥쑥 자라고 있어요' : '도전한 만큼 자라요';
  // 나와 비교: 지난 7일 평균 '힌트 없이 맞힌 비율'
  let prevN = 0, prevNh = 0;
  for (let i = 1; i <= 7; i++) { const e = LOG()[today(daysAgo(i))]; if (e) { prevN += e.n; prevNh += e.nh; } }
  const prevRatio = prevN ? prevNh / prevN : null;
  const compare = prevRatio !== null && first.length >= 5 && ratio > prevRatio + 0.05
    ? `지난 7일보다 혼자 맞힌 비율이 ${Math.round((ratio - prevRatio) * 100)}% 올랐어요! 📈` : null;
  if (grew.length || newly.length) setTimeout(() => sfx('up'), 300);
  o.append(h('div', { class: 'result-wrap' },
    h('div', { class: 'result-av', html: avatarSVG(p.avatar) }),
    h('h2', {}, title),
    h('div', { class: 'tiles' }, tile('🌟', nh, '혼자 맞힘'), tile('💡', hint, '힌트로 맞힘'), tile('🔁', wrong, '다시 볼 단어'), comeback ? tile('💪', comeback, '다시 도전 성공') : null),
    compare ? h('p', { class: 'compare' }, compare) : null,
    grew.length ? h('div', { class: 'card' }, h('h4', { class: 'label' }, `🌱 자란 단어 ${grew.length}개`),
      h('div', { class: 'grew' }, grew.map(w => h('div', { class: 'grew-item' }, h('span', { html: plantSVG(t.before[w.id], 'plant sm') }), '→', h('span', { html: plantSVG(w.s.level, 'plant sm') }), h('b', {}, w.term), h('small', {}, STAGES[w.s.level]))))) : null,
    !grew.length && hint ? h('p', { class: 'note center' }, '힌트 없이 맞히면 단어가 한 단계 자라요 🌱') : null,
    unlockBlock(newly),
    h('div', { class: 'result-btns' },
      wrong ? h('button', { class: 'btn primary', onclick: () => startTest({ ...t.filter, onlyWrong: true, mode: t.mode }) }, '🔁 틀린 것만 다시') : null,
      h('button', { class: wrong ? 'btn' : 'btn primary', onclick: () => startTest({ ...t.filter, mode: t.mode }) }, '한 번 더'),
      h('button', { class: 'btn ghost', onclick: () => { T = null; closeOverlay(); go('me'); } }, '🌸 내 정원 보기'))));
  if (ratio >= 0.8) setTimeout(() => burst($('.result-av'), 20), 200);
  T = null; renderNav(); renderTop();
}
function unlockBlock(newly) {
  if (!newly.length) return null;
  const p = P();
  return h('div', { class: 'card unlock' }, h('h4', { class: 'label' }, '🎁 새로 열린 꾸미기'),
    h('div', { class: 'unlock-row' }, newly.map(it => h('div', { class: 'unlock-item' }, h('span', { html: avatarSVG({ ...p.avatar, [it.cat]: it.id }, 'avatar sm') }), h('small', {}, it.name)))),
    h('button', { class: 'btn small', onclick: () => { T = null; openDress(); } }, '지금 꾸미기 🎀'));
}

/* ================= 나 (성장 · 아바타 · 설정) ================= */
function viewMe(m) {
  const p = P(), st = stats();
  const locked = CATALOG.filter(it => it.req && !isUnlocked(it))
    .map(it => ({ it, v: reqValue(st, it.req[0]), n: it.req[1] })).sort((a, b) => b.v / b.n - a.v / a.n).slice(0, 3);
  m.append(h('section', { class: 'pad' },
    h('div', { class: 'me-card' },
      h('div', { class: 'me-av', html: avatarSVG(p.avatar) }),
      h('div', { class: 'me-info' }, h('h2', {}, p.name), h('p', {}, `🔥 ${st.streak}일째 공부 중 (최고 ${st.bestStreak}일)`),
        h('button', { class: 'btn primary', onclick: openDress }, '꾸미기 🎀'))),
    locked.length ? h('div', { class: 'card' }, h('h4', { class: 'label' }, '곧 열려요'),
      locked.map(({ it, v, n }) => h('div', { class: 'next-unlock' },
        h('span', { html: avatarSVG({ ...p.avatar, [it.cat]: it.id }, 'avatar xs') }),
        h('div', {}, h('b', {}, it.name), h('small', {}, `${REQ_LABEL[it.req[0]](n)} (${Math.min(v, n)}/${n})`), h('i', { class: 'prog' }, h('i', { style: { width: Math.min(100, v / n * 100) + '%' } })))))) : null,
    h('div', { class: 'tiles four' }, tile('🌸', st.bloom, '꽃 핀 단어'), tile('🌟', st.nohint, '혼자 맞힘'), tile('🏅', st.recovered, '이겨낸 단어'), tile('🎤', st.sentences, '만든 문장')),
    weekChart(),
    sentenceNote(),
    subjBar(),
    garden(),
    settingsBlock()));
}
function weekChart() {
  const days = [...Array(7)].map((_, i) => daysAgo(6 - i));
  const es = days.map(d => LOG()[today(d)] || { n: 0, c: 0, nh: 0, h: 0, f: 0 });
  const max = Math.max(5, ...es.map(e => e.n));
  const wk = '일월화수목금토';
  return h('div', { class: 'card' }, h('h4', { class: 'label' }, '최근 7일 ', h('small', {}, '■ 혼자 맞힘 ■ 힌트·틀림')),
    h('div', { class: 'chart' }, days.map((d, i) => {
      const e = es[i];
      return h('div', { class: 'col' + (i === 6 ? ' today' : '') },
        h('div', { class: 'bars' }, h('i', { class: 'b-rest', style: { height: ((e.n - e.nh) / max * 100) + '%' } }), h('i', { class: 'b-nh', style: { height: (e.nh / max * 100) + '%' } })),
        h('small', {}, i === 6 ? '오늘' : wk[d.getDay()]), e.n ? h('em', {}, e.nh) : null);
    })));
}
function garden() {
  const ws = starred().filter(inSubj).sort((a, b) => (b.s ? b.s.level : 0) - (a.s ? a.s.level : 0));
  const counts = [0, 0, 0, 0, 0, 0]; ws.forEach(w => counts[w.s ? w.s.level : 0]++);
  return h('div', { class: 'card' },
    h('h4', { class: 'label' }, curSubj() === 'all' ? '🌷 내 단어 정원' : `🌷 내 ${LANG_LABEL[curSubj()]} 정원`),
    h('div', { class: 'legend' }, STAGES.map((n, i) => h('span', {}, h('span', { html: plantSVG(i, 'plant xs') }), `${n} ${counts[i]}`))),
    ws.length ? h('div', { class: 'garden' }, ws.map(w => h('button', { class: 'g-cell', onclick: () => openWord(w.id), title: w.meaning }, h('span', { html: plantSVG(w.s ? w.s.level : 0) }), h('small', {}, w.term))))
      : h('p', { class: 'empty-line' }, '별 단어를 모으면 씨앗이 심어져요.'),
    h('p', { class: 'note' }, '힌트 없이 맞히면 한 단계 자라요. 힌트를 보고 맞히면 그대로, 틀리면 조금 작아져요.'));
}
function openDress() {
  const p = P(), draft = { ...AV_DEFAULT, ...p.avatar };
  const st = stats();
  const o = openFull(); o.classList.add('dress');
  const preview = h('div', { class: 'dress-preview', html: avatarSVG(draft) });
  const grid = h('div', { class: 'item-grid' });
  let cat = 'hair';
  const fill = () => {
    grid.innerHTML = '';
    for (const it of CATALOG.filter(x => x.cat === cat)) {
      const open = isUnlocked(it);
      const v = it.req ? reqValue(st, it.req[0]) : 0;
      grid.append(h('button', {
        class: 'item' + (draft[cat] === it.id ? ' on' : '') + (open ? '' : ' locked'),
        onclick: () => {
          if (!open) { toast(`🔒 ${REQ_LABEL[it.req[0]](it.req[1])}하면 열려요 (지금 ${Math.min(v, it.req[1])})`); return; }
          draft[cat] = it.id; preview.innerHTML = avatarSVG(draft); fill();
        },
      }, h('span', { html: avatarSVG({ ...draft, [cat]: it.id }, 'avatar sm') }), h('small', {}, open ? it.name : '🔒 ' + it.name),
        open ? null : h('i', { class: 'prog' }, h('i', { style: { width: Math.min(100, v / it.req[1] * 100) + '%' } }))));
    }
  };
  o.append(h('div', { class: 't-top' }, h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: () => { closeOverlay(); render(); } }, '✕'), h('b', { class: 'grow' }, '꾸미기'),
    h('button', { class: 'btn primary small', onclick: () => { p.avatar = draft; save(); closeOverlay(); render(); toast('예쁘다! 저장했어요 🎀'); } }, '저장')),
    preview,
    segmented(CATS, cat, v => { cat = v; fill(); }, 'cats'),
    grid,
    h('p', { class: 'note center' }, '🔒 아이템은 단어가 자랄수록 하나씩 열려요.'));
  fill();
}
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function settingsBlock() {
  const s = ST();
  const rate = h('input', { type: 'range', min: 0.5, max: 1.2, step: 0.05, value: s.rate || 0.85, onchange: e => { s.rate = +e.target.value; save(); Speech.say('Hello, nice to meet you.', 'en'); } });
  const voices = Speech.voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  const vsel = voices.length ? h('select', { class: 'input', onchange: e => { s.voice = e.target.value; save(); Speech.say('Good job!', 'en'); } },
    h('option', { value: '' }, '자동 (미국 영어)'), voices.map(v => h('option', { value: v.name, selected: s.voice === v.name ? true : null }, `${v.name} (${v.lang})`))) : null;
  const sfxT = h('input', { type: 'checkbox', checked: s.sfx !== false, onchange: e => { s.sfx = e.target.checked; save(); } });
  const checkBox = h('div', { class: 'check-box' });
  return h('div', { class: 'card settings' },
    h('h4', { class: 'label' }, '⚙️ 설정'),
    installEvt ? h('button', { class: 'btn primary wide', onclick: async () => { installEvt.prompt(); installEvt = null; } }, '📲 앱으로 설치하기') : null,
    h('label', { class: 'set-row' }, h('span', {}, '읽어 주는 빠르기'), rate),
    vsel ? h('label', { class: 'set-row col' }, h('span', {}, '영어 목소리'), vsel) : null,
    h('label', { class: 'toggle' }, sfxT, h('span', {}, '효과음')),
    h('div', { class: 'set-btns' },
      h('button', { class: 'btn small', onclick: openProfiles }, '👭 사람 바꾸기·추가'),
      h('button', { class: 'btn small', onclick: openShare }, '💌 단어 나누기'),
      h('button', { class: 'btn small', onclick: openBackup }, '💾 백업·되살리기'),
      h('button', { class: 'btn small', onclick: openScanner }, '📷 QR로 받기'),
      h('button', { class: 'btn small', onclick: () => runCheck(checkBox) }, '🔌 사전 연결 점검'),
      h('button', { class: 'btn small', onclick: openMomSettings }, aiReady() ? '👩 엄마 설정 (🤖 AI 켜짐)' : '👩 엄마 설정 (AI 선생님)')),
    checkBox,
    h('details', { class: 'more' }, h('summary', {}, '사전 출처 · 도움말'),
      h('ul', { class: 'about' },
        h('li', {}, '영어 사전: Free Dictionary API — dictionaryapi.dev'),
        h('li', {}, '영어→한국어 뜻: MyMemory 번역 — mymemory.translated.net (기계 번역이라 틀릴 수 있어요. 뜻은 고쳐 쓸 수 있어요)'),
        h('li', {}, '국어·한자: 위키낱말사전 ko.wiktionary.org / en.wiktionary.org (CC BY-SA)'),
        h('li', {}, '한자 8급 50자: 한국어문회 한자능력검정시험 8급 배정한자'),
        h('li', {}, '영어 읽기: 기기에 설치된 음성(TTS) / 말하기 인식: 브라우저 음성 인식(Chrome은 Google 서버에서 처리)'),
        h('li', {}, 'AI 선생님: Anthropic Claude API (엄마가 넣은 키로 이 기기에서 바로 연결)'),
        h('li', {}, '무료 글자 인식: Tesseract.js (cdn.jsdelivr.net)'),
        h('li', {}, '모든 기록은 이 기기 안(브라우저 저장소)에만 저장돼요. 기기를 바꿀 때는 백업 코드를 쓰세요.'))));
}
async function runCheck(box) {
  box.innerHTML = '';
  const items = [['en', '영어 사전 (api.dictionaryapi.dev)'], ['tr', '영→한 번역 (api.mymemory.translated.net)'], ['ko', '국어·한자 (ko.wiktionary.org)'], ['enwiki', '한자 훈음 (en.wiktionary.org)']];
  const rows = items.map(([k, label]) => { const r = h('div', { class: 'check-row' }, h('span', {}, '⏳'), label); box.append(r); return [k, r]; });
  const tts = h('div', { class: 'check-row' }, h('span', {}, Speech.voices.some(v => v.lang.toLowerCase().startsWith('en')) ? '✅' : '⚠️'), '영어 음성(TTS)');
  box.append(tts);
  if (aiReady()) { const ai = h('div', { class: 'check-row' }, h('span', {}, '⏳'), 'AI 선생님 (api.anthropic.com)'); box.append(ai); aiPing().then(() => { ai.firstChild.textContent = '✅'; }).catch(e => { ai.firstChild.textContent = '❌'; ai.append(' — ' + aiErrorText(e)); }); }
  const sr = h('div', { class: 'check-row' }, h('span', {}, SR ? '✅' : '⚠️'), '말하기 인식 (문장 만들기)'); box.append(sr);
  let bad = 0;
  await Promise.all(rows.map(async ([k, r]) => { const ok = await Dict.ping(k); if (!ok) bad++; r.firstChild.textContent = ok ? '✅' : '❌'; }));
  if (bad) box.append(h('p', { class: 'note' }, '❌인 곳은 인터넷이 끊겼거나, 패밀리 링크에서 막힌 것일 수 있어요. 보호자 계정의 Family Link 앱 → 아이 → 콘텐츠 제한 → Google Chrome → "승인된 사이트"에 위 주소를 넣어 보세요.'));
}

/* ================= 나누기 · 백업 (코드) ================= */
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
async function encodeCode(obj, prefix) {
  let bytes = new TextEncoder().encode(JSON.stringify(obj)), z = '';
  if ('CompressionStream' in window) {
    try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); z = 'z'; } catch (e) { }
  }
  return `${prefix}${z}:${b64u(bytes)}`;
}
async function decodeCode(code) {
  const m = String(code).replace(/\s+/g, '').match(/(BW[WBSRK]1z?):([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('코드 모양이 아니에요');
  let bytes = unb64u(m[2]);
  if (m[1].endsWith('z')) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  return { type: m[1].slice(0, 3), data: JSON.parse(new TextDecoder().decode(bytes)) };
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('복사했어요'); }
  catch (e) { const ta = h('textarea', {}, t); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('복사했어요'); }
}
function openShare() {
  const ws = starred();
  const out = h('textarea', { class: 'input code', rows: 4, readonly: true, placeholder: '여기에 코드가 만들어져요' });
  const inp = h('textarea', { class: 'input code', rows: 4, placeholder: '받은 코드(또는 링크)를 붙여 넣어요' });
  let link = '';
  openSheet('💌 단어 나누기',
    h('p', { class: 'note' }, '내 별 단어를 코드로 만들어 가족에게 보내요. 받은 사람은 같은 단어로 공부할 수 있어요. (공부 기록은 보내지 않아요)'),
    h('button', {
      class: 'btn primary wide', disabled: !ws.length, onclick: async () => {
        const data = { from: P().name, w: ws.map(w => [w.term, w.lang, w.meaning, w.pron || '', (w.examples || []).slice(0, 2), (w.parts || []).map(p => [p.ch, p.hun])]) };
        const code = await encodeCode(data, 'BWW1');
        link = location.href.split('#')[0] + '#add=' + code; out.value = code;
      },
    }, `별 단어 ${ws.length}개로 코드 만들기`),
    out,
    h('div', { class: 'set-btns' },
      h('button', { class: 'btn small', onclick: () => out.value && copyText(out.value) }, '코드 복사'),
      h('button', { class: 'btn small', onclick: () => link && copyText(link) }, '링크 복사'),
      navigator.share ? h('button', { class: 'btn small', onclick: () => link && navigator.share({ title: '반짝 단어카드', text: `${P().name}의 단어 ${ws.length}개`, url: link }).catch(() => { }) }, '보내기') : null),
    h('h4', { class: 'label' }, '받은 코드 넣기'), inp,
    h('button', { class: 'btn wide', onclick: () => handleIncoming(inp.value) }, '받기'));
}
async function importWordsFrom(code) {
  let d;
  try { d = await decodeCode(code); } catch (e) { toast('코드를 읽지 못했어요. 끝까지 다 붙여 넣었는지 확인해 주세요'); return; }
  if (d.type !== 'BWW') { toast('단어 나누기 코드가 아니에요 (백업 코드는 백업·되살리기에서 넣어요)'); return; }
  const list = d.data.w || [];
  openSheet('단어 받기', h('p', {}, `${d.data.from || '누군가'}가 보낸 단어 ${list.length}개를 받을까요?`),
    h('div', { class: 'chips' }, list.slice(0, 40).map(x => h('span', { class: 'chip' }, `${x[0]} · ${x[2]}`))),
    h('button', {
      class: 'btn primary wide', onclick: () => {
        const ws = W(); let n = 0;
        for (const [term, lang, meaning, pron, ex, parts] of list) {
          if (!term || !meaning) continue;
          const id = wordId(term, lang);
          const w = ws[id] ||= { id, created: Date.now(), s: newSrs(), examples: [], parts: [] };
          Object.assign(w, { term, lang, pron: w.pron || pron || '', starred: true, meaning: w.meaning || meaning });
          w.examples = [...new Set([...(w.examples || []), ...(ex || [])])].slice(0, 8);
          if (parts && parts.length && !(w.parts || []).length) w.parts = parts.map(([ch, hun]) => ({ ch, hun }));
          n++;
        }
        save(); checkUnlocks(); closeOverlay(); TAB = 'words'; wordsTab = 'star'; render(); toast(`⭐ ${n}개 받았어요`);
      },
    }, '받기'));
}
function openBackup() {
  const out = h('textarea', { class: 'input code', rows: 4, readonly: true });
  openSheet('💾 백업 · 되살리기',
    h('p', { class: 'note' }, `${P().name}의 단어·성장·꾸미기를 코드 하나로 만들어요. 기기를 바꾸거나 앱을 지웠을 때 되살릴 수 있어요. 코드는 메모장 같은 곳에 보관하세요.`),
    h('button', {
      class: 'btn primary wide', onclick: async () => {
        out.value = await encodeCode({ profile: P(), words: W(), log: LOG(), hist: HIST(), settings: ST(), at: Date.now() }, 'BWB1');
      },
    }, '백업 코드 만들기'), out,
    h('button', { class: 'btn small', onclick: () => out.value && copyText(out.value) }, '코드 복사'),
    h('h4', { class: 'label' }, '백업 코드로 되살리기'),
    h('button', { class: 'btn wide', onclick: openRestore }, '되살리기 열기'));
}
function openRestore() {
  const inp = h('textarea', { class: 'input code', rows: 5, placeholder: 'BWB1… 로 시작하는 백업 코드' });
  openSheet('백업 코드로 되살리기', inp,
    h('button', {
      class: 'btn primary wide', onclick: async () => {
        let d; try { d = await decodeCode(inp.value); } catch (e) { toast('코드를 읽지 못했어요'); return; }
        if (d.type !== 'BWB') { toast('백업 코드가 아니에요'); return; }
        const b = d.data, pid = b.profile.id;
        const exists = DB.profiles.find(p => p.id === pid);
        if (exists && !confirm(`${exists.name}의 지금 기록을 백업 내용으로 바꿀까요?`)) return;
        DB.profiles = DB.profiles.filter(p => p.id !== pid).concat([b.profile]);
        DB.words[pid] = b.words || {}; DB.log[pid] = b.log || {}; DB.hist[pid] = b.hist || []; DB.settings[pid] = b.settings || {};
        DB.current = pid; save(); closeOverlay(); TAB = 'me'; render(); toast(`${b.profile.name}의 기록을 되살렸어요`);
      },
    }, '되살리기'));
}
let pendingImport = null;
function checkPendingImport() {
  if (pendingImport && P()) { const c = pendingImport; pendingImport = null; handleIncoming(c); }
}

/* ================= 시작 ================= */
function boot() {
  Speech.init();
  const m = location.hash.match(/^#add=(.+)$/);
  if (m) { pendingImport = decodeURIComponent(m[1]); history.replaceState(null, '', location.pathname + location.search); }
  if (DB.current && !P()) DB.current = DB.profiles[0] ? DB.profiles[0].id : null;
  render();
  checkPendingImport();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
