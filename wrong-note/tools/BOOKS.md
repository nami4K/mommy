# 문제집 넣기 (Claude 작업용 절차)

문제집 PDF(스캔본)는 엄마 구글 드라이브 `nami / (스캔) / 문제집 / N학년`에 있습니다.
앱과 밤 정리는 PDF 대신 **쪽 그림**을 씁니다: Supabase(서울, `nybtgfqfrxiuqizyqbpc`)의 비공개 Storage 버킷 `books`에
`{책 id}/p{PDF 장 번호 3자리}.jpg`(쪽당 약 115KB)와 목록 `books.json`이 있습니다.

## 새 문제집을 넣을 때
1. 엄마가 PDF를 드라이브에 올리고 **잠깐 "링크가 있는 모든 사용자(뷰어)"로 공유**합니다.
   (드라이브 연결은 10MB까지만 내려받고, 공유 설정 변경·파일 만들기는 할 수 없습니다.)
2. `curl -L "https://drive.usercontent.google.com/download?id=<파일 id>&export=download&confirm=t" -o book.pdf`
   (환경 허용 주소: `drive.usercontent.google.com`) → 받으면 바로 엄마에게 공유를 꺼 달라고 말하기.
3. `python3 -I tools/sheet.py book.pdf sheet.jpg`로 전체 장 미리보기를 만들어 보고
   차례 장, 단원 첫 장, 본문 끝 장, '정답과 풀이' 첫 장을 찾습니다. 차례 장을 읽어 단원 이름과 시작 쪽을 적습니다.
   `offset = 단원 첫 장(PDF) - 차례의 시작 쪽`.
4. `python3 -I tools/pages.py book.pdf pages/<책 id>` → 각 장을 `books/<책 id>/pNNN.jpg`로 올립니다
   (`POST /storage/v1/object/books/<경로>`, `x-upsert: true`, 비밀 키는 프록시가 `apikey` 헤더에 넣음).
5. `tools/books.json`과 버킷의 `books.json`에 책을 더합니다(id, title, grade, semester, offset, mainEndPdf, answerStartPdf, units).
6. 가족 데이터 `wn_docs`에 `kind=book` 문서를 넣거나(ts는 지금 밀리초), `js/app.js`의 `PRESET_BOOKS`에 더하고 `sw.js` VERSION을 올립니다.

## 지금 들어 있는 책
| id | 책 | offset | 본문 끝 | 해설 시작 (PDF 장) |
| --- | --- | --- | --- | --- |
| b-wsc-1-1 | 왕수학 최상위 1-1 | 0 | 128 | 132 |
| b-wsc-1-2 | 왕수학 최상위 1-2 | 2 | 152 | 156 |
| b-wsc-2-1 | 왕수학 최상위 2-1 | 4 | 144 | 150 |
| b-wsc-2-2 | 왕수학 최상위 2-2 | 4 | 148 | 154 |
