# 완료 보고 — Phase 1 / Phase 3 / Phase 2 / Phase 4 (모바일 반응형) / 후속: 텍스트 탭 실기능

---

## 후속 — 편집기 "텍스트" 탭 실기능 (백엔드 포함, 사용자 승인)

### 변경
- **DB**: `blog_clip_boards.text_style_json TEXT` 추가(기동 시 `ALTER TABLE`, 기존 행 NULL = 템플릿 값 유지). 프로덕션 마이그레이션 성공 확인.
- **API**: `PATCH /blog-clips/{id}/boards/{board_id}`에 `text_style`(fontFamily 화이트리스트 · fontSize 20~120 · accentColor `#RRGGBB` · animation `none|highlight`) 추가. 잘못된 값 400, `null`이면 되돌리기. 응답 `BoardResponse.text_style`, `remotion-props`의 각 board `textStyle`.
- **Remotion**: `BoardCaption`이 `board.textStyle`로 폰트·크기·강조색·애니메이션을 덮어씀. props JSON 스키마(`additionalProperties:false`)와 백엔드 응답 모델에 `textStyle` 추가.
- **프론트**: 편집기 텍스트 탭 — 폰트 선택 · 크기 · 강조색(스와치 4 + 직접 입력) · 등장 애니메이션(글자 튀기기/없음) · "이 장면 스타일 되돌리기". 장면별로 격리 저장.
- **함께 고친 버그**: `_caption_template_payload`가 DB에 없는 `category == "gallery"`만 허용해 **템플릿을 골라도 렌더 자막에 반영되지 않던** 문제 → `legacy`만 제외로 수정(이제 `captionTemplate`이 실제 값으로 채워짐).
- 등장 애니메이션은 Remotion이 지원하는 `highlight`/`none` 두 가지만(v2 README의 "페이드"는 미지원).

### 검증
- `pytest -q` 138 passed(신규 8: 저장/되돌리기/검증 거부/템플릿 category), `npm run build` 통과.
- 프로덕션: 저장 200·잘못된 값 400·`remotion-props.boards[].textStyle` 전달, UI에서 장면 2 강조색 클릭 → DB에 장면별로만 저장, 새 클립에서 편집기 **미리보기**에 장면 1 자막이 jalnan 90px로 반영됨.

### Remotion 렌더 서비스 프로덕션 배포 (해결됨)
원래 프로덕션에는 Remotion 렌더 서비스가 없어 최종 MP4가 항상 FFmpeg 폴백("간단 버전")이었고, 템플릿·장면 스타일이 편집기 미리보기에만 보이고 MP4에는 안 들어갔습니다(이번 변경 이전부터의 상태).
- 백엔드가 `remotion/public/`에 파일을 쓰고 Remotion이 같은 디스크에서 읽으므로 Railway 별도 서비스로 나눌 수 없어, **백엔드 컨테이너 안에서 Remotion을 127.0.0.1:3100 사이드카로** 띄움: `Dockerfile.backend` + `scripts/start-backend.sh`(죽으면 5초 뒤 재시작), `.dockerignore`, `.gitattributes`(sh/Dockerfile LF 고정).
- Railway 설정: Root Directory 비움 + `RAILWAY_DOCKERFILE_PATH=Dockerfile.backend` + **Custom Start Command 비움**(예전 Railpack용 `uvicorn --port $PORT`가 Dockerfile CMD를 덮어써 `'$PORT' is not a valid integer`로 크래시했음).
- 검증(프로덕션): `/health` → `remotion.ok=true`. 새 클립(27) 렌더 → `engine=remotion, fallback_used=false`, 1080×1920 30fps 24.8초 35MB. 다운로드 MP4 프레임에서 **템플릿 박스 자막 + 장면 1에만 지정한 빨간 강조색·큰 폰트가 실제로 표시됨.**
- 남은 위험: Chrome 렌더 메모리(플랜에 따라 OOM 가능), `max_concurrent=1`이라 동시 렌더는 대기열.

