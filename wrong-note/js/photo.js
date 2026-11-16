'use strict';
/*
 * 사진 정리: 돌리기 → 문제만 자르기 → 밝게 + 연필 지우기(회색 글씨를 흰색으로) → 지우개로 남은 자국 지우기.
 * 인쇄 글자(검정)는 남기고 연한 회색(연필)만 지우는 방식이라, 진하게 쓴 글씨나 글자 위에 겹친 글씨는 남을 수 있어요.
 */
const MAX_SIDE = 1600, OUT_SIDE = 1400;

async function fileToCanvas(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(async () => {
    const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img;
  });
  const sc = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
function rotated(src, rot) {
  if (!rot) return src;
  const c = document.createElement('canvas');
  const odd = rot % 2 === 1;
  c.width = odd ? src.height : src.width; c.height = odd ? src.width : src.height;
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 2);
  x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
/* clean 0~100: 클수록 진한 회색까지 지움. bright: 종이를 하얗게 */
function cleanCanvas(src, clean, bright) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
  if (!clean && !bright) return c;
  const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
  let white = 255;
  if (bright) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 16) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
    const total = d.length / 16; let acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.08) { white = Math.max(140, v); break; } }
  }
  const sc = 255 / white;
  const T = 255 - clean * 1.7; // 0 → 지우지 않음, 100 → 밝기 85 이상인 회색 지움
  for (let i = 0; i < d.length; i += 4) {
    let r = Math.min(255, d[i] * sc), g = Math.min(255, d[i + 1] * sc), b = Math.min(255, d[i + 2] * sc);
    if (clean) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      if (mx - mn < 46 && L > T) { const t = Math.min(1, (L - T) / 28); r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  x.putImageData(im, 0, 0);
  return c;
}

/* 사진 편집 창. 다 하면 Blob(JPEG), 그만두면 null */
async function editPhoto(file, { title = '사진 정리하기' } = {}) {
  let base;
  try { base = await fileToCanvas(file); } catch (e) { toast('사진을 열지 못했어요. 다른 사진으로 해 주세요.'); return null; }
  return new Promise(resolve => {
    const st = { rot: 0, crop: null, clean: 55, bright: true, strokes: [], mode: 'crop', brush: 18 };
    let rot = base, proc = null, procKey = '';
    const view = h('canvas', { class: 'pe-canvas' });
    const ctx = view.getContext('2d');
    let scale = 1, drag = null, done = false;

    const processed = () => {
      const key = `${st.rot}|${st.clean}|${st.bright}`;
      if (key !== procKey) { proc = cleanCanvas(rot, st.clean, st.bright); procKey = key; }
      return proc;
    };
    function paintStrokes(x, s = 1, ox = 0, oy = 0) {
      x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
      for (const k of st.strokes) {
        x.lineWidth = k.w * s; x.beginPath();
        k.pts.forEach(([px, py], i) => { const X = (px - ox) * s, Y = (py - oy) * s; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
        if (k.pts.length === 1) x.lineTo((k.pts[0][0] - ox) * s + 0.1, (k.pts[0][1] - oy) * s);
        x.stroke();
      }
    }
    function draw() {
      const box = view.parentElement;
      const maxW = box ? box.clientWidth : 600, maxH = Math.max(260, window.innerHeight * 0.52);
      scale = Math.min(maxW / rot.width, maxH / rot.height);
      view.width = Math.round(rot.width * scale); view.height = Math.round(rot.height * scale);
      ctx.drawImage(processed(), 0, 0, view.width, view.height);
      paintStrokes(ctx, scale);
      const c = st.crop;
      if (c) {
        ctx.save();
        ctx.fillStyle = 'rgba(20,40,70,.45)';
        ctx.beginPath(); ctx.rect(0, 0, view.width, view.height);
        ctx.rect(c.x * scale, c.y * scale, c.w * scale, c.h * scale); ctx.fill('evenodd');
        ctx.strokeStyle = '#ffcf3d'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
        ctx.strokeRect(c.x * scale, c.y * scale, c.w * scale, c.h * scale);
        ctx.restore();
      }
    }
    const pt = e => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };
    view.addEventListener('pointerdown', e => {
      view.setPointerCapture(e.pointerId);
      const p = pt(e);
      if (st.mode === 'crop') drag = { x0: p[0], y0: p[1] };
      else { st.strokes.push({ w: st.brush / scale, pts: [p] }); drag = { erase: true }; }
      draw();
    });
    view.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = pt(e);
      if (drag.erase) st.strokes[st.strokes.length - 1].pts.push(p);
      else {
        const x = Math.max(0, Math.min(drag.x0, p[0])), y = Math.max(0, Math.min(drag.y0, p[1]));
        const x2 = Math.min(rot.width, Math.max(drag.x0, p[0])), y2 = Math.min(rot.height, Math.max(drag.y0, p[1]));
        st.crop = { x, y, w: x2 - x, h: y2 - y };
      }
      draw();
    });
    const up = () => { if (drag && !drag.erase && st.crop && (st.crop.w < 20 || st.crop.h < 20)) st.crop = null; drag = null; draw(); };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);

    const modeSeg = h('div', { class: 'pe-modes' });
    const tip = h('p', { class: 'note' });
    const renderModes = () => {
      modeSeg.replaceChildren(segmented([['crop', '자르기'], ['erase', '지우개']], st.mode, v => { st.mode = v; renderModes(); }));
      tip.textContent = st.mode === 'crop'
        ? '문제 부분을 손가락으로 끌어 네모를 그리면 그 부분만 남아요.'
        : '남은 연필 자국을 손가락으로 문질러 지워요.';
    };
    renderModes();
    const slider = h('input', { type: 'range', min: 0, max: 100, value: st.clean, class: 'range', 'aria-label': '연필 지우기 세기' });
    let sT = 0;
    slider.addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(() => { st.clean = +slider.value; draw(); }, 60); });
    const brightBox = h('input', { type: 'checkbox', checked: st.bright, id: 'pe-bright' });
    brightBox.addEventListener('change', () => { st.bright = brightBox.checked; draw(); });

    function finish(close) {
      const src = processed();
      const c = st.crop || { x: 0, y: 0, w: rot.width, h: rot.height };
      const sc = Math.min(1, OUT_SIDE / Math.max(c.w, c.h));
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(c.w * sc)); out.height = Math.max(1, Math.round(c.h * sc));
      const x = out.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height);
      x.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, out.width, out.height);
      paintStrokes(x, sc, c.x, c.y);
      out.toBlob(b => { done = true; resolve(b); close(); }, 'image/jpeg', 0.84);
    }

    modal(close => h('div', { class: 'pe' },
      h('div', { class: 'row between' }, h('h3', {}, title),
        h('button', { class: 'icon-btn', 'aria-label': '돌리기', title: '오른쪽으로 돌리기', onclick: () => { st.rot = (st.rot + 1) % 4; rot = rotated(base, st.rot); st.crop = null; st.strokes = []; procKey = ''; draw(); } }, '↻')),
      h('div', { class: 'pe-stage' }, view),
      modeSeg,
      tip,
      h('label', { class: 'pe-row' }, h('span', {}, '연필 지우기'), slider),
      h('label', { class: 'pe-row', for: 'pe-bright' }, h('span', {}, '종이 하얗게'), brightBox),
      h('div', { class: 'row between' },
        h('button', { class: 'btn ghost', onclick: () => { st.strokes.pop(); draw(); } }, '지우개 되돌리기'),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => close() }, '그만두기'),
          h('button', { class: 'btn primary', onclick: () => finish(close) }, '다 했어요')))),
    { wide: true, onClose: () => { if (!done) resolve(null); } });
    requestAnimationFrame(draw);
  });
}
