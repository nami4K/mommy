#!/usr/bin/env python3
"""다시봄 밤 정리 도구 (Claude 예약 작업이 씁니다).

가족 저장 공간(Supabase)에는 이 작업 환경의 프록시가 비밀 키를 `apikey` 헤더에 넣어 줍니다.
그래서 이 스크립트는 키를 갖고 있지 않고 'proxy-injected'라는 자리표시만 보냅니다.

명령
  pending                         정리할 문제 목록(JSON)
  page BOOK PDF                   쪽 그림을 내려받고 경로 출력 (PDF = PDF 장 번호)
  boxes BOOK PDF [JSON]           그 장의 문제 상자 보기/저장. JSON = {"4":[x0,y0,x1,y1], ...} (0~1 비율)
  answers BOOK PAGE [JSON]        그 책 쪽의 정답 보기/저장. JSON = {"4":{"answer":"..","solution":"..","type":"auto|self"}}
  amap BOOK [PAGE PDF]            해설 위치 보기/저장 (책 쪽 → 해설 PDF 장)
  crop PID BOOK PDF x0 y0 x1 y1   문제 그림 잘라 올리고 문제에 연결 (미리보기 경로 출력)
  update PID JSON                 문제 문서에 필드 합치기 (answer, solution, answerType, types, unit, status ...)
  done PID                        정답·그림이 있으면 status=ready로
  summary [DAYS]                  주간 메모용 요약(JSON)
  report KID TEXT                 주간 분석 메모 저장
"""
import sys, os, json, time, base64, subprocess, datetime, io

URL = 'https://nybtgfqfrxiuqizyqbpc.supabase.co'
CACHE = os.path.expanduser('~/.cache/dasibom')
os.makedirs(CACHE, exist_ok=True)


def curl(method, path, body=None, ctype='application/json', headers=(), out=None):
    cmd = ['curl', '-sS', '-X', method, URL + path, '-H', 'apikey: proxy-injected', '-w', '\n%{http_code}']
    for h in headers:
        cmd += ['-H', h]
    if body is not None:
        cmd += ['-H', 'Content-Type: ' + ctype, '--data-binary', '@-']
    if out:
        cmd += ['-o', out]
    r = subprocess.run(cmd, input=body if isinstance(body, bytes) else (body.encode() if body else None), capture_output=True)
    text = r.stdout.decode('utf-8', 'replace')
    txt, _, code = text.rpartition('\n')
    if not code.isdigit() or int(code) >= 300:
        raise SystemExit(f'HTTP {code} {path}: {txt[:300]} {r.stderr.decode()[:200]}')
    return txt


def rest(method, path, data=None, prefer=None):
    hs = [f'Prefer: {prefer}'] if prefer else []
    t = curl(method, '/rest/v1/' + path, json.dumps(data, ensure_ascii=False) if data is not None else None, headers=hs)
    return json.loads(t) if t.strip() else None


def family():
    rows = rest('GET', 'wn_family?select=id')
    if len(rows) != 1:
        raise SystemExit(f'가족이 {len(rows)}개예요. 하나여야 해요.')
    return rows[0]['id']


def docs(kind, extra=''):
    return rest('GET', f'wn_docs?select=id,data,ts,deleted&kind=eq.{kind}&deleted=eq.false{extra}')


def put_doc(fam, kind, did, data):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    row = {'family_id': fam, 'kind': kind, 'id': did, 'data': {**data, 'id': did}, 'ts': int(time.time() * 1000), 'deleted': False, 'updated_at': now}
    rest('POST', 'wn_docs?on_conflict=family_id,kind,id', [row], prefer='resolution=merge-duplicates,return=minimal')


def get_doc(kind, did):
    r = rest('GET', f'wn_docs?select=data&kind=eq.{kind}&id=eq.{did}')
    return r[0]['data'] if r else None


# ---------- 책 정보와 저장소의 작은 JSON들 ----------
def storage_json(name, default):
    p = os.path.join(CACHE, name)
    try:
        curl('GET', f'/storage/v1/object/books/{name}', out=p)
        return json.load(open(p))
    except SystemExit:
        return default


