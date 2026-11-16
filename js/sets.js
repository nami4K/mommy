'use strict';
/*
 * 엄마 단어 세트 (반 단어장처럼 엄마가 정해 주는 단어 묶음)
 *  - 만들기: 📷 단어장 사진(AI 또는 무료 글자 인식) · 📋 글 붙여넣기 · ✏️ 직접
 *  - 자동 분류: 영어 / 국어 / 한자
 *  - 보내기: QR(여러 장이면 자동으로 넘김) · 링크 · 코드  /  받기: 📷 QR로 받기
 *  - 결과: 아이 기기 → "엄마에게 결과 보여주기" QR → 엄마 기기에서 아이별 진도
 */
const SETS = () => (DB.sets ||= {});
const REPORTS = () => (DB.reports ||= {});
const setWordsOf = (setId, pid = DB.current) => Object.values(DB.words[pid] || {}).filter(w => (w.sets || []).includes(setId));
const mySets = () => Object.values(SETS()).filter(s => setWordsOf(s.id).length).sort((a, b) => b.created - a.created);

function applySetToProfile(set, pid) {
  const ws = DB.words[pid] ||= {};
  for (const [term, lang, meaning, pron, ex] of set.words) {
    if (!term || !meaning) continue;
    const id = wordId(term, lang);
    const w = ws[id] ||= { id, created: Date.now(), s: newSrs(), examples: [], parts: [] };
    Object.assign(w, { term, lang, meaning, starred: true }); // 엄마가 정한 뜻을 따릅니다
    if (pron && !w.pron) w.pron = pron;
    w.sets = [...new Set([...(w.sets || []), set.id])];
    if (ex) w.examples = [...new Set([ex, ...(w.examples || [])])].slice(0, 8);
  }
  set.assigned = [...new Set([...(set.assigned || []), pid])];
}
/* 예문·발음이 없는 단어는 인터넷이 될 때 사전에서 채워 둡니다 (힌트용) */
async function enrichWords(pid) {
  const ws = Object.values(DB.words[pid] || {}).filter(w => w.starred && w.lang !== 'hanja' && !(w.examples || []).length && !w.enriched).slice(0, 40);
  for (const w of ws) {
    try {
      const r = await Dict.lookup(w.term, w.lang);
      w.enriched = true;
      if (r && r.found) {
        w.examples = r.examples.slice(0, 6).map(e => e.text);
        if (!w.pron && r.pron) w.pron = r.pron;
        if (!w.audio && r.audio) w.audio = r.audio;
      }
      save();
    } catch (e) { break; }
  }
}