---

## Phase 4 — 모바일 반응형 (⑨-a 내 브랜드·⑥ 채널연동 제외)

### 범위 조정 (진행 전 사용자 확인)
- ⑨-a 내 브랜드는 `brand_presets` 신규 백엔드 테이블이 필요해 이번 범위에서 제외.
- ⑥ 채널 연결(SNS 예약 업로드)은 원본 기획서도 "1차는 다운로드만, feature flag 뒤"로 명시해 제외.
- v2 README의 ⑨-d(모바일 전용 3화면, 구간후보·템플릿을 AI 추천값으로 자동 스킵)는 **사용자 조작을 없애는
  큰 변경**이라 채택하지 않고, **기존 화면을 그대로 두고 768px 이하에서 레이아웃만 접는 쪽**으로 축소.

### 바뀐 파일
- `frontend/src/styles.css` — `@media (max-width: 768px)` 블록 추가.
  - 가장 큰 문제: `.studio-shell`이 `.studio-rail`(244px 고정) + 본문을 가로로 배치해서, 375px 화면에서
    레일이 대부분을 차지하고 있었음. 세로 배치로 바꾸고 레일을 상단 가로 스크롤 바로 접음.
  - 프로젝트 하위 항목(최근 쇼츠 목록)·사용량 게이지는 가로 바에 넣기엔 너무 길어서 숨김(같은 정보를
    "프로젝트" 탭 본문에서 볼 수 있음).
  - 구간 후보 카드 그리드·대본 3안 카드·템플릿 갤러리 그리드는 이미 Phase 1·3에서 `auto-fill`/`flex-wrap`
    기반으로 만들어서 별도 미디어쿼리 없이도 좁은 화면에서 자연스럽게 재배치됨(추가 작업 불필요).

### 검증
- `npm run build`, `pytest -q`(130 passed) 통과.
- 375×812(모바일) 뷰포트로 프로덕션 배포본을 직접 열어 확인: 상단 레일이 가로 바로 정상적으로 접히고,
  입력 화면(로고·새로 만들기·프로젝트 nav, URL 입력창, 길이 칩, 크레딧 박스, 단계 목록, 미리보기 카드)이
  전부 가로 스크롤 없이 단일 컬럼으로 보임.
- 후속 확인(375×812, 프로덕션): 템플릿 갤러리(옵션 패널 → 카테고리 칩 → 2열 카드로 세로 배치)와 장면
  편집기(장면 목록 → 미리보기 → 패널로 세로 배치) 모두 가로 스크롤 없이 정상 표시됨.
- 아직 모바일에서 직접 열어보지 못한 화면: 구간 후보(유튜브 경로), 대본 3안 카드.

### 남은 이슈
1. 구간 후보/템플릿 갤러리/대본 3안/편집기 화면의 모바일 실사용 확인이 안 됨(다음 세션 숙제).
2. 하단 탭 바(홈·내 쇼츠·설정), 48px 이상 탭 타겟 등 v2 README의 세부 터치 타겟 가이드는 적용 안 함 — 지금은
   "쓸 수는 있다" 수준이고, "터치하기 편하다" 수준의 다듬기는 안 됨.
3. ⑨-a 내 브랜드·⑥ 채널 연결은 백엔드 작업이 선행돼야 함.

---

## Phase 2 — 편집기 우측 패널 5탭 재배치

### 범위 조정 (진행 전 사용자 확인)
"텍스트" 탭(장면별 폰트·크기·강조색·애니메이션)은 `Board` 테이블에 저장 컬럼이 없어 실제 기능을 만들려면
백엔드 스키마 변경이 필요함을 발견해 멈추고 물어봄 → **이번엔 탭 자리만 만들고 준비 중 안내, 실제 기능은
다음으로 미루기**로 결정.

