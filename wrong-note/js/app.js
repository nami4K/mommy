'use strict';
/* ================= 화면 상태 ================= */
const UI = {
  role: null,      // 'mom' | 'kid' (이 기기)
  kidId: null,     // 아이 기기면 그 아이
  view: 'today',   // 아이 화면: today | garden | growth | upload
  mom: false,      // 엄마 화면 열림
  momTab: 'add',
  momKid: null,    // 엄마 화면에서 보고 있는 아이
  preview: null,   // 엄마가 '아이 화면 보기'로 보는 아이
  solve: null,     // 푸는 중인 문제 {pid, phase, input, hint, res}
  draft: null,     // 엄마 문제 넣기 칸들
  filter: 'all',
};
let pendingJoin = '';

/* null·false는 빼고 붙이기 (DOM append는 null을 글자로 붙여요) */
const add = (el, ...kids) => { el.append(...kids.flat().filter(k => k != null && k !== false)); return el; };
const curKid = () => kidById(UI.preview || UI.kidId);
const isMomView = () => UI.mom || (UI.role === 'mom' && !UI.preview);

/* 글자를 쓰는 중에는 다시 그리지 않고, 다 쓰고 나면 그립니다 */
let renderWaiting = false;
function render() {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#main') && a.type !== 'range' && a.type !== 'checkbox') {
    if (!renderWaiting) { renderWaiting = true; a.addEventListener('blur', () => { renderWaiting = false; setTimeout(render, 0); }, { once: true }); }
    return;
  }
  const main = $('#main'), top = $('#top'), nav = $('#nav');
  const scroll = window.scrollY;
  top.replaceChildren(); nav.replaceChildren();
  let body;
  if (!UI.role) body = setupScreen();
  else if (isMomView()) { document.documentElement.dataset.theme = 'sky'; body = momScreen(top); }
  else {
    const kid = curKid();
    if (!kid) body = waitScreen();
    else {
      document.documentElement.dataset.theme = themeOf(kid.id);
      body = UI.solve ? solveScreen(kid, top) : kidScreen(kid, top, nav);
    }
  }
  main.replaceChildren(body);
  if (!UI.solve) window.scrollTo(0, scroll);
}

/* ================= 처음 설정 ================= */
function setupScreen() {
  document.documentElement.dataset.theme = 'sky';
  const wrap = h('div', { class: 'pad setup' },
    h('div', { class: 'hero' },
      plantSVG(2, 3, 84),
      h('h1', {}, '다시봄 오답노트'),
      h('p', { class: 'sub' }, '틀린 문제를 다른 날 다시 만나서, 맞히면 꽃으로 피워요.')));
  add(wrap, 
    h('section', { class: 'card' },
      h('h2', {}, '엄마 기기로 처음 시작하기'),
      h('p', { class: 'sub' }, '아이 이름·학년과 엄마 비밀번호를 정해요. 한 번만 하면 돼요.'),
      h('button', { class: 'btn primary wide', onclick: () => setupMom() }, '처음 시작하기')),
    h('section', { class: 'card' },
      h('h2', {}, '가족 코드로 들어가기'),
      h('p', { class: 'sub' }, '아이 태블릿이나 엄마의 다른 기기는 엄마가 알려 준 가족 코드를 넣어요.'),
      joinForm()));
  return wrap;
}

function setupMom() {
  const rows = [{ name: '', grade: 1 }, { name: '', grade: 1 }];
  const code = newFamilyCode();
  const list = h('div', { class: 'stack' });
  const drawRows = () => list.replaceChildren(...rows.map((r, i) => h('div', { class: 'row' },
    h('input', { class: 'input', placeholder: `아이 ${i + 1} 이름`, value: r.name, oninput: e => { r.name = e.target.value; } }),
    h('select', { class: 'input narrow', 'aria-label': '학년', onchange: e => { r.grade = +e.target.value; } },
      [1, 2, 3, 4, 5, 6].map(g => h('option', { value: g, selected: g === r.grade }, `초${g}`))))));
  drawRows();
  const pin = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '숫자 4자리 이상', autocomplete: 'new-password' });
  const err = h('p', { class: 'err' });
  modal(close => h('div', { class: 'stack' },
    h('h3', {}, '처음 시작하기'),
    h('div', { class: 'label' }, '아이'), list,
    h('button', { class: 'btn ghost small', onclick: () => { rows.push({ name: '', grade: 1 }); drawRows(); } }, '+ 아이 더하기'),
    h('p', { class: 'note' }, '학년은 입학한 해로 바꿔서 저장해요. 해마다 3월 1일에 저절로 한 학년씩 올라가요(설정에서 1월 1일로 바꿀 수 있어요).'),
    h('div', { class: 'label' }, '엄마 비밀번호'), pin,
    h('div', { class: 'label' }, '가족 코드'),
    h('div', { class: 'code-box' }, code),
    h('p', { class: 'note' }, '아이 태블릿에서 이 코드를 넣으면 같은 문제와 기록을 함께 써요. 설정 화면에서 언제든 다시 볼 수 있어요.'),
    err,
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: close }, '그만두기'),
      h('button', { class: 'btn primary', onclick: async () => {
        const kids = rows.filter(r => r.name.trim()).map(r => ({ id: 'k' + uid(), name: r.name.trim(), entryYear: entryYearFor(r.grade), reasonMode: 'auto' }));
        if (!kids.length) { err.textContent = '아이 이름을 한 명 이상 넣어 주세요.'; return; }
        if (!/^\d{4,}$/.test(pin.value)) { err.textContent = '비밀번호는 숫자 4자리 이상으로 정해 주세요.'; return; }
        if (Sync.hasServer()) {
          try {
            const ok = await Sync.create(code);
            if (!ok) { err.textContent = '이 저장 공간에는 이미 가족이 있어요. "가족 코드로 들어가기"를 써 주세요.'; return; }
          } catch (e) { err.textContent = Sync.friendly(e) + ' 이 기기에만 먼저 저장하려면 잠시 뒤 다시 눌러 주세요.'; return; }
        }
        saveSettings({ kids, pinHash: await sha256('dasibom:' + pin.value) });
        await Sync.save({ code });
        await setDevice('mom', null);
        close();
        toast('준비됐어요! 이제 틀린 문제를 넣어 보세요.');
        Sync.soon(200);
      } }, '시작하기'))), { wide: true });
}

function joinForm() {
  const inp = h('input', { class: 'input big', placeholder: 'ABCD-EFGH', value: pendingJoin, autocapitalize: 'characters', autocomplete: 'off', 'aria-label': '가족 코드' });
  const msg = h('p', { class: 'err' });
  const btn = h('button', { class: 'btn primary wide', onclick: async () => {
    const code = cleanCode(inp.value);
    if (code.length < 9) { msg.textContent = '가족 코드 8글자를 넣어 주세요.'; return; }
    if (!Sync.hasServer()) { msg.textContent = '아직 가족 저장 공간이 연결되지 않은 앱이에요. 엄마 기기에서 먼저 연결해 주세요.'; return; }
    btn.disabled = true; msg.textContent = '확인하는 중…';
    try {
      if (!(await Sync.check(code))) { msg.textContent = '가족 코드가 맞지 않아요. 다시 확인해 주세요.'; return; }
      await Sync.save({ code });
      await Sync.run();
      msg.textContent = '';
      chooseDevice();
    } catch (e) { msg.textContent = Sync.friendly(e); }
    finally { btn.disabled = false; }
  } }, '들어가기');
  return h('div', { class: 'stack' }, inp, msg, btn);
}

function chooseDevice() {
  const kids = S().kids;
  modal(close => h('div', { class: 'stack' },
    h('h3', {}, '이 기기는 누구 거예요?'),
    !kids.length ? h('p', { class: 'note' }, '아직 가족 정보를 받는 중이에요. 잠시 뒤 다시 해 주세요.') : null,
    h('div', { class: 'who-grid' },
      kids.map(k => h('button', { class: 'who-btn', onclick: async () => { await setDevice('kid', k.id); close(); } },
        h('span', { class: 'av big' }, k.name.slice(0, 1)), h('b', {}, k.name), h('small', {}, gradeLabel(gradeOf(k))))),
      h('button', { class: 'who-btn', onclick: async () => {
        if (await askPin()) { await setDevice('mom', null); close(); }
      } }, h('span', { class: 'av big mom' }, '엄'), h('b', {}, '엄마'), h('small', {}, '비밀번호 필요')))));
}
async function setDevice(role, kidId) {
  UI.role = role; UI.kidId = kidId; UI.mom = false; UI.preview = null; UI.solve = null; UI.view = 'today';
  await Store.setMeta('device', { role, kidId });
  render();
}
function waitScreen() {
  return h('div', { class: 'pad center' },
    h('h2', {}, '가족 정보를 받는 중이에요'),
    h('p', { class: 'sub' }, '인터넷이 연결되어 있는지 확인해 주세요.'),
    h('button', { class: 'btn', onclick: () => Sync.run() }, '다시 받기'),
    h('button', { class: 'btn ghost', onclick: () => chooseDevice() }, '누구 기기인지 다시 고르기'));
}