def save_storage_json(name, obj):
    curl('POST', f'/storage/v1/object/books/{name}', json.dumps(obj, ensure_ascii=False, indent=1), headers=['x-upsert: true'])


def books():
    return {b['id']: b for b in storage_json('books.json', {'books': []})['books']}


def pdf_of(book, page):
    return int(page) + int(book['offset'])


def unit_of(book, page):
    for u in book.get('units', []):
        if u['from'] <= int(page) <= u['to']:
            return u['name']
    return ''


def page_image(book_id, pdf):
    p = os.path.join(CACHE, book_id, f'p{int(pdf):03d}.jpg')
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        curl('GET', f'/storage/v1/object/books/{book_id}/p{int(pdf):03d}.jpg', out=p)
    return p


# ---------- 명령 ----------
def cmd_pending():
    bk = books()
    boxes = storage_json('boxes.json', {})
    answers = storage_json('answers.json', {})
    amap = storage_json('answer-map.json', {})
    out = []
    for r in docs('problem'):
        p = r['data']
        need = []
        if p.get('status') == 'review':
            continue  # 아이가 보낸 사진: 엄마 확인이 먼저
        if not (p.get('img') or p.get('pageImg') or (p.get('text') or '').strip()):
            need.append('img')
        if p.get('answerType') != 'self' and not (p.get('answer') or '').strip():
            need.append('answer')
        if not p.get('types'):
            need.append('types')
        if not p.get('unit'):
            need.append('unit')
        if not need:
            continue
        src = p.get('src') or {}
        item = {'id': p['id'], 'kidId': p.get('kidId'), 'need': need, 'src': src, 'status': p.get('status'),
                'img': p.get('img'), 'text': (p.get('text') or '')[:200], 'answer': p.get('answer', '')}
        b = bk.get(src.get('bookId'))
        if b and src.get('page'):
            pdf = pdf_of(b, src['page'])
            item.update(book=b['title'], pdf=pdf, unit=unit_of(b, src['page']),
                        knownBox=(boxes.get(b['id'], {}).get(str(pdf), {}) or {}).get(str(src.get('num'))),
                        knownAnswer=(answers.get(b['id'], {}).get(str(src['page']), {}) or {}).get(str(src.get('num'))),
                        answerPdf=amap.get(b['id'], {}).get(str(src['page'])),
                        answerRange=[b['answerStartPdf'], b['pdfPages']])
        out.append(item)
    print(json.dumps(out, ensure_ascii=False, indent=1))


def cmd_page(book_id, pdf):
    print(page_image(book_id, pdf))


def merge_json(name, book_id, key, value):
    allj = storage_json(name, {})
    cur = allj.setdefault(book_id, {}).setdefault(str(key), {})
    cur.update(json.loads(value))
    save_storage_json(name, allj)
    return cur


def cmd_boxes(book_id, pdf, value=None):
    if value:
        print(json.dumps(merge_json('boxes.json', book_id, pdf, value), ensure_ascii=False))
    else:
        print(json.dumps(storage_json('boxes.json', {}).get(book_id, {}).get(str(pdf), {}), ensure_ascii=False))


def cmd_answers(book_id, page, value=None):
    if value:
        print(json.dumps(merge_json('answers.json', book_id, page, value), ensure_ascii=False))
    else:
        print(json.dumps(storage_json('answers.json', {}).get(book_id, {}).get(str(page), {}), ensure_ascii=False))


def cmd_amap(book_id, page=None, pdf=None):
    allj = storage_json('answer-map.json', {})
    if page and pdf:
        allj.setdefault(book_id, {})[str(page)] = int(pdf)
        save_storage_json('answer-map.json', allj)
    print(json.dumps(allj.get(book_id, {}), ensure_ascii=False))


