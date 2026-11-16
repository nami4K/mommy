'use strict';
/* 아바타와 정원 식물을 SVG 문자열로 그립니다. */
const AV = {
  skin: { fair: '#ffe6d8', light: '#f8d3b8', tan: '#e9b48e', brown: '#c58a61', deep: '#8c5a3c' },
  hairColor: { brown: '#7b4a2b', black: '#2f2535', choco: '#a5663d', blonde: '#f1c76d', pink: '#ff9cc6', lav: '#b89cff', mint: '#71d3bf', sky: '#86c3ff', red: '#d65a54' },
  outfitColor: { pink: '#ff9cc6', sky: '#8cc8ff', mint: '#86dcc0', lav: '#bba3ff', yellow: '#ffd66b', coral: '#ff917c', white: '#fbfbff', navy: '#5c6bb0' },
};
const AV_DEFAULT = { skin: 'light', hair: 'long', hairColor: 'brown', eyes: 'round', outfit: 'dress', outfitColor: 'pink', acc: 'ribbon', face: 'none', bg: 'pink', pet: 'none' };
const AV_PRESETS = [
  { ...AV_DEFAULT },
  { skin: 'fair', hair: 'bob', hairColor: 'black', eyes: 'smile', outfit: 'tee', outfitColor: 'mint', acc: 'none', face: 'none', bg: 'mint', pet: 'none' },
  { skin: 'tan', hair: 'short', hairColor: 'choco', eyes: 'round', outfit: 'tee', outfitColor: 'sky', acc: 'ribbon', face: 'none', bg: 'pink', pet: 'none' },
];

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? c => Math.round(c * (1 + amt)) : c => Math.round(c + (255 - c) * amt);
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
const f1 = n => n.toFixed(1);
function svgFlower(x, y, r, c, center = '#ffd66b') {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = i * 72 * Math.PI / 180 - Math.PI / 2;
    s += `<circle cx="${f1(x + Math.cos(a) * r)}" cy="${f1(y + Math.sin(a) * r)}" r="${f1(r * 0.75)}" fill="${c}"/>`;
  }
  return s + `<circle cx="${x}" cy="${y}" r="${f1(r * 0.6)}" fill="${center}"/>`;
}
function svgStar(x, y, r, c, extra = '') {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = Math.PI / 5 * i - Math.PI / 2;
    p.push(f1(x + Math.cos(a) * rr) + ',' + f1(y + Math.sin(a) * rr));
  }
  return `<polygon points="${p.join(' ')}" fill="${c}" ${extra}/>`;
}
function svgHeart(x, y, s, c, extra = '') {
  return `<path d="M${x} ${f1(y + s * 0.9)} C${f1(x - s * 1.6)} ${f1(y - s * 0.2)} ${f1(x - s * 0.8)} ${f1(y - s * 1.5)} ${x} ${f1(y - s * 0.6)} C${f1(x + s * 0.8)} ${f1(y - s * 1.5)} ${f1(x + s * 1.6)} ${f1(y - s * 0.2)} ${x} ${f1(y + s * 0.9)} Z" fill="${c}" ${extra}/>`;
}
const DECO = [[22, 26], [176, 24], [18, 92], [184, 84], [30, 150], [172, 150], [60, 16], [140, 14]];

