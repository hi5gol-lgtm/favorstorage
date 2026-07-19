# 공급처 상품등록 툴 (페이버주얼리 3일 MVP)

담당자가 모바일로 상품을 촬영/등록하면 내부용 시트 + 셀러용 시트에 동시 기록되는 툴.
스펙 원문: `../공급처_상품등록툴_스펙.md`

## 구성

- `app/` — Next.js(App Router) 프론트엔드. 상품등록 폼(`/`), 등록 목록(`/list`)
- `app/api/*` — Vercel Serverless Function. 브라우저 → Apps Script 사이의 CORS 우회 프록시
- `apps-script/Code.gs` — Google Apps Script. 실제 Sheets/Drive 읽기·쓰기를 담당하는 API 레이어
- `lib/constants.ts` — 판매가 자동계산 / 마진 경고 로직 (기준배수 3.5, 안전 3.2 / 경고 2.5)
- `lib/imageCompress.ts` — 업로드 전 클라이언트 이미지 리사이즈(1600px)/압축(JPEG 78%)

## 배포 순서

### 1. Google Apps Script 배포

1. https://script.google.com 에서 **새 프로젝트** 생성 (특정 스프레드시트에 종속되지 않은 독립 프로젝트로 — 두 스프레드시트를 모두 `openById`로 열어야 하기 때문)
2. `apps-script/Code.gs` 내용을 그대로 붙여넣기
3. 상단 `CONFIG` 값 중 아래 2개를 채우기
   - `DRIVE_FOLDER_ID`: 이미지 저장용 구글 드라이브 폴더 ID
   - `API_KEY`: 임의의 랜덤 문자열 (서버 간 인증용 — Vercel 쪽 `APPS_SCRIPT_API_KEY`와 동일해야 함)
   - 스프레드시트 ID 2개는 스펙 문서 값으로 이미 채워져 있음
4. 스크립트 에디터에서 `setup` 함수를 한 번 수동 실행 → 내부/셀러 시트에 헤더 행 자동 생성
   (실행 시 두 스프레드시트 + 드라이브 접근 권한 승인 필요)
5. **배포 → 새 배포 → 유형: 웹 앱**
   - 실행 계정: 나(담당자 본인 계정)
   - 액세스 권한: **아무나(Anyone)** — Vercel 서버가 Google 계정 없이 호출하므로 필수
6. 배포 후 나오는 웹 앱 URL(`.../exec`)을 기록

> Code.gs를 수정해 재배포한 뒤에는 스크립트 에디터에서 `fixInternalMultiplierColumns_`, `cleanupBlankInternalRows_`를 필요시 한 번씩 수동 실행. K열 배수 수식이 시트 전체를 "데이터 있음"으로 잡아 저장 위치가 밀리며 생기는 빈 행을 정리하는 함수들 (일반적인 사용 중에는 실행할 필요 없음).

### 2. 거래처목록 초기값

내부용 스프레드시트의 `거래처목록` 탭 A열에 거래처 2개를 미리 기입 (스펙 3-1 참고).

### 3. Next.js 환경변수

`.env.local.example`을 복사해 `.env.local` 생성 후 채우기:

```
APPS_SCRIPT_URL=https://script.google.com/macros/s/xxxx/exec
APPS_SCRIPT_API_KEY=(Code.gs의 API_KEY와 동일한 값)
```

### 4. 로컬 실행

```bash
npm install
npm run dev
```

http://localhost:3000 에서 폼, http://localhost:3000/list 에서 등록 목록 확인.

### 5. Vercel 배포

Vercel 프로젝트에 위 두 환경변수(`APPS_SCRIPT_URL`, `APPS_SCRIPT_API_KEY`)를 등록하고 배포.

## 시트 컬럼

**내부용 시트 (`상품` 탭)**: 품번(A) · 상품명(B) · 식별코드(C) · 거래처(D) · 원가(E) · 판매가(F) · 재고(G) · 이미지(H) · 이미지URL(I, 보조) · 등록일시(J) · 배수(K, 수식) · 상품설명(M)

**셀러용 시트 (`상품` 탭)**: 품번 · 상품명 · 판매가 · 재고 · 이미지 · 상품설명

K열(배수)은 `ARRAYFORMULA`로 열 전체를 자동 계산하므로 다른 값을 절대 개별로 쓰면 안 됨 — 상품설명이 K/L이 아닌 M열에 있는 이유. (L열은 비워둠)

이미지는 Drive에 업로드 후 `SpreadsheetApp.newCellImage()`로 셀에 이미지 데이터 자체를 삽입합니다(수식이 아님, 다운로드 시 안 깨짐). 내부 시트의 "이미지URL" 컬럼은 스펙에는 없지만 `/list` 화면에서 썸네일을 빠르게 불러오기 위한 보조 컬럼입니다.

## 참고 (v2에서 추가 예정, 이번 MVP 제외)

카테고리 자동 채번, 소재별 배수 설정, 신규 구글 계정 연동, 사진 정사각형 크롭, 품번 자동 증가 — 스펙 문서 8절 참고.
