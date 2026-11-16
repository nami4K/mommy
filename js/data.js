'use strict';
/* 한자능력검정시험(한국어문회) 8급 배정한자 50자: [훈, 음, 첫소리일 때 음(두음법칙), 다른 훈음] */
const HANJA8 = {
  '校': ['학교', '교'], '敎': ['가르칠', '교'], '九': ['아홉', '구'], '國': ['나라', '국'], '軍': ['군사', '군'],
  '金': ['쇠', '금', null, '성 김'], '南': ['남녘', '남'], '女': ['계집', '녀', '여'], '年': ['해', '년', '연'], '大': ['큰', '대'],
  '東': ['동녘', '동'], '六': ['여섯', '륙', '육'], '萬': ['일만', '만'], '母': ['어미', '모'], '木': ['나무', '목'],
  '門': ['문', '문'], '民': ['백성', '민'], '白': ['흰', '백'], '父': ['아비', '부'], '北': ['북녘', '북', null, '달아날 배'],
  '四': ['넉', '사'], '山': ['메', '산'], '三': ['석', '삼'], '生': ['날', '생'], '西': ['서녘', '서'],
  '先': ['먼저', '선'], '小': ['작을', '소'], '水': ['물', '수'], '室': ['집', '실'], '十': ['열', '십'],
  '五': ['다섯', '오'], '王': ['임금', '왕'], '外': ['바깥', '외'], '月': ['달', '월'], '二': ['두', '이'],
  '人': ['사람', '인'], '一': ['한', '일'], '日': ['날', '일'], '長': ['긴', '장'], '弟': ['아우', '제'],
  '中': ['가운데', '중'], '靑': ['푸를', '청'], '寸': ['마디', '촌'], '七': ['일곱', '칠'], '土': ['흙', '토'],
  '八': ['여덟', '팔'], '學': ['배울', '학'], '韓': ['한국', '한', null, '나라 한'], '兄': ['형', '형'], '火': ['불', '화'],
};
const HANJA_ALIAS = { '教': '敎', '国': '國', '万': '萬', '青': '靑', '学': '學' };

const POS_KO = {
  noun: '명사', verb: '동사', adjective: '형용사', adverb: '부사', pronoun: '대명사',
  preposition: '전치사', conjunction: '접속사', interjection: '감탄사', exclamation: '감탄사',
  determiner: '한정사', article: '관사', numeral: '수사', phrase: '구',
};

const LANG_LABEL = { en: '영어', ko: '국어', hanja: '한자' };

/* 4지선다에서 별 단어가 모자랄 때 쓰는 오답 보기 */
const FALLBACK_MEANINGS = {
  en: ['사과', '학교', '친구', '행복한', '달리다', '예쁜', '바다', '작은', '빠른', '가족', '따뜻한', '책', '노래하다', '하늘', '용감한', '조용한', '배고픈', '나무', '기억하다', '선물'],
  ko: ['기쁘고 즐거운 마음', '몸이 아프고 괴로움', '물건을 사고파는 곳', '어떤 일을 끝까지 해냄', '말이나 행동이 바르고 착함', '서로 돕고 의지함', '매우 빠르게 움직임', '조용하고 평화로움'],
  hanja: ['나무 목', '물 수', '불 화', '흙 토', '쇠 금', '날 일', '달 월', '메 산', '사람 인', '큰 대', '작을 소', '배울 학'],
};

const STAGES = ['씨앗', '새싹', '잎새', '꽃봉오리', '꽃', '반짝 별꽃'];