/* 엄마 비밀번호 확인 */
function askPin() {
  return new Promise(res => {
    let ok = false;
    const inp = h('input', { class: 'input big', type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': '엄마 비밀번호' });
    const err = h('p', { class: 'err' });
    const go = async close => {
      if ((await sha256('dasibom:' + inp.value)) === S().pinHash) { ok = true; res(true); close(); }
      else { err.textContent = '비밀번호가 달라요.'; inp.value = ''; inp.focus(); }
    };
    modal(close => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(close); });
      setTimeout(() => inp.focus(), 50);
      return h('div', { class: 'stack' }, h('h3', {}, '엄마 비밀번호'), inp, err,
        h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: close }, '닫기'), h('button', { class: 'btn primary', onclick: () => go(close) }, '열기')));
    }, { onClose: () => { if (!ok) res(false); } });
  });
}

/* ================= 그림: 씨앗 · 새싹 · 꽃 ================= */
const PETALS = ['#ffcf3d', '#ff9f6b', '#ff8fb8', '#b98cff', '#6fc3ff', '#ffe066'];
function plantSVG(stage, seed = 0, size = 56) {
  const c = PETALS[Math.abs(seed) % PETALS.length];
  const soil = '<ellipse cx="30" cy="62" rx="20" ry="5" fill="var(--soil)"/>';
  let g;
  if (stage === 0) g = `${soil}<ellipse cx="30" cy="57" rx="6" ry="4.5" fill="var(--seed)"/><path d="M27 56q3-3 6 0" stroke="#fff" stroke-opacity=".5" fill="none"/>`;
  else if (stage === 1) g = `${soil}<path d="M30 60V40" stroke="var(--leaf)" stroke-width="3" stroke-linecap="round"/><path d="M30 46c-10 0-13-8-13-11 7 0 13 4 13 11z" fill="var(--leaf)"/><path d="M30 42c9 0 12-7 12-10-7 0-12 3-12 10z" fill="var(--leaf2)"/>`;
  else g = `${soil}<path d="M30 60V30" stroke="var(--leaf)" stroke-width="3" stroke-linecap="round"/><path d="M30 50c-9 0-12-7-12-10 7 0 12 3 12 10z" fill="var(--leaf)"/><path d="M30 46c8 0 11-6 11-9-6 0-11 3-11 9z" fill="var(--leaf2)"/>`
    + [0, 72, 144, 216, 288].map(a => `<ellipse cx="30" cy="16" rx="6" ry="9" fill="${c}" transform="rotate(${a} 30 25)"/>`).join('')
    + '<circle cx="30" cy="25" r="5.5" fill="#fff4c7" stroke="#e8a900" stroke-width="1.2"/>';
  return svgNode(`<svg class="plant" viewBox="0 0 60 70" width="${size}" height="${size * 70 / 60}" aria-hidden="true">${g}</svg>`);
}
const hashNum = s => [...String(s)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

/* ================= 아이 화면 ================= */
function kidHeader(kid, top) {
  add(top, 
    h('div', { class: 'who' }, h('span', { class: 'av' }, kid.name.slice(0, 1)), h('b', {}, kid.name), h('small', {}, gradeLabel(gradeOf(kid)))),
    h('div', { class: 'brand' }, '다시봄'),
    h('button', { class: 'icon-btn', 'aria-label': '테마 색 고르기', title: '색 고르기', onclick: () => themePicker(kid) }, svgNode('<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="10" r="1.6" fill="currentColor"/><circle cx="12" cy="7.5" r="1.6" fill="currentColor"/><circle cx="15.5" cy="10" r="1.6" fill="currentColor"/></svg>')),
    UI.preview
      ? h('button', { class: 'btn small', onclick: () => { UI.preview = null; render(); } }, '엄마 화면으로')
      : h('button', { class: 'icon-btn', 'aria-label': '엄마 화면', title: '엄마', onclick: async () => { if (await askPin()) { UI.mom = true; render(); } } },
        svgNode('<svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>')));
}
function kidScreen(kid, top, nav) {
  kidHeader(kid, top);
  const q = queue(kid.id);
  const reviewN = kidProblems(kid.id).filter(p => p.status === 'review').length;
  [['today', '오늘', q.today.length], ['garden', '내 정원'], ['growth', '자라는 나'], ['upload', '사진 보내기']].forEach(([v, label, n]) =>
    add(nav, h('button', { class: UI.view === v ? 'on' : '', onclick: () => { UI.view = v; render(); window.scrollTo(0, 0); } },
      h('span', {}, label), n ? h('i', { class: 'badge' }, n) : null)));
  if (UI.view === 'garden') return gardenView(kid);
  if (UI.view === 'growth') return growthView(kid);
  if (UI.view === 'upload') return uploadView(kid, reviewN);
  return todayView(kid, q);
}

function todayView(kid, q) {
  const wrap = h('div', { class: 'pad' });
  const cards = Store.list('card').filter(c => c.kidId === kid.id && !c.seenAt).sort((a, b) => a.createdAt - b.createdAt);
  if (cards.length) add(wrap, h('button', { class: 'surprise', onclick: () => openCard(cards[0]) },
    h('b', {}, '엄마가 보낸 깜짝 카드가 있어요!'), h('span', {}, '눌러서 열어 봐요')));
  const total = q.done + q.today.length;
  add(wrap, h('div', { class: 'today-head' },
    h('h1', {}, q.today.length ? `오늘 다시 만날 문제 ${q.today.length}개` : total ? '오늘 할 일 끝!' : '오늘은 쉬는 날'),
    total ? h('div', { class: 'dots', 'aria-label': `${total}개 중 ${q.done}개 풀었어요` },
      Array.from({ length: total }, (_, i) => h('span', { class: i < q.done ? 'on' : '' }))) : null));
  if (q.today.length) {
    add(wrap, h('p', { class: 'sub' }, '풀고 싶은 문제부터 골라요.'));
    add(wrap, h('div', { class: 'qgrid' }, q.today.map(x => problemTile(x.p, x.g, () => startSolve(x.p)))));
  } else if (total) {
    add(wrap, h('div', { class: 'done-box' }, plantSVG(2, hashNum(kid.id), 70),
      h('p', {}, `오늘 ${q.done}문제를 다시 만났어요. 내일 또 만나요!`),
      q.extra.length ? h('button', { class: 'btn', onclick: () => { UI.extra = true; render(); } }, `더 풀어 볼래? (${q.extra.length}개 기다려요)`) : null));
    if (UI.extra && q.extra.length) add(wrap, h('div', { class: 'qgrid' }, q.extra.map(x => problemTile(x.p, x.g, () => startSolve(x.p)))));
  } else {
    const waiting = kidProblems(kid.id).filter(p => !isReady(p) && p.status !== 'review').length;
    const next = kidProblems(kid.id).map(p => prog(p.id)).filter(g => g && !g.grad).map(g => g.due).sort()[0];
    add(wrap, h('div', { class: 'done-box' }, plantSVG(1, 1, 70),
      h('p', {}, next ? `다음 문제는 ${shortDate(next)}에 만나요.` : '아직 다시 풀 문제가 없어요. 엄마가 넣어 주면 여기에 나와요.'),
      waiting ? h('p', { class: 'note' }, `엄마가 준비하고 있는 문제 ${waiting}개`) : null));
  }
  return wrap;
}
function problemTile(p, g, onclick) {
  return h('button', { class: 'qtile' + (g && g.freq ? ' freq' : ''), onclick },
    hasImage(p) ? imgEl(p.img || p.pageImg, 'thumb') : h('div', { class: 'thumb text' }, (p.text || '').slice(0, 40)),
    h('div', { class: 'qmeta' },
      h('b', {}, sourceLabel(p, true)),
      h('div', { class: 'chips' },
        g && g.wrong ? h('span', { class: 'chip oops' }, `${g.wrong}번 틀림`) : null,
        g && g.freq ? h('span', { class: 'chip sun' }, '단골') : null,
        g && g.freq && g.streak ? h('span', { class: 'chip' }, `복습 ${g.streak - 1}/${S().intervals.length}`) : null)));
}
function openCard(c) {
  Store.put('card', c.id, { ...c, seenAt: Date.now() });
  modal(close => h('div', { class: 'card-open look-' + (c.look || 'sun') },
    h('div', { class: 'card-art' }, plantSVG(2, hashNum(c.id), 90)),
    h('p', { class: 'card-text' }, c.text),
    h('p', { class: 'note' }, `엄마가 · ${shortDate(ymdOf(c.createdAt))}`),
    h('button', { class: 'btn primary wide', onclick: close }, '고마워요!')));
}
function themePicker(kid) {
  modal(close => h('div', { class: 'stack' }, h('h3', {}, '내 앱 색 고르기'),
    h('div', { class: 'theme-grid' }, THEMES.map(([v, label]) => h('button', {
      class: 'theme-sw t-' + v + (themeOf(kid.id) === v ? ' on' : ''),
      onclick: () => { Store.put('pref', kid.id, { ...(Store.get('pref', kid.id) || {}), theme: v }); close(); } }, h('span', {}), label)))));
}

/* ---------- 풀기 ---------- */
function startSolve(p) {
  UI.solve = { pid: p.id, phase: 'try', input: '', hint: false, res: null };
  render(); window.scrollTo(0, 0);
}
function hintsFor(p, g) {
  const out = [];
  if (g && g.reasonTags && g.reasonTags.length) out.push('지난번 틀린 이유: ' + g.reasonTags.join(', '));
  if (g && g.reasonText) out.push('내가 쓴 이유: ' + g.reasonText);
  if (p.reason) out.push('엄마의 힌트: ' + p.reason);
  return out;
}
function solveScreen(kid, top) {
  const st = UI.solve;
  const p = Store.get('problem', st.pid);
  if (!p) { UI.solve = null; return kidScreen(kid, top, $('#nav')); }
  const g = ensureProg(p);
  add(top, h('button', { class: 'btn ghost small', onclick: () => { UI.solve = null; render(); } }, '← 목록'),
    h('div', { class: 'brand' }, sourceLabel(p)),
    h('span', { class: 'chip oops' }, `${g.wrong}번 틀림`));
  const wrap = h('div', { class: 'pad solve' });
  add(wrap, problemView(p));
  const hints = hintsFor(p, g);

  if (st.phase === 'try') {
    if (hints.length) add(wrap, st.hint
      ? h('div', { class: 'hint-box' }, h('b', {}, '힌트'), hints.map(t => h('p', {}, t)))
      : h('button', { class: 'btn ghost hint-btn', onclick: () => { st.hint = true; render(); } }, '힌트 보기'));
    if (p.answerType === 'self') {
      add(wrap, h('p', { class: 'sub center' }, '종이나 문제집에 풀어 보고, 다 풀면 눌러요.'),
        h('button', { class: 'btn primary big-btn', onclick: () => { st.phase = 'reveal'; render(); } }, '정답 확인하기'));
    } else {
      const numeric = isNumericAnswer(p.answer);
      const inp = h('input', { class: 'input answer', value: st.input, placeholder: '답을 써요', inputmode: numeric ? 'decimal' : 'text', autocomplete: 'off', 'aria-label': '내 답',
        oninput: e => { st.input = e.target.value; } });
      const submit = () => {
        if (!st.input.trim()) { toast('답을 먼저 써 주세요.'); inp.focus(); return; }
        const ok = check(p.answer, st.input);
        st.res = { ok, ...record(p, ok, { answer: st.input, hint: st.hint }) };
        st.phase = 'result'; inp.blur(); render(); window.scrollTo(0, 0);
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      add(wrap, h('div', { class: 'answer-row' }, inp, h('button', { class: 'btn primary', onclick: submit }, '채점하기')),
        /,/.test(p.answer || '') ? h('p', { class: 'note' }, '답이 여러 개면 쉼표(,)로 나눠 써요.') : null);
    }
  } else if (st.phase === 'reveal') {
    add(wrap, answerBox(p, null),
      h('p', { class: 'sub center' }, '내 답이 맞았나요?'),
      h('div', { class: 'row center' },
        h('button', { class: 'btn oops-btn', onclick: () => { st.res = { ok: false, ...record(p, false, { hint: st.hint }) }; st.phase = 'result'; render(); } }, '틀렸어요'),
        h('button', { class: 'btn primary', onclick: () => { st.res = { ok: true, ...record(p, true, { hint: st.hint }) }; st.phase = 'result'; render(); } }, '맞았어요')));
  } else {
    const r = st.res;
    const grad = r.event === 'grad' || r.event === 'gradFreq';
    wrap.prepend(h('div', { class: 'verdict ' + (r.ok ? 'ok' : 'oops') + (grad ? ' grad' : '') },
      grad ? plantSVG(2, hashNum(p.id), 76) : r.ok ? plantSVG(1, 0, 60) : null,
      h('h2', {}, grad ? '꽃이 피었어요!' : r.ok ? '맞았어요!' : '다시 도전!'),
      h('p', {}, praise(r.event, r.g, st.hint))));
    add(wrap, answerBox(p, p.answerType === 'self' ? null : st.input));
    if (!r.ok) add(wrap, reasonBox(kid, p));
    const left = queue(kid.id).today.filter(x => x.p.id !== p.id);
    add(wrap, h('div', { class: 'row center gap-lg' },
      h('button', { class: 'btn', onclick: () => { UI.solve = null; render(); } }, '목록으로'),
      left.length ? h('button', { class: 'btn primary', onclick: () => startSolve(left[0].p) }, '다음 문제') : null));
  }
  return wrap;
}
function problemView(p) {
  const box = h('div', { class: 'problem' });
  if (hasImage(p)) {
    const im = imgEl(p.img || p.pageImg, 'pimg');
    im.addEventListener('click', () => modal(h('div', { class: 'zoom' }, imgEl(p.img || p.pageImg, 'zimg')), { wide: true }));
    add(box, im);
    if (!p.img && p.pageImg && p.src && p.src.num) add(box, h('p', { class: 'page-note' }, `이 쪽의 ${p.src.num}번 문제를 풀어요.`));
  }
  if ((p.text || '').trim()) add(box, h('p', { class: 'ptext' }, p.text));
  return box;
}
function answerBox(p, mine) {
  return h('div', { class: 'answer-box' },
    mine != null ? h('div', { class: 'ans-line' }, h('span', {}, '내 답'), h('b', {}, mine || '—')) : null,
    (p.answer || '').trim() ? h('div', { class: 'ans-line right' }, h('span', {}, '정답'), h('b', {}, p.answer.split('|')[0])) : null,
    (p.solution || '').trim() || p.solImg ? h('div', { class: 'sol' }, h('span', { class: 'label' }, '풀이'),
      (p.solution || '').trim() ? h('p', {}, p.solution) : null,
      p.solImg ? imgEl(p.solImg, 'pimg', '풀이 사진') : null) : null);
}
function reasonBox(kid, p) {
  const mode = reasonMode(kid);
  if (mode === 'off') return null;
  const g = prog(p.id) || {};
  const tags = new Set(g.reasonTags || []);
  let text = g.reasonText || '';
  const saved = h('p', { class: 'note' });
  const save = () => { Store.put('progress', p.id, { ...prog(p.id), reasonTags: [...tags], reasonText: text.trim() }, { silent: true }); saved.textContent = '저장했어요. 다음에 힌트로 보여 줄게요.'; };
  const chips = h('div', { class: 'chips big' }, REASONS.map(t => {
    const b = h('button', { class: 'chip pickable' + (tags.has(t) ? ' on' : ''), onclick: () => { tags.has(t) ? tags.delete(t) : tags.add(t); b.classList.toggle('on'); save(); } }, t);
    return b;
  }));
  return h('div', { class: 'reason card' },
    h('h3', {}, '왜 틀렸을까?'),
    h('p', { class: 'note' }, '고르거나 쓰지 않아도 괜찮아요. 써 두면 다음에 풀 때 힌트로 볼 수 있어요.'),
    chips,
    mode === 'write' ? h('textarea', { class: 'input', rows: 2, placeholder: '틀린 이유나 다음에 조심할 점', value: text, oninput: e => { text = e.target.value; }, onchange: save }) : null,
    saved);
}

/* ---------- 정원 ---------- */
function gardenView(kid) {
  const s = stats(kid.id);
  const wrap = h('div', { class: 'pad' },
    h('h1', {}, `${kid.name}의 정원`),
    h('div', { class: 'legend' },
      h('span', {}, plantSVG(0, 0, 26), `씨앗 ${s.seeds}`),
      h('span', {}, plantSVG(1, 0, 26), `새싹 ${s.sprouts}`),
      h('span', {}, plantSVG(2, 0, 26), `꽃 ${s.flowers}`)),
    h('p', { class: 'note' }, '틀린 문제는 씨앗이에요. 다시 맞히면 새싹, 졸업하면 꽃이 돼요.'));
  if (!s.plants.length) { add(wrap, h('div', { class: 'done-box' }, h('p', {}, '아직 심은 씨앗이 없어요.'))); return wrap; }
  const plants = s.plants.slice().sort((a, b) => b.stage - a.stage || (a.p.createdAt - b.p.createdAt));
  add(wrap, h('div', { class: 'garden' }, plants.map(({ p, g, stage }) =>
    h('button', { class: 'plot', 'aria-label': sourceLabel(p), onclick: () => plantInfo(p, g, stage) }, plantSVG(stage, hashNum(p.id), 54), h('small', {}, sourceLabel(p, true))))));
  const arc = Store.get('archive', kid.id);
  if (arc && arc.conquered) add(wrap, h('p', { class: 'note center' }, `오래돼서 정리한 꽃도 ${arc.conquered}송이 있어요.`));
  return wrap;
}
function plantInfo(p, g, stage) {
  const msg = stage === 2 ? `${shortDate(ymdOf(g.gradAt))}에 꽃이 피었어요.`
    : g && !g.grad ? (g.due <= ymd() ? '오늘 다시 만날 수 있어요.' : `${shortDate(g.due)}에 다시 만나요.`) : '곧 만나요.';
  modal(close => h('div', { class: 'stack' }, h('h3', {}, sourceLabel(p)),
    hasImage(p) ? imgEl(p.img || p.pageImg, 'pimg') : h('p', {}, p.text),
    h('p', {}, msg), g ? h('p', { class: 'note' }, `틀린 횟수 ${g.wrong}번 · 푼 횟수 ${g.hist.length}번`) : null,
    h('button', { class: 'btn wide', onclick: close }, '닫기')));
}

/* ---------- 자라는 나 ---------- */
function growthView(kid) {
  const s = stats(kid.id);
  const tm = s.thisM, lm = s.lastM;
  const rate = m => (m.tries ? Math.round(m.solo / m.tries * 100) : null);
  const rT = rate(tm), rL = rate(lm);
  const max = Math.max(tm.grad, lm.grad, 1);
  const bar = (label, v, m, cls) => h('div', { class: 'bar-row' }, h('span', {}, label),
    h('div', { class: 'bar' }, h('i', { class: cls, style: { width: (m ? v / m * 100 : 0) + '%' } })), h('b', {}, v));
  const diff = tm.grad - lm.grad;
  const week = thisWeek();
  const names = ['월', '화', '수', '목', '금', '토', '일'];
  return h('div', { class: 'pad' },
    h('h1', {}, '자라는 나'),
    h('p', { class: 'sub' }, '다른 사람이 아니라 지난달의 나와 비교해요.'),
    h('section', { class: 'card stat-hero' },
      h('div', {}, h('span', { class: 'label' }, '처음엔 틀렸지만 이제 아는 문제'), h('div', { class: 'big-num' }, s.conquered, h('small', {}, '개'))),
      plantSVG(2, 2, 64)),
    h('section', { class: 'card' },
      h('div', { class: 'label' }, '이번 달에 이겨낸 문제'),
      bar('지난달', lm.grad, max, 'past'), bar('이번 달', tm.grad, max, 'now'),
      h('p', { class: 'note' }, diff > 0 ? `지난달보다 ${diff}개 더 이겨냈어요!` : tm.grad ? '꾸준히 이겨내고 있어요.' : '이번 달 첫 꽃을 피워 볼까요?')),
    h('section', { class: 'card' },
      h('div', { class: 'label' }, '힌트 없이 혼자 맞힌 비율'),
      bar('지난달', rL ?? 0, 100, 'past'), bar('이번 달', rT ?? 0, 100, 'now'),
      h('p', { class: 'note' }, rT == null ? '이번 달에 푼 문제가 아직 없어요.' : rL != null && rT > rL ? `지난달보다 ${rT - rL}%p 더 혼자 해냈어요.` : `이번 달 ${tm.tries}번 풀어서 ${tm.solo}번 혼자 맞혔어요.`)),
    h('section', { class: 'card two' },
      h('div', {}, h('span', { class: 'label' }, '단골 문제 졸업'), h('div', { class: 'mid-num' }, s.freqGrad, h('small', {}, '개'))),
      h('div', {}, h('span', { class: 'label' }, '강해진 곳'),
        s.topUnits.length ? h('ol', { class: 'units' }, s.topUnits.map(([u, n]) => h('li', {}, `${u} `, h('small', {}, `꽃 ${n}`)))) : h('p', { class: 'note' }, '꽃이 피면 여기에 나와요.'))),
    h('section', { class: 'card' },
      h('div', { class: 'label' }, '이번 주에 공부한 날'),
      h('div', { class: 'week' }, week.map((d, i) => h('div', { class: 'wday' + (s.days.has(d) ? ' on' : '') + (d === ymd() ? ' today' : '') }, h('i', {}), h('small', {}, names[i])))),
      h('p', { class: 'note' }, '하루 쉬어도 괜찮아요. 쌓인 꽃은 그대로예요.')));
}

/* ---------- 아이가 사진 보내기 ---------- */
function uploadView(kid, reviewN) {
  const mine = kidProblems(kid.id).filter(p => p.createdBy === 'kid' && p.status === 'review').sort((a, b) => b.createdAt - a.createdAt);
  const wrap = h('div', { class: 'pad' },
    h('h1', {}, '틀린 문제 사진 보내기'),
    h('p', { class: 'sub' }, '틀린 문제를 찍어서 엄마에게 보내요. 엄마가 확인하면 다시 풀기에 나와요.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary big-btn', onclick: () => kidUpload(kid, true) }, '사진 찍기'),
      h('button', { class: 'btn big-btn', onclick: () => kidUpload(kid, false) }, '앨범에서 고르기')));
  if (mine.length) {
    add(wrap, h('div', { class: 'label' }, `엄마가 확인하는 중 ${mine.length}개`),
      h('div', { class: 'qgrid' }, mine.map(p => h('div', { class: 'qtile static' }, imgEl(p.kidImg || p.img, 'thumb'), h('div', { class: 'qmeta' }, h('b', {}, sourceLabel(p, true)), h('small', {}, shortDate(ymdOf(p.createdAt))))))));
  }
  void reviewN;
  return wrap;
}
async function shrinkPhoto(file) {
  const c = await fileToCanvas(file);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
}
async function kidUpload(kid, camera) {
  const file = await chooseImage({ camera });
  if (!file) return;
  let blob;
  try { blob = await shrinkPhoto(file); } catch (e) { toast('사진을 열지 못했어요.'); return; }
  const books = Store.list('book');
  const f = { bookId: books.length === 1 ? books[0].id : '', page: '', num: '', mine: '' };
  const url = URL.createObjectURL(blob);
  modal(close => h('div', { class: 'stack' },
    h('h3', {}, '엄마에게 보내기'),
    h('img', { src: url, class: 'pimg', alt: '보낼 사진' }),
    books.length ? h('label', { class: 'field' }, h('span', {}, '문제집 (몰라도 돼요)'),
      h('select', { class: 'input', onchange: e => { f.bookId = e.target.value; } }, h('option', { value: '' }, '모르겠어요'),
        books.map(b => h('option', { value: b.id, selected: b.id === f.bookId }, b.title)))) : null,
    h('div', { class: 'row' },
      h('label', { class: 'field' }, h('span', {}, '쪽'), h('input', { class: 'input', inputmode: 'numeric', oninput: e => { f.page = e.target.value; } })),
      h('label', { class: 'field' }, h('span', {}, '번호'), h('input', { class: 'input', inputmode: 'numeric', oninput: e => { f.num = e.target.value; } }))),
    h('label', { class: 'field' }, h('span', {}, '내가 쓴 답 (안 써도 돼요)'), h('input', { class: 'input', oninput: e => { f.mine = e.target.value; } })),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: close }, '그만두기'),
      h('button', { class: 'btn primary', onclick: async () => {
        const kidImg = await Store.putImage(blob);
        const book = f.bookId ? Store.get('book', f.bookId) : null;
        const page = parseInt(f.page, 10) || null, num = String(f.num || '').trim() || null;
        const p = { id: 'p' + uid(), kidId: kid.id, createdAt: Date.now(), createdBy: 'kid', approved: false, kidImg, kidAnswer: f.mine.trim(),
          src: { type: book ? 'book' : 'photo', bookId: book ? book.id : null, page, num }, subject: book ? book.subject : '', unit: unitFor(book, page), answerType: 'auto' };
        p.status = statusFor(p);
        Store.put('problem', p.id, p);
        close(); toast('엄마에게 보냈어요!');
      } }, '보내기'))), { onClose: () => URL.revokeObjectURL(url) });
}

