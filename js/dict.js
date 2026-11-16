'use strict';
/*
 * 사전 연결
 *  - 영어: Free Dictionary API (https://dictionaryapi.dev) — 발음, 영영 뜻풀이, 예문
 *  - 영→한 뜻: MyMemory 번역 API (https://mymemory.translated.net/doc/spec.php)
 *  - 국어·한자: 위키낱말사전 (ko.wiktionary.org), 영어 위키낱말사전 (en.wiktionary.org) MediaWiki API
 *  - 한자 8급 50자는 앱 안에 들어 있습니다 (data.js).
 */
const Dict = (() => {
  const CACHE_KEY = 'bwc.cache.v1';
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

  async function lookupEn(term) {
    const r = blank(term, 'en');
    let [d, m] = await Promise.allSettled([freeDict(term), translate(term)]);
    let entries = d.status === 'fulfilled' ? d.value : null;
    if (d.status === 'rejected') r.errors.push('영어사전에 연결하지 못했어요');
    if (!entries && d.status === 'fulfilled' && !/\s/.test(term)) {
      for (const c of lemmaCandidates(term)) {
        try { entries = await freeDict(c); } catch (e) { break; }
        if (entries) { r.note = `기본형 '${c}'(으)로 찾았어요`; break; }
      }
    }
    if (entries) {
      r.found = true; r.sources.push('Free Dictionary API (dictionaryapi.dev, 위키낱말사전 기반)');
      for (const e of entries) {
        if (!r.pron) r.pron = e.phonetic || (e.phonetics || []).map(p => p.text).find(Boolean) || '';
        if (!r.audio) {
          const ps = (e.phonetics || []).filter(p => p.audio);
          r.audio = ((ps.find(p => /-us\.mp3$/.test(p.audio)) || ps[0]) || {}).audio || '';
        }
        for (const mm of e.meanings || []) {
          for (const df of mm.definitions || []) {
            if (r.defs.length < 10) r.defs.push({ pos: POS_KO[mm.partOfSpeech] || mm.partOfSpeech || '', text: df.definition });
            if (df.example && !r.examples.some(x => x.text === df.example)) r.examples.push({ text: df.example });
          }
        }
      }
    }
    if (m.status === 'fulfilled' && m.value) {
      r.meanings = koCandidates(m.value, term);
      if (r.meanings.length) { r.found = true; r.sources.push('MyMemory 번역 (mymemory.translated.net)'); }
    } else if (m.status === 'rejected') r.errors.push('한국어 뜻(번역)에 연결하지 못했어요');
    const stem = term.toLowerCase().slice(0, Math.max(3, term.length - 2));
    r.examples.sort((a, b) => (b.text.toLowerCase().includes(stem) - a.text.toLowerCase().includes(stem)) || a.text.length - b.text.length);
    r.examples = r.examples.slice(0, 8);
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

  return { lookup, detect, translate, hanjaByReading, ping, HANJA_RE };
})();
