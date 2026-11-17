# 밤 정리 (Claude 예약 작업 절차)

매일 새벽(한국 시간 2시 13분, 5시 13분)에 새 세션이 이 절차를 따릅니다.
엄마가 앱에 "문제집 쪽·번호"로 넣은 문제를 아이가 풀 수 있게 준비하는 일입니다.

- 도구: `python3 tools/nightly.py` (이 폴더). 비밀 키는 환경 프록시가 넣어 주므로 따로 다루지 않습니다.
- 쪽 그림은 Supabase Storage `books/{책 id}/pNNN.jpg`(NNN = PDF 장 번호). `pending`이 `pdf`(문제 장)와 `answerRange`(해설 장 범위)를 알려 줍니다.
- 토큰을 아끼려고 **한 장은 한 번만** 봅니다. 문제 장을 처음 볼 때 그 장의 모든 문제 상자를 `boxes`에,
  해설 장을 처음 볼 때 그 장에 있는 모든 쪽·번호의 정답을 `answers`에, 쪽→해설 장을 `amap`에 저장합니다.
  다음에 같은 장의 문제가 오면 `knownBox`, `knownAnswer`, `answerPdf`를 그대로 씁니다.

## 순서
1. `cd wrong-note/tools && python3 nightly.py pending` → 비어 있으면 끝(아무것도 바꾸지 않음).
2. 문제마다(같은 책·장끼리 묶어서):
   1. **문제 그림** (`need`에 img): `knownBox`가 있으면 바로 `crop`. 없으면 `page BOOK PDF`로 장을 보고,
      그 장의 **모든** 문제 번호 상자(0~1 비율, 번호와 문제 글·그림·보기를 다 포함, 다음 문제는 빼기)를 `boxes`로 저장한 뒤 `crop PID BOOK PDF x0 y0 x1 y1`.
      `crop`이 알려 주는 미리보기 그림을 열어 잘림이 없는지 확인하고, 잘렸으면 상자를 고쳐 다시 `crop`.
   2. **정답·풀이** (`need`에 answer): `knownAnswer`가 있으면 사용. 없으면 `answerPdf` 또는 해설 범위에서 쪽 순서로 짐작해 장을 보고
      ("○쪽" 머리글과 문제 번호로 찾기), 그 장에 나온 쪽들의 정답을 모두 `answers BOOK PAGE JSON`으로, 위치를 `amap BOOK PAGE PDF`로 저장.
      한 쪽 안에서 번호가 이어지는 묶음(예: Jump3 1~18번)이 있으니 쪽 머리글을 꼭 확인합니다.
   3. `update PID JSON`으로 `answer`(짧게, 여러 칸은 쉼표, 같은 뜻 다른 표기는 `|`), `solution`(해설 문장 그대로 요약),
      `answerType`(그리기·잇기·고르기 등 글로 채점하기 어려우면 `self`), `types`(js/logic.js `TYPE_GROUPS`에서 1~2개, 없으면 새 이름), `unit`(pending의 unit).
   4. `done PID` → 그림과 정답이 있으면 `ready`가 되어 아이 화면에 나옵니다.
3. 정답을 확신할 수 없으면 `answer`를 비워 두고 `update PID '{"reason":""}'`처럼 다른 칸만 채운 뒤 두세요(엄마 '확인' 탭에 남음). 지어내지 않습니다.
4. **일요일 2시 13분 실행에서만**: `python3 nightly.py summary 7`을 보고 아이마다 `report KID "메모"` 저장.
   메모는 5~8줄: 이번 주 틀린 유형과 어떻게 틀리는지(아이가 쓴 답·틀린 이유 근거), 다시 맞힌 것, 집에서 해 볼 연습 1~2개.
   아이 이름 대신 "아이"라고 쓰지 말고 summary의 이름을 씁니다. 점수 비교나 형제 비교는 쓰지 않습니다.
5. 끝에 한 줄 요약: 처리한 문제 수, 준비 완료 수, 남은 문제와 이유.

## 하지 말 것
- 문제 문서의 `kidId`, `createdAt`, `src`, 진도(`progress`)의 풀이 기록은 바꾸지 않습니다(`update`가 없을 때만 진도를 새로 만듭니다).
- 엄마 확인 전(`status: review`)인 아이 사진은 건드리지 않습니다.
- 저장소 코드는 고치지 않습니다. 고칠 점이 보이면 요약에 적기만 합니다.