/* ================= 엄마 화면 ================= */
let purgedToday = '';
function momScreen(top) {
  if (purgedToday !== ymd()) { purgedToday = ymd(); purgeOld().then(n => { if (n) toast(`2년 지난 문제 ${n}개를 정리했어요.`); }); }
  const s = S();
  if (!UI.momKid || !kidById(UI.momKid)) UI.momKid = (s.kids[0] || {}).id || null;
  const review = Store.list('problem').filter(p => p.status === 'review' || p.status === 'pending');
  add(top, h('div', { class: 'brand left' }, '엄마 관리'), syncChip(),
    UI.role === 'kid' ? h('button', { class: 'btn small', onclick: () => { UI.mom = false; render(); } }, '닫기') : null);
  const tabs = [['add', '문제 넣기'], ['review', `확인${review.length ? ' ' + review.length : ''}`], ['list', '문제들'], ['log', '기록'], ['card', '깜짝 카드'], ['set', '설정']];
  const wrap = h('div', { class: 'pad mom' }, h('div', { class: 'tabs-scroll' }, segmented(tabs, UI.momTab, v => { UI.momTab = v; render(); window.scrollTo(0, 0); }, 'tabs')));
  const exp = expiring();
  if (exp.length && UI.momTab !== 'list') add(wrap, h('button', { class: 'warn-bar', onclick: () => { UI.momTab = 'list'; UI.filter = 'expiring'; render(); } }, `한 달 안에 자동 삭제될 문제 ${exp.length}개 · 보관하려면 눌러요`));
  const body = { add: momAdd, review: momReview, list: momList, log: momLog, card: momCards, set: momSettings }[UI.momTab]();
  add(wrap, body);
  return wrap;
}
function syncChip() {
  const st = Sync.status;
  const label = { off: '이 기기에만 저장', nocode: '가족 코드 필요', idle: '연결됨', busy: '맞추는 중…', ok: '맞춤 완료', offline: '인터넷 꺼짐', error: '연결 안 됨' }[st.state] || '';
  return h('button', { class: 'sync-chip s-' + st.state, title: st.msg || label, onclick: () => { if (st.msg) toast(st.msg, 4000); Sync.run(); } }, label);
}
function kidSelect(value, onChange) {
  return segmented(S().kids.map(k => [k.id, k.name]), value, onChange, 'kids');
}