const BG = {
  pink: () => `<rect width="200" height="200" fill="#ffe1ec"/>` + DECO.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 5 : 8}" fill="#fff" opacity=".7"/>`).join(''),
  mint: () => `<rect width="200" height="200" fill="#d8f5ea"/>` + DECO.map(([x, y], i) => svgHeart(x, y, i % 2 ? 4 : 6, '#fff', 'opacity=".8"')).join(''),
  sky: () => `<rect width="200" height="200" fill="#dcefff"/>` + [[34, 34], [160, 56], [40, 140]].map(([x, y]) => `<g fill="#fff"><ellipse cx="${x}" cy="${y}" rx="20" ry="9"/><circle cx="${x - 7}" cy="${y - 6}" r="9"/><circle cx="${x + 6}" cy="${y - 8}" r="11"/></g>`).join(''),
  lav: () => `<rect width="200" height="200" fill="#ece4ff"/>` + DECO.map(([x, y], i) => svgStar(x, y, i % 2 ? 5 : 8, i % 3 ? '#fff' : '#ffe27a')).join(''),
  peach: () => `<rect width="200" height="200" fill="#ffeadb"/>` + DECO.map(([x, y], i) => svgFlower(x, y, i % 2 ? 3.5 : 5, i % 2 ? '#ffb3c8' : '#fff', '#ffd66b')).join(''),
  garden: () => `<rect width="200" height="200" fill="#e2f4ff"/><path d="M0 150 Q60 120 110 142 Q160 124 200 140 L200 200 L0 200 Z" fill="#bfeccc"/>` +
    [[20, 160], [180, 158], [40, 186], [168, 188], [12, 130], [190, 120]].map(([x, y], i) => svgFlower(x, y, 4, ['#ff9cc6', '#bba3ff', '#ffd66b'][i % 3], '#fff7c2')).join('') +
    `<circle cx="168" cy="30" r="14" fill="#ffe27a"/>`,
  rainbow: () => `<rect width="200" height="200" fill="#fff5fb"/>` + ['#ffb3c8', '#ffd9a0', '#fff1a0', '#bff0d4', '#bfe0ff', '#dccbff'].map((c, i) => `<path d="M${-10 + i * 9} 200 A${110 - i * 9} ${110 - i * 9} 0 0 1 ${210 - i * 9} 200" stroke="${c}" stroke-width="9" fill="none"/>`).join(''),
  stage: () => `<rect width="200" height="200" fill="#4a3b7c"/><path d="M62 0 L18 200 L118 200 Z" fill="#fff3b0" opacity=".22"/><path d="M138 0 L82 200 L182 200 Z" fill="#fff3b0" opacity=".22"/><path d="M0 0 L42 0 Q30 100 0 200 Z" fill="#ff6f9f"/><path d="M200 0 L158 0 Q170 100 200 200 Z" fill="#ff6f9f"/><path d="M0 0 H200 V14 Q150 26 100 14 Q50 26 0 14 Z" fill="#ff8fb8"/>` + [[60, 40], [140, 36], [100, 22]].map(([x, y]) => svgStar(x, y, 4, '#ffe27a')).join(''),
  night: () => `<rect width="200" height="200" fill="#38407a"/><circle cx="162" cy="34" r="16" fill="#fff3b0"/><circle cx="170" cy="28" r="14" fill="#38407a"/>` + DECO.map(([x, y], i) => svgStar(x, y, i % 2 ? 3 : 5, '#ffe27a')).join(''),
};