### 바뀐 파일
- `frontend/src/components/board/MediaPanel.tsx` — 기존 3탭(화면/음성/모션)을 목표 5탭(텍스트/나레이션/
  배경음악/구간편집/전체 스타일)으로 재배치.
  - 텍스트: 준비 중 안내만.
  - 나레이션: 기존 "음성" 탭에서 TTS 속도·장면별 보이스 지정 부분만 유지.
  - 배경음악: 기존 "음성" 탭에 같이 있던 `BgmPanel`을 독립 탭으로 분리.
  - 구간편집: 기존 "모션" 탭의 장면 길이 조절 + **판단 필요**: 목표 5탭 스펙에는 "이미지 교체/스톡 검색"이
    들어갈 자리가 명시돼 있지 않았음(원래 "화면" 탭의 핵심 기능이었음). 장면 단위 편집이라는 성격이 가장
    가까운 "구간편집" 탭으로 옮김 — 이 배치가 맞는지는 실제 사용해보고 재조정이 필요할 수 있음.
  - 전체 스타일: `VisualStylePanel`이 기존엔 "화면"·"모션" 두 탭에 중복 렌더되고 있었음 — 하나로 통합.
- v2 README가 권장한 "MediaPanel 상태를 scene/clip 단위 훅(`useSceneDraft`/`useClipStyle`)으로 분리"하는
  내부 아키텍처 리팩터는 **하지 않음** — 사용자에게 보이는 변화가 없고, prop 24개를 다시 배선하는 위험만
  큰 작업이라 판단. props는 기존 그대로 유지, 동작은 동일.

### 검증 중 발견해서 함께 고친 버그
Phase 2 화면을 확인하려는데 `BoardEditor`(장면 편집기)에 들어가는 경로 자체가 막혀 있었습니다.
`BlogClipFlow.tsx`의 `useEffect`가 `awaiting_boards` 상태가 되자마자(템플릿 갤러리 처리 직후) 조건 없이
`onRender(blogClip)`을 자동 호출해서, 화면에 "장면 직접 편집"/"이대로 영상 만들기" 두 버튼이 뜨는 그
순간 이미 렌더가 시작돼 있었습니다 — 사실상 "장면 직접 편집"을 누를 수 없는 사전부터 있던 버그(제가
Phase 2에서 만든 게 아니라 발견한 것)였습니다. 자동 렌더 호출을 제거해 사용자가 버튼으로 직접
선택하도록 고쳤습니다(`frontend/src/components/BlogClipFlow.tsx`).

### 검증
- `npm run build`, `pytest -q`(130 passed) 통과.
- **위 버그를 고친 뒤 프로덕션 배포본에서 5탭 전부 직접 열어서 확인**:
  - 텍스트: "준비 중" 안내 정상 표시
  - 나레이션: 재생 속도 + 장면별 보이스 목록(배경음악 없이 분리됨) 정상
  - 배경음악: BGM 무드 칩·볼륨·효과음 전부 독립 탭에서 정상 작동
  - 구간편집: 장면 길이 조절 + 이미지 교체 그리드 + 스톡 검색 정상
  - 전체 스타일: 장면 전환(페이드/슬라이드/없음) + 전환 길이 슬라이더 정상, 더 이상 다른 탭에 중복 렌더 안 됨

### 남은 이슈
1. "구간편집" 탭에 이미지 교체 기능을 넣은 게 맞는 배치인지는 계속 써보면서 재검토 필요(목표 스펙엔 명시가 없었음).
2. 텍스트 탭 실제 기능(장면별 폰트/크기/강조색/애니메이션)은 백엔드 스키마 추가가 선행돼야 함.

### 다음 제안
Phase 4(계정 자산·모바일)로 진행 권장. 시작 전 계획은 다시 보여드리겠습니다.

---

## Phase 3 — 구간 후보 비교 · 대본 3안 카드화 · 대기 문구 소스별 분기