/* ---------- 문제 넣기 ---------- */
function newDraft() {
  return { kidId: UI.momKid, method: Store.list('book').length ? 'book' : 'photo', bookId: (Store.list('book')[0] || {}).id || '', page: '', nums: '', answers: {},
    answer: '', answerType: 'auto', solution: '', text: '', subject: '수학', unit: '', reason: '', kidAnswer: '', img: null, solImg: null };
}
function momAdd() {
  const d = UI.draft || (UI.draft = newDraft());
  if (!kidById(d.kidId)) d.kidId = UI.momKid;
  const books = Store.list('book');
  const wrap = h('div', { class: 'stack' });
  const bind = (key, attrs = {}) => h('input', { class: 'input', value: d[key] || '', ...attrs, oninput: e => { d[key] = e.target.value; } });
  add(wrap, h('div', { class: 'label' }, '누구 문제예요?'), kidSelect(d.kidId, v => { d.kidId = v; UI.momKid = v; render(); }),
    h('div', { class: 'label' }, '어떻게 넣을까요?'),
    segmented([['book', '문제집 쪽·번호'], ['photo', '사진'], ['text', '직접 쓰기']], d.method, v => { d.method = v; render(); }));

  if (d.method === 'book') {
    add(wrap, h('div', { class: 'row' },
      books.length ? h('select', { class: 'input', 'aria-label': '문제집', onchange: e => { d.bookId = e.target.value; render(); } },
        books.map(b => h('option', { value: b.id, selected: b.id === d.bookId }, b.title))) : h('p', { class: 'note grow' }, '아직 문제집이 없어요.'),
      h('button', { class: 'btn small', onclick: () => bookForm(null, b => { d.bookId = b.id; render(); }) }, '+ 문제집')));
    const book = Store.get('book', d.bookId);
    if (book) {
      const nums = parseNums(d.nums);
      const page = parseInt(d.page, 10);
      const pageImg = book.pages && book.pages[page];
      add(wrap, h('div', { class: 'row' },
        h('label', { class: 'field' }, h('span', {}, '쪽'), bind('page', { inputmode: 'numeric', placeholder: '23', onchange: () => render() })),
        h('label', { class: 'field grow' }, h('span', {}, '번호 (여러 개는 쉼표로)'), bind('nums', { inputmode: 'text', placeholder: '4, 7, 9', onchange: () => render() }))),
        page ? h('p', { class: 'note' }, [book.title, `${book.grade}-${book.semester}`, unitFor(book, page) || '단원 모름'].join(' · '),
          pageImg ? ' · 쪽 그림 있음' : ' · 쪽 그림은 Claude가 정리할 때 만들어요') : null);
      if (nums.length > 1) {
        add(wrap, h('div', { class: 'label' }, '정답 ', h('small', {}, '모르면 비워 두세요. Claude가 해설에서 찾아 채워요.')),
          h('div', { class: 'ans-grid' }, nums.map(n => h('label', { class: 'field' }, h('span', {}, `${n}번`),
            h('input', { class: 'input', value: d.answers[n] || '', oninput: e => { d.answers[n] = e.target.value; } })))));
      } else {
        if (!pageImg) add(wrap, photoPicker(d, 'img', '문제 사진 (없으면 Claude가 PDF에서 잘라 넣어요)'));
        add(wrap, answerFields(d, bind));
      }
    }
  } else if (d.method === 'photo') {
    add(wrap, photoPicker(d, 'img', '문제 사진'),
      h('div', { class: 'row' },
        h('label', { class: 'field' }, h('span', {}, '과목'), subjectSelect(d)),
        h('label', { class: 'field grow' }, h('span', {}, '단원 (안 써도 돼요)'), bind('unit', { placeholder: '3. 덧셈과 뺄셈' }))),
      answerFields(d, bind));
  } else {
    add(wrap, h('label', { class: 'field' }, h('span', {}, '문제'), h('textarea', { class: 'input', rows: 3, value: d.text, placeholder: '예) 사과가 7개 있었는데 3개를 먹었어요. 몇 개 남았나요?', oninput: e => { d.text = e.target.value; } })),
      photoPicker(d, 'img', '그림이 있으면 사진 (안 넣어도 돼요)'),
      h('div', { class: 'row' },
        h('label', { class: 'field' }, h('span', {}, '과목'), subjectSelect(d)),
        h('label', { class: 'field grow' }, h('span', {}, '단원'), bind('unit', { placeholder: '안 써도 돼요' }))),
      answerFields(d, bind));
  }
  add(wrap, 
    h('details', { class: 'more' }, h('summary', {}, '더 넣기 (아이가 쓴 답, 엄마 힌트)'),
      h('label', { class: 'field' }, h('span', {}, '아이가 처음에 쓴 답'), bind('kidAnswer')),
      h('label', { class: 'field' }, h('span', {}, '엄마 힌트 (풀 때 "힌트 보기"로만 보여요)'), bind('reason', { placeholder: '예) 받아올림을 잊지 않았나 확인해 봐' }))),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => { UI.draft = newDraft(); render(); } }, '비우기'),
      h('button', { class: 'btn primary', onclick: () => saveDraft(d) }, '저장하기')));
  return wrap;
}
function parseNums(s) { return [...new Set(String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean))]; }
function subjectSelect(d) {
  return h('select', { class: 'input', onchange: e => { d.subject = e.target.value; } }, SUBJECTS.map(x => h('option', { value: x, selected: x === d.subject }, x)));
}
function answerFields(d, bind) {
  return h('div', { class: 'stack' },
    h('div', { class: 'label' }, '채점 방법'),
    segmented([['auto', '답을 써서 자동 채점'], ['self', '스스로 확인 (그리기·잇기 등)']], d.answerType, v => { d.answerType = v; render(); }),
    h('label', { class: 'field' }, h('span', {}, d.answerType === 'self' ? '정답 (보여 주기만 해요)' : '정답'),
      bind('answer', { placeholder: '예) 5  ·  여러 칸: 3, 5  ·  정답이 여럿: 5개|다섯 개' })),
    h('p', { class: 'note' }, '모르면 비워 두세요. 문제집이면 Claude가 해설에서 찾아 채워요. 숫자만 맞으면 단위(개, cm)는 안 써도 정답이에요.'),
    h('label', { class: 'field' }, h('span', {}, '풀이 (채점 뒤에 보여요)'), h('textarea', { class: 'input', rows: 2, value: d.solution, oninput: e => { d.solution = e.target.value; } })),
    photoPicker(d, 'solImg', '풀이 사진 (안 넣어도 돼요)'));
}
function photoPicker(d, key, label) {
  const box = h('div', { class: 'photo-pick' }, h('span', { class: 'label' }, label));
  if (d[key]) add(box, imgEl(d[key], 'thumb wide'), h('button', { class: 'btn ghost small', onclick: () => { d[key] = null; render(); } }, '빼기'));
  add(box, h('div', { class: 'row' },
    h('button', { class: 'btn small', onclick: () => addPhoto(d, key, true) }, '사진 찍기'),
    h('button', { class: 'btn small ghost', onclick: () => addPhoto(d, key, false) }, '앨범에서')));
  return box;
}
async function addPhoto(d, key, camera) {
  const file = await chooseImage({ camera });
  if (!file) return;
  const blob = await editPhoto(file);
  if (!blob) return;
  d[key] = await Store.putImage(blob);
  render();
}
function saveDraft(d) {
  const kid = kidById(d.kidId);
  if (!kid) { toast('아이를 골라 주세요.'); return; }
  const base = { kidId: kid.id, createdAt: Date.now(), createdBy: 'mom', answerType: d.answerType, reason: d.reason.trim(), kidAnswer: d.kidAnswer.trim(), solImg: d.solImg };
  const made = [];
  if (d.method === 'book') {
    const book = Store.get('book', d.bookId);
    const page = parseInt(d.page, 10);
    const nums = parseNums(d.nums);
    if (!book || !page || !nums.length) { toast('문제집, 쪽, 번호를 넣어 주세요.'); return; }
    for (const n of nums) {
      made.push({ ...base, id: 'p' + uid(), src: { type: 'book', bookId: book.id, page, num: n }, subject: book.subject, grade: book.grade, semester: book.semester,
        unit: unitFor(book, page), pageImg: (book.pages && book.pages[page]) || null, img: nums.length === 1 ? d.img : null,
        answer: (nums.length > 1 ? d.answers[n] || '' : d.answer).trim(), solution: nums.length > 1 ? '' : d.solution.trim(), solImg: nums.length > 1 ? null : d.solImg });
    }
  } else if (d.method === 'photo') {
    if (!d.img) { toast('문제 사진을 넣어 주세요.'); return; }
    made.push({ ...base, id: 'p' + uid(), src: { type: 'photo' }, subject: d.subject, unit: d.unit.trim(), img: d.img, answer: d.answer.trim(), solution: d.solution.trim() });
  } else {
    if (!d.text.trim()) { toast('문제를 써 주세요.'); return; }
    made.push({ ...base, id: 'p' + uid(), src: { type: 'text' }, subject: d.subject, unit: d.unit.trim(), text: d.text.trim(), img: d.img, answer: d.answer.trim(), solution: d.solution.trim() });
  }
  let ready = 0;
  for (const p of made) {
    p.status = statusFor(p); if (p.status === 'ready') ready++;
    Store.put('problem', p.id, p, { silent: true });
    Store.put('progress', p.id, newProgress(p), { silent: true });
  }
  const keep = { kidId: d.kidId, method: d.method, bookId: d.bookId, page: d.page };
  UI.draft = { ...newDraft(), ...keep };
  Store.emit();
  toast(ready === made.length ? `${kid.name}에게 ${made.length}문제를 넣었어요. 내일부터 다시 풀기에 나와요.`
    : `${made.length}문제를 넣었어요. ${made.length - ready}문제는 Claude가 정답·그림을 채우면 나와요.`, 4000);
}