/* ---------- 단어장 탭: 세트 목록 ---------- */
function viewSets(box) {
  box.innerHTML = '';
  box.append(h('div', { class: 'info-box' }, h('b', {}, '📚 엄마 세트'), h('br'),
    '엄마가 단어장 사진을 찍거나 목록을 넣어서 세트를 만들고, QR로 아이 기기에 보내요. 아이는 세트별로 테스트하고 문장을 만들어요.'),
    h('div', { class: 'row-tools' },
      h('button', { class: 'btn small primary', onclick: openNewSet }, '+ 새 세트 만들기'),
      h('button', { class: 'btn small', onclick: openScanner }, '📷 QR로 받기')));
  const sets = Object.values(SETS()).filter(s => curSubj() === 'all' || s.words.some(x => x[1] === curSubj())).sort((a, b) => b.created - a.created);
  if (!sets.length) { box.append(h('p', { class: 'empty-line' }, Object.keys(SETS()).length ? '이 과목 세트가 없어요. 위에서 다른 과목을 골라 보세요.' : '아직 세트가 없어요.')); return; }
  for (const s of sets) {
    const ws = setWordsOf(s.id);
    const lv = ws.reduce((a, w) => a + (w.s ? w.s.level : 0), 0);
    const bloom = ws.filter(w => w.s && w.s.level >= 4).length, wrong = ws.filter(inWrongNote).length;
    const langs = [...new Set(s.words.map(x => x[1]))].map(l => h('span', { class: 'tag t-' + l }, LANG_LABEL[l]));
    box.append(h('div', { class: 'set-card' },
      h('button', { class: 'set-main', onclick: () => openSet(s.id) },
        h('div', { class: 'set-title' }, h('b', {}, s.name), langs),
        h('small', {}, `${s.words.length}단어 · ${s.from ? s.from + '가 만듦' : ''} ${new Date(s.created).toLocaleDateString('ko-KR')}`),
        ws.length ? h('div', { class: 'set-prog' }, h('i', { class: 'prog' }, h('i', { style: { width: (lv / (ws.length * 5) * 100) + '%' } })),
          h('small', {}, `🌸 ${bloom}/${ws.length}`, wrong ? ` · 🔁 ${wrong}` : '')) : h('small', { class: 'warn-text' }, '이 사람에게는 아직 안 줬어요')),
      ws.length ? h('div', { class: 'set-actions' },
        h('button', { class: 'btn small primary', onclick: () => startTest({ setId: s.id, lang: s.words.every(x => x[1] === s.words[0][1]) ? s.words[0][1] : curSubj(), mode: testMode() }) }, '🎯 테스트'),
        h('button', { class: 'btn small', onclick: () => startSentences({ setId: s.id, lang: s.words.every(x => x[1] === s.words[0][1]) ? s.words[0][1] : curSubj() }) }, '🎤 문장')) : null));
  }
}
function openSet(id) {
  const s = SETS()[id]; if (!s) return;
  const ws = setWordsOf(id);
  const byLang = { en: [], ko: [], hanja: [] };
  s.words.forEach(x => (byLang[x[1]] || byLang.en).push(x));
  const assignBox = h('div', { class: 'assign' }, DB.profiles.map(p => {
    const on = setWordsOf(id, p.id).length > 0;
    return h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: on, disabled: on, onchange: e => { if (e.target.checked) { applySetToProfile(s, p.id); save(); toast(`${p.name}에게 줬어요`); renderNav(); } } }),
      h('span', { class: 'mini-av', html: avatarSVG(p.avatar) }), h('span', {}, p.name));
  }));
  openSheet('📚 ' + s.name,
    h('div', { class: 'set-actions' },
      ws.length ? h('button', { class: 'btn small primary', onclick: () => { closeOverlay(); startTest({ setId: id, lang: 'all', mode: testMode() }); } }, '🎯 테스트') : null,
      ws.length ? h('button', { class: 'btn small', onclick: () => { closeOverlay(); startSentences({ setId: id, lang: 'all' }); } }, '🎤 문장 만들기') : null,
      h('button', { class: 'btn small', onclick: () => sendSet(id) }, '📤 다른 기기로 보내기'),
      ws.length ? h('button', { class: 'btn small', onclick: () => sendReport(id) }, '📊 엄마에게 결과 보여주기') : null),
    reportBlock(id),
    h('h4', { class: 'label' }, '이 기기에서 이 세트로 공부할 사람'), assignBox,
    ...['en', 'ko', 'hanja'].filter(l => byLang[l].length).map(l => h('div', {},
      h('h4', { class: 'label' }, h('span', { class: 'tag t-' + l }, LANG_LABEL[l]), ` ${byLang[l].length}개`),
      h('div', { class: 'set-words' }, byLang[l].map(x => {
        const w = W()[wordId(x[0], x[1])];
        return h('div', { class: 'set-word' }, h('span', { html: plantSVG(w && w.s ? w.s.level : 0, 'plant xs') }), h('b', { class: 'lang-' + l }, x[0]), h('small', {}, x[2]));
      })))),
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn small', onclick: () => { const n = prompt('세트 이름', s.name); if (n && n.trim()) { s.name = n.trim(); save(); closeOverlay(); render(); } } }, '이름 바꾸기'),
      h('button', {
        class: 'btn small danger', onclick: () => {
          if (!confirm(`'${s.name}' 세트를 지울까요? (단어와 공부 기록은 별 단어장에 남아요)`)) return;
          for (const ws_ of Object.values(DB.words)) for (const w of Object.values(ws_)) if (w.sets) w.sets = w.sets.filter(x => x !== id);
          delete SETS()[id]; save(); closeOverlay(); render();
        },
      }, '세트 지우기')));
}

