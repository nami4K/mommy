'use strict';
/* ================= 작은 도구들 ================= */
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
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const svgNode = str => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstChild; };

const DAY = 864e5;
const pad2 = n => String(n).padStart(2, '0');
/* 날짜는 기기 시간 기준 'YYYY-MM-DD' 글자로 다룹니다 */
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const ymdOf = t => ymd(new Date(t));
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);
const shortDate = s => { const [, m, d] = s.split('-'); return `${+m}월 ${+d}일`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pick = a => a[Math.floor(Math.random() * a.length)];

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const blobToB64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
function b64ToBlob(b64, mime) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime || 'image/jpeg' });
}

let _toastT = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('on'), ms);
}

/* 화면 위에 뜨는 창. close()를 돌려줍니다. */
function modal(content, { wide = false, onClose } = {}) {
  const box = h('div', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
  const back = h('div', { class: 'scrim' }, box);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    back.classList.add('out');
    setTimeout(() => back.remove(), 180);
    onClose && onClose();
  };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  box.append(typeof content === 'function' ? content(close) : content);
  $('#overlay').append(back);
  return close;
}

/* 페이지 안에서 확인받기 (confirm() 대신) */
function ask(question, { yes = '네', no = '아니요', danger = false } = {}) {
  return new Promise(res => {
    let answered = false;
    const close = modal(c => h('div', { class: 'ask' },
      h('p', { class: 'ask-q' }, question),
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onclick: () => { answered = true; res(false); c(); } }, no),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { answered = true; res(true); c(); } }, yes))),
      { onClose: () => { if (!answered) res(false); } });
    void close;
  });
}

/* 사진 고르기/찍기: 파일 입력을 잠깐 만들어 누릅니다 */
function chooseImage({ camera = true } = {}) {
  return new Promise(res => {
    const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    if (camera) inp.setAttribute('capture', 'environment');
    inp.addEventListener('change', () => { res(inp.files && inp.files[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

const segmented = (options, value, onChange, cls = '') =>
  h('div', { class: 'seg ' + cls, role: 'tablist' }, options.map(([v, label]) =>
    h('button', { class: v === value ? 'on' : '', role: 'tab', 'aria-selected': v === value ? 'true' : 'false', onclick: () => onChange(v) }, label)));