### 범위 조정 (진행 전 사용자 확인)
계획 단계에서 두 항목이 규칙 5("백엔드 API를 바꾸지 마")와 충돌한다는 걸 발견해 멈추고 물어봄:
1. **셀링포인트 3개 화면** — 백엔드에 "셀링포인트" 개념 자체가 없어(상품도 블로그와 동일한 `script_candidates` 사용, 가격/할인율/리뷰 칩을 실제로 켜고 끄려면 새 엔드포인트 필요) → **대본 3안 화면을 상품에도 그대로 재사용**하기로 결정.
2. **①-b 대기 화면의 실시간 스트리밍/MP4 업로드 %** — 백엔드 폴링 응답에 `stage`/`partial_highlights`가 아직 없음 → **이번엔 기존 데이터로 문구·라벨만 소스별로 적용**하기로 결정.
③ 사진 선택 변경(스톡 보충 토글 등)은 변경 포인트 대비 효과가 낮아 스킵.

### 바뀐 파일
- `frontend/src/components/YoutubeClipFlow.tsx`
  - **핵심 변경**: 기존에는 하이라이트가 오면 `shortsCount`/`lengthBand` 설정으로 상위 N개를 곧바로 자동 생성했음(사용자 선택 화면 자체가 없었음). 이제 하이라이트 도착 시 자동 생성 대신 새 **"구간 후보" 스텝**으로 전환.
  - 신규: 점수 배지(1위는 accent 강조 + "최고")·이유·길이를 보여주는 카드 그리드, 다중 선택(체크), `usage.remaining` 기반 선택 개수 제한(남은 크레딧 초과 시 카드 비활성화), 하단 바에 "N개 선택됨" + "예상 차감 N/M회 남음" + "선택한 구간으로 계속".
  - `generateShorts(targets)`를 "내부에서 자동으로 골라 생성"에서 "전달받은 목록을 그대로 순차 생성"으로 의미 변경. 재방문 시(이미 하이라이트만 있고 클립이 없는 경우)도 자동생성 대신 구간 후보 화면으로 감.
  - 대기 화면(progress) 헤드라인을 유튜브/MP4 소스별로 분기(`projectChannel` 유무로 판별 — MP4 업로드는 채널 정보가 없음).
  - `usage` prop 추가(App.tsx에서 전달).
- `frontend/src/components/BlogClipFlow.tsx`
  - `ScriptToneStep`: 탭 전환식(`.tone-switch`, 활성 1개만 본문 노출)을 **3개 대본을 동시에 보여주는 병렬 카드**(`repeat(auto-fit,minmax(240px,1fr))`)로 변경. 각 카드에 라디오 선택 · "추천" 배지(hook만) · 읽는시간/글자수 · 설명 · 대본 전문을 모두 표시. CTA를 "이 말투로 영상 만들기" → "이 대본으로 계속"으로 변경(대본 선택이라는 실제 행동에 맞춤).
  - `ProgressLog`: 준비 단계 태스크 목록과 헤드라인을 블로그/상품 소스별로 분기(`detectSource(blogClip.source_url)`로 판별). 상품은 "상품 정보 읽기 → 상품 사진 모으기 → 매력 포인트 찾기", 블로그는 "글 읽기 → 사진 찾기 → 대본 3안 쓰기".
- `frontend/src/App.tsx` — `<YoutubeClipFlow>`에 `usage` prop 전달.
- `frontend/src/styles.css` — `.candidates-grid`/`.candidate-card`/`.candidate-score`/`.candidate-check` 등 구간 후보 카드 스타일 신규 추가. 더 이상 쓰이지 않는 `.tone-switch*`/`.tone-preview*`를 새 `.tone-card*`(카드 그리드) 스타일로 교체.

### 스키마/백엔드 변경
없음(전부 프론트엔드). `Highlight.score`/`Highlight.reason`은 이미 백엔드에 있었음(v2 README가 "새로 추가 필요"라고 적었던 것과 달리 이미 구현돼 있었음 — 코드 확인으로 재확인).