/* ---------- 결과(진도) ---------- */
function summarize(rows) { // rows: [term, level, wrong, hints, seen]
  const n = rows.length || 1;
  return {
    pct: Math.round(rows.reduce((a, r) => a + r[1], 0) / (n * 5) * 100),
    bloom: rows.filter(r => r[1] >= 4).length,
    wrong: rows.filter(r => r[2] > 0 && r[1] < 3).length,
    unseen: rows.filter(r => !r[4]).length,
    hard: rows.filter(r => r[2] || r[3]).sort((a, b) => (b[2] * 2 + b[3]) - (a[2] * 2 + a[3])).slice(0, 5).map(r => r[0]),
  };
}
function rowsFor(setId, pid) { return setWordsOf(setId, pid).map(w => { const s = w.s || newSrs(); return [w.term, s.level, s.wrong, s.hints, s.seen, s.nh]; }); }
function reportBlock(setId) {
  const entries = [];
  for (const p of DB.profiles) { const rows = rowsFor(setId, p.id); if (rows.length) entries.push({ name: p.name, av: p.avatar, at: null, rows, local: true }); }
  for (const r of Object.values(REPORTS()[setId] || {})) if (!DB.profiles.some(p => p.id === r.pid)) entries.push({ name: r.name, av: r.av, at: r.at, rows: r.w, sent: r.sent });
  if (!entries.length) return null;
  return h('div', { class: 'card' }, h('h4', { class: 'label' }, '📊 아이들 진도'),
    entries.map(e => {
      const s = summarize(e.rows);
      return h('div', { class: 'report-row' },
        h('span', { class: 'mini-av', html: avatarSVG(e.av) }),
        h('div', { class: 'grow' },
          h('div', {}, h('b', {}, e.name), h('small', {}, e.local ? ' · 이 기기' : ` · ${new Date(e.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 받은 결과`)),
          h('i', { class: 'prog' }, h('i', { style: { width: s.pct + '%' } })),
          h('small', {}, `자람 ${s.pct}% · 🌸 꽃 ${s.bloom}/${e.rows.length} · 🔁 오답 ${s.wrong} · 아직 안 본 ${s.unseen}`, e.sent ? ` · 🎤 문장 ${e.sent}` : ''),
          s.hard.length ? h('small', { class: 'hard' }, '어려워하는 단어: ' + s.hard.join(', ')) : null));
    }));
}
async function sendReport(setId) {
  const s = SETS()[setId], p = P();
  const ids = new Set(setWordsOf(setId).map(w => w.id));
  const sent = ((DB.sentences || {})[DB.current] || []).filter(x => ids.has(x.id)).length;
  const code = await encodeCode({ sid: setId, sname: s.name, pid: p.id, name: p.name, av: p.avatar, at: Date.now(), w: rowsFor(setId, p.id), sent }, 'BWR1');
  showQR(`📊 ${p.name}의 '${s.name}' 결과`, code, '엄마 기기의 앱에서 📷 QR로 받기로 찍어요.');
}