const HAIR_BACK = {
  long: c => `<path d="M52 92 Q46 32 100 32 Q154 32 148 92 L154 168 Q128 182 100 176 Q72 182 46 168 Z" fill="${c}"/>`,
  wavy: c => `<path d="M52 92 Q46 32 100 32 Q154 32 148 92 Q160 110 150 128 Q162 146 150 166 Q126 180 100 172 Q74 180 50 166 Q38 146 50 128 Q40 110 52 92 Z" fill="${c}"/>`,
  bob: c => `<path d="M50 96 Q46 32 100 32 Q154 32 150 96 L152 130 Q100 142 48 130 Z" fill="${c}"/>`,
  short: c => `<path d="M54 98 Q50 34 100 34 Q150 34 146 98 L144 110 Q100 114 56 110 Z" fill="${c}"/>`,
  twin: c => `<path d="M54 98 Q50 34 100 34 Q150 34 146 98 Z" fill="${c}"/><ellipse cx="40" cy="122" rx="16" ry="38" fill="${c}"/><ellipse cx="160" cy="122" rx="16" ry="38" fill="${c}"/><circle cx="48" cy="84" r="7" fill="#ff7fa8"/><circle cx="152" cy="84" r="7" fill="#ff7fa8"/>`,
  pony: c => `<path d="M54 98 Q50 34 100 34 Q150 34 146 98 Z" fill="${c}"/><path d="M138 50 Q182 58 170 122 Q166 152 150 164 Q158 122 140 96 Z" fill="${c}"/><circle cx="142" cy="52" r="7" fill="#ff7fa8"/>`,
  bun: c => `<circle cx="100" cy="30" r="20" fill="${c}"/><path d="M54 98 Q50 38 100 38 Q150 38 146 98 Z" fill="${c}"/><path d="M84 40 Q100 34 116 40" stroke="#ff7fa8" stroke-width="5" fill="none" stroke-linecap="round"/>`,
};
const BANGS_A = c => `<path d="M55 96 Q52 44 100 44 Q148 44 145 96 Q140 74 124 66 Q116 78 100 72 Q84 80 74 68 Q60 76 55 96 Z" fill="${c}"/>`;
const BANGS_SIDE = c => `<path d="M55 98 Q50 42 102 44 Q150 46 145 94 Q132 64 100 64 Q74 66 55 98 Z" fill="${c}"/>`;
const BANGS = { long: BANGS_A, wavy: BANGS_A, bob: BANGS_A, twin: BANGS_A, short: BANGS_SIDE, pony: BANGS_SIDE, bun: BANGS_SIDE };