/* 아바타 꾸미기: req가 없으면 처음부터 열림. 열림 조건은 '성장'에만 연결합니다. */
const CATS = [
  ['hair', '머리 모양'], ['hairColor', '머리 색'], ['eyes', '눈'], ['skin', '피부'], ['outfit', '옷'],
  ['outfitColor', '옷 색'], ['acc', '머리 장식'], ['face', '얼굴'], ['bg', '배경'], ['pet', '친구'],
];
const REQ_LABEL = {
  words: n => `별 단어 ${n}개 모으기`,
  correct: n => `정답 ${n}번`,
  nohint: n => `힌트 없이 ${n}번 맞히기`,
  sessions: n => `공부 ${n}번 하기`,
  bloom: n => `꽃 핀 단어 ${n}개`,
  master: n => `반짝 별꽃 단어 ${n}개`,
  streak: n => `${n}일 연속 공부`,
  recovered: n => `틀렸던 단어 ${n}개 이겨내기`,
  sentences: n => `말로 문장 ${n}개 만들기`,
};
const CATALOG = [
  { cat: 'hair', id: 'long', name: '긴 머리' }, { cat: 'hair', id: 'bob', name: '단발' }, { cat: 'hair', id: 'short', name: '짧은 머리' },
  { cat: 'hair', id: 'twin', name: '양갈래', req: ['words', 10] }, { cat: 'hair', id: 'pony', name: '포니테일', req: ['recovered', 5] },
  { cat: 'hair', id: 'bun', name: '똥머리', req: ['sessions', 5] }, { cat: 'hair', id: 'wavy', name: '웨이브', req: ['bloom', 10] },

  { cat: 'hairColor', id: 'brown', name: '갈색' }, { cat: 'hairColor', id: 'black', name: '검정' }, { cat: 'hairColor', id: 'choco', name: '초코' },
  { cat: 'hairColor', id: 'blonde', name: '금발', req: ['correct', 30] }, { cat: 'hairColor', id: 'red', name: '빨강', req: ['sessions', 8] },
  { cat: 'hairColor', id: 'pink', name: '분홍', req: ['correct', 100] }, { cat: 'hairColor', id: 'lav', name: '라벤더', req: ['nohint', 50] },
  { cat: 'hairColor', id: 'mint', name: '민트', req: ['streak', 5] }, { cat: 'hairColor', id: 'sky', name: '하늘', req: ['master', 10] },

  { cat: 'eyes', id: 'round', name: '동글' }, { cat: 'eyes', id: 'smile', name: '웃는 눈' },
  { cat: 'eyes', id: 'wink', name: '윙크', req: ['sessions', 3] }, { cat: 'eyes', id: 'sparkle', name: '반짝 눈', req: ['correct', 50] },
  { cat: 'eyes', id: 'heart', name: '하트 눈', req: ['nohint', 100] },

  { cat: 'skin', id: 'fair', name: '복숭아' }, { cat: 'skin', id: 'light', name: '살구' }, { cat: 'skin', id: 'tan', name: '캐러멜' },
  { cat: 'skin', id: 'brown', name: '코코아' }, { cat: 'skin', id: 'deep', name: '초콜릿' },

  { cat: 'outfit', id: 'tee', name: '티셔츠' }, { cat: 'outfit', id: 'dress', name: '원피스' },
  { cat: 'outfit', id: 'hoodie', name: '후드티', req: ['words', 20] }, { cat: 'outfit', id: 'overalls', name: '멜빵바지', req: ['sessions', 10] },
  { cat: 'outfit', id: 'sailor', name: '세일러', req: ['bloom', 5] }, { cat: 'outfit', id: 'star', name: '별 스웨터', req: ['master', 5] },

  { cat: 'outfitColor', id: 'pink', name: '분홍' }, { cat: 'outfitColor', id: 'sky', name: '하늘' }, { cat: 'outfitColor', id: 'mint', name: '민트' },
  { cat: 'outfitColor', id: 'yellow', name: '노랑', req: ['sessions', 1] }, { cat: 'outfitColor', id: 'lav', name: '라벤더', req: ['correct', 20] },
  { cat: 'outfitColor', id: 'coral', name: '코랄', req: ['nohint', 20] }, { cat: 'outfitColor', id: 'white', name: '하양', req: ['words', 30] },
  { cat: 'outfitColor', id: 'navy', name: '남색', req: ['streak', 3] },

  { cat: 'acc', id: 'none', name: '없음' }, { cat: 'acc', id: 'ribbon', name: '리본' },
  { cat: 'acc', id: 'starpin', name: '별 핀', req: ['words', 5] }, { cat: 'acc', id: 'heartclip', name: '하트 핀', req: ['correct', 10] },
  { cat: 'acc', id: 'catears', name: '고양이 귀', req: ['nohint', 10] }, { cat: 'acc', id: 'flowercrown', name: '꽃 왕관', req: ['bloom', 3] },
  { cat: 'acc', id: 'bunny', name: '토끼 귀', req: ['recovered', 3] }, { cat: 'acc', id: 'headphones', name: '헤드폰', req: ['nohint', 30] },
  { cat: 'acc', id: 'bigribbon', name: '왕리본', req: ['streak', 7] }, { cat: 'acc', id: 'mic', name: '마이크', req: ['sentences', 5] }, { cat: 'acc', id: 'crown', name: '왕관', req: ['master', 20] },

  { cat: 'face', id: 'none', name: '없음' }, { cat: 'face', id: 'glasses', name: '동글 안경', req: ['words', 15] },
  { cat: 'face', id: 'stickers', name: '볼 스티커', req: ['nohint', 40] },

  { cat: 'bg', id: 'pink', name: '분홍 물방울' }, { cat: 'bg', id: 'mint', name: '민트 하트' },
  { cat: 'bg', id: 'sky', name: '구름', req: ['sessions', 2] }, { cat: 'bg', id: 'lav', name: '별가루', req: ['words', 8] },
  { cat: 'bg', id: 'peach', name: '꽃잎', req: ['correct', 40] }, { cat: 'bg', id: 'garden', name: '꽃동산', req: ['bloom', 8] },
  { cat: 'bg', id: 'rainbow', name: '무지개', req: ['recovered', 10] }, { cat: 'bg', id: 'stage', name: '무대', req: ['sentences', 15] }, { cat: 'bg', id: 'night', name: '밤하늘', req: ['streak', 10] },

  { cat: 'pet', id: 'none', name: '없음' }, { cat: 'pet', id: 'chick', name: '병아리', req: ['recovered', 1] },
  { cat: 'pet', id: 'cat', name: '고양이', req: ['streak', 3] }, { cat: 'pet', id: 'bunny', name: '토끼', req: ['bloom', 15] },
];
