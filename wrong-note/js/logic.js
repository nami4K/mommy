'use strict';
/* ================= 설정 ================= */
const DEFAULTS = {
  kids: [],
  changeMonth: 3,          // 학년이 바뀌는 달 (3 = 3월 1일, 1 = 1월 1일)
  dailyMax: 5,             // 하루에 다시 풀 문제 수
  freqN: 2,                // 이만큼 틀리면 '단골 문제'
  intervals: [3, 7, 14, 30], // 단골 문제: 다시 맞힌 뒤 복습 간격(일). 모두 맞히면 졸업
  retentionDays: 730,      // 등록하고 이만큼 지나면 자동 삭제(2년)
  warnDays: 30,            // 삭제 몇 일 전부터 엄마에게 알리기
  pinHash: '',
};
const S = () => ({ ...DEFAULTS, ...(Store.get('settings', 'main') || {}) });
const saveSettings = patch => Store.put('settings', 'main', { ...S(), ...patch });
const kidById = id => S().kids.find(k => k.id === id) || null;

const THEMES = [
  ['sky', '하늘'], ['sea', '바다'], ['forest', '숲'], ['grape', '포도'],
];
const themeOf = kidId => (Store.get('pref', kidId) || {}).theme || 'sky';

/* ================= 학년 ================= */
/* 학년도: 바뀌는 달이 지나면 올해, 아니면 작년 */
function schoolYear(d = new Date(), month = S().changeMonth) {
  return d.getMonth() + 1 >= month ? d.getFullYear() : d.getFullYear() - 1;
}
const gradeOf = kid => Math.max(1, schoolYear() - kid.entryYear + 1);
const gradeLabel = g => (g <= 6 ? `초${g}` : g <= 9 ? `중${g - 6}` : `고${g - 9}`);
const entryYearFor = grade => schoolYear() - grade + 1;

/* 틀린 이유 쓰기: auto면 학년에 따라(초1·2 끔, 초3·4 버튼, 초5부터 쓰기) */
function reasonMode(kid) {
  if (kid && kid.reasonMode && kid.reasonMode !== 'auto') return kid.reasonMode;
  const g = kid ? gradeOf(kid) : 1;
  return g <= 2 ? 'off' : g <= 4 ? 'pick' : 'write';
}
const REASON_MODES = [['auto', '학년에 맞게'], ['off', '안 쓰기'], ['pick', '버튼으로 고르기'], ['write', '직접 쓰기']];
const REASONS = ['계산 실수', '문제를 잘못 읽음', '몰라서', '헷갈려서', '깜빡함'];

/* ================= 문제와 진도 ================= */
const SUBJECTS = ['수학', '국어', '통합', '영어', '기타'];
const kidProblems = kidId => Store.list('problem').filter(p => p.kidId === kidId);
const prog = pid => Store.get('progress', pid);
const hasImage = p => !!(p.img || p.pageImg);
function isReady(p) {
  if (!p || p.status !== 'ready') return false;
  if (!hasImage(p) && !(p.text || '').trim()) return false;
  return p.answerType === 'self' ? !!((p.answer || '').trim() || (p.solution || '').trim() || p.solImg) : !!(p.answer || '').trim();
}
/* 엄마가 정답을 넣었거나 '스스로 확인' 문제면 바로 풀 수 있게 상태를 정합니다 */
function statusFor(p) {
  if (p.createdBy === 'kid' && !p.approved) return 'review';
  const content = hasImage(p) || (p.text || '').trim();
  const answer = p.answerType === 'self' ? true : !!(p.answer || '').trim();
  return content && answer ? 'ready' : 'pending';
}
function newProgress(p) {
  return { kidId: p.kidId, wrong: 1, streak: 0, due: addDays(ymdOf(p.createdAt || Date.now()), 1), freq: 1 >= S().freqN, grad: false, hist: [] };
}
/* 진도가 아직 없으면 기본값만 돌려줍니다(저장은 채점할 때). 다른 기기의 기록을 덮어쓰지 않으려는 것 */
function ensureProg(p) {
  return prog(p.id) || newProgress(p);
}
const lastTry = g => g && g.hist.length ? g.hist[g.hist.length - 1] : null;
const triedToday = g => { const l = lastTry(g); return !!l && ymdOf(l.t) === ymd(); };

