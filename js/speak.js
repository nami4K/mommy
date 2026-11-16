'use strict';
/*
 * 🎤 말로 문장 만들기
 *  아이가 단어를 넣어 문장을 말하면(브라우저 음성 인식) → AI 선생님이 맞는지 보고, 고친 문장과 더 좋은 표현을 알려 줘요.
 *  AI가 꺼져 있으면 단어를 넣어 말했는지만 확인해요.
 */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SENT = () => ((DB.sentences ||= {})[DB.current] ||= []);

function listenOnce(lang, onText) {
  return new Promise((resolve, reject) => {
    const r = new SR();
    r.lang = lang === 'en' ? 'en-US' : 'ko-KR';
    r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let final = '', last = '';
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      last = (final + interim).trim(); onText(last);
    };
    r.onerror = e => { if (e.error === 'no-speech' || e.error === 'aborted') resolve(last); else reject(e.error); };
    r.onend = () => resolve((final || last).trim());
    listenOnce.cur = r;
    r.start();
  });
}
const words = s => s.toLowerCase().replace(/[^a-z0-9가-힣' ]/g, ' ').split(/\s+/).filter(Boolean);
function similarity(a, b) {
  const A = words(a), B = words(b); if (!B.length) return 0;
  const bag = {}; A.forEach(x => bag[x] = (bag[x] || 0) + 1);
  let hit = 0; for (const x of B) if (bag[x]) { hit++; bag[x]--; }
  return hit / Math.max(A.length, B.length);
}
/* 고친 문장에서 아이 문장과 달라진 낱말을 표시 (LCS) */
function diffMarks(said, fixed) {
  const a = words(said), bt = fixed.split(/(\s+)/), b = bt.filter((_, i) => i % 2 === 0);
  const bn = b.map(x => words(x)[0] || '');
  const dp = Array.from({ length: a.length + 1 }, () => new Array(bn.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = bn.length - 1; j >= 0; j--) dp[i][j] = a[i] === bn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Set(); let i = 0, j = 0;
  while (i < a.length && j < bn.length) { if (a[i] === bn[j]) { keep.add(j); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  const out = []; b.forEach((tok, k) => { if (k) out.push(' '); out.push(keep.has(k) || !bn[k] ? tok : h('mark', { class: 'fix' }, tok)); });
  return out;
}
function readingOf(w) { return w.lang === 'hanja' ? (w.parts || []).map(p => (p.hun || '').split(/[\s,]+/).filter(Boolean)[1] || '').join('') : ''; }

let SS = null;
function startSentences(opts = {}) {
  if (T) { T = null; }
  if (!opts.lang) opts.lang = curSubj();
  let pool = opts.setId ? setWordsOf(opts.setId) : starred();
  if (opts.lang && opts.lang !== 'all') pool = pool.filter(w => w.lang === opts.lang);
  if (!pool.length) { toast('문장을 만들 단어가 없어요'); return; }
  const n = Math.min(5, pool.length);
  // 공부해 본 단어, 문장을 덜 만든 단어 먼저
  const picked = pool.map(w => ({ w, k: ((w.s && w.s.seen) ? 0 : 1) + ((w.s && w.s.sent) || 0) * 0.7 + Math.random() * 1.2 })).sort((a, b) => a.k - b.k).slice(0, n).map(x => x.w.id);
  SS = { ids: picked, i: 0, results: [], before: Object.fromEntries(picked.map(id => [id, (W()[id].s || newSrs()).level])) };
  Speech.stop(); openFull(); renderSentence();
}
function renderSentence() {
  const o = $('#overlay'); o.innerHTML = '';
  if (SS.i >= SS.ids.length) return finishSentences();
  const w = W()[SS.ids[SS.i]];
  const rd = readingOf(w);
  const shown = w.lang === 'hanja' && rd ? `${w.term}(${rd})` : w.term;
  const said = h('div', { class: 'said empty' }, '🎤를 누르고 말해 봐요');
  const fb = h('div', { class: 'feedback' });
  const hint = h('div', { class: 'hint-box' });
  const actions = h('div', { class: 'judge hidden' });
  let text = '', hinted = false, busy = false;
  const mic = h('button', { class: 'mic', 'aria-label': '말하기' }, '🎤');
  const typed = h('textarea', { class: 'input', rows: 2, placeholder: '말하기가 안 되면 엄마가 대신 적어 주세요' });

  const setText = t => { text = t; said.classList.toggle('empty', !t); said.textContent = t || '잘 안 들렸어요. 다시 말해 봐요'; };
  async function record() {
    if (busy) { try { listenOnce.cur && listenOnce.cur.stop(); } catch (e) { } return; }
    busy = true; Speech.stop(); mic.classList.add('on'); mic.textContent = '⏹'; fb.innerHTML = ''; actions.classList.add('hidden');
    said.textContent = '듣고 있어요…'; said.classList.remove('empty');
    try { setText(await listenOnce(w.lang === 'en' ? 'en' : 'ko', t => { said.textContent = t; })); }
    catch (e) { setText(''); said.textContent = e === 'not-allowed' ? '마이크를 쓸 수 없어요. 마이크 권한을 허락해 주세요.' : '말하기 인식이 멈췄어요 (' + e + ')'; }
    busy = false; mic.classList.remove('on'); mic.textContent = '🎤';
    if (text) showActions();
  }
  function showActions() {
    actions.innerHTML = '';
    actions.append(h('button', { class: 'judge-btn no', onclick: record }, '🔄 다시 말하기'), h('button', { class: 'judge-btn yes', onclick: check }, '✅ 확인해 줘'));
    actions.classList.remove('hidden');
  }
  async function check() {
    actions.classList.add('hidden');
    fb.innerHTML = ''; fb.append(h('div', { class: 'loading' }, h('span', { class: 'spin' }), aiReady() ? 'AI 선생님이 보고 있어요…' : '확인 중…'));
    const used = termRegex(w).test(text) || (rd && text.includes(rd)) || (w.lang !== 'en' && text.includes(w.term));
    let r = null, err = null;
    if (aiReady()) { try { r = await aiSentenceFeedback(w, text); } catch (e) { err = aiErrorText(e); } }
    fb.innerHTML = '';
    if (r) showFeedback(r);
    else {
      fb.append(h('div', { class: 'fb-card' + (used ? ' good' : '') },
        h('div', { class: 'fb-title' }, used ? `🌟 '${shown}'를 넣어서 말했어요!` : `🤔 '${shown}'가 안 들렸어요`),
        h('p', {}, '내 문장: ', h('b', {}, text)),
        h('button', { class: 'mini', onclick: () => Speech.say(text, w.lang === 'en' ? 'en' : 'ko') }, '🔊 내 문장 듣기'),
        h('p', { class: 'note' }, err || 'AI 선생님을 켜면 문장이 맞는지, 더 좋은 표현이 있는지도 알려 줘요 (엄마 설정).')));
    }
    saveSentence(w, text, r, used, hinted);
    fb.append(h('div', { class: 'result-btns' },
      h('button', { class: 'btn', onclick: () => { fb.innerHTML = ''; record(); } }, '🔄 다른 문장 말하기'),
      h('button', { class: 'btn primary', onclick: () => { SS.i++; renderSentence(); } }, SS.i + 1 < SS.ids.length ? '다음 단어 ▶' : '끝내기 ✨')));
  }
  function showFeedback(r) {
    const same = r.corrected.trim().toLowerCase().replace(/[.!?]$/, '') === text.trim().toLowerCase().replace(/[.!?]$/, '');
    const lang = w.lang === 'en' ? 'en' : 'ko';
    const echo = h('div', { class: 'echo' });
    fb.append(h('div', { class: 'fb-card' + (r.is_correct ? ' good' : '') },
      h('div', { class: 'stars' }, '★'.repeat(r.stars), h('span', {}, '★'.repeat(3 - r.stars))),
      h('div', { class: 'fb-title' }, r.praise),
      h('p', { class: 'fb-said' }, '내가 말한 문장: ', text),
      !same ? h('div', { class: 'fb-sec' }, h('small', {}, '🛠 이렇게 고치면 딱 맞아요'), h('div', { class: 'fb-sent' }, diffMarks(text, r.corrected)),
        h('button', { class: 'mini', onclick: () => Speech.say(r.corrected, lang) }, '🔊 듣기')) : null,
      r.meaning_ko ? h('p', { class: 'fb-ko' }, '뜻: ', r.meaning_ko) : null,
      r.better && r.better.trim().toLowerCase() !== r.corrected.trim().toLowerCase() ? h('div', { class: 'fb-sec better' }, h('small', {}, '✨ 이런 표현도 멋져요'), h('div', { class: 'fb-sent' }, highlight(r.better, w)),
        h('div', { class: 'ex-tools' }, h('button', { class: 'mini', onclick: () => Speech.say(r.better, lang) }, '🔊 듣기'),
          SR ? h('button', {
            class: 'mini', onclick: async e => {
              const b = e.currentTarget; b.disabled = true; echo.textContent = '따라 말해 봐요…';
              try {
                const t = await listenOnce(lang, x => { echo.textContent = x; });
                const s = similarity(t, r.better);
                echo.textContent = s >= 0.8 ? `🎉 똑같이 말했어요! (${t})` : s >= 0.5 ? `👍 거의 다 왔어요! (${t})` : `한 번 더 해 볼까요? (${t || '안 들렸어요'})`;
                if (s >= 0.8) { sfx('ok'); burst(b, 10); }
              } catch (err) { echo.textContent = '말하기 인식이 멈췄어요'; }
              b.disabled = false;
            },
          }, '🎤 따라 말하기') : null), echo) : null,
      r.tip ? h('p', { class: 'fb-tip' }, '💡 ', r.tip) : null));
    if (r.is_correct) { sfx('ok'); burst(fb, 12); } else sfx('no');
    if (ST().speak !== false) setTimeout(() => Speech.say(same ? text : r.corrected, lang), 500);
  }

  o.append(
    h('div', { class: 't-top' }, h('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: () => { try { listenOnce.cur && listenOnce.cur.abort(); } catch (e) { } finishSentences(); } }, '✕'),
      h('div', { class: 'bar' }, h('i', { style: { width: (SS.i / SS.ids.length * 100) + '%' } })), h('span', { class: 'count' }, `${SS.i + 1}/${SS.ids.length}`)),
    h('div', { class: 'flash-card in sent-card' }, h('div', { class: 'face' },
      h('span', { class: 'tag t-' + w.lang }, LANG_LABEL[w.lang]),
      h('div', { class: 'term lang-' + w.lang + (shown.length > 9 ? ' long' : '') }, shown),
      h('div', { class: 'sent-mean' }, w.meaning),
      w.lang !== 'hanja' ? h('button', { class: 'mini', onclick: () => speakWord(w) }, '🔊 듣기') : null)),
    h('p', { class: 'sent-ask' }, w.lang === 'en' ? `'${w.term}'를 넣어서 영어 문장을 말해 봐요` : `'${shown}'를 넣어서 문장을 말해 봐요`),
    hint,
    h('div', { class: 't-tools' }, h('button', {
      class: 'tool hint', onclick: () => {
        hinted = true; hint.innerHTML = '';
        const ex = pickExample(w);
        hint.append(h('div', { class: 'hint-title' }, '💡 예문을 보고 비슷하게 만들어 봐요'), ex ? h('div', { class: 'ex-text' }, highlight(ex, w)) : h('div', {}, w.lang === 'en' ? `"I am ___." / "It is ___." 처럼 짧게 시작해 봐요` : '"나는 ___." 처럼 짧게 시작해 봐요'));
        hint.classList.add('on'); if (ex) Speech.say(ex, w.lang === 'en' ? 'en' : 'ko');
      },
    }, '💡 예문 보기')),
    SR ? h('div', { class: 'mic-wrap' }, mic) : h('p', { class: 'warn' }, '이 브라우저에서는 말하기 인식을 쓸 수 없어요. 엄마가 아래에 대신 적어 줄 수 있어요.'),
    said, actions,
    h('details', { class: 'more' }, h('summary', {}, '⌨️ 글로 적기'), typed, h('button', { class: 'btn small', onclick: () => { if (typed.value.trim()) { setText(typed.value.trim()); showActions(); } } }, '이 문장으로')),
    fb);
  mic.addEventListener('click', record);
  if (ST().speak !== false) speakWord(w);
}
function saveSentence(w, said, r, used, hinted) {
  const s = w.s ||= newSrs();
  s.sent = (s.sent || 0) + 1;
  const good = r ? r.used_word && r.is_correct : false;
  // 단어를 바르게 넣어 문장을 만들면, 하루 한 번 한 단계 자라요 (힌트를 봤으면 그대로)
  if (good && !hinted && s.sentDay !== today()) { s.level = Math.min(5, s.level + 1); s.sentDay = today(); s.due = Date.now() + INTERVAL[s.level] * DAY; }
  if (s.wrong > 0 && s.level >= 3) s.recovered = true;
  SENT().unshift({ id: w.id, term: w.term, lang: w.lang, said, corrected: r ? r.corrected : '', better: r ? r.better : '', stars: r ? r.stars : 0, ok: r ? good : used, at: Date.now() });
  SENT().length = Math.min(SENT().length, 300);
  SS.results.push({ id: w.id, good, stars: r ? r.stars : 0 });
  logDay(e => { e.sent = (e.sent || 0) + 1; });
  save();
}
function finishSentences() {
  Speech.stop();
  const ss = SS; SS = null;
  if (!ss || !ss.results.length) { closeOverlay(); render(); return; }
  logDay(e => { e.s++; }); save();
  const newly = checkUnlocks();
  const grew = Object.keys(ss.before).map(id => W()[id]).filter(w => w && w.s && w.s.level > ss.before[w.id]);
  const good = ss.results.filter(x => x.good).length;
  const o = openFull(); o.classList.add('result');
  o.append(h('div', { class: 'result-wrap' },
    h('div', { class: 'result-av', html: avatarSVG(P().avatar) }),
    h('h2', {}, `🎤 문장 ${ss.results.length}개 만들었어요!`),
    h('p', { class: 'sub' }, good ? `그중 ${good}개는 딱 맞는 문장이었어요.` : '말로 문장을 만드는 건 정말 어려운 일이에요. 멋져요!'),
    grew.length ? h('div', { class: 'card' }, h('h4', { class: 'label' }, `🌱 문장으로 자란 단어 ${grew.length}개`),
      h('div', { class: 'grew' }, grew.map(w => h('div', { class: 'grew-item' }, h('span', { html: plantSVG(ss.before[w.id], 'plant sm') }), '→', h('span', { html: plantSVG(w.s.level, 'plant sm') }), h('b', {}, w.term), h('small', {}, STAGES[w.s.level]))))) : null,
    unlockBlock(newly),
    h('div', { class: 'result-btns' },
      h('button', { class: 'btn primary', onclick: () => startSentences() }, '🎤 더 만들기'),
      h('button', { class: 'btn ghost', onclick: () => { closeOverlay(); go('me'); } }, '📝 내 문장 노트 보기'))));
  if (grew.length || newly.length) setTimeout(() => sfx('up'), 300);
  renderNav(); renderTop();
}
function sentenceNote() {
  const list = SENT();
  if (!list.length) return null;
  const item = x => h('li', {},
    h('div', {}, h('span', { class: 'tag t-' + x.lang }, x.term), ' ', x.stars ? h('span', { class: 'stars sm' }, '★'.repeat(x.stars)) : (x.ok ? '🌟' : '')),
    h('div', { class: 'ex-text' }, '🗣 ', x.said),
    x.corrected && x.corrected !== x.said ? h('div', { class: 'ex-text small' }, '🛠 ', x.corrected) : null,
    x.better ? h('div', { class: 'ex-text small' }, '✨ ', x.better) : null);
  const all = h('ul', { class: 'examples' });
  return h('div', { class: 'card' }, h('h4', { class: 'label' }, `📝 내가 만든 문장 (${list.length})`),
    h('ul', { class: 'examples' }, list.slice(0, 3).map(item)),
    list.length > 3 ? h('details', { class: 'more', ontoggle: e => { if (e.target.open && !all.children.length) list.slice(3, 100).forEach(x => all.append(item(x))); } }, h('summary', {}, '더 보기'), all) : null);
}
