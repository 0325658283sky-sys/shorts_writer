# 핸드오프: New Cut v3 — 소스별 앞단 플로우 + 공유 템플릿·완료

## 개요
`design_handoff_newcut_v2/`(2차 상품화 설계)를 **실제 사용 흐름으로 다시 확인하고 클릭 가능한 프로토타입으로 만든 것**입니다. 기획서 "New Cut 리뉴얼 기획 — 소스별 프로세스/기능 정의(2026-09-23)"의 결정 사항을 반영했습니다.

핵심 원칙: **① 입력은 `CreateStudio` 단일 URL 입력창 + 자동 판별을 유지**합니다. 소스 4종(유튜브·MP4·블로그·상품)은 앞단만 다르게 가고, **④ 템플릿 · ⑤ 편집기 · ⑥ 완료는 완전히 공유**합니다. 분기 때문에 새로 생기는 화면은 **② 구간 후보**와 **셀링포인트** 두 개뿐입니다.

```
유튜브  : ① 입력 → ①-b 대기 → ② 구간 후보 → ④ 템플릿 → (⑤ 편집) → ⑥ 완료
MP4     : ① 입력 → ①-b 업로드+대기 → ② 구간 후보 → ④ 템플릿 → (⑤) → ⑥
블로그  : ① 입력 → ①-b 대기 → ③ 사진 → 대본 3안 → ④ 템플릿 → (⑤) → ⑥
상품    : ① 입력 → ①-b 대기 → ③ 상품 사진 → 셀링포인트 3개 → ④ 템플릿 → (⑤) → ⑥
```

## 디자인 파일에 대해
`mockup/` 안의 파일은 **HTML로 만든 디자인 참고 자료**입니다. 그대로 배포하는 코드가 아닙니다. 할 일은 이 디자인을 **기존 코드베이스**(`frontend/` React + Vite + TS, `styles.css` `:root` 토큰, 기존 클래스 체계)의 패턴대로 **다시 구현하는 것**입니다. 인라인 스타일로 적힌 값은 전부 기존 CSS 클래스·토큰에서 가져온 값이므로 **새 하드코딩 없이 기존 클래스를 재사용**하세요(아래 "재사용 클래스" 표).

- `New Cut 소스별 플로우.dc.html` — 클릭 가능한 프로토타입. 브라우저에서 바로 열립니다(`support.js`가 같은 폴더에 있어야 함). 입력창 옆 "예시로 넣어보기"로 소스를 바꿔 볼 수 있습니다.
- `New Cut 전체 화면 보드.dc.html` — 4개 소스 × 전체 단계 + 예외 5종을 한 판에 펼친 보드(21화면).

## 완성도
**하이파이(hi-fi), 단 셸·토큰 기준.** 셸(`StudioShell`)·입력(`CreateStudio`)·템플릿(`TemplateGalleryStep`)·사진(`ImageSelectStep`)은 현재 코드를 그대로 옮겼습니다. 신규 화면(② 구간 후보, 대본 3안 카드, 셀링포인트)은 기존 클래스 조합으로 만들었습니다. 회색 사각형은 전부 썸네일·영상 자리 표시입니다.

## 이번 구현 범위 (기획서 결정 사항)
1. **`NewCutFlow.tsx`**: 4탭 입력·단일 페이지 전환 구조는 **버립니다**. 다음 로직만 새 컴포넌트로 옮깁니다: 폴링 연속 실패 처리, 이미지 min/max 캐핑, 토스트 에러(`.ncf-toast`), 템플릿 카테고리 조회.
2. **순서**: Phase 1(템플릿) → Phase 3(구간 후보·셀링포인트·대본 3안) → Phase 2(편집기 리팩터) → Phase 4(계정 자산·모바일). **각 Phase마다 `npm run build`와 `pytest -q`를 통과시키고 커밋을 나눕니다.**
3. **대본 3안**: `tone: "hook"` 자동 선택을 **없애고** 사용자에게 보여줍니다(Phase 3).
4. **구간 후보 일괄 생성**: 선택한 하이라이트마다 **순차 호출**합니다(백엔드 변경 없음). `POST /videos/{id}/clips:batch`는 백로그로 둡니다.
5. **자막 텍스트 트랙 저장**: 이번 범위에서 제외합니다(Phase 2).
6. **유튜브 봇 차단**: 범위 밖입니다. 프로덕션 검증은 MP4·블로그·상품으로 먼저 합니다.
7. **데스크톱만** 합니다. 모바일은 Phase 4입니다.