### 검증
- `npm run build`, `pytest -q`(130 passed) 통과.
- **프로덕션 배포본에서 직접 끝까지 확인**:
  - 블로그 경로: 대본 3안 카드 3개 병렬 표시, "임팩트 있게"에 추천 배지, 라디오 선택 정상.
  - 유튜브 경로: "Me at the zoo"(19초 영상)로 실제 테스트 — 하이라이트 후보 3개(90점·최고 배지 포함)가 카드로 뜨고, 2개 다중 선택 시 "예상 차감 2/3회 남음" 정상 표시, "선택한 구간으로 계속" 클릭 시 선택한 2개만 순차로 클립 생성된 뒤 템플릿 갤러리가 한 번만(편별로 따로 안 뜸) 뜨는 것까지 확인.
  - 유튜브 봇 차단(yt-dlp)은 이번 테스트에서는 우연히 통과됨(간헐적 — 여전히 프로덕션에서 안정적이지 않을 수 있음, 범위 밖 이슈로 유지).

### 남은 이슈
1. MP4 업로드 경로는 실제 업로드 가능한 MP4 파일이 없어 "구간 후보" 화면을 MP4로는 직접 검증 못 함(코드는 YoutubeClipFlow와 완전히 공유되므로 동작 원리는 동일).
2. 대본 3안 카드에 "나레이션 듣기"(TTS 미리듣기) 버튼은 이번에 추가 안 함 — 시간상 텍스트만 표시.
3. 구간 후보 화면의 "영상 옵션 박스"(화자 추적 확대·무음 구간 제거·원본음성/TTS 토글)는 이번에 구현 안 함 — 현재 옵션은 CreateStudio의 "세부 설정"(생성 개수)에만 있음.

### 다음 Phase 제안
Phase 2(편집기 5탭 리팩터)를 다음으로 진행 권장. 시작 전 남은 이슈 3번(구간 후보 화면의 영상 옵션)을 Phase 2 범위에 포함할지 먼저 결정 필요.

## 범위
`design_handoff_newcut_v3_source_flows/README.md`의 "이번 구현 범위(기획서 결정 사항)" 중 Phase 1만 진행. Phase 3(구간 후보·사진·대본 3안·셀링포인트·①-b 대기 화면 재설계)와 Phase 2(편집기 5탭 리팩터)는 이번 범위 밖.

## 바뀐 파일
- `frontend/src/App.tsx` — create 진입점을 `NewCutFlow`(4탭 입력·단일 페이지 전환)에서 `CreateStudio`/`BlogClipFlow`/`YoutubeClipFlow`로 되돌림. `NewCutFlow`/`newcut.css`는 파일만 남기고 import 제거(사용 안 함 — 완전 삭제 여부는 다음 결정 필요, "다음 Phase 제안" 참고).
- `frontend/src/components/TemplateGalleryStep.tsx`
  - `GET /subtitle-templates?category=gallery` 제거(항상 빈 배열 반환하던 버그 — 실제 DB category는 `impact`/`news`/`minimal`/`commerce`/`legacy`이고 `"gallery"`라는 값은 존재하지 않았음). 전체 조회 후 `legacy` 제외.
  - 클라이언트 전용 `CLIENT_GROUP`(슬러그→한글 라벨 수동 매핑) 제거, 실제 DB `category` 필드 기준 `CATEGORY_LABEL`로 대체.
  - 상품 소스(`blogClip.source_url`을 `CreateStudio`의 `detectSource`로 재판별) 진입 시 `commerce_price` 템플릿을 기본 선택 + "상품 추천" 배지 표시. 그 외 소스는 `impact_yellow` 기본 선택.
  - 리드 문구를 유튜브/그 외 소스로 분기, 정렬 라벨("많이 쓰는 순") 추가, 하단에 "적용 순서: 템플릿 → 편집기 전체 스타일 → 장면별 값" 안내 추가.
