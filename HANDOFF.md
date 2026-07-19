# 작업 인수인계 메모 (2026-07-20 기준)

다른 컴퓨터/새 대화에서 이 프로젝트를 이어받을 때 빠르게 맥락을 잡기 위한 문서.
설치/배포 절차는 [README.md](README.md) 참고, 여기는 "지금까지 뭘 했고 왜 했는지" 위주.

## 배포 현황

- **프로덕션 URL**: https://favorjewelry-product.vercel.app (Vercel, `hi5gol-lgtms-projects` 팀)
- **Google Apps Script**: 내부용/셀러용 스프레드시트 2개를 `openById`로 여는 독립 프로젝트. 코드는 [apps-script/Code.gs](apps-script/Code.gs)와 항상 동일해야 함 — **Apps Script는 CLI 배포가 없어서 script.google.com 에디터에 수동으로 붙여넣고 재배포해야 반영됨** (Vercel처럼 git push로 자동 배포 안 됨).
- git 원격 저장소는 아직 없음 (로컬 전용). 다른 컴퓨터에서 이어받으려면 GitHub 등에 push 필요.

## 최근 작업: 상품설명(productDescription) 필드 추가

폼 → 내부용 시트 → 셀러용 시트 세 군데 다 상품설명이 들어가야 한다는 요구로 시작.

**겪었던 문제와 원인:**

1. 내부용 시트 K열에 이미 "배수"(원가 대비 판매가) `ARRAYFORMULA`가 살아있었는데, 처음에 상품설명을 그 K열에 쓰도록 코드를 짜서 수식과 충돌 → 상품설명은 **M열**로 분리해서 해결. (K열은 절대 개별 `setValue`로 건드리면 안 됨 — [apps-script/Code.gs](apps-script/Code.gs)의 `ensureMultiplierColumn_` 주석 참고)
2. 더 심각했던 문제: K열의 열려있는 범위 수식(`E2:E` 같은 open-ended range)이 시트 전체(~1000행)를 "데이터 있음"으로 착각하게 만들어서, `sheet.getLastRow()`가 항상 부풀려진 값을 반환 → 신규 상품 저장 시 실제 마지막 행이 아니라 시트 맨 아래 900번대~1000번대에 저장되고, 그 사이 900개 가까운 빈 행이 앱 목록에 "이름 없는 가짜 상품"으로 표시됨. **A열(품번) 값 기준으로 진짜 마지막 행을 찾는 `getLastDataRow_` 헬퍼로 교체해서 해결.**
3. 정리 함수(`fixInternalMultiplierColumns_`, `cleanupBlankInternalRows_`)를 처음엔 별도 함수로 만들었는데, 이름 끝에 `_`가 붙은 함수는 Apps Script 에디터의 "함수 선택" 드롭다운에 안 나타나는 걸 몰랐음(비공개 함수 관례) → `setup()` 함수 안에서 같이 호출하도록 합쳐서 해결. **앞으로 Apps Script에 새 "수동 실행용" 함수를 추가할 땐 이름에 `_`를 붙이지 말 것.**
4. `cleanupBlankInternalRows_`를 처음엔 빈 행을 한 줄씩 `deleteRow()` 호출로 지웠는데, ~900번 개별 API 호출이라 몇 분 넘게 걸려 무료 계정 6분 실행 제한에 걸릴 뻔함 → 연속된 빈 행 구간을 통째로 `deleteRows(start, count)`로 지우도록 최적화.

**결과**: 내부용 시트는 A~J(품번~등록일시), K(배수 수식), M(상품설명) 순. L열은 비워둠. 셀러용은 A~E(품번~이미지), F(상품설명).

## 알아두면 좋은 것

- 삭제는 **앱의 `/list` 화면 삭제 버튼**으로만 하면 내부용/셀러용 양쪽이 같이 지워짐. 구글 시트에서 직접 행을 지우면 반대쪽 시트는 안 지워지므로 수동으로 양쪽 다 지워야 함.
- 상품 목록은 **등록 순서**(row 순서)대로 표시됨 — 품번 값으로 정렬되는 게 아님. 시트를 수동으로 정렬하면, 정렬 직후 앱을 새로고침 안 하고 삭제/사진추가를 누르면 "품번이 일치하지 않습니다" 에러가 뜰 수 있음(안전장치 작동, 데이터 깨지는 건 아님).
- 코드 수정할 때마다 **Vercel(`npx vercel deploy --prod`)과 Apps Script(수동 붙여넣기+재배포) 둘 다** 따로 해줘야 반영됨. 하나만 하면 절반만 반영된 상태가 됨.