def cmd_crop(pid, book_id, pdf, x0, y0, x1, y1):
    from PIL import Image
    im = Image.open(page_image(book_id, pdf)).convert('RGB')
    W, H = im.size
    box = [float(x0) * W, float(y0) * H, float(x1) * W, float(y1) * H]
    box = [max(0, int(box[0])), max(0, int(box[1])), min(W, int(box[2])), min(H, int(box[3]))]
    c = im.crop(box)
    sc = min(1.0, 1400 / max(c.size))
    if sc < 1:
        c = c.resize((int(c.size[0] * sc), int(c.size[1] * sc)))
    b = io.BytesIO()
    c.save(b, 'JPEG', quality=84)
    prev = os.path.join(CACHE, f'crop-{pid}.jpg')
    open(prev, 'wb').write(b.getvalue())
    fam = family()
    img_id = 'img_n' + base64.b32encode(os.urandom(6)).decode().lower().rstrip('=')
    rest('POST', 'wn_images', [{'family_id': fam, 'id': img_id, 'mime': 'image/jpeg', 'b64': base64.b64encode(b.getvalue()).decode()}], prefer='return=minimal')
    p = get_doc('problem', pid)
    old = p.get('img')
    p['img'] = img_id
    put_doc(fam, 'problem', pid, p)
    if old and old.startswith('img_n'):
        rest('DELETE', f'wn_images?id=eq.{old}')
    print(json.dumps({'img': img_id, 'preview': prev, 'bytes': len(b.getvalue())}))


def new_progress(p):
    created = datetime.datetime.fromtimestamp((p.get('createdAt') or time.time() * 1000) / 1000)
    due = (created + datetime.timedelta(days=1)).strftime('%Y-%m-%d')
    return {'kidId': p.get('kidId'), 'wrong': 1, 'streak': 0, 'due': due, 'freq': False, 'grad': False, 'hist': []}


def cmd_update(pid, value):
    fam = family()
    p = get_doc('problem', pid)
    if not p:
        raise SystemExit('그 문제가 없어요: ' + pid)
    p.update(json.loads(value))
    put_doc(fam, 'problem', pid, p)
    if not get_doc('progress', pid):
        put_doc(fam, 'progress', pid, new_progress(p))
    print(json.dumps({k: p.get(k) for k in ('status', 'answer', 'answerType', 'types', 'unit', 'img')}, ensure_ascii=False))


def cmd_done(pid):
    p = get_doc('problem', pid)
    content = p.get('img') or p.get('pageImg') or (p.get('text') or '').strip()
    answer = p.get('answerType') == 'self' or (p.get('answer') or '').strip()
    if p.get('createdBy') == 'kid' and not p.get('approved'):
        status = 'review'
    else:
        status = 'ready' if content and answer else 'pending'
    cmd_update(pid, json.dumps({'status': status}))


def cmd_summary(days='7'):
    since = (time.time() - int(days) * 86400) * 1000
    probs = {r['id']: r['data'] for r in docs('problem')}
    progs = {r['id']: r['data'] for r in docs('progress')}
    settings = (get_doc('settings', 'main') or {})
    kids = {k['id']: k['name'] for k in settings.get('kids', [])}
    out = {}
    for pid, p in probs.items():
        g = progs.get(pid) or {}
        recent = [h for h in g.get('hist', []) if h.get('t', 0) >= since]
        k = out.setdefault(kids.get(p.get('kidId'), p.get('kidId')), [])
        k.append({'label': f"{(p.get('src') or {}).get('page', '')}쪽 {(p.get('src') or {}).get('num', '')}번", 'unit': p.get('unit'), 'types': p.get('types'),
                  'wrong': g.get('wrong'), 'freq': g.get('freq'), 'grad': g.get('grad'), 'reasonTags': g.get('reasonTags'),
                  'recent': [{'ok': h.get('ok'), 'a': h.get('a'), 'h': h.get('h')} for h in recent], 'answer': p.get('answer')})
    print(json.dumps({'kidIds': {v: k for k, v in kids.items()}, 'byKid': out}, ensure_ascii=False, indent=1))


def cmd_report(kid_id, text):
    put_doc(family(), 'report', kid_id, {'text': text, 'at': int(time.time() * 1000)})
    print('saved')


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)
    fn = globals().get('cmd_' + sys.argv[1])
    if not fn:
        raise SystemExit('모르는 명령: ' + sys.argv[1])
    fn(*sys.argv[2:])
