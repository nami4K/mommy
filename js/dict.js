'use strict';
/*
 * 사전 연결
 *  - 영어: Free Dictionary API (https://dictionaryapi.dev) — 발음, 영영 뜻풀이, 예문
 *  - 영→한 뜻: MyMemory 번역 API (https://mymemory.translated.net/doc/spec.php)
 *  - 국어·한자: 위키낱말사전 (ko.wiktionary.org), 영어 위키낱말사전 (en.wiktionary.org) MediaWiki API
 *  - 한자 8급 50자는 앱 안에 들어 있습니다 (data.js).
 */
const Dict = (() => {
  const CACHE_KEY = 'bwc.cache.v2'; // v2: 영어 뜻을 품사별로 저장
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { cache = {}; }
  function saveCache() {
    try {
      const keys = Object.keys(cache);
      if (keys.length > 300) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - 300).forEach(k => delete cache[k]);
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* 저장 공간 부족 등은 무시 */ }
  }

  async function getJSON(url, ms = 9000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) return { _status: r.status };
      return await r.json();
    } finally { clearTimeout(t); }
  }

  const HANJA_RE = /[㐀-鿿豈-﫿]/;
  function detect(term) {
    if (HANJA_RE.test(term)) return 'hanja';
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(term)) return 'ko';
    return 'en';
  }

  async function lookup(term, lang) {
    term = (term || '').trim();
    lang = lang || detect(term);
    const key = lang + ':' + term.toLowerCase();
    const hit = cache[key];
    if (hit && Date.now() - hit.t < 30 * 864e5) return hit.r;
    let r;
    if (lang === 'en') r = await lookupEn(term);
    else if (lang === 'ko') r = await lookupKo(term);
    else r = await lookupHanja(term);
    if (r && r.found) { cache[key] = { t: Date.now(), r }; saveCache(); }
    return r;
  }

  function blank(term, lang) {
    return { term, lang, found: false, pron: '', audio: '', meanings: [], defs: [], examples: [], parts: [], hanja: '', reading: '', note: '', sources: [], errors: [] };
  }

  /* ---------- 영어 ---------- */
  async function freeDict(word) {
    const j = await getJSON('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word.toLowerCase()));
    return Array.isArray(j) ? j : null;
  }
  function lemmaCandidates(t) {
    const w = t.toLowerCase(), out = [];
    const add = s => { if (s && s.length > 1 && s !== w && !out.includes(s)) out.push(s); };
    if (/ies$/.test(w)) add(w.replace(/ies$/, 'y'));
    if (/ied$/.test(w)) add(w.replace(/ied$/, 'y'));
    if (/es$/.test(w)) add(w.replace(/es$/, ''));
    if (/s$/.test(w)) add(w.replace(/s$/, ''));
    if (/ed$/.test(w)) { add(w.replace(/ed$/, '')); add(w.replace(/d$/, '')); add(w.replace(/(.)\1ed$/, '$1')); }
    if (/ing$/.test(w)) { add(w.replace(/ing$/, '')); add(w.replace(/ing$/, 'e')); add(w.replace(/(.)\1ing$/, '$1')); }
    if (/er$/.test(w)) add(w.replace(/er$/, ''));
    if (/est$/.test(w)) add(w.replace(/est$/, ''));
    return out.slice(0, 5);
  }
  async function translate(text, pair = 'en|ko') {
    const j = await getJSON('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + encodeURIComponent(pair));
    return j && j.responseData ? j : null;
  }
  function koCandidates(j, term) {
    const out = [];
    const push = s => {
      if (!s) return;
      s = String(s).replace(/[.。!?"“”'‘’]/g, '').replace(/\s+/g, ' ').trim();
      if (!/[가-힣]/.test(s) || /MYMEMORY|QUERY|LIMIT/i.test(s) || s.length > 24) return;
      if (!out.includes(s)) out.push(s);
    };
    push(j.responseData && j.responseData.translatedText);
    for (const m of (j.matches || [])) {
      if (String(m.segment || '').trim().toLowerCase() === term.toLowerCase()) push(m.translation);
    }
    return out.slice(0, 6);
  }

  /* ---------- 영어 → 한국어 뜻: 영어 위키낱말사전 번역표(품사·뜻별) ---------- */
  const EN_POS = /^(={3,6})\s*(Noun|Verb|Adjective|Adverb|Pronoun|Preposition|Conjunction|Interjection|Determiner|Numeral|Article|Particle|Phrase|Prepositional phrase|Proper noun|Idiom|Contraction)\s*\1\s*$/i;
  // 아이에게 맞지 않는 뜻은 뺍니다 (번역표의 영어 설명으로 거름)
  const ADULT = /sex|sexual|erotic|porn|obscen|vulgar|offensive|derogator|slur|prostitut|genital|masturb|fuck|intercourse|orgasm|fetish|narcotic/i;
  function englishSection(wt) {
    const i = wt.search(/^==\s*English\s*==\s*$/m);
    if (i < 0) return '';
    const rest = wt.slice(i + 4), j = rest.search(/^==[^=]/m);
    return j >= 0 ? rest.slice(0, j) : rest;
  }
  function koFromLine(ln) {
    if (/\{\{(?:q|qual|qualifier|i)\|[^}]*\b(prefix|suffix)\b/i.test(ln)) return [];
    const out = [];
    for (const m of ln.matchAll(/\{\{tt?\+?\|ko\|((?:[^{}]|\{\{[^{}]*\}\})*?)\}\}/g)) {
      let v = m[1].replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').split('|')[0];
      v = v.replace(/\([㐀-鿿豈-﫿]+\)/g, '').replace(/([가-힣])-([가-힣])/g, '$1$2').replace(/\s+/g, ' ').trim();
      if (v && /[가-힣]/.test(v) && !out.includes(v)) out.push(v);
    }
    return out;
  }
  function cleanGloss(g) {
    const pos = g.split('|').filter(x => !/^\s*[\w-]+\s*=/.test(x));
    return (pos[0] || '').replace(/'{2,}/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/^[\d.]+\s*/, '').trim();
  }
  function parseEnTrans(wt) {
    const out = []; let cur = null, lvl = 99, gloss = null;
    for (const ln of englishSection(wt).split('\n')) {
      const hm = ln.match(/^(=+)\s*(.+?)\s*=+\s*$/);
      if (hm) {
        const pm = ln.match(EN_POS);
        if (pm) { cur = { key: pm[2].toLowerCase(), senses: [], sub: false }; out.push(cur); lvl = pm[1].length; }
        else if (hm[1].length <= lvl) { cur = null; lvl = 99; }
        gloss = null; continue;
      }
      if (!cur) continue;
      if (/\{\{see translation subpage/.test(ln)) cur.sub = true;
      if (/\{\{(?:trans-top-see|checktrans-top)/.test(ln)) { gloss = null; continue; }
      const tm = ln.match(/\{\{trans-top(?:-also)?\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/);
      if (tm) gloss = cleanGloss(tm[1]);
      if (/\{\{trans-bottom/.test(ln)) { gloss = null; continue; }
      if (gloss !== null && /^\*:?\s*Korean\s*:/.test(ln) && !ADULT.test(gloss)) {
        const ko = koFromLine(ln);
        if (ko.length) cur.senses.push({ gloss, ko });
      }
    }
    return out;
  }
  /* 형용사 기본형 → 꾸미는 꼴 (가볍다 → 가벼운, 밝다 → 밝은, 행복하다 → 행복한, 빨갛다 → 빨간) */
  function toAdnominal(w) {
    const m = w.match(/^(.*?)([가-힣])다$/);
    if (!m) return w;
    const [, head, last] = m;
    if (/[있없]$/.test(last)) return head + last + '는';
    const c = last.charCodeAt(0) - 0xAC00, jong = c % 28, base = last.charCodeAt(0) - jong;
    const ch = n => String.fromCharCode(base + n);
    if (jong === 0) return head + ch(4);                                  // 예쁘다 → 예쁜, 행복하다 → 행복한
    if (jong === 8) return head + ch(4);                                  // ㄹ: 길다 → 긴
    if (jong === 17 && last !== '좁') return head + ch(0) + '운';         // ㅂ: 가볍다 → 가벼운 (좁다는 좁은)
    if (jong === 27 && last !== '좋') return head + ch(4);                // ㅎ: 빨갛다 → 빨간 (좋다는 좋은)
    return head + last + '은';                                            // 밝다 → 밝은, 작다 → 작은
  }
  async function koByPos(word) {
    const wt = await wikitext('en.wiktionary.org', word);
    if (!wt) return [];
    let list = parseEnTrans(wt);
    if (list.some(x => x.sub)) {
      try {
        const sub = await wikitext('en.wiktionary.org', word + '/translations');
        if (sub) {
          const sl = parseEnTrans(sub);
          for (const x of list) if (x.sub) { const y = sl.find(z => z.key === x.key); if (y) x.senses = y.senses.concat(x.senses); }
        }
      } catch (e) { /* 번역 하위 문서를 못 받아도 본문 것만 씁니다 */ }
    }
    // 같은 품사(어원이 달라 두 번 나온 것)는 합치고, 품사마다 뜻은 6개까지
    const merged = [];
    for (const x of list) {
      let g = merged.find(z => z.key === x.key);
      if (!g) { g = { key: x.key, label: POS_KO[x.key] || x.key, ko: [], glosses: [] }; merged.push(g); }
      for (const s of x.senses) for (const k0 of s.ko) { const k = x.key === 'adjective' ? k0.split(' ').map((t, i, a) => i === a.length - 1 ? toAdnominal(t) : t).join(' ') : k0; if (!g.ko.includes(k) && g.ko.length < 6) { g.ko.push(k); g.glosses.push(s.gloss); } }
    }
    return merged.filter(g => g.ko.length);
  }

  async function lookupEn(term) {
    const r = blank(term, 'en');
    r.posGroups = [];
    let [d, k] = await Promise.allSettled([freeDict(term), koByPos(term.toLowerCase())]);
    let entries = d.status === 'fulfilled' ? d.value : null;
    let groups = k.status === 'fulfilled' ? k.value : [];
    if (d.status === 'rejected') r.errors.push('영어사전에 연결하지 못했어요');
    if (!entries && d.status === 'fulfilled' && !/\s/.test(term)) {
      for (const c of lemmaCandidates(term)) {
        try { entries = await freeDict(c); } catch (e) { break; }
        if (entries) {
          r.note = `기본형 '${c}'(으)로 찾았어요`;
          if (!groups.length) { try { groups = await koByPos(c); } catch (e) { } }
          break;
        }
      }
    }
    // 영영 뜻풀이와 예문을 품사별로 모읍니다
    const byPos = {};
    if (entries) {
      r.found = true; r.sources.push('Free Dictionary API (dictionaryapi.dev)');
      for (const e of entries) {
        if (!r.pron) r.pron = e.phonetic || (e.phonetics || []).map(p => p.text).find(Boolean) || '';
        if (!r.audio) {
          const ps = (e.phonetics || []).filter(p => p.audio);
          r.audio = ((ps.find(p => /-us\.mp3$/.test(p.audio)) || ps[0]) || {}).audio || '';
        }
        for (const mm of e.meanings || []) {
          const key = (mm.partOfSpeech || '').toLowerCase();
          const b = byPos[key] ||= { defs: [], ex: [] };
          for (const df of mm.definitions || []) {
            if (b.defs.length < 2) b.defs.push(df.definition);
            if (df.example && !b.ex.includes(df.example)) b.ex.push(df.example);
          }
        }
      }
    }
    if (groups.length) { r.found = true; r.sources.push('영어 위키낱말사전 번역표 (en.wiktionary.org, CC BY-SA)'); }
    for (const g of groups) { g.defs = (byPos[g.key] || {}).defs || []; }
    for (const key of Object.keys(byPos)) if (!groups.some(g => g.key === key)) groups.push({ key, label: POS_KO[key] || key, ko: [], glosses: [], defs: byPos[key].defs });
    r.posGroups = groups;
    r.defs = groups.flatMap(g => g.defs.map(t => ({ pos: g.label, text: t })));
    // 예문: 품사마다 하나씩 돌아가며 고르기 (화면에는 3개, 힌트용으로 6개까지 저장)
    const stem = term.toLowerCase().slice(0, Math.max(3, term.length - 2));
    const pools = groups.map(g => ((byPos[g.key] || {}).ex || []).slice().sort((a, b) => (b.toLowerCase().includes(stem) - a.toLowerCase().includes(stem)) || a.length - b.length).map(t => ({ text: t, pos: g.label })));
    for (let i = 0; r.examples.length < 6 && pools.some(p => p[i]); i++) for (const p of pools) if (p[i] && r.examples.length < 6) r.examples.push(p[i]);
    // 한국어 뜻: 품사마다 첫 뜻을 기본으로 (위키낱말사전에 없을 때만 기계 번역)
    r.meanings = groups.filter(g => g.ko.length).slice(0, 3).map(g => g.ko[0]);
    if (!r.meanings.length) {
      try {
        const m = await translate(term);
        if (m) { r.meanings = koCandidates(m, term); r.machine = true; if (r.meanings.length) { r.found = true; r.sources.push('MyMemory 기계 번역 (mymemory.translated.net)'); } }
      } catch (e) { r.errors.push('한국어 뜻(번역)에 연결하지 못했어요'); }
    }
    return r;
  }

  /* ---------- 위키낱말사전 ---------- */
  async function wikitext(host, title) {
    const j = await getJSON(`https://${host}/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*`);
    return j && j.parse && typeof j.parse.wikitext === 'string' ? j.parse.wikitext : null;
  }
  function cleanWiki(s) {
    s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
    s = s.replace(/\[\[(?:분류|Category|파일|File|그림|Image):[^\]]*\]\]/gi, '');
    for (let i = 0; i < 3; i++) {
      s = s.replace(/\{\{(?:lang|l|m|ko-l)\|[^|{}]*\|([^|{}]*)[^{}]*\}\}/g, '$1');
      s = s.replace(/\{\{w\|([^|{}]*)[^{}]*\}\}/g, '$1');
      s = s.replace(/\{\{[^{}]*\}\}/g, '');
    }
    s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:[^\s\]]+\s([^\]]+)\]/g, '$1');
    s = s.replace(/'{2,}/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return s.replace(/^[\s:;,.·-]+/, '').trim();
  }
  function parseKoWiki(wt) {
    const secs = [];
    let cur = null, sub = '';
    for (const ln of wt.split('\n')) {
      let m = ln.match(/^==\s*([^=].*?)\s*==\s*$/);
      if (m) { cur = { title: cleanWiki(m[1]), defs: [], ex: [], raw: '' }; secs.push(cur); sub = ''; continue; }
      m = ln.match(/^={3,}\s*(.+?)\s*={3,}\s*$/);
      if (m) { sub = cleanWiki(m[1]); continue; }
      if (!cur) { cur = { title: '', defs: [], ex: [], raw: '' }; secs.push(cur); }
      cur.raw += ln + '\n';
      m = ln.match(/^#+[:*]+\s*(.+)$/);
      if (m) { const t = cleanWiki(m[1]); if (t && cur.ex.length < 6) cur.ex.push(t); continue; }
      m = ln.match(/^#+\s*(.+)$/);
      if (m) { const t = cleanWiki(m[1]); if (t && t.length > 1 && cur.defs.length < 8) cur.defs.push({ pos: /뜻|어원|발음|참고/.test(sub) ? '' : sub, text: t }); }
    }
    return secs;
  }
  function pickSection(secs, prefer) {
    for (const p of prefer) { const s = secs.find(x => x.title.includes(p) && x.defs.length); if (s) return s; }
    return secs.find(x => x.defs.length) || null;
  }

  async function lookupKo(term) {
    const r = blank(term, 'ko');
    let wt = null;
    try { wt = await wikitext('ko.wiktionary.org', term); } catch (e) { r.errors.push('국어사전(위키낱말사전)에 연결하지 못했어요'); }
    if (wt) {
      const sec = pickSection(parseKoWiki(wt), ['한국어']);
      if (sec) {
        r.found = true; r.sources.push('위키낱말사전 (ko.wiktionary.org, CC BY-SA)');
        r.defs = sec.defs.slice(0, 6);
        r.examples = sec.ex.filter(x => x.includes(term.slice(0, Math.max(1, term.length - 1)))).map(text => ({ text }));
        const hm = sec.raw.match(/[㐀-鿿豈-﫿]{1,8}/);
        if (hm) r.hanja = hm[0];
        r.meanings = r.defs.slice(0, 4).map(d => { const t = d.text.replace(/[.。]$/, ''); return t.length > 40 ? t.slice(0, 40) + '…' : t; });
      }
    }
    if (!r.found && /다$/.test(term) === false && /[었았했겠]|[요니까]$/.test(term)) r.note = "'-다'로 끝나는 기본형(예: 먹었어요 → 먹다)으로 찾아보세요";
    return r;
  }

  /* ---------- 한자 ---------- */
  function fromHanja8(ch) {
    const k = HANJA_ALIAS[ch] || ch, e = HANJA8[k];
    if (!e) return null;
    return { ch, hun: `${e[0]} ${e[1]}` + (e[3] ? `, ${e[3]}` : ''), eum: e[1], eum1: e[2] || e[1], src: '8급' };
  }
  async function hanjaFromEnWiki(ch) {
    const wt = await wikitext('en.wiktionary.org', ch);
    if (!wt) return null;
    const i = wt.search(/^==\s*Korean\s*==\s*$/m);
    if (i < 0) return null;
    let sec = wt.slice(i + 4);
    const j = sec.search(/^==[^=]/m);
    if (j >= 0) sec = sec.slice(0, j);
    const m = sec.match(/\{\{ko-hanja\b([^{}]*)\}\}/);
    if (!m) return null;
    const hangul = s => (s.match(/[가-힣]+/g) || []).join(' ');
    let hun = '', eum = '', pair = '';
    const pos = [];
    for (const p of m[1].split('|').slice(1).map(s => s.trim())) {
      const kv = p.match(/^([\w-]+)\s*=\s*(.*)$/);
      if (kv) {
        const k = kv[1], v = hangul(kv[2]);
        if (/^eumhun\d*$/.test(k) && !pair) pair = v;
        else if (/^hun\d*$/.test(k) && !hun) hun = v;
        else if (/^eum\d*$/.test(k) && !eum) eum = v;
      } else if (/[가-힣]/.test(p)) pos.push(hangul(p));
    }
    let text = hun && eum ? `${hun} ${eum}` : pair || (pos.length >= 2 ? `${pos[0]} ${pos[1]}` : pos[0] || '');
    text = text.trim();
    if (!text) return null;
    const syl = text.split(/\s+/).pop();
    return { ch, hun: text, eum: syl.slice(-1), eum1: syl.slice(-1), src: 'en.wiktionary' };
  }

  async function lookupHanja(term) {
    const r = blank(term, 'hanja');
    const chars = [...term].filter(c => HANJA_RE.test(c)).slice(0, 6);
    const parts = await Promise.all(chars.map(async ch => {
      const local = fromHanja8(ch);
      if (local) return local;
      try { return (await hanjaFromEnWiki(ch)) || { ch, hun: '', eum: '' }; }
      catch (e) { r.errors.push('한자 사전에 연결하지 못했어요'); return { ch, hun: '', eum: '' }; }
    }));
    r.parts = parts;
    if (parts.some(p => p.hun)) { r.found = true; }
    if (parts.some(p => p.src === '8급')) r.sources.push('앱에 들어 있는 한자 8급 50자');
    if (parts.some(p => p.src === 'en.wiktionary')) r.sources.push('영어 위키낱말사전 (en.wiktionary.org, CC BY-SA)');
    if (parts.length && parts.every(p => p.eum)) r.reading = parts.map((p, i) => i === 0 ? p.eum1 || p.eum : p.eum).join('');

    if (chars.length === 1) {
      if (parts[0].hun) r.meanings = [parts[0].hun];
    } else if (r.reading) {
      r.meanings.push(r.reading);
    }
    // 한자 단어(학교 → 學校)는 음으로 국어사전 뜻풀이를 덧붙입니다.
    const tasks = [];
    if (chars.length > 1 && r.reading) tasks.push(lookupKo(r.reading).catch(() => null));
    tasks.push(wikitext('ko.wiktionary.org', term).catch(() => null));
    const [ko, wt] = chars.length > 1 && r.reading ? await Promise.all(tasks) : [null, await tasks[0]];
    if (ko && ko.found) {
      r.defs = ko.defs.slice(0, 4);
      r.examples = ko.examples;
      ko.defs.slice(0, 2).forEach(d => r.meanings.push(`${r.reading} (${d.text.length > 30 ? d.text.slice(0, 30) + '…' : d.text})`));
      r.found = true;
      r.sources.push('위키낱말사전 (ko.wiktionary.org, CC BY-SA)');
    }
    if (wt) {
      const sec = pickSection(parseKoWiki(wt), ['한국어', '한자']);
      if (sec && !r.defs.length) {
        r.defs = sec.defs.slice(0, 4);
        r.found = true;
        if (!r.sources.some(s => s.startsWith('위키낱말사전'))) r.sources.push('위키낱말사전 (ko.wiktionary.org, CC BY-SA)');
      }
    }
    r.meanings = [...new Set(r.meanings)].slice(0, 5);
    return r;
  }

  /* 음(한글)으로 8급 한자 찾기 */
  function hanjaByReading(syl) {
    const out = [];
    for (const [ch, e] of Object.entries(HANJA8)) if (e[1] === syl || e[2] === syl || (e[3] || '').endsWith(syl)) out.push({ ch, hun: `${e[0]} ${e[1]}` + (e[3] ? `, ${e[3]}` : '') });
    return out;
  }

  /* 사전 연결 점검 (패밀리 링크·네트워크 막힘 확인용) */
  async function ping(kind) {
    try {
      if (kind === 'en') return !!(await freeDict('apple'));
      if (kind === 'tr') { const j = await translate('apple'); return !!(j && j.responseData); }
      if (kind === 'ko') return !!(await wikitext('ko.wiktionary.org', '사과'));
      if (kind === 'enwiki') return !!(await wikitext('en.wiktionary.org', '水'));
    } catch (e) { return false; }
    return false;
  }

  /* AI 사전 결과처럼 나중에 덧붙인 내용도 저장해 둡니다 */
  function remember(r) { if (r && r.found) { cache[r.lang + ':' + r.term.toLowerCase()] = { t: Date.now(), r }; saveCache(); } }
  return { lookup, detect, translate, hanjaByReading, ping, remember, parseEnTrans, koFromLine, toAdnominal, HANJA_RE };
})();