function sourceLabel(p, short = false) {
  const book = p.src && p.src.bookId ? Store.get('book', p.src.bookId) : null;
  const parts = [];
  if (!short) parts.push(p.subject || (book && book.subject) || '');
  const g = p.grade || (book && book.grade), sem = p.semester || (book && book.semester);
  if (!short && g) parts.push(sem ? `${g}-${sem}` : `${g}학년`);
  if (!short && p.unit) parts.push(p.unit);
  if (p.src && p.src.page) parts.push(`${p.src.page}쪽` + (p.src.num ? ` ${p.src.num}번` : ''));
  else if (p.src && p.src.num) parts.push(`${p.src.num}번`);
  const s = parts.filter(Boolean).join(' · ');
  return s || (short ? (p.subject || '문제') : (p.text ? p.text.slice(0, 18) : '사진 문제'));
}
function unitFor(book, page) {
  if (!book || !book.units || !page) return '';
  const u = book.units.find(u => page >= u.from && page <= u.to);
  return u ? u.name : '';
}

/* 오늘 풀 문제: 날짜가 된 것 중 단골 먼저, 오래된 것 먼저. 하루 최대 개수까지 */
function queue(kidId) {
  const t = ymd();
  const s = S();
  let done = 0;
  const due = [];
  for (const p of kidProblems(kidId)) {
    if (!isReady(p)) continue;
    const g = ensureProg(p);
    if (triedToday(g)) { done++; continue; }
    if (g.grad || g.due > t) continue;
    due.push({ p, g });
  }
  due.sort((a, b) => (b.g.freq - a.g.freq) || a.g.due.localeCompare(b.g.due) || (a.p.createdAt - b.p.createdAt));
  const room = Math.max(0, s.dailyMax - done);
  return { today: due.slice(0, room), extra: due.slice(room), done, max: s.dailyMax };
}

/* 채점 결과를 기록하고 다음 날짜를 정합니다 */
function record(p, ok, { answer = '', hint = false } = {}) {
  const s = S();
  const g = { ...ensureProg(p) };
  g.hist = [...g.hist, { t: Date.now(), ok, a: String(answer).slice(0, 80), h: !!hint }];
  let event;
  if (!ok) {
    g.wrong += 1; g.streak = 0; g.due = addDays(ymd(), 1);
    if (!g.freq && g.wrong >= s.freqN) { g.freq = true; event = 'becameFreq'; } else event = 'wrong';
  } else {
    g.streak += 1;
    if (!g.freq) { g.grad = true; g.gradAt = Date.now(); event = 'grad'; }
    else if (g.streak > s.intervals.length) { g.grad = true; g.gradAt = Date.now(); event = 'gradFreq'; }
    else { g.due = addDays(ymd(), s.intervals[g.streak - 1]); event = 'review'; }
  }
  Store.put('progress', p.id, g);
  return { g, event };
}