function bookForm(book, onSaved) {
  const b = book ? JSON.parse(JSON.stringify(book)) : { title: '', subject: '수학', grade: 1, semester: 1, units: [] };
  const unitsText = (b.units || []).map(u => `${u.name} | ${u.from}-${u.to}`).join('\n');
  let utext = unitsText;
  const err = h('p', { class: 'err' });
  modal(close => h('div', { class: 'stack' },
    h('h3', {}, book ? '문제집 고치기' : '문제집 더하기'),
    h('label', { class: 'field' }, h('span', {}, '이름'), h('input', { class: 'input', value: b.title, placeholder: '예) ○○ 수학 2-2', oninput: e => { b.title = e.target.value; } })),
    h('div', { class: 'row' },
      h('label', { class: 'field' }, h('span', {}, '과목'), h('select', { class: 'input', onchange: e => { b.subject = e.target.value; } }, SUBJECTS.map(x => h('option', { value: x, selected: x === b.subject }, x)))),
      h('label', { class: 'field' }, h('span', {}, '학년'), h('select', { class: 'input', onchange: e => { b.grade = +e.target.value; } }, [1, 2, 3, 4, 5, 6].map(g => h('option', { value: g, selected: g === b.grade }, `${g}학년`)))),
      h('label', { class: 'field' }, h('span', {}, '학기'), h('select', { class: 'input', onchange: e => { b.semester = +e.target.value; } }, [1, 2].map(g => h('option', { value: g, selected: g === b.semester }, `${g}학기`))))),
    h('label', { class: 'field' }, h('span', {}, '단원과 쪽 (한 줄에 하나, 안 써도 돼요. Claude가 목차에서 채울 수 있어요)'),
      h('textarea', { class: 'input mono', rows: 5, value: utext, placeholder: '1. 네 자리 수 | 6-27\n2. 곱셈구구 | 28-51', oninput: e => { utext = e.target.value; } })),
    err,
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: close }, '그만두기'),
      h('button', { class: 'btn primary', onclick: () => {
        if (!b.title.trim()) { err.textContent = '문제집 이름을 넣어 주세요.'; return; }
        const units = [];
        for (const line of utext.split('\n').map(s => s.trim()).filter(Boolean)) {
          const m = line.match(/^(.+?)\s*\|\s*(\d+)\s*[-~]\s*(\d+)$/);
          if (!m) { err.textContent = `이 줄을 읽지 못했어요: "${line}" (예: 1. 네 자리 수 | 6-27)`; return; }
          units.push({ name: m[1].trim(), from: +m[2], to: +m[3] });
        }
        const saved = Store.put('book', b.id || 'b' + uid(), { ...b, title: b.title.trim(), units, pages: b.pages || {} });
        close(); onSaved && onSaved(saved);
      } }, '저장'))), { wide: true });
}