/* ---------- 새 세트 만들기 ---------- */
function openNewSet() {
  const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  const hanjaOcr = h('input', { type: 'checkbox' });
  const status = h('div', { class: 'ocr-status' });
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    status.innerHTML = ''; status.append(h('div', { class: 'loading' }, h('span', { class: 'spin' }), '사진을 읽고 있어요…'));
    try {
      const { b64, canvas } = await fileToJpegBase64(f);
      let res;
      if (aiReady()) res = await aiExtractWords(b64);
      else {
        const text = await ocrImage(canvas, hanjaOcr.checked, (st, pr) => { status.querySelector('.loading').lastChild.textContent = `글자 읽는 중… ${Math.round(pr * 100)}%`; });
        res = { title: '', items: parseWordText(text), raw: text };
      }
      if (!res.items.length) { status.innerHTML = ''; status.append(h('div', { class: 'warn' }, '단어를 찾지 못했어요. 사진을 밝고 똑바로 다시 찍거나, 📋 글 붙여넣기를 써 보세요.', res.raw ? h('pre', { class: 'raw' }, res.raw) : null)); return; }
      openReview(res.items, res.title, aiReady() ? 'AI가 읽었어요' : '무료 글자 인식으로 읽었어요. 틀린 곳이 있을 수 있어요.');
    } catch (e) {
      status.innerHTML = ''; status.append(h('div', { class: 'warn' }, aiReady() ? aiErrorText(e) : '글자 인식 도구를 불러오지 못했어요 (cdn.jsdelivr.net 연결 필요). ' + (e.message || '')));
    }
  });
  const paste = h('textarea', { class: 'input', rows: 6, placeholder: '단어 목록을 붙여 넣어요. 모양은 자유롭게:\napple 사과\nbrave - 용감한\n學 배울 학\n성실 : 정성스럽고 참됨' });
  openSheet('📚 새 세트 만들기',
    h('div', { class: 'big-choices' },
      h('button', { class: 'big-choice', onclick: () => file.click() }, h('span', {}, '📷'), h('b', {}, '단어장 사진'), h('small', {}, aiReady() ? 'AI가 읽고 영어·국어·한자로 나눠요' : '무료 글자 인식 (AI를 켜면 더 정확해요)')),
      h('button', { class: 'big-choice', onclick: () => openReview([], '', '') }, h('span', {}, '✏️'), h('b', {}, '직접 적기'), h('small', {}, '한 줄씩 넣어요'))),
    file, aiReady() ? null : h('label', { class: 'toggle' }, hanjaOcr, h('span', {}, '사진에 한자가 있어요 (인식 파일이 더 커요)')),
    status,
    h('h4', { class: 'label' }, '📋 글 붙여넣기'),
    h('p', { class: 'note' }, '팁: 휴대폰 카메라의 Google 렌즈로 단어장을 찍고 "텍스트 복사"한 뒤 여기에 붙여 넣어도 돼요.'),
    paste,
    h('button', { class: 'btn wide', onclick: () => { const items = parseWordText(paste.value); if (!items.length) { toast('단어를 찾지 못했어요'); return; } openReview(items, '', '붙여 넣은 글에서 나눴어요'); } }, '나누기 ▶'));
}
async function ocrImage(canvas, withHanja, onProgress) {
  if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  const worker = await window.Tesseract.createWorker(withHanja ? 'eng+kor+chi_tra' : 'eng+kor', 1, {
    logger: m => { if (onProgress && typeof m.progress === 'number') onProgress(m.status, m.progress); },
  });
  try { const { data } = await worker.recognize(canvas); return data.text || ''; }
  finally { await worker.terminate(); }
}