/* ================= 채점 ================= */
function norm(s) {
  return String(s == null ? '' : s).normalize('NFKC').toLowerCase()
    .replace(/(\d)\s+(?=\d)/g, '$1,')      // "3 5" → "3,5"
    .replace(/[\s'"“”‘’]/g, '')
    .replace(/[.。]$/, '')
    .replace(/[·、，;/]/g, ',')
    .replace(/,+/g, ',').replace(/^,|,$/g, '');
}
const NUM = /^(-?\d+(?:\.\d+)?)(.*)$/;
function sameItem(a, x) {
  if (a === x) return true;
  const an = a.match(NUM), xn = x.match(NUM);
  // 숫자가 같으면 단위는 안 써도 정답 (5개 = 5). 다른 단위를 쓰면 오답
  if (an && xn && parseFloat(an[1]) === parseFloat(xn[1]) && (!xn[2] || xn[2] === an[2])) return true;
  return false;
}
/* 정답 칸에 '|'로 여러 정답을 넣을 수 있어요. 빈칸이 여럿이면 쉼표로 (예: 3, 5) */
function check(answer, input) {
  const x = norm(input);
  if (!x) return false;
  return String(answer || '').split('|').map(norm).filter(Boolean).some(a => {
    if (sameItem(a, x)) return true;
    const A = a.split(','), X = x.split(',');
    return A.length > 1 && A.length === X.length && A.every((v, i) => sameItem(v, X[i]));
  });
}
const isNumericAnswer = a => /^[\d\s.,|-]+$/.test(String(a || '').trim());

/* ================= 칭찬 (노력과 방법을 칭찬) ================= */
function praise(event, g, hint) {
  const w = g.wrong;
  const days = S().intervals;
  switch (event) {
    case 'gradFreq': return pick([
      `${w}번이나 어려웠던 문제를 끝까지 이겨냈어! 꾸준히 다시 만난 덕분이야.`,
      `단골 문제 졸업! 여러 번 다시 도전한 힘이 꽃이 됐어.`]);
    case 'grad': return hint
      ? '힌트를 보고 방법을 찾아냈어! 다음엔 혼자서도 할 수 있을 거야.'
      : pick([`지난번엔 틀렸는데 이번엔 해냈어! 다시 풀어 본 덕분이야.`, `틀렸던 문제를 다시 풀어서 맞혔어. 이게 바로 실력이 느는 순간이야!`]);
    case 'review': return g.streak === 1
      ? `다시 풀어서 맞혔어! 잊지 않게 ${days[0]}일 뒤에 한 번 더 만나자.`
      : `기억하고 있었네! 다음엔 ${days[g.streak - 1]}일 뒤에 만나자. (복습 ${g.streak - 1}/${days.length})`;
    case 'becameFreq': return '이 문제는 이제 단골 문제야. 자주 만나서 꼭 친해지자!';
    default: return pick(['괜찮아, 틀린 문제는 다시 만날 기회야. 내일 또 만나자.', '천천히 다시 보면 방법이 보일 거야. 내일 다시 도전!']);
  }
}

/* ================= 성장 숫자 (자기 자신과 비교) ================= */
const monthOf = t => ymdOf(t).slice(0, 7);
function prevMonth(ym) { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`; }
function stats(kidId) {
  const probs = kidProblems(kidId);
  const arc = Store.get('archive', kidId) || {};
  const thisM = ymd().slice(0, 7), lastM = prevMonth(thisM);
  const r = { seeds: 0, sprouts: 0, flowers: 0, conquered: arc.conquered || 0, freqGrad: arc.freqGrad || 0,
    month: { [thisM]: { grad: 0, tries: 0, solo: 0 }, [lastM]: { grad: 0, tries: 0, solo: 0 } }, units: {}, days: new Set(), plants: [] };
  for (const p of probs) {
    const g = prog(p.id);
    if (!g) { if (isReady(p)) { r.seeds++; r.plants.push({ p, stage: 0 }); } continue; }
    const stage = g.grad ? 2 : g.streak > 0 ? 1 : 0;
    r.plants.push({ p, g, stage });
    if (stage === 0) r.seeds++; else if (stage === 1) r.sprouts++; else r.flowers++;
    if (g.grad) {
      r.conquered++;
      if (g.freq) r.freqGrad++;
      const m = r.month[monthOf(g.gradAt)]; if (m) m.grad++;
      const u = typesOf(p)[0] || unitLine(p) || p.subject; if (u) r.units[u] = (r.units[u] || 0) + 1;
    }
    for (const x of g.hist) {
      const m = r.month[monthOf(x.t)];
      if (m) { m.tries++; if (x.ok && !x.h) m.solo++; }
      r.days.add(ymdOf(x.t));
    }
  }
  r.thisM = r.month[thisM]; r.lastM = r.month[lastM];
  r.topUnits = Object.entries(r.units).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return r;
}
/* 이번 주(월~일) 날짜들 */
function thisWeek() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7;
  const mon = addDays(ymd(d), -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/* ================= 2년 지난 문제 정리 ================= */
const ageDays = p => (Date.now() - (p.createdAt || Date.now())) / DAY;
function expiring() {
  const s = S();
  return Store.list('problem').filter(p => !p.keep && ageDays(p) > s.retentionDays - s.warnDays && ageDays(p) <= s.retentionDays);
}
const deleteOn = p => addDays(ymdOf(p.createdAt), S().retentionDays);
async function purgeOld() {
  const s = S();
  const old = Store.list('problem').filter(p => !p.keep && ageDays(p) > s.retentionDays);
  for (const p of old) {
    const g = prog(p.id);
    if (g && g.grad) {
      const a = { ...(Store.get('archive', p.kidId) || {}) };
      a.conquered = (a.conquered || 0) + 1;
      if (g.freq) a.freqGrad = (a.freqGrad || 0) + 1;
      Store.put('archive', p.kidId, a, { silent: true });
    }
    await removeProblem(p);
  }
  if (old.length) Store.emit();
  return old.length;
}
async function removeProblem(p) {
  Store.del('problem', p.id);
  Store.del('progress', p.id);
  const imgs = [p.img, p.solImg, p.kidImg];
  const pageUsed = p.pageImg && Store.list('problem').some(q => q.id !== p.id && q.pageImg === p.pageImg);
  if (p.pageImg && !pageUsed && !(p.src && p.src.bookId)) imgs.push(p.pageImg);
  await Store.delImages(imgs);
}

/* 가족 코드: 헷갈리는 글자(0/O, 1/I/L)는 뺍니다 */
function newFamilyCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map(x => A[x % A.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}
const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.+)$/, '$1-$2');

/* ================= 학년-학기 · 단원 표시 ================= */
/* 학기: 3~8월 1학기, 9~2월 2학기 */
const curSemester = (d = new Date()) => (d.getMonth() + 1 >= 3 && d.getMonth() + 1 <= 8 ? 1 : 2);
function gradeSem(p) {
  const book = p.src && p.src.bookId ? Store.get('book', p.src.bookId) : null;
  return { g: p.grade || (book && book.grade) || null, s: p.semester || (book && book.semester) || null };
}
/* 문제 아래에 붙는 한 줄: "2-2 · 3. 길이 재기" */
function unitLine(p) {
  const { g, s } = gradeSem(p);
  const gs = g ? (s ? `${g}-${s}` : `${g}학년`) : '';
  return [gs, p.unit || ''].filter(Boolean).join(' · ');
}

/* ================= 문제 유형 =================
 * 밤 정리 때 Claude가 문제 그림을 보고 아래 목록에서 골라 problem.types에 넣어요(목록에 없으면 새 이름).
 * 엄마가 문제 고치기 창에서 바꿀 수 있어요. 처음 목록이라 써 보면서 늘리거나 고치면 돼요. */
const TYPE_GROUPS = [
  ['수와 연산', ['수 세기·읽기', '수의 크기 비교', '자릿값', '뛰어 세기·수 규칙', '받아올림 덧셈', '받아내림 뺄셈', '세 수의 계산', '어떤 수(□) 구하기', '덧셈·뺄셈 문장제', '곱셈구구', '곱셈 문장제', '합차 문제']],
  ['도형', ['도형 이름·특징', '도형 개수 세기', '칠교·조각 맞추기', '넓이·칸 세기', '쌓기나무']],
  ['측정', ['길이 재기·어림', '시각 읽기', '시간 계산', '들이·무게 비교']],
  ['규칙과 자료', ['규칙 찾기', '분류하기', '표·그래프']],
  ['국어', ['받아쓰기·맞춤법', '낱말 뜻', '문장 부호', '글 읽고 답하기']],
];
const ALL_TYPES = TYPE_GROUPS.flatMap(g => g[1]);
const typesOf = p => (Array.isArray(p.types) ? p.types.filter(Boolean) : []);

/* ================= 취약한 곳 분석 (엄마용) =================
 * 숫자는 앱이 계산하고, 유형 붙이기와 한 주 메모(report/{kidId})는 Claude가 해요.
 * 약한 정도 = 아직 졸업 못 한 문제의 틀린 횟수 합 + 단골 문제 하나당 2점 + 최근 30일 틀림 하나당 1점 */
function analysis(kidId) {
  const since = Date.now() - 30 * DAY;
  const groups = { type: {}, unit: {} };
  const reasons = {};
  const frequent = [];
  let untyped = 0;
  const bump = (bag, key, p, g) => {
    const b = bag[key] || (bag[key] = { key, problems: 0, open: 0, wrong: 0, freq: 0, grad: 0, recent: 0, ids: [] });
    b.problems++; b.ids.push(p.id);
    const wrong = g ? g.wrong : 1;
    b.wrong += wrong;
    if (g && g.grad) b.grad++; else { b.open++; b.score = (b.score || 0) + wrong; }
    if (g && g.freq && !g.grad) b.freq++;
    b.recent += g ? g.hist.filter(x => !x.ok && x.t > since).length : 0;
  };
  for (const p of kidProblems(kidId)) {
    if (p.status === 'review') continue;
    const g = prog(p.id);
    const types = typesOf(p);
    if (!types.length) untyped++;
    types.forEach(t => bump(groups.type, t, p, g));
    const ul = unitLine(p);
    if (ul) bump(groups.unit, ul, p, g);
    if (g) {
      (g.reasonTags || []).forEach(t => { reasons[t] = (reasons[t] || 0) + 1; });
      if (g.wrong >= S().freqN && !g.grad) frequent.push({ p, g });
    }
  }
  const rank = bag => Object.values(bag)
    .map(b => ({ ...b, score: (b.score || 0) + b.freq * 2 + b.recent, rate: b.problems ? Math.round(b.grad / b.problems * 100) : 0 }))
    .sort((a, b) => b.score - a.score || b.wrong - a.wrong);
  frequent.sort((a, b) => b.g.wrong - a.g.wrong);
  return { types: rank(groups.type), units: rank(groups.unit), reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]), frequent, untyped };
}