- `frontend/src/components/CreateStudio.tsx`
  - `detectSource`를 export(다른 컴포넌트에서 재사용하기 위해).
  - `coupang\.` 패턴을 상품 URL 판별에 추가.
  - 자막 스와치 선택 UI(`.create-swatch-row`) 제거, 미리보기 하단 문구를 "스타일은 다음 단계 템플릿에서 고릅니다"로 변경.
  - 판별 결과 카드 신규 추가(블로그/상품 URL 인식 시 체크 표시, 블로그는 "사진이 3장보다 적은 글은 만들 수 없어요" 안내). 유튜브는 기존 `YoutubeConfirmStep`이 이미 같은 역할을 하므로 별도 카드 없음.
  - `.create-steps` 문구를 소스별(영상 / 블로그 / 상품)로 새 플로우에 맞게 교체.
- `frontend/src/styles.css` — `.gallery-layout`을 grid→flex-wrap, `.gallery-grid`를 `repeat(4,1fr)`→`repeat(auto-fill, minmax(104px,1fr))`로 반응형화. `.gallery-sort-label`, `.gallery-card-badge-accent`, `.gallery-apply-order-hint`, `.create-detected-*` 신규 클래스 추가(전부 기존 `:root` 토큰만 사용, 새 하드코딩 색 없음).

## 스키마 변경
없음. `subtitle_templates`의 `category`/`position`/`box_style`/`accent_color`/`animation`/`font_family`/`preview_url` 컬럼과 갤러리 템플릿 12종 시드는 이전 세션에서 이미 완료·배포되어 있었음(프로덕션 DB 직접 확인: 템플릿 15개, category 값 `legacy`/`impact`/`minimal`/`news`/`commerce`).

## 옮기려다 불필요했던 것
계획에는 `NewCutFlow.tsx`에서 검증한 "폴링 연속실패 처리"·"이미지 min/max 캐핑" 로직을 새 컴포넌트로 이식하는 항목이 있었으나, 검토 결과:
- `App.tsx`의 `pollBlogClip`은 이미 요청 실패 시 즉시 interval을 멈추고 `awaiting_*` 상태에서는 사용자 조작을 기다림(자동 재시도 루프 자체가 없음).
- `ImageSelectStep.tsx`는 이미 `BLOG_IMAGE_MIN_COUNT`(3)/`BLOG_IMAGE_MAX_COUNT`(8)로 CTA를 막고 있음.

`NewCutFlow`가 겪었던 무한 재시도 버그는 "전부 자동 선택 후 제출"하는 자체 로직의 문제였고, 기존 인터랙티브 플로우(사용자가 직접 고름)에는 애초에 해당하지 않아 이식할 대상이 없었음. 별도 작업 없이 Phase 1 완료.

## 검증
- `cd frontend && npm run build` — 통과 (tsc + vite build, 경고 없음)
- `cd backend && pytest -q` — 130 passed
- 프로덕션 배포본(`appealing-grace-production-4171.up.railway.app`)에서 실제 블로그 소스로 옵션 화면 진입까지는 확인. 새로 바뀐 판별 결과 카드/템플릿 갤러리 반응형 레이아웃/커머스 기본 선택은 로컬 개발 서버에 인증된 백엔드가 없어 이번 세션에서 브라우저로 직접 조작 검증은 못 함 — **다음 대화에서 실제 배포 후 스크린샷으로 확인 필요**.

## 남은 이슈
1. `NewCutFlow.tsx`/`newcut.css` 파일을 완전히 삭제할지, 다음 Phase에서 재활용할지 결정 안 됨(현재는 미사용 상태로 방치).
2. `TemplateGalleryStep`의 "브랜드 커스텀" 칩은 여전히 플레이스홀더("준비 중")만 있음(⑨-a 내 브랜드는 Phase 4).
3. 판별 결과 카드에 v3 스펙이 요구하는 상세 메타(유튜브 길이·채널, 블로그 사진 수·글자 수, 상품 가격·할인·리뷰, MP4 용량·해상도)는 아직 없음 — 블로그/상품은 사전 프리뷰 API가 없어 URL만 보고 소스 종류만 알려줌. 상세 메타를 보여주려면 백엔드에 경량 프리뷰 엔드포인트가 필요(범위 밖으로 판단해 이번엔 보류).
4. 크레딧 0/비공개 영상 시 CTA disabled 처리(⑨-c 예외 카드)는 이번 범위에 포함 안 됨.

