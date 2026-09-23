# 완료 보고 — Phase 1 (템플릿 갤러리 + 입력화면 정리) / Phase 3 (구간 후보·대본 3안) / Phase 2 (편집기 5탭)

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

### 검증
- `npm run build`, `pytest -q`(130 passed) 통과.
- **라이브 화면 확인은 못 함.** 이 편집기(`BoardEditor`)에 들어가려면 블로그클립이 `awaiting_boards` 상태여야
  하는데, `BlogClipFlow.tsx`의 기존 로직이 그 상태가 되자마자 "장면 직접 편집" 버튼을 사용자가 누르기도 전에
  자동으로 렌더를 시작해버리는 **사전에 있던 버그**(내가 만든 게 아님, Phase 2와 무관)에 막혀 접근 경로를
  찾지 못했습니다. `#/shorts/{id}/edit` 해시 라우트로도 이미 완료된 클립은 결과 화면으로 감. 코드 리뷰와
  빌드 통과로만 검증했고, 실제 화면 스크린샷 확인은 다음 세션 숙제로 남김.

### 남은 이슈
1. **BoardEditor 진입 불가 버그** — `BlogClipFlow.tsx`의 `useEffect`가 `isAwaitingBoards && !showTemplateGallery`이면
   무조건 자동 렌더를 시작해, "장면 직접 편집" 버튼이 사실상 눌릴 기회가 없음. Phase 2 완성도를 확인하려면
   먼저 이 버그부터 고쳐야 함.
2. "구간편집" 탭에 이미지 교체 기능을 넣은 게 맞는 배치인지 실제 사용 후 재검토 필요.
3. 텍스트 탭 실제 기능(장면별 폰트/크기/강조색/애니메이션)은 백엔드 스키마 추가가 선행돼야 함.

### 다음 제안
다음 세션에서 먼저 위 "BoardEditor 진입 불가 버그"를 고쳐서 Phase 2 결과물을 실제로 확인한 뒤, Phase 4(계정
자산·모바일)로 넘어가는 걸 권장.

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