/* 글 → 단어 자동 분류 */
const RE_HAN = /[㐀-鿿豈-﫿]/, RE_KO = /[가-힣]/, RE_EN = /[A-Za-z]/;
function parseWordText(text) {
  const items = [];
  const clean = s => s.replace(/[\s.,;:·~\-–|]+$/g, '').replace(/^[\s.,;:·~\-–|]+/g, '').trim();
  const lines = String(text || '').split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:\(?\d{1,3}[.)]|[①-⑳]|[-•·*▪◦□■☐✓✔])\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  let pending = null; // 뜻이 다음 줄에 오는 경우
  for (const l of lines) {
    const hasEn = RE_EN.test(l), hasKo = RE_KO.test(l), hasHan = RE_HAN.test(l);
    if (hasHan) {
      const m = l.match(/^([㐀-鿿豈-﫿]+)\s*[:=\-–(]?\s*([가-힣][가-힣 ,]*)?\)?/);
      if (m) { const it = { term: m[1], meaning: clean(m[2] || ''), lang: 'hanja', example: '' }; items.push(it); pending = it.meaning ? null : it; continue; }
      const k = l.match(/^([가-힣]+)\s*\(([㐀-鿿豈-﫿]+)\)\s*[:=\-–]?\s*(.*)$/); // 성실(誠實) : 뜻
      if (k) { items.push({ term: k[1], meaning: clean(k[3]), lang: 'ko', example: '' }); pending = null; continue; }
    }
    if (hasEn && hasKo) {
      const re = /([A-Za-z][A-Za-z'’\-]*(?: [A-Za-z][A-Za-z'’\-]*)*)\s*[:=\-–]?\s*([가-힣(~][^A-Za-z]*)/g;
      let m, found = false;
      while ((m = re.exec(l))) { found = true; items.push({ term: m[1].trim(), meaning: clean(m[2]), lang: 'en', example: '' }); }
      if (found) { pending = null; continue; }
    }
    if (hasEn && !hasKo) {
      if (/^[A-Za-z][A-Za-z'’\-]*(?: [A-Za-z'’\-]+){0,3}$/.test(l)) { const it = { term: l, meaning: '', lang: 'en', example: '' }; items.push(it); pending = it; }
      else if (items.length && items[items.length - 1].lang === 'en' && /[.!?]$/.test(l) && l.split(' ').length >= 3) items[items.length - 1].example ||= l; // 예문
      continue;
    }
    if (hasKo) {
      const m = l.match(/^([가-힣]{1,10})\s*[:=\-–|]\s*(.+)$/);
      if (m) { items.push({ term: m[1], meaning: clean(m[2]), lang: 'ko', example: '' }); pending = null; continue; }
      if (pending && l.length <= 30) { pending.meaning = clean(l); pending = null; continue; }
    }
  }
  const seen = new Set();
  return items.filter(x => x.term && !seen.has(x.lang + x.term.toLowerCase()) && seen.add(x.lang + x.term.toLowerCase()));
}