---

## 셸 (모든 화면 공통) — `StudioShell.tsx`, 현행 유지
- `.studio-shell` 하위에서 **accent가 파랑으로 덮어써집니다**: `--accent #2563EB`, `--accent-strong #1D4ED8`, `--accent-soft #EAF1FE`, focus ring `0 0 0 2px rgb(37 99 235 / 22%)`. v2 README의 `#4B3BFF`가 아니라 **셸 안에서 실제로 렌더되는 값**을 기준으로 삼았습니다.
- 레일 244px(`.studio-rail`). 타이틀 바 52px(`.studio-shell-title`). 본문은 `.studio-main`(`width:min(1100px,100%)`, padding `22px 24px 48px`, gap 18)입니다.
- **신규 — 타이틀 바 오른쪽(`titleAside`)에 소스별 단계 표시**
  - 앞에 "{소스} 흐름" 라벨(11px/600 `--muted`)을 둡니다.
  - 알약(pill) 22px 높이, padding 0 8px, 11px 글자.
    - 현재 단계: ink 배경, 흰 글자 700
    - 지난 단계: `--accent-soft` 배경, `--accent` 글자
    - 남은 단계: 투명 배경, `--muted` 글자
    - ⑤ 편집: `#C2C2CC`(Phase 2 자리)
  - 알약 사이에 `›`(#C2C2CC, 10px)를 둡니다.
  - 한 줄 고정(`nowrap`)입니다. 제목은 말줄임 처리합니다.
  - 라벨: `① 입력 · ①-b 분석 · ② 후보 / ③ 사진 · 대본 / 셀링포인트 · ④ 템플릿 · ⑤ 편집 · ⑥ 완료`
  - 목적: "이 화면이 왜 지금 나오는지"를 예측할 수 있게 합니다.

## 화면별 명세

### ① 소스 입력 — `CreateStudio.tsx` (단일 입력 유지 + 3곳 변경)
그대로 두는 것: 제목 영역(`.create-kicker` "새 프로젝트", h2 "링크 하나로 쇼츠 만들기", `.create-lead`) · `.create-hero` 카드 · `.create-input-shell`(42px) + `.create-source-badge` · primary `btn-lg` "쇼츠 만들기" · "MP4 파일 올리기" 링크 · MP4 선택 시 `.create-mp4-row` · 길이 칩(`.create-chip`) · `.create-credit-box` · 오른쪽 `.create-preview-phone`(132×234).

변경:
1. **판별 결과 카드(신규)** — 입력창 아래에 둡니다. 소스가 인식되면 나타납니다.
   - 박스: 1px `--line`, radius 11, `--surface-2`, padding 12/14
   - 썸네일: 영상은 64×44, 글·상품은 44×44, radius 6
   - 녹색 체크 + "{유튜브 영상/블로그 글/상품 페이지/MP4 파일}로 인식됨"(11px/700 `#0F7B52`)
   - 제목(13.5px/700, 말줄임) + 메타(11.5px `--muted`)
     - 유튜브: 길이 · 채널
     - 블로그: 사진 N장 · 글자 수
     - 상품: 가격 · 할인 · 리뷰
     - MP4: 용량 · 길이 · 해상도
   - 블로그만 아래에 11.5px `#8A6410` 안내를 붙입니다: "사진이 3장보다 적은 글은 만들 수 없어요"
   - 이 카드는 기존 `YoutubeConfirmStep` inline 자리를 대체·일반화한 것입니다.
2. **자막 템플릿 스와치(`.create-swatch-row`)를 입력 화면에서 뺍니다.** 스타일은 ④에서 고릅니다. 미리보기 아래 문구는 "스타일은 다음 단계 템플릿에서 고릅니다"로 바꿉니다.
3. **`.create-steps`를 소스별 새 흐름으로 바꿉니다.**
   - 영상: 구간 후보 여러 개 중 고르기 · 템플릿 고르기 · 편집 · 다운로드
   - 블로그: 사진 고르기 · 대본 3안 중 고르기 · 템플릿 고르기 · 편집 · 다운로드
   - 상품: 상품 사진 고르기 · 셀링포인트 3개 다듬기 · 템플릿 고르기 · 편집 · 다운로드
- 크레딧 박스 라벨: 영상은 "쇼츠 1편당 쓰는 크레딧 · 분석은 무료", 글·상품은 "이 쇼츠에 쓰는 크레딧"(현행)입니다.
- `detectSource`에 `coupang\.`을 추가합니다(백엔드 `is_supported_product_url`과 맞춤).
- 크레딧 0 또는 비공개 영상이면 CTA를 disabled(opacity .45) 처리하고, 예외 카드를 콘텐츠 맨 위에 띄웁니다(아래 "예외").

### ①-b 분석 대기 — 기존 `.ncf-progress-screen` 대체 (v2 README 명세)
- 카드: `#16161A`, radius 11, padding 24/26, grid `minmax(0,1fr) 200px`, gap 24
- 왼쪽
  - eyebrow "쇼츠 만드는 중 · {소스}"(11px/700 .09em `#8B8B98`)
  - 제목 22/700 흰색
    - 유튜브: 영상을 보고 하이라이트를 찾고 있습니다
    - MP4: 파일을 올리고 하이라이트를 찾고 있습니다
    - 블로그: 글을 읽고 대본 3안을 쓰고 있습니다
    - 상품: 상품을 읽고 셀링포인트를 찾고 있습니다
  - 단계 4줄
    - 아이콘은 22px 원: 완료 `#0F7B52` ✓ / 진행 `#8b7cff` / 대기는 1.5px `#63636f` 테두리 + opacity .45
    - 진행 중인 줄은 13.5px/600, 완료된 줄 오른쪽에 걸린 시간(11.5px `#63636f`)
  - 진행 바 6px(트랙 `#26262f`, 채움 `#8b7cff`) + "N분 N초 지남 · 약 N초 남음"(12px `#8b8b98`)
  - 결과 카드(`#1a1a21`, 1px `#26262f`, radius 11)
    - 영상: **"먼저 찾은 구간"**(#8b7cff 11/700) + `"제목" — 08:12부터 42초`
    - 글·상품: "지금까지 찾은 것" + 찾은 사진 수 등
- 오른쪽: 9:16 자리(`#1a1a21`, 영상은 찾은 구간 점수 배지 + 제목 오버레이) + "닫아도 계속 만듭니다" 버튼(44px, 1px `#332c52`, 13/600 `#8b8b98`) + 보조 문구
  - 기본: "다 되면 알림 보낼게요"
  - MP4: "페이지를 떠나도 서버 작업은 계속돼요. 업로드가 끊기면 이어서 올립니다."
- 단계 문구(`constants.ts`로 옮기기):
  - 유튜브: 원본 영상 가져오기 → 말소리 받아쓰기 → 볼 만한 구간 고르기 → 후보별 자막 붙이기
  - MP4: **파일 올리는 중 · N% (N MB / 1.2 GB)** → 말소리 받아쓰기 → 볼 만한 구간 고르기 → 후보별 자막 붙이기
    - %는 **실제 업로드 bytes 기준**입니다(XHR `upload.onprogress`). 지금은 진행률이 없어서 멈춘 건지 느린 건지 구분이 안 됩니다.
  - 블로그: 글 읽기 → 쓸 만한 사진 찾기 → 대본 3안 쓰기 → 나레이션 듣기
  - 상품: 상품 정보 읽기 → 상품 사진 모으기 → 셀링포인트 찾기 → 나레이션 듣기
- 평균 시간: 유튜브 2~3분 / MP4 업로드 + 2분 / 블로그 1분 40초 / 상품 1분 20초
- 백엔드: 폴링 응답에 `stage`, `stage_started_at`, `partial_highlights[]`를 넣어 주세요.

### ② 구간 후보 비교 — 신규, 유튜브·MP4 공유 (`HighlightList.tsx` 확장)
- 카드: `.flow-card`(padding 18, gap 16)
- 머리
  - kicker "구간 후보"
  - h1 "하이라이트 후보 N개를 찾았어요"
  - lead "점수와 이유를 보고 쓸 구간을 여러 개 고르세요. 고른 구간마다 쇼츠가 한 편씩 만들어집니다."
  - 오른쪽 "원본 24:10 · "제목""(12px `--muted`)
- 그리드: `repeat(auto-fill, minmax(150px,1fr))`, gap 10(1100 폭에서 6열)
  - v2 README의 "3열"은 콘텐츠 폭 기준으로 조정했습니다. 3열이면 카드 높이가 600px를 넘습니다.
- 후보 카드: padding 8, radius 11, 1.5px 테두리
  - 9:16 썸네일(radius 8, `#16161A`)
  - 왼쪽 위: 점수 배지(20px, radius 5, 10.5/700)
    - 1위: `--accent` 배경 흰 글자 "92점 · 최고"
    - 나머지: `#F0F0F3` / `#6B6B75`
  - 오른쪽 위: 선택 시 18px 체크 원
  - 오른쪽 아래: 길이(rgba(0,0,0,.6))
  - 왼쪽 아래: 시작 시각
  - 제목 12/600, 이유 10.5px
- 상태
  - 선택: 1.5px `--accent` 테두리 + `--accent-soft` 배경 + 이유 글자 accent
  - **남은 크레딧 = 선택 수가 되면, 선택 안 된 카드는 opacity .4 + `not-allowed`로 막습니다.**
- **영상 옵션 박스**(`--surface-2`, radius 11, padding 14), 라벨 "{소스} 옵션 · 고른 구간 전체에 적용"
  - 토글(`.ncf-switch` 38×22 재사용)
    - 화자 추적 확대: 말하는 사람을 따라 9:16 크롭 위치를 옮깁니다
    - 무음 구간 제거: 0.6초 넘는 공백을 잘라 템포를 올립니다
    - 9:16 위치 자동: 끄면 편집기에서 크롭 위치를 직접 조정합니다
  - 음성 세그먼트(`.tone-switch` 재사용): 원본 음성 / AI 나레이션
  - MP4만: "원본이 이미 세로(9:16)면 크롭 단계를 건너뜁니다"
- 하단 바(`.image-step-foot` 패턴)
  - ghost "← 다른 링크"
  - "**N개** 선택됨 — 선택한 후보마다 쇼츠가 하나씩 만들어집니다"
  - **예상 차감 박스**(`.create-credit-box` 재사용: "예상 차감 N / M회 남음"). 한도에 닿으면 테두리 `#F0DFB4`에 11.5px `#8A6410` 안내를 붙입니다.
  - primary 44px "선택한 구간으로 계속"(0개면 disabled, 그림자 `0 2px 6px rgba(37,99,235,.35)`)
- 동작: 계속을 누르면 선택한 하이라이트마다 **순차로** clip을 생성한 뒤 ④로 갑니다. 템플릿은 전체에 한 번만 고릅니다.
- 백엔드: `Highlight.reason`(짧은 문자열)을 추가합니다. `score`는 이미 있습니다.

### ③ 사진 선택 — `ImageSelectStep.tsx`, 블로그·상품 공유 (현행 + 2곳 변경)
- `.image-step-head` + `.image-step-counter`("N / 8장" + 72px 게이지) · `.image-candidate-grid`(minmax 92px, 9:16) · 선택하면 2px accent + 순서 원(20px) — 전부 현행입니다.
- 제한: **최소 3장 · 최대 8장**
  - 8장이 차면 나머지는 opacity .4로 막습니다.
  - 3장 미만이면 CTA disabled + 안내 "3장 이상 골라야 다음으로 갈 수 있어요"(`#8A6410`)
  - 후보가 8장을 넘으면 **상위 8장까지만 선택 가능**합니다(기존 캐핑 로직을 그대로 옮기기).
- **블로그만: "사진 부족 시 스톡 보충" 토글 행**(`--surface-2` 박스). 켜져 있으면 부족한 만큼 스톡으로 채우고, 해당 타일 왼쪽 아래에 "스톡" 배지를 붙입니다.
- CTA: 블로그 "대본 고르기", 상품 "셀링포인트로"

### 대본 3안 — 블로그 전용 (`ScriptToneStep` 개편)
- **자동 hook 선택을 없앱니다.** 3안을 `repeat(auto-fit,minmax(240px,1fr))`, gap 12로 병렬 배치합니다. 기존 `.tone-switch` 탭 방식이 아닙니다.
- 카드: padding 16, radius 11
  - 선택: 1.5px accent 테두리 + 배경 `#F5F8FE`
  - 미선택: 1px `--line`
  - 라디오 18px(선택하면 5px accent 테두리)
- 카드 내용: 라벨 13.5/700 + "추천" 배지(hook만) + 길이(11px) · 설명 11.5px · 대본 13px/1.75 · "나레이션 듣기" outline 버튼(재생 중에는 "듣는 중… 멈추기")
- 라벨·설명은 `SCRIPT_TONE_LABELS` / 설명 상수를 그대로 씁니다: 핵심만 / 임팩트 있게 / 친근하게
- 아래 2칸
  - **말투**(블로그 생성기 말투 라이브러리 공유, select 34px)
  - **분량** 세그먼트: 1편으로 / 시리즈 3편으로 — 글이 길 때만 보여줍니다.
- 하단 바는 `.tone-actions`입니다.
  - ghost "← 사진 다시 고르기"
  - 차감 안내: "크레딧 1회 (렌더 성공 시 차감)" / 시리즈면 "시리즈 3편 · 크레딧 3회"
  - primary "이 대본으로 계속"

### 셀링포인트 3개 — 상품 전용, **신규**
- grid `minmax(0,1fr) 180px`, gap 20
- 왼쪽
  1. 상품 요약 행(`--surface-2`): 44px 썸네일 · 상품명 13.5/700 · "**32%** **39,900원** ~~58,900원~~ · 리뷰 1,284개"
  2. 한 줄 입력 3개: 42px, 1px `--line`, radius 8, 왼쪽 번호 칩 20px(`--accent-soft`), 오른쪽 글자 수 "N/24"(24자를 넘으면 `--danger`). 아래에 outline "AI로 다시 뽑기"
  3. "화면에 올릴 상품 정보" 칩(30px pill)
     - 항목: 가격 / 할인율 / 리뷰 수
     - 켜짐: accent 테두리 + soft 배경 + "✓"
     - 꺼짐: `+`
  4. 토글 행: "설명란에 상품 링크 자동 첨부"
- 오른쪽: 1번 장면 9:16 미리보기. 켠 칩이 상단 배지로 나타납니다(할인 `--danger` 배경 / 가격 `#FFE500` / 리뷰 흰 배경). 첫 셀링포인트가 자막으로 들어갑니다.
- 하단 바는 `.tone-actions`: "셀링포인트 3개 · 장면 3개 + 끝 장면" + primary "이 셀링포인트로 계속"

### ④ 템플릿 갤러리 — `TemplateGalleryStep.tsx`, 전 소스 공유 (Phase 1)
- 현행 구조를 유지합니다: `.gallery-chip-row`(전체 12 · 임팩트 · 뉴스형 · 미니멀 · 브랜드 커스텀, 30px pill, 선택은 ink) · `.gallery-card`(선택 2px accent + 18px 체크) · "내 브랜드 만들기" 점선 칸 + "준비 중" · 오른쪽 미리보기 + CTA 44px "이 템플릿으로 계속" + "건너뛰기"
- 변경
  - **반응형**: 좌우 2열을 flex-wrap으로 바꿉니다(왼쪽 `flex:1 1 420px`, 오른쪽 `flex:1 1 240px; max-width:300px`). 카드 그리드는 `repeat(auto-fill, minmax(104px,1fr))`입니다. 고정 4열이면 좁은 화면에서 카드가 50px까지 줄어듭니다.
  - 칩 오른쪽에 정렬 라벨 "많이 쓰는 순"(11.5px `--muted`)을 둡니다.
  - 리드 문구
    - 영상: "선택한 구간 N편에 한 번에 적용돼요. 편별로 다르게 하려면 편집기에서 바꾸세요."
    - 글·상품: 현행 "건너뛰어도 기존 스타일의 자막이 그대로 적용됩니다."
  - **상품 소스: `commerce_price`를 맨 앞에 두고 기본 선택합니다.** "상품 추천" 배지(accent, 9.5/700)를 붙이고, 미리보기에 할인율·가격 배지를 오버레이합니다.
  - 다른 소스는 `impact_yellow`를 기본 선택합니다.
  - 미리보기 아래 10.5px 안내: "적용 순서: 템플릿 → 편집기 전체 스타일 → 장면별 값. 장면에서 바꾼 값은 언제든 되돌릴 수 있어요."
  - 카테고리 조회: `category=gallery` 하드코딩 대신 **DB `category`(impact/news/minimal/commerce) 기준**으로 그룹을 나눕니다. 지금은 클라이언트 `CLIENT_GROUP`에 임시 매핑되어 있으니 근본 수정이 필요합니다.
- 자막 칩 스타일은 `boxStylePreviewStyle()`을 그대로 씁니다. 카드 안 칩은 `white-space:nowrap`입니다. 노랑·녹색 box는 글자를 ink로 바꿉니다(대비).

### ⑥ 완료 · 업로드 — 전 소스 공유 (`ResultActionsCard.tsx`)
- 카드: 최대 폭 620, 가운데 정렬
- kicker "완성"(`#0F7B52`) + h1 + "크레딧 N회 차감 · M회 남음"
- h1
  - 여러 편: "쇼츠 N편이 완성됐어요"
  - 한 편: "쇼츠가 완성됐어요"
  - 폴백: "쇼츠가 만들어졌어요 (간단 버전)"
- **한 편**(블로그·상품 기본): 96×170 미리보기 + 제목 · "0:31 · 1080×1920 · {템플릿}" + primary 44px "MP4 다운로드" + outline "편집기에서 다듬기"
- **여러 편**(영상 N편, 블로그 시리즈): 오른쪽 위에 primary "N편 모두 다운로드"를 둡니다. 편마다 행(1px 테두리, padding 10, 54×96 썸네일, "N편 · 제목")을 두고, 행마다 outline 30px 다운로드와 편집 버튼을 둡니다.
- 상품 + 링크 첨부가 켜져 있으면 "설명란" 박스에 설명과 상품 링크를 보여주고 "· 상품 링크 자동 첨부됨"을 붙입니다.
- 채널 행(유튜브 쇼츠 "오전 10시 예약" / 인스타 릴스 "지금 업로드" / 점선 "+ 채널 연결하기")은 **feature flag 뒤**에 둡니다. 1차는 다운로드만 합니다.
- 하단: "스타일만 바꾸는 재생성은 크레딧이 들지 않습니다." + outline "새로 만들기" + ghost "내 쇼츠에서 보기 →"

## 예외 (⑨-c 공통 규칙)
카드는 콘텐츠 맨 위에 둡니다(radius 11, padding 14/16, gap 8).
- 제목 13/700, 본문 12px/1.6
- 끝에 **크레딧 문구를 굵게** 붙입니다.
- 버튼은 최대 2개, 32px

| 상황 | 뜨는 곳 | 제목 | 버튼 | 톤 |
|---|---|---|---|---|
| 크레딧 소진 | ① | 이번 달 크레딧을 다 쓰셨어요 | 플랜 올리기(accent) · 크레딧 추가 구매 | neutral |
| 비공개·삭제 영상 | ① 유튜브 | 이 영상은 가져올 수 없어요 | 다른 링크 넣기 · 파일로 올리기(→MP4) | danger |
| 이미지 후보 부족 | ③ | 이 글에서는 / 이 상품에서는 사진을 충분히 못 찾았어요 | 다른 글·상품 URL 넣기 | danger |
| 렌더 폴백 | ⑥ | 간단 버전으로 만들어졌어요 | 스타일 적용해서 다시 만들기 | amber |
| 저작권 음원 | ⑥ 영상 | 원본에 저작권 있는 음악이 있어요 | 무료 음원으로 교체(ink) · 그대로 두기 | amber |

- 본문은 프로토타입 문구를 그대로 쓰세요. 크레딧 소진 초기화 수치는 **플랜 한도(Free 3 / Lite 20 / Pro 80)**로 채웁니다.
- 톤 색
  - amber: 배경 `#FDF9EE` / 테두리 `#F0DFB4` / 제목 `#6B4E10` / 본문 `#8A6410` / 보조 버튼 테두리 `#E0D3AC`
  - danger: `#FDF6F5` / `#F0C9C5` / 제목 `#C2453C` / 본문 `#A85049`
  - neutral: `#FBFBFC` / `#E8E8EC` / `#16161A` / `#6B6B75`
- 에러 코드와 카피를 잇는 매핑 테이블을 만드세요. 서버 원문은 `RenderSpecFooter` 접힘 영역에만 둡니다.
- 토스트(`.ncf-toast`)는 일시적 알림에만 씁니다.

## 크레딧 규칙
- 차감 시점은 **렌더 성공**입니다. 실패하면 자동 복구하고 문구에 밝힙니다.
- 템플릿·스타일 재생성, 편집 후 재렌더, 실패 재시도는 0회입니다.
- 예상 차감 박스는 ①(1회)과 ②(선택 수 × 1)에 둡니다. 남은 수를 넘는 선택은 막습니다.
- 긴 영상 분석은 무료입니다(플랜별 `max_video_minutes` 적용).

## 상태
- 플로우
  - `source: 'youtube'|'mp4'|'blog'|'product'`
  - `step: 'input'|'wait'|'candidates'|'photos'|'script'|'selling'|'template'|'editor'|'done'`
  - 소스별 `order[]`로 다음·이전 단계를 정합니다. 뒤로 가면 `wait`는 건너뜁니다.
- ②: `selectedHighlightIds: number[]`(길이 ≤ remaining), `videoOpts {speakerTrack, removeSilence, autoCrop}`, `voiceMode: 'original'|'tts'`
- ③: `selectedImageIds: number[]`(순서 = 장면 순서, 3 ≤ n ≤ 8), `stockFill: boolean`
- 대본: `tone: 'summary'|'hook'|'detailed'`, `previewingTone`, `series: 'one'|'three'`, `voicePresetId`
- 셀링포인트: `points: [string,string,string]`, `overlay {price, discount, reviews}`, `attachLink: boolean`
- ④: `templateId`, `category`
- 진행: `stage`, `stageStartedAt`, `partialHighlights`, `uploadBytes/total`

## 재사용 클래스 (프로토타입 인라인 값의 출처)
| 요소 | 클래스 |
|---|---|
| 셸·레일·사용량 | `.studio-shell` `.studio-rail*` `.studio-usage-*` `.studio-shell-title` `.studio-main` |
| 입력 | `.create-hero` `.create-input-shell` `.create-source-badge` `.create-chip` `.create-credit-box` `.create-steps` `.create-preview-phone` |
| 단계 카드 | `.flow-card` `.flow-lead` `.create-kicker` |
| 하단 바 | `.image-step-foot` `.tone-actions` |
| 사진 | `.image-step-counter` `.image-step-gauge` `.image-candidate*` |
| 세그먼트·토글 | `.tone-switch*` `.ncf-switch` |
| 템플릿 | `.gallery-*` |
| 대기 | `.ncf-panel` 계열 → v2 README ①-b 값으로 교체 |
| 버튼 | `.btn-primary` `.btn-outline` `.btn-ghost` `.btn-lg` |

## 디자인 토큰 (`styles.css` `:root` + `.studio-shell` 덮어쓰기)
- 글꼴: Pretendard / Noto Sans KR(`--font-display`, `--font-body`)
- 글자색: `--ink #16161A` · `--ink-soft #6B6B75` · `--muted #9C9CA6` · 보조 `#C2C2CC` · 버튼 글자 `#3A3A44`
- 면·선: `--surface #FFF` · `--surface-2 #FBFBFC` · `--page-bg #F3F3F5` · `--line #E8E8EC` · `--line-strong #E0E0E6`
- accent(셸 안): `#2563EB` / `#1D4ED8` / `#EAF1FE`, 대본 선택 배경 `#F5F8FE`
- 상태: 성공 `#0F7B52` · 경고 `#8A6410` · 위험 `--danger #C2453C`
- 다크: `#16161A` / `#1a1a21` / `#26262f` / `#8b8b98` / `#63636f` / 진행 `#8b7cff` / 버튼 테두리 `#332c52`
- radius: 카드 11 · 컨트롤 8 · 작은 배지 5 · pill 999
- 그림자: `--shadow 0 1px 2px rgba(22,22,26,.06)` · 주 CTA `0 2px 6px rgba(37,99,235,.35)`
- 버튼 높이: 단계 CTA 42–44 · 보조 30–32 · 칩 22–30

## 에셋
실제 에셋은 없습니다. 회색·다크 사각형은 썸네일·영상 자리입니다. 아이콘은 `StudioShell.tsx`의 인라인 SVG(plus/folder/settings)와 Lucide 계열 check·play만 썼습니다. YT/IG 칸은 공식 로고로 바꾸세요.

## 아직 설계하지 않은 것
⑤ 장면 편집기 5탭(Phase 2 — v2 README를 따르세요) · ⑥-b 내 쇼츠 · ⑨-b 원본 상세 · ⑨-a 내 브랜드 · 모바일 · 상품 "가격 업데이트 후 재생성"

## 파일
- `mockup/New Cut 소스별 플로우.dc.html` — 클릭 프로토타입(props: `creditsRemaining`, `errorDemo`, `showChannels`, `startSource`, `startStep`)
- `mockup/New Cut 전체 화면 보드.dc.html` — 전체 화면 보드
- `mockup/support.js` — 목업 실행용 런타임(구현 대상 아님)
- 상위 설계: `design_handoff_newcut_v2/README.md`