/* ---------- 확인 대기 ---------- */
function momReview() {
  const items = Store.list('problem').filter(p => p.status === 'review' || p.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  if (!items.length) return h('div', { class: 'done-box' }, h('p', {}, '확인할 문제가 없어요.'));
  return h('div', { class: 'stack' },
    h('p', { class: 'note' }, '"아이가 보낸 사진"은 엄마가 확인해야 다시 풀기에 나와요. "Claude 정리 대기"는 정답이나 문제 그림이 비어 있는 문제예요. 정답을 직접 넣으면 바로 풀 수 있어요.'),
    items.map(p => h('button', { class: 'list-row', onclick: () => editProblem(p) },
      imgEl(p.img || p.kidImg || p.pageImg, 'mini-thumb'),
      h('div', { class: 'grow' }, h('b', {}, `${(kidById(p.kidId) || {}).name || ''} · ${sourceLabel(p)}`),
        h('small', {}, p.status === 'review' ? '아이가 보낸 사진 · 확인해 주세요' : !hasImage(p) && !p.text ? 'Claude 정리 대기 · 문제 그림 없음' : 'Claude 정리 대기 · 정답 없음')),
      h('span', { class: 'chip ' + (p.status === 'review' ? 'sun' : '') }, p.status === 'review' ? '확인' : '대기'))));
}

function editProblem(orig) {
  const p = JSON.parse(JSON.stringify(orig));
  p.src = p.src || {};
  const g = prog(p.id);
  const err = h('p', { class: 'err' });
  const imgBox = h('div');
  const drawImgs = () => imgBox.replaceChildren(
    p.kidImg ? h('div', { class: 'photo-pick' }, h('span', { class: 'label' }, '아이가 보낸 사진'), imgEl(p.kidImg, 'pimg'),
      h('button', { class: 'btn small', onclick: async () => { const r = await Store.imageRecord(p.kidImg); if (!r) return; const blob = await editPhoto(r.blob, { title: '연필 자국 지우기' }); if (blob) { p.img = await Store.putImage(blob); drawImgs(); } } }, '이 사진 정리해서 문제로 쓰기')) : null,
    h('div', { class: 'photo-pick' }, h('span', { class: 'label' }, '문제 그림'),
      p.img ? imgEl(p.img, 'pimg') : p.pageImg ? h('div', {}, imgEl(p.pageImg, 'pimg'), h('p', { class: 'note' }, `쪽 전체 그림 · ${p.src.num || ''}번`)) : h('p', { class: 'note' }, '없음'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: async () => { const f = await chooseImage({ camera: true }); if (!f) return; const b = await editPhoto(f); if (b) { p.img = await Store.putImage(b); drawImgs(); } } }, '사진 찍기'),
        h('button', { class: 'btn small ghost', onclick: async () => { const f = await chooseImage({ camera: false }); if (!f) return; const b = await editPhoto(f); if (b) { p.img = await Store.putImage(b); drawImgs(); } } }, '앨범에서'),
        p.img ? h('button', { class: 'btn small ghost', onclick: () => { p.img = null; drawImgs(); } }, '빼기') : null)));
  drawImgs();
  const books = Store.list('book');
  const field = (label, key, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { class: 'input', value: p[key] || '', ...attrs, oninput: e => { p[key] = e.target.value; } }));
  const typeSeg = h('div');
  const drawType = () => typeSeg.replaceChildren(segmented([['auto', '자동 채점'], ['self', '스스로 확인']], p.answerType || 'auto', v => { p.answerType = v; drawType(); }));
  drawType();
  modal(close => h('div', { class: 'stack' },
    h('h3', {}, `${(kidById(p.kidId) || {}).name || ''} · ${sourceLabel(p)}`),
    g ? h('p', { class: 'note' }, `틀린 횟수 ${g.wrong} · 푼 횟수 ${g.hist.length}${g.grad ? ' · 졸업' : ` · 다음 ${shortDate(g.due)}`}${g.freq ? ' · 단골' : ''}`) : null,
    imgBox,
    h('div', { class: 'row' },
      books.length ? h('label', { class: 'field grow' }, h('span', {}, '문제집'), h('select', { class: 'input', onchange: e => { p.src.bookId = e.target.value || null; } },
        h('option', { value: '' }, '없음'), books.map(b => h('option', { value: b.id, selected: b.id === p.src.bookId }, b.title)))) : null,
      h('label', { class: 'field' }, h('span', {}, '쪽'), h('input', { class: 'input', inputmode: 'numeric', value: p.src.page || '', oninput: e => { p.src.page = parseInt(e.target.value, 10) || null; } })),
      h('label', { class: 'field' }, h('span', {}, '번호'), h('input', { class: 'input', value: p.src.num || '', oninput: e => { p.src.num = e.target.value.trim() || null; } }))),
    (p.text || '').trim() ? h('label', { class: 'field' }, h('span', {}, '문제 글'), h('textarea', { class: 'input', rows: 3, value: p.text, oninput: e => { p.text = e.target.value; } })) : null,
    typeSeg,
    field('정답', 'answer', { placeholder: '여러 칸: 3, 5 · 정답이 여럿: 5개|다섯 개' }),
    h('label', { class: 'field' }, h('span', {}, '풀이'), h('textarea', { class: 'input', rows: 3, value: p.solution || '', oninput: e => { p.solution = e.target.value; } })),
    field('단원', 'unit'),
    field('엄마 힌트', 'reason'),
    p.kidAnswer ? h('p', { class: 'note' }, `아이가 처음 쓴 답: ${p.kidAnswer}`) : null,
    g && (g.reasonTags || g.reasonText) ? h('p', { class: 'note' }, `아이가 고른 틀린 이유: ${[...(g.reasonTags || []), g.reasonText].filter(Boolean).join(', ')}`) : null,
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!p.keep, onchange: e => { p.keep = e.target.checked; } }), '2년이 지나도 지우지 않고 보관'),
    err,
    h('div', { class: 'row between' },
      h('button', { class: 'btn danger', onclick: async () => { if (await ask('이 문제를 지울까요? 풀이 기록도 함께 지워져요.', { yes: '지우기', danger: true })) { await removeProblem(orig); close(); toast('지웠어요.'); } } }, '지우기'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: close }, '닫기'),
        h('button', { class: 'btn primary', onclick: () => {
          const book = p.src.bookId ? Store.get('book', p.src.bookId) : null;
          if (book) { p.src.type = 'book'; p.subject = p.subject || book.subject; p.grade = book.grade; p.semester = book.semester; if (!p.unit) p.unit = unitFor(book, p.src.page);
            if (!p.img && book.pages && book.pages[p.src.page]) p.pageImg = book.pages[p.src.page]; }
          if (p.createdBy === 'kid') p.approved = true;
          p.answer = (p.answer || '').trim(); p.solution = (p.solution || '').trim();
          p.status = statusFor(p);
          Store.put('problem', p.id, p);
          if (!prog(p.id)) Store.put('progress', p.id, newProgress(p), { silent: true });
          close();
          toast(p.status === 'ready' ? '저장했어요. 다시 풀기에 나와요.' : '저장했어요. 정답이나 그림이 채워지면 나와요.');
        } }, p.status === 'review' ? '확인 완료' : '저장')))), { wide: true });
}