/* 확인 화면: 언어별로 나눠 보여 주고, 고치고, 뜻이 없으면 사전에서 채워요 */
function openReview(items, title, note) {
  const o = openFull();
  const rows = items.map(x => ({ ...x, on: true, auto: false }));
  if (!rows.length) for (let i = 0; i < 5; i++) rows.push({ term: '', meaning: '', lang: 'en', example: '', on: true });
  const name = h('input', { class: 'input', value: title || `${today()} 단어`, placeholder: '세트 이름 (예: 3단원 영어)' });
  const groups = h('div', {});
  const draw = () => {
    groups.innerHTML = '';
    for (const l of ['en', 'ko', 'hanja']) {
      const rs = rows.filter(r => r.lang === l);
      if (!rs.length && rows.some(r => r.term)) continue;
      groups.append(h('h4', { class: 'label' }, h('span', { class: 'tag t-' + l }, LANG_LABEL[l]), ` ${rs.filter(r => r.on && r.term).length}개`));
      for (const r of rs) {
        const mean = h('input', { class: 'input sm', value: r.meaning, placeholder: r.lang === 'hanja' ? '훈음 (예: 배울 학)' : '뜻', oninput: e => { r.meaning = e.target.value; r.auto = false; } });
        if (r.auto) mean.classList.add('auto');
        groups.append(h('div', { class: 'rev-row' + (r.on ? '' : ' off') },
          h('input', { type: 'checkbox', checked: r.on, onchange: e => { r.on = e.target.checked; draw(); } }),
          h('input', { class: 'input sm term-in', value: r.term, placeholder: '단어', oninput: e => { r.term = e.target.value; }, onchange: e => { const nl = Dict.detect(e.target.value); if (nl !== r.lang) { r.lang = nl; draw(); } } }),
          mean,
          h('select', { class: 'input sm lang-sel', onchange: e => { r.lang = e.target.value; draw(); } }, ['en', 'ko', 'hanja'].map(x => h('option', { value: x, selected: x === r.lang ? true : null }, LANG_LABEL[x])))));
      }
    }
  };
  draw();
  const who = h('div', { class: 'assign' }, DB.profiles.map(p => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: p.id === DB.current, 'data-pid': p.id }), h('span', { class: 'mini-av', html: avatarSVG(p.avatar) }), h('span', {}, p.name))));
  const fillBtn = h('button', { class: 'btn small', onclick: () => autoFill(rows, draw, fillBtn) }, '🔍 빈 뜻 사전으로 채우기');
  const split = h('input', { type: 'checkbox', checked: true });
  o.append(
    h('div', { class: 't-top' }, h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: () => { closeOverlay(); render(); } }, '✕'), h('b', { class: 'grow' }, '단어 확인하기')),
    note ? h('p', { class: 'note' }, note, ' 체크를 풀면 빠져요. 언어가 틀리면 오른쪽에서 바꿔요.') : null,
    h('h4', { class: 'label' }, '세트 이름'), name,
    groups,
    h('div', { class: 'row-tools' }, h('button', { class: 'btn small', onclick: () => { rows.push({ term: '', meaning: '', lang: 'en', example: '', on: true }); draw(); } }, '+ 줄 추가'), fillBtn),
    h('label', { class: 'toggle' }, split, h('span', {}, '과목이 섞여 있으면 영어·국어·한자 세트로 나눠 저장')),
    h('h4', { class: 'label' }, '이 기기에서 공부할 사람'), who,
    h('button', {
      class: 'btn primary wide big-start', onclick: async () => {
        const ok = rows.filter(r => r.on && r.term.trim());
        const missing = ok.filter(r => !r.meaning.trim());
        if (!ok.length) { toast('단어가 없어요'); return; }
        if (missing.length) { toast(`뜻이 빈 단어가 ${missing.length}개 있어요. 채우거나 체크를 풀어 주세요`); return; }
        const base = name.value.trim() || '새 세트';
        const langs = [...new Set(ok.map(r => r.lang))];
        const groups = split.checked && langs.length > 1 ? langs.map(l => [l, ok.filter(r => r.lang === l)]) : [[null, ok]];
        const made = groups.map(([l, rs], k) => {
          const set = { id: uid() + uid(), name: l ? `${base} · ${LANG_LABEL[l]}` : base, from: P().name, created: Date.now() + k, words: rs.map(r => [r.term.trim(), r.lang, r.meaning.trim(), '', (r.example || '').trim()]), assigned: [] };
          SETS()[set.id] = set;
          [...who.querySelectorAll('input:checked')].forEach(c => applySetToProfile(set, c.dataset.pid));
          return set;
        });
        if (made.length === 1 && made[0].words.every(x => x[1] === made[0].words[0][1])) ST().subj = made[0].words[0][1];
        save(); closeOverlay(); TAB = 'words'; wordsTab = 'sets'; render();
        toast(made.length > 1 ? `📚 과목별로 세트 ${made.length}개를 만들었어요` : `📚 '${made[0].name}' ${made[0].words.length}단어 세트를 만들었어요`);
        enrichWords(DB.current);
        setTimeout(() => (made.length > 1 ? sendSets(made.map(x => x.id)) : sendSet(made[0].id)), 400);
      },
    }, '📚 세트 저장'));
  if (rows.some(r => r.term && !r.meaning)) autoFill(rows, draw, fillBtn);
}
async function autoFill(rows, draw, btn) {
  const todo = rows.filter(r => r.on && r.term.trim() && !r.meaning.trim());
  if (!todo.length) return;
  btn.disabled = true; btn.textContent = `🔍 뜻 찾는 중… 0/${todo.length}`;
  let i = 0;
  for (const r of todo) {
    try {
      const res = await Dict.lookup(r.term.trim(), r.lang);
      if (res && res.meanings[0] && !r.meaning) { r.meaning = res.meanings[0]; r.auto = true; }
      if (res && res.examples[0] && !r.example) r.example = res.examples[0].text;
    } catch (e) { }
    btn.textContent = `🔍 뜻 찾는 중… ${++i}/${todo.length}`;
  }
  btn.disabled = false; btn.textContent = '🔍 빈 뜻 사전으로 채우기';
  draw(); toast('사전 뜻을 채웠어요. 노란 칸은 꼭 확인해 주세요');
}

