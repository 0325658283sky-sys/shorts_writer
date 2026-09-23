# 완료 보고 — Phase 1 (템플릿 갤러리 + 입력화면 정리)

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