## 다음 Phase 제안
README 권장 순서(기획서에서도 재확인): **Phase 3(구간 후보 비교·사진 선택 캡션·대본 3안·셀링포인트·①-b 대기 화면 소스별 문구) → Phase 2(편집기 5탭 리팩터) → Phase 4(계정 자산·모바일)**.

Phase 3을 시작하기 전에 결정 필요한 것:
- `NewCutFlow.tsx` 완전 삭제 여부(위 남은 이슈 1)
- 구간 후보 다중 선택 후 클립 생성을 순차 호출로 유지할지(이번 v3 결정대로 유지 권장) vs `clips:batch` 신규 엔드포인트
- 대본 3안 화면에서 "말투"(블로그 생성기 말투 라이브러리 공유) select를 이번 프로젝트에서 어떻게 가져올지(Ditodio 허브 연동 방식 확인 필요)

## 목업 충실도 보정 (2026-09-26)
- 카드 늘어남 수정(`.flow-card align-content:start`), 콘텐츠 폭 1100px.
- 타이틀 바 단계 알약(`FlowCrumbs`) — 소스별 순서, 기존 상단 스테퍼 제거.
- ①-b 분석 대기: 다크 2단 `WaitScreen` (유튜브·MP4·블로그·상품 공통).
- ② 후보: 흰 카드 + 9:16 썸네일, 점수·시작시각·길이, "← 다른 링크", 예상 차감 박스.
- ③ 사진: 소스별 라벨·문구, "N / 8장", 3장 미만 경고, 소스별 CTA.
- 대본 3안: 라디오·추천·길이 한 줄 머리, 문구 정렬.
- ⑥ 완료: 620px 폭, "완성" 라벨.
- 미반영: ② 영상 옵션 박스(토글·음성), ③ 스톡 보충, 대본 말투/분량, ⑥ 다운로드 카드 리스트·채널 업로드 (백엔드 기능 필요).

## 후속 기능 (2026-09-26)
- ② 후보: "원본 음성 / AI 나레이션" 선택 — AI 선택 시 클립 생성 뒤 기존 `POST /clips/{id}/narration` 호출(크레딧 추가 차감 없음).
- ② 후보: "무음 구간 제거" 토글 — `POST /clips/create`에 `remove_silence`. FFmpeg silencedetect(0.6초)로 잘라 자막 타이밍을 재계산, 컷 구간은 `clips.silence_cuts_json`에 저장. 로컬 FFmpeg로 6초→약 4.3초 확인, 운영 서버 실영상 시험은 미실시(업로드 원본 소실).
- ③ 사진(블로그): "사진 부족 시 스톡 보충" — `POST /blog-clips/{id}/images/stock-fill`(Pexels, 글 제목 검색). 운영에서 사진 1장 + 스톡 2장으로 대본 단계 진입 확인. `PEXELS_API_KEY` 필요.
- TTS: `TTS_PROVIDER=elevenlabs` 추가(보이스 24개 조회·샘플·나레이션). 운영에서 스톡 3장 쇼츠를 Remotion으로 렌더 확인. 공급자 변경 후 예전 보이스 id는 기본 보이스로 대체. 서버 전체에 적용(플랜별 구분 없음).
- 대본 3안: 말투 선택(차분한 정보형/친근한 리뷰어/활기찬 홍보형) + `POST /blog-clips/{id}/rewrite-scripts`. 운영 API 200 확인.
- 미구현: 분량 "시리즈 3편으로"(클립 여러 개 생성 파이프라인 필요), ElevenLabs 보이스 한글 이름.