/* ---------- 보내기 ---------- */
async function sendSet(id) {
  const s = SETS()[id];
  let code = await encodeCode({ id: s.id, name: s.name, from: s.from, created: s.created, w: s.words }, 'BWS1');
  if (code.length > 2400) code = await encodeCode({ id: s.id, name: s.name, from: s.from, created: s.created, w: s.words.map(x => x.slice(0, 3)) }, 'BWS1');
  showQR(`📤 '${s.name}' 보내기`, code, '아이 기기의 앱에서 단어장 → 📚 엄마 세트 → 📷 QR로 받기로 찍어요. 링크로 보내도 돼요.');
}
async function sendSets(ids) {
  openSheet('📤 다른 기기로 보내기', h('p', { class: 'note' }, '보낼 세트를 골라요. 한 번에 하나씩 QR로 보여 줘요.'),
    ids.map(id => h('button', { class: 'btn wide', onclick: () => sendSet(id) }, '📚 ' + SETS()[id].name + ` (${SETS()[id].words.length})`)));
}
const QR_CHUNK = 850;
function showQR(title, code, note) {
  const link = location.href.split('#')[0] + '#add=' + code;
  const parts = [];
  if (link.length <= QR_CHUNK + 200) parts.push(link);
  else { const id = uid(), n = Math.ceil(code.length / QR_CHUNK); for (let i = 0; i < n; i++) parts.push(`BWQ1:${id}:${i + 1}/${n}:${code.slice(i * QR_CHUNK, (i + 1) * QR_CHUNK)}`); }
  const img = h('div', { class: 'qr' }), label = h('div', { class: 'qr-label' });
  let i = 0, timer = null, paused = false;
  const show = () => {
    const q = qrcode(0, 'L'); q.addData(parts[i], 'Byte'); q.make();
    img.innerHTML = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    label.textContent = parts.length > 1 ? `${i + 1} / ${parts.length}장 (자동으로 넘어가요 — 다 찍힐 때까지 비춰 주세요)` : '';
  };
  show();
  if (parts.length > 1) timer = setInterval(() => { if (!document.body.contains(img)) return clearInterval(timer); if (!paused) { i = (i + 1) % parts.length; show(); } }, 1300);
  openSheet(title, h('p', { class: 'note' }, note), img, label,
    parts.length > 1 ? h('button', { class: 'btn small', onclick: e => { paused = !paused; e.currentTarget.textContent = paused ? '▶ 다시 넘기기' : '⏸ 멈추기'; } }, '⏸ 멈추기') : null,
    h('div', { class: 'set-btns' },
      h('button', { class: 'btn small', onclick: () => copyText(link) }, '🔗 링크 복사'),
      h('button', { class: 'btn small', onclick: () => copyText(code) }, '코드 복사'),
      navigator.share ? h('button', { class: 'btn small', onclick: () => navigator.share({ title: '반짝 단어카드', url: link }).catch(() => { }) }, '보내기') : null));
}