/* ---------- 문제들 ---------- */
function momList() {
  const s = S();
  const kidId = UI.momKid;
  const all = Store.list('problem').filter(p => p.kidId === kidId).sort((a, b) => b.createdAt - a.createdAt);
  const exp = new Set(expiring().map(p => p.id));
  const t = ymd();
  const f = UI.filter;
  const rows = all.filter(p => {
    const g = prog(p.id);
    if (f === 'today') return isReady(p) && g && !g.grad && g.due <= t;
    if (f === 'freq') return g && g.freq && !g.grad;
    if (f === 'grad') return g && g.grad;
    if (f === 'expiring') return exp.has(p.id);
    return true;
  });
  return h('div', { class: 'stack' },
    kidSelect(kidId, v => { UI.momKid = v; render(); }),
    segmented([['all', '전체'], ['today', '오늘'], ['freq', '단골'], ['grad', '졸업'], ['expiring', `삭제 예정${exp.size ? ' ' + exp.size : ''}`]], f, v => { UI.filter = v; render(); }, 'small'),
    f === 'expiring' ? h('p', { class: 'note' }, `등록하고 ${Math.round(s.retentionDays / 365)}년이 지난 문제는 자동으로 지워요. 남기려면 문제를 눌러 "보관"에 체크하세요.`) : null,
    rows.length ? rows.map(p => {
      const g = prog(p.id);
      return h('button', { class: 'list-row', onclick: () => editProblem(p) },
        imgEl(p.img || p.pageImg || p.kidImg, 'mini-thumb'),
        h('div', { class: 'grow' }, h('b', {}, sourceLabel(p)),
          h('small', {}, p.status !== 'ready' ? (p.status === 'review' ? '확인 대기' : 'Claude 정리 대기')
            : g ? (g.grad ? `졸업 ${shortDate(ymdOf(g.gradAt))}` : `다음 ${shortDate(g.due)}`) : '', exp.has(p.id) ? ` · ${shortDate(deleteOn(p))} 삭제 예정` : '', p.keep ? ' · 보관' : '')),
        g ? h('span', { class: 'chip oops' }, `${g.wrong}번`) : null,
        g && g.freq && !g.grad ? h('span', { class: 'chip sun' }, '단골') : null);
    }) : h('p', { class: 'note center' }, '해당하는 문제가 없어요.'));
}