function svgOutfit(kind, c) {
  const body = fill => `<path d="M44 200 Q46 152 100 144 Q154 152 156 200 Z" fill="${fill}"/>`;
  const d = shade(c, -0.15), l = shade(c, 0.35);
  const neck = col => `<path d="M86 145 Q100 158 114 145" stroke="${col}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  switch (kind) {
    case 'tee': return body(c) + neck(d) + svgHeart(100, 178, 6, '#fff', 'opacity=".85"');
    case 'hoodie': return body(c) + `<path d="M72 150 Q100 134 128 150 Q118 164 100 164 Q82 164 72 150 Z" fill="${d}"/><path d="M93 160 L91 184 M107 160 L109 184" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><rect x="72" y="184" width="56" height="20" rx="9" fill="${d}" opacity=".55"/>`;
    case 'overalls': return body('#ffffff') + neck('#e8e3f0') + `<path d="M76 170 L66 150 M124 170 L134 150" stroke="${c}" stroke-width="9" stroke-linecap="round"/><rect x="70" y="164" width="60" height="40" rx="9" fill="${c}"/><circle cx="78" cy="171" r="3.5" fill="#ffd66b"/><circle cx="122" cy="171" r="3.5" fill="#ffd66b"/>` + svgHeart(100, 186, 5, l);
    case 'sailor': return body('#fbfbff') + `<path d="M70 148 L100 184 L130 148 Q100 162 70 148 Z" fill="${c}"/><path d="M76 152 L100 180 L124 152" stroke="#fff" stroke-width="2" fill="none"/><path d="M100 176 L86 168 L86 184 Z M100 176 L114 168 L114 184 Z" fill="#ff6f8f"/><circle cx="100" cy="176" r="4" fill="#ff4f7a"/>`;
    case 'star': return body(c) + neck(d) + svgStar(72, 180, 7, '#fff') + svgStar(128, 172, 6, '#fff') + svgStar(102, 192, 5, '#ffe27a') + svgStar(140, 192, 4, '#ffe27a');
    case 'dress':
    default: return body(c) + `<circle cx="58" cy="170" r="15" fill="${l}"/><circle cx="142" cy="170" r="15" fill="${l}"/><path d="M80 146 Q84 164 100 156 Q116 164 120 146 Q100 154 80 146 Z" fill="#fff"/><circle cx="100" cy="174" r="2.6" fill="#fff"/><circle cx="100" cy="186" r="2.6" fill="#fff"/>`;
  }
}

function svgEyes(kind) {
  const ink = '#3a2a3f';
  const round = x => `<ellipse cx="${x}" cy="100" rx="5.5" ry="6.5" fill="${ink}"/><circle cx="${x + 2}" cy="97.5" r="2" fill="#fff"/>`;
  const smile = x => `<path d="M${x - 7} 101 Q${x} 93 ${x + 7} 101" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
  switch (kind) {
    case 'smile': return smile(82) + smile(118);
    case 'wink': return round(82) + smile(118);
    case 'sparkle': return [82, 118].map(x => `<ellipse cx="${x}" cy="100" rx="7" ry="8.5" fill="#5b3b6e"/><circle cx="${x + 2.5}" cy="96.5" r="2.8" fill="#fff"/><circle cx="${x - 2.2}" cy="103.5" r="1.4" fill="#fff"/>`).join('') +
      `<path d="M73 95 L69 92 M127 95 L131 92" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'heart': return svgHeart(82, 101, 6, '#ff5f95') + svgHeart(118, 101, 6, '#ff5f95');
    case 'round':
    default: return round(82) + round(118);
  }
}

function svgAcc(kind, hc) {
  switch (kind) {
    case 'ribbon': return `<g transform="translate(134 52) rotate(18)"><path d="M0 0 L-18 -11 Q-23 0 -18 11 Z" fill="#ff6f9f"/><path d="M0 0 L18 -11 Q23 0 18 11 Z" fill="#ff6f9f"/><circle r="5" fill="#ff4f8a"/></g>`;
    case 'bigribbon': return `<g transform="translate(100 38)"><path d="M0 0 L-30 -17 Q-38 0 -30 17 Z" fill="#ff6f9f"/><path d="M0 0 L30 -17 Q38 0 30 17 Z" fill="#ff6f9f"/><path d="M-4 4 L-14 26 M4 4 L14 26" stroke="#ff4f8a" stroke-width="5" stroke-linecap="round"/><circle r="8" fill="#ff4f8a"/></g>`;
    case 'starpin': return svgStar(68, 64, 10, '#ffd34d', 'stroke="#fff" stroke-width="2"');
    case 'heartclip': return svgHeart(134, 62, 8, '#ff6f9f', 'stroke="#fff" stroke-width="2"');
    case 'catears': return `<path d="M56 66 L62 22 L92 46 Z" fill="${hc}"/><path d="M144 66 L138 22 L108 46 Z" fill="${hc}"/><path d="M64 56 L67 34 L82 46 Z" fill="#ffb3c8"/><path d="M136 56 L133 34 L118 46 Z" fill="#ffb3c8"/>`;
    case 'bunny': return `<g><ellipse cx="80" cy="22" rx="10" ry="28" fill="#fff" transform="rotate(-12 80 22)"/><ellipse cx="120" cy="22" rx="10" ry="28" fill="#fff" transform="rotate(12 120 22)"/><ellipse cx="80" cy="24" rx="5" ry="19" fill="#ffc2d4" transform="rotate(-12 80 24)"/><ellipse cx="120" cy="24" rx="5" ry="19" fill="#ffc2d4" transform="rotate(12 120 24)"/></g>`;
    case 'headphones': return `<path d="M50 98 Q48 28 100 28 Q152 28 150 98" stroke="#ff8fb8" stroke-width="8" fill="none" stroke-linecap="round"/><rect x="42" y="86" width="18" height="28" rx="9" fill="#ff8fb8"/><rect x="140" y="86" width="18" height="28" rx="9" fill="#ff8fb8"/>` + svgHeart(51, 100, 3.5, '#fff') + svgHeart(149, 100, 3.5, '#fff');
    case 'flowercrown': return [[60, 70], [72, 54], [88, 46], [104, 44], [120, 48], [134, 58], [142, 72]].map(([x, y], i) => svgFlower(x, y, 4.5, ['#ff9cc6', '#bba3ff', '#fff', '#ffd66b'][i % 4], i % 4 === 3 ? '#ff9cc6' : '#ffd66b')).join('');
    case 'mic': return `<path d="M50 98 Q48 28 100 28 Q152 28 150 98" stroke="#bba3ff" stroke-width="7" fill="none" stroke-linecap="round"/><rect x="141" y="88" width="16" height="24" rx="8" fill="#bba3ff"/><path d="M146 110 Q142 128 116 124" stroke="#7a5ce0" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="113" cy="124" r="5" fill="#7a5ce0"/>`;
    case 'crown': return `<path d="M72 52 L76 22 L90 38 L100 14 L110 38 L124 22 L128 52 Z" fill="#ffd66b" stroke="#f0b443" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="42" r="4" fill="#ff6f9f"/><circle cx="84" cy="45" r="3" fill="#8cc8ff"/><circle cx="116" cy="45" r="3" fill="#8cc8ff"/>`;
    default: return '';
  }
}
function svgFace(kind) {
  if (kind === 'glasses') return `<g fill="none" stroke="#7a5a8f" stroke-width="3"><circle cx="82" cy="100" r="12"/><circle cx="118" cy="100" r="12"/><path d="M94 99 Q100 95 106 99"/></g>`;
  if (kind === 'stickers') return svgStar(66, 118, 5.5, '#ffd34d') + svgHeart(134, 118, 4.5, '#ff8fb1');
  return '';
}
function svgPet(kind) {
  const ink = '#3a2a3f';
  switch (kind) {
    case 'chick': return `<g><circle cx="30" cy="178" r="17" fill="#ffe066"/><path d="M26 162 Q30 154 34 162" stroke="#ffcf1a" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="24" cy="175" r="2.2" fill="${ink}"/><circle cx="36" cy="175" r="2.2" fill="${ink}"/><path d="M27 180 L33 180 L30 185 Z" fill="#ff9f43"/><ellipse cx="20" cy="182" rx="3" ry="2" fill="#ffb3c8"/><ellipse cx="40" cy="182" rx="3" ry="2" fill="#ffb3c8"/></g>`;
    case 'cat': return `<g><ellipse cx="30" cy="190" rx="20" ry="12" fill="#f4dcc4"/><circle cx="30" cy="170" r="15" fill="#f4dcc4"/><path d="M17 164 L18 148 L29 158 Z M43 164 L42 148 L31 158 Z" fill="#f4dcc4"/><path d="M20 160 L21 152 L26 157 Z M40 160 L39 152 L34 157 Z" fill="#ffb3c8"/><circle cx="24" cy="170" r="2" fill="${ink}"/><circle cx="36" cy="170" r="2" fill="${ink}"/><path d="M28 175 Q30 177 32 175" stroke="${ink}" stroke-width="1.6" fill="none"/></g>`;
    case 'bunny': return `<g><ellipse cx="22" cy="146" rx="5.5" ry="16" fill="#fff"/><ellipse cx="38" cy="146" rx="5.5" ry="16" fill="#fff"/><ellipse cx="22" cy="147" rx="2.6" ry="11" fill="#ffc2d4"/><ellipse cx="38" cy="147" rx="2.6" ry="11" fill="#ffc2d4"/><ellipse cx="30" cy="190" rx="19" ry="12" fill="#fff"/><circle cx="30" cy="172" r="15" fill="#fff"/><circle cx="24" cy="171" r="2" fill="${ink}"/><circle cx="36" cy="171" r="2" fill="${ink}"/><ellipse cx="30" cy="176" rx="2.2" ry="1.6" fill="#ff8fb1"/></g>`;
    default: return '';
  }
}

/* 받은 코드(결과·백업)에 든 아바타 값도 앱이 아는 아이템만 쓰도록 걸러요 */
function cleanAvatar(a) {
  const out = { ...AV_DEFAULT };
  if (a && typeof a === 'object') for (const k of Object.keys(AV_DEFAULT)) {
    const v = a[k];
    if (typeof v === 'string' && CATALOG.some(it => it.cat === k && it.id === v)) out[k] = v;
  }
  return out;
}
function avatarSVG(a, cls = 'avatar') {
  a = cleanAvatar(a);
  const skin = AV.skin[a.skin] || AV.skin.light;
  const hc = AV.hairColor[a.hairColor] || AV.hairColor.brown;
  const oc = AV.outfitColor[a.outfitColor] || AV.outfitColor.pink;
  const hair = HAIR_BACK[a.hair] ? a.hair : 'long';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" class="${cls}" aria-hidden="true">` +
    (BG[a.bg] || BG.pink)() +
    HAIR_BACK[hair](hc) +
    `<rect x="89" y="120" width="22" height="28" rx="8" fill="${skin}"/><rect x="89" y="122" width="22" height="8" fill="${shade(skin, -0.15)}" opacity=".5"/>` +
    svgOutfit(a.outfit, oc) +
    `<circle cx="57" cy="100" r="8" fill="${skin}"/><circle cx="143" cy="100" r="8" fill="${skin}"/>` +
    `<ellipse cx="100" cy="92" rx="45" ry="43" fill="${skin}"/>` +
    svgEyes(a.eyes) +
    `<ellipse cx="70" cy="112" rx="7.5" ry="4.5" fill="#ff8fb1" opacity=".45"/><ellipse cx="130" cy="112" rx="7.5" ry="4.5" fill="#ff8fb1" opacity=".45"/>` +
    `<path d="M93 114 Q100 120 107 114" stroke="#c2557a" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    BANGS[hair](hc) +
    `<path d="M76 54 Q92 46 112 49" stroke="#fff" stroke-opacity=".35" stroke-width="4" fill="none" stroke-linecap="round"/>` +
    svgFace(a.face) + svgAcc(a.acc, hc) + svgPet(a.pet) +
    `</svg>`;
}

/* 정원 식물: 0 씨앗 → 5 반짝 별꽃 */
function plantSVG(level, cls = 'plant') {
  const leaf = (x, y, dir, s = 1) => `<path d="M${x} ${y} q${f1(8 * dir * s)} ${f1(-8 * s)} ${f1(15 * dir * s)} ${f1(-2 * s)} q${f1(-6 * dir * s)} ${f1(8 * s)} ${f1(-15 * dir * s)} ${f1(2 * s)} Z" fill="#7fd69a"/>`;
  const stem = hgt => `<path d="M30 40 Q28.5 ${40 - hgt / 2} 30 ${40 - hgt}" stroke="#5cbf7a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  let p = '';
  if (level <= 0) p = `<ellipse cx="30" cy="37" rx="4.5" ry="3.2" fill="#b07a55"/><path d="M28 36 Q30 34 32 36" stroke="#d6a27c" stroke-width="1" fill="none"/>`;
  else if (level === 1) p = stem(9) + leaf(30, 33, -1, 0.65) + leaf(30, 33, 1, 0.65);
  else if (level === 2) p = stem(18) + leaf(30, 34, -1) + leaf(30, 29, 1) + leaf(30, 25, -1, 0.75);
  else {
    p = stem(24) + leaf(30, 35, -1) + leaf(30, 30, 1) + leaf(30, 26, -1, 0.75);
    if (level === 3) p += `<path d="M30 6 Q23 13 30 19 Q37 13 30 6 Z" fill="#ff9cc6"/><path d="M26 17 L30 21 L34 17" stroke="#5cbf7a" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    else if (level === 4) p += svgFlower(30, 14, 5, '#ff8fb8');
    else p += svgFlower(30, 14, 5.6, '#c8a6ff', '#ffe066') + svgStar(11, 12, 4, '#ffd34d') + svgStar(49, 8, 3.2, '#ffd34d') + svgStar(50, 28, 2.4, '#ffb3d1');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" class="${cls}" aria-hidden="true">` + p +
    `<ellipse cx="30" cy="41" rx="13" ry="2.6" fill="#9b6b4f"/><path d="M17 43 L43 43 L40 57 L20 57 Z" fill="#f6a5b5"/><rect x="15" y="39.5" width="30" height="6" rx="3" fill="#f38da3"/></svg>`;
}