/* ---------- 받기 (QR 스캔) ---------- */
let scanState = null;
async function openScanner() {
  const o = openFull();
  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  const msg = h('p', { class: 'note center' }, 'QR을 네모 안에 비춰 주세요');
  const paste = h('textarea', { class: 'input code', rows: 3, placeholder: '카메라가 안 되면 코드나 링크를 붙여 넣어요' });
  const stop = () => { if (scanState) { scanState.stop = true; (scanState.stream ? scanState.stream.getTracks() : []).forEach(t => t.stop()); } scanState = null; };
  o.append(h('div', { class: 't-top' }, h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: () => { stop(); closeOverlay(); render(); } }, '✕'), h('b', { class: 'grow' }, '📷 QR로 받기')),
    h('div', { class: 'scan-box' }, video, h('div', { class: 'scan-frame' })), msg,
    paste, h('button', { class: 'btn wide', onclick: () => { stop(); handleIncoming(paste.value); } }, '코드로 받기'));
  const st = scanState = { stop: false, parts: {}, stream: null };
  try {
    st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = st.stream; await video.play();
  } catch (e) { msg.textContent = '카메라를 쓸 수 없어요. 아래에 코드를 붙여 넣어 주세요.'; return; }
  const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  if (!detector && !window.jsQR) { try { await loadScript('js/vendor/jsQR.js'); } catch (e) { msg.textContent = 'QR 읽기 도구를 불러오지 못했어요. 코드를 붙여 넣어 주세요.'; return; } }
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (st.stop) return;
    let text = null;
    try {
      if (video.readyState >= 2) {
        if (detector) { const r = await detector.detect(video); if (r[0]) text = r[0].rawValue; }
        else {
          const w = Math.min(640, video.videoWidth), hh = Math.round(video.videoHeight * w / video.videoWidth);
          canvas.width = w; canvas.height = hh; ctx.drawImage(video, 0, 0, w, hh);
          const r = jsQR(ctx.getImageData(0, 0, w, hh).data, w, hh); if (r) text = r.data;
        }
      }
    } catch (e) { }
    if (text) {
      const m = text.match(/^BWQ1:(\w+):(\d+)\/(\d+):(.*)$/);
      if (m) {
        const [, id, k, n, chunk] = m;
        const bag = st.parts[id] ||= {}; bag[k] = chunk;
        const got = Object.keys(bag).length;
        msg.textContent = `📥 ${got} / ${n}장 받았어요… 계속 비춰 주세요`;
        if (got === +n) { const code = [...Array(+n)].map((_, i) => bag[i + 1]).join(''); stop(); sfx('ok'); return handleIncoming(code); }
      } else if (/BW[A-Z]1z?:/.test(text)) { stop(); sfx('ok'); return handleIncoming(text); }
    }
    setTimeout(tick, 220);
  };
  tick();
}

/* 받은 코드 처리: 단어 나누기 / 세트 / 결과 / AI 설정 / 백업 */
async function handleIncoming(code) {
  let d;
  try { d = await decodeCode(code); } catch (e) { toast('코드를 읽지 못했어요. 끝까지 다 붙여 넣었는지 확인해 주세요'); return; }
  closeOverlay();
  if (d.type === 'BWW') return importWordsFrom(code);
  if (d.type === 'BWK') { if (confirm('엄마의 AI 설정을 이 기기에 넣을까요?')) receiveAIConfig(d.data); render(); return; }
  if (d.type === 'BWB') { toast('백업 코드는 나 → 💾 백업·되살리기에서 넣어 주세요'); return openRestore(); }
  if (d.type === 'BWR') {
    const r = d.data; (REPORTS()[r.sid] ||= {})[r.pid] = r; save();
    toast(`📊 ${r.name}의 '${r.sname}' 결과를 받았어요`);
    TAB = 'words'; wordsTab = 'sets'; render();
    if (SETS()[r.sid]) openSet(r.sid);
    return;
  }
  if (d.type === 'BWS') {
    const s = d.data;
    const set = SETS()[s.id] = Object.assign(SETS()[s.id] || { assigned: [] }, { id: s.id, name: s.name, from: s.from, created: s.created || Date.now(), words: s.w });
    const who = h('div', { class: 'assign' }, DB.profiles.map(p => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: p.id === DB.current, 'data-pid': p.id }), h('span', { class: 'mini-av', html: avatarSVG(p.avatar) }), h('span', {}, p.name))));
    save();
    openSheet('📚 세트 받기',
      h('p', {}, `${s.from || '엄마'}가 보낸 '${s.name}' ${s.w.length}단어`),
      h('div', { class: 'chips' }, s.w.slice(0, 30).map(x => h('span', { class: 'chip' }, `${x[0]} · ${x[2]}`)), s.w.length > 30 ? h('span', { class: 'chip' }, `…${s.w.length - 30}개 더`) : null),
      h('h4', { class: 'label' }, '누가 공부할까요?'), who,
      h('button', {
        class: 'btn primary wide', onclick: () => {
          const pids = [...who.querySelectorAll('input:checked')].map(c => c.dataset.pid);
          if (!pids.length) { toast('한 명 이상 골라 주세요'); return; }
          pids.forEach(pid => applySetToProfile(set, pid)); save(); closeOverlay();
          TAB = 'words'; wordsTab = 'sets'; render(); announceUnlocks(`📚 '${set.name}'을 받았어요!`);
          pids.forEach(pid => enrichWords(pid));
        },
      }, '받기'));
  }
}