/* ---------- 기록 ---------- */
function momLog() {
  const kid = kidById(UI.momKid);
  if (!kid) return h('p', {}, '아이가 없어요.');
  const s = stats(kid.id);
  const tries = [];
  for (const p of kidProblems(kid.id)) { const g = prog(p.id); if (g) for (const x of g.hist) tries.push({ p, g, x }); }
  tries.sort((a, b) => b.x.t - a.x.t);
  const q = queue(kid.id);
  return h('div', { class: 'stack' },
    kidSelect(kid.id, v => { UI.momKid = v; render(); }),
    h('div', { class: 'tiles' },
      tile('오늘 남은 문제', q.today.length), tile('정복한 문제', s.conquered), tile('단골 졸업', s.freqGrad),
      tile('이번 달 혼자 맞힘', s.thisM.tries ? Math.round(s.thisM.solo / s.thisM.tries * 100) + '%' : '—')),
    h('button', { class: 'btn small', onclick: () => { UI.preview = kid.id; UI.mom = false; UI.view = 'today'; render(); } }, `${kid.name} 화면 보기`),
    h('div', { class: 'label' }, '최근 풀이'),
    tries.length ? h('div', { class: 'log' }, tries.slice(0, 40).map(({ p, g, x }) => h('div', { class: 'log-row' },
      h('span', { class: 'when' }, new Date(x.t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
      h('span', { class: 'grow' }, sourceLabel(p, true)),
      h('span', { class: 'chip ' + (x.ok ? 'ok' : 'oops') }, x.ok ? '맞음' : '틀림'),
      x.h ? h('span', { class: 'chip' }, '힌트') : null,
      x.a ? h('small', {}, `"${x.a}"`) : null,
      !x.ok && (g.reasonTags || []).length ? h('small', {}, g.reasonTags.join(', ')) : null))) : h('p', { class: 'note' }, '아직 푼 기록이 없어요.'));
}
const tile = (label, v) => h('div', { class: 'tile' }, h('small', {}, label), h('b', {}, v));

/* ---------- 깜짝 카드 ---------- */
function momCards() {
  const kid = kidById(UI.momKid);
  let text = '';
  let look = 'sun';
  const lookSeg = h('div');
  const drawLook = () => lookSeg.replaceChildren(segmented([['sun', '해님'], ['sky', '하늘'], ['flower', '꽃']], look, v => { look = v; drawLook(); }, 'small'));
  drawLook();
  const sent = Store.list('card').filter(c => !kid || c.kidId === kid.id).sort((a, b) => b.createdAt - a.createdAt);
  return h('div', { class: 'stack' },
    h('p', { class: 'note' }, '예고 없이 가끔 보내는 칭찬 카드예요. 점수보다 노력과 방법을 칭찬하면 좋아요. 예) "어려운 문제를 포기하지 않고 세 번이나 다시 풀었더라. 멋졌어!"'),
    kidSelect(UI.momKid, v => { UI.momKid = v; render(); }),
    h('textarea', { class: 'input', rows: 3, placeholder: '아이에게 하고 싶은 말', oninput: e => { text = e.target.value; } }),
    lookSeg,
    h('button', { class: 'btn primary', onclick: () => {
      if (!text.trim() || !kid) { toast('카드에 쓸 말을 넣어 주세요.'); return; }
      const id = 'c' + uid();
      Store.put('card', id, { kidId: kid.id, text: text.trim(), look, createdAt: Date.now(), seenAt: null });
      toast(`${kid.name}에게 카드를 보냈어요. 다음에 앱을 열면 보여요.`);
    } }, '카드 보내기'),
    sent.length ? h('div', { class: 'label' }, '보낸 카드') : null,
    sent.slice(0, 20).map(c => h('div', { class: 'list-row static' }, h('div', { class: 'grow' }, h('b', {}, c.text), h('small', {}, `${shortDate(ymdOf(c.createdAt))} · ${c.seenAt ? '봤어요' : '아직 안 봤어요'}`)),
      h('button', { class: 'btn ghost small', onclick: () => Store.del('card', c.id) }, '지우기'))));
}

/* ---------- 설정 ---------- */
function momSettings() {
  const s = S();
  const wrap = h('div', { class: 'stack' });
  const kidsBox = h('section', { class: 'card' }, h('h3', {}, '아이'));
  s.kids.forEach((k, i) => {
    const g = gradeOf(k);
    add(kidsBox, h('div', { class: 'kid-row' },
      h('input', { class: 'input', value: k.name, 'aria-label': '이름', onchange: e => { const kids = S().kids.slice(); kids[i] = { ...kids[i], name: e.target.value.trim() || k.name }; saveSettings({ kids }); } }),
      h('select', { class: 'input narrow', 'aria-label': '지금 학년', onchange: e => { const kids = S().kids.slice(); kids[i] = { ...kids[i], entryYear: entryYearFor(+e.target.value) }; saveSettings({ kids }); } },
        Array.from({ length: 12 }, (_, j) => j + 1).map(n => h('option', { value: n, selected: n === g }, gradeLabel(n)))),
      h('select', { class: 'input', 'aria-label': '틀린 이유 쓰기', onchange: e => { const kids = S().kids.slice(); kids[i] = { ...kids[i], reasonMode: e.target.value }; saveSettings({ kids }); } },
        REASON_MODES.map(([v, l]) => h('option', { value: v, selected: v === (k.reasonMode || 'auto') }, '틀린 이유: ' + l)))));
  });
  add(kidsBox, h('p', { class: 'note' }, `'학년에 맞게'는 초1·2 안 쓰기, 초3·4 버튼으로 고르기, 초5부터 직접 쓰기예요. 지금은 ${s.kids.map(k => `${k.name} ${REASON_MODES.find(m => m[0] === reasonMode(k))[1]}`).join(', ')}.`),
    h('button', { class: 'btn small', onclick: () => { const kids = [...S().kids, { id: 'k' + uid(), name: '새 아이', entryYear: entryYearFor(1), reasonMode: 'auto' }]; saveSettings({ kids }); } }, '+ 아이 더하기'));
  add(wrap, kidsBox);

  const num = (label, key, min, max, note) => h('label', { class: 'set-row' }, h('span', {}, label, note ? h('small', {}, note) : null),
    h('input', { class: 'input narrow', type: 'number', min, max, value: s[key], onchange: e => { const v = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || s[key])); saveSettings({ [key]: v }); } }));
  add(wrap, h('section', { class: 'card' }, h('h3', {}, '다시 풀기 규칙'),
    num('하루에 다시 풀 문제', 'dailyMax', 1, 30, '다 풀면 "더 풀어 볼래?"가 나와요'),
    num('단골 문제 기준 (틀린 횟수)', 'freqN', 2, 10),
    h('label', { class: 'set-row' }, h('span', {}, '단골 문제 복습 간격(일)', h('small', {}, '다시 맞힌 뒤 이 간격으로 다시 나오고, 모두 맞히면 졸업')),
      h('input', { class: 'input narrow', value: s.intervals.join(', '), onchange: e => { const v = e.target.value.split(/[,\s]+/).map(Number).filter(n => n > 0 && n < 400); if (v.length) saveSettings({ intervals: v }); } })),
    h('div', { class: 'set-row' }, h('span', {}, '학년이 바뀌는 날'),
      segmented([[3, '3월 1일'], [1, '1월 1일']], s.changeMonth, v => saveSettings({ changeMonth: v }), 'small')),
    h('div', { class: 'set-row' }, h('span', {}, '자동 삭제', h('small', {}, '등록하고 이만큼 지난 문제. 한 달 전에 알려 드려요')),
      h('select', { class: 'input narrow', onchange: e => saveSettings({ retentionDays: +e.target.value }) },
        [[365, '1년'], [730, '2년'], [1095, '3년'], [36500, '지우지 않기']].map(([v, l]) => h('option', { value: v, selected: v === s.retentionDays }, l))))));

  const st = Sync.cfg;
  const joinUrl = location.origin + location.pathname + '#join=' + (st.code || '');
  add(wrap, h('section', { class: 'card' }, h('h3', {}, '가족 저장 공간'),
    h('p', { class: 'sub' }, '상태: ', syncChip(), Sync.status.msg ? h('small', {}, ' ' + Sync.status.msg) : null),
    st.code ? h('div', {}, h('div', { class: 'label' }, '가족 코드'), h('div', { class: 'code-box' }, st.code),
      h('p', { class: 'note' }, '아이 태블릿에서 앱을 열고 "가족 코드로 들어가기"에 넣어요. 또는 아래 QR을 태블릿 카메라로 찍어도 돼요.'),
      qrNode(joinUrl)) : null,
    h('details', { class: 'more' }, h('summary', {}, '저장 공간 주소와 키 (처음 연결할 때만)'),
      serverForm()),
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => Sync.run() }, '지금 맞추기'))));

  add(wrap, h('section', { class: 'card' }, h('h3', {}, '이 기기'),
    h('p', { class: 'note' }, UI.role === 'mom' ? '엄마 기기예요.' : `${(kidById(UI.kidId) || {}).name || ''}의 기기예요.`),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => chooseDevice() }, '누구 기기인지 바꾸기'),
      h('button', { class: 'btn small', onclick: () => changePin() }, '엄마 비밀번호 바꾸기')),
    h('details', { class: 'more' }, h('summary', {}, '문제집 관리'),
      Store.list('book').map(b => h('div', { class: 'list-row static' }, h('div', { class: 'grow' }, h('b', {}, b.title), h('small', {}, `${b.subject} ${b.grade}-${b.semester} · 단원 ${b.units.length}개 · 쪽 그림 ${Object.keys(b.pages || {}).length}장`)),
        h('button', { class: 'btn small ghost', onclick: () => bookForm(b) }, '고치기'))),
      h('button', { class: 'btn small', onclick: () => bookForm(null) }, '+ 문제집'))));
  return wrap;
}
function serverForm() {
  const c = Sync.cfg;
  const url = h('input', { class: 'input', placeholder: 'https://○○○○.supabase.co', value: c.url });
  const key = h('input', { class: 'input', placeholder: 'sb_publishable_…', value: c.key });
  const msg = h('p', { class: 'note' }, '앱에 미리 넣어 두었으면 비워 둬도 돼요. Secret 키는 여기에 넣지 마세요.');
  return h('div', { class: 'stack' }, url, key, msg,
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: async () => {
        await Sync.save({ url: url.value.trim(), key: key.value.trim() });
        msg.textContent = '저장했어요.';
        if (Sync.hasServer() && Sync.cfg.code) {
          try {
            if (!(await Sync.check(Sync.cfg.code))) {
              const made = await Sync.create(Sync.cfg.code);
              msg.textContent = made ? '가족을 만들고 연결했어요.' : '이 저장 공간에는 다른 가족 코드가 있어요.';
            } else msg.textContent = '연결됐어요.';
            Sync.run();
          } catch (e) { msg.textContent = Sync.friendly(e); }
        }
      } }, '저장하고 연결')));
}
function qrNode(text) {
  try {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return h('div', { class: 'qr', html: q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) });
  } catch (e) { return h('p', { class: 'note' }, text); }
}
function changePin() {
  const a = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '새 비밀번호 (숫자 4자리 이상)' });
  const err = h('p', { class: 'err' });
  modal(close => h('div', { class: 'stack' }, h('h3', {}, '엄마 비밀번호 바꾸기'), a, err,
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: close }, '닫기'),
      h('button', { class: 'btn primary', onclick: async () => {
        if (!/^\d{4,}$/.test(a.value)) { err.textContent = '숫자 4자리 이상으로 정해 주세요.'; return; }
        saveSettings({ pinHash: await sha256('dasibom:' + a.value) }); close(); toast('바꿨어요.');
      } }, '바꾸기'))));
}

/* ================= 시작 ================= */
async function boot() {
  try { await Store.open(); }
  catch (e) { $('#main').append(h('div', { class: 'pad' }, h('h2', {}, '저장 공간을 열지 못했어요'), h('p', {}, '시크릿 모드가 아닌지 확인해 주세요.'))); return; }
  await Sync.init();
  const m = location.hash.match(/^#join=([A-Za-z0-9-]+)/);
  if (m) { pendingJoin = cleanCode(m[1]); history.replaceState(null, '', location.pathname + location.search); }
  const dev = await Store.meta('device');
  if (dev) { UI.role = dev.role; UI.kidId = dev.kidId; }
  Store.on(render);
  Sync.watch(() => document.querySelectorAll('.sync-chip').forEach(c => c.replaceWith(syncChip())));
  render();
  Sync.start();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
