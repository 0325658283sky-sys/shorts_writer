# New Cut 리뉴얼 제안 — 개발 전달용 코드

원본: Design 캔버스 "New Cut 리뉴얼 제안 (피카클립 구조 · 기존 디자인 톤)"
(피카클립 구조를 참고해 New Cut의 기존 디자인 톤을 유지하며 재구성한 4단계 플로우)

이 폴더의 4개 HTML 파일은 캔버스의 각 화면을 **dc-runtime 래퍼(`<x-dc>`, `<helmet>`,
`support.js`, 컴포넌트 스크립트) 없이 순수 HTML/CSS/JS만으로** 다시 정리한 것입니다.
프레임워크 종속 없이 그대로 열어볼 수 있고, Cursor 등 코딩 AI에게 "이 마크업/스타일을
기준으로 실제 기능을 붙여줘" 하고 넘기기 좋은 형태입니다.

## 화면 구성 (플로우 순서)

1. **`01-home.html`** — ① 입력: 유튜브/블로그/상품 URL 또는 MP4로 원본 소스 입력
2. **`02-settings-template.html`** — ② 옵션 · 템플릿 선택: 쇼츠 개수, 자막·언어·나레이션 옵션, 템플릿 선택
3. **`03-progress.html`** — ③ 생성 중: AI 처리 단계와 진행률 표시
4. **`04-results.html`** — ④ 결과 리스트 · 미리보기: 생성된 쇼츠 후보 목록, 미리보기, 제목/자막 편집, 다운로드

## 디자인 토큰 (4개 파일에 공통, 각 파일 `<style>` 상단 `:root`)

| 변수 | 값 | 용도 |
|---|---|---|
| `--ink` | `#16161A` | 기본 텍스트/진한 배경 |
| `--ink-soft` | `#6B6B75` | 보조 텍스트 |
| `--muted` | `#9C9CA6` | 캡션/placeholder |
| `--surface` | `#FFFFFF` | 카드/패널 배경 |
| `--surface-2` | `#FBFBFC` | 옅은 배경 |
| `--page-bg` | `#F3F3F5` | 페이지 배경 |
| `--line` / `--line-strong` | `#E8E8EC` / `#E0E0E6` | 구분선/보더 |
| `--accent` / `--accent-strong` / `--accent-soft` | `#4B3BFF` / `#3B2CE0` / `#EFEDFF` | 브랜드 보라(포인트 컬러) |
| `--radius` / `--radius-control` / `--radius-pill` | `11px` / `8px` / `999px` | 카드 / 버튼·인풋 / 필·토글 |
| `--font` | Pretendard → Noto Sans KR → sans-serif | 본문 폰트 (jsdelivr CDN, 운영 시 자체 호스팅 검토) |

같은 값을 코드베이스의 기존 디자인 토큰/Tailwind 설정 등으로 옮겨써도 무방합니다.
(각 파일이 완전히 독립적으로 열리도록 토큰을 파일마다 중복 선언해 두었습니다.)

## 공통 주의사항

- 캔버스 원본이 **1440×900 데스크톱 고정 캔버스** 기준이라, 반응형(태블릿/모바일)
  브레이크포인트는 아직 설계되어 있지 않습니다. 모바일 대응이 필요하면 별도 논의가 필요합니다.
- 인터랙션이 필요한 지점은 각 HTML 파일 안에 `<!-- TODO(coding AI): ... -->` 주석과
  `id`/`data-*` 속성으로 표시해 두었습니다. 아래 화면별 목록은 그 요약입니다.
- 모든 시각 요소(색상·간격·라운드 값)는 목업 그대로이며, 실제 구현 시 컴포넌트 라이브러리나
  디자인 시스템에 맞게 리팩터링해도 값 자체는 유지해 주세요.

## 화면별 기능 TODO

### 01-home.html (입력)
- 상단 4개 탭(`data-source="youtube|blog|product|upload"`) 전환 시 입력 UI가 달라져야 함
  (URL 입력 vs 파일 업로드 드롭존). 현재는 '유튜브 링크' 탭 상태만 마크업됨.
- `#input-source-url` 값 검증 (URL 형식) 필요.
- `#btn-convert-start` 클릭 → 변환/생성 API 호출 → `03-progress.html` 로 이동.
- 좌측 `.rail-plan` 크레딧 표시는 로그인 사용자의 실제 플랜/사용량 데이터로 바인딩.
- `.recent-grid` 최근 영상 목록은 실제 프로젝트 API로 대체 (현재는 4개 정적 예시 + 빈 상태 카드).

### 02-settings-template.html (옵션 · 템플릿)
- `.mode-switch` 두 모드(`data-mode="ai|manual"`)는 서로 다른 하위 옵션 UI를 가짐
  (자동 생성 vs 수동 구간 지정). 현재는 'AI 클립생성' 모드 상태만 마크업됨.
- `#slider-clip-count` (range input) 값 변경 시 `#slider-clip-count-label` 갱신.
- `#toggle-hide-subtitles` 토글 스위치 상태 관리 (`aria-checked` 반영).
- `#select-source-lang` / `#select-target-lang` 실제 언어 옵션 목록 연결.
- `#btn-select-tts`, `#btn-select-clip-length` 클릭 시 드롭다운/모달 오픈.
- `.template-grid` 내 각 `button.tcard`는 `data-template-id`로 식별, 클릭 시 단일 선택
  토글(`aria-selected`) — 실제 템플릿 목록 API로 대체 필요.
- `#btn-create-brand-template` ("내 브랜드 만들기") → 커스텀 템플릿 생성 플로우로 이동.
- `#btn-generate` ("이 설정으로 만들기") 클릭 → 선택된 옵션·템플릿으로 생성 작업 시작 →
  `03-progress.html` 로 이동.

### 03-progress.html (생성 중)
- `#progress-steps` 안의 각 `<li data-step="...">`는 `data-status="done|active|pending"`을
  실제 백엔드 작업 상태에 맞춰 폴링 또는 웹소켓으로 갱신.
- `#progress-fill`의 width(%)와 `#progress-caption`의 경과/잔여 시간을 실제 진행률에 바인딩.
- `#found-segment` (먼저 찾은 구간 미리보기)는 첫 하이라이트가 감지된 시점에만 노출.
- `#btn-close-keep-running`: 화면을 벗어나도 서버 작업은 계속 진행되어야 하며, 완료 시
  알림/리다이렉트로 `04-results.html` 이동 처리.

### 04-results.html (결과 리스트 · 미리보기)
- `#candidate-list` 항목(`data-clip-id`)은 실제 생성 결과(개수·점수·정렬)로 대체, 클릭 시
  가운데 미리보기(`#video-preview`)와 우측 패널(`#guide-text`, `#input-title`,
  `#textarea-subtitles`) 갱신.
- `#video-preview`는 정적 목업 → 실제 video/canvas 기반 재생기로 교체, 재생 버튼에
  재생/일시정지 로직 연결.
- `#btn-regenerate-lang` (다른 언어로 재생성): 언어 선택 후 비동기 재생성 요청.
- `#btn-open-editor` (편집): 편집 화면/모달로 이동.
- `#btn-download-mp4`: 선택된 클립을 실제 파일로 인코딩·다운로드.
- `#btn-regenerate-title`: AI 제목 재생성 API 호출.
- `#textarea-subtitles` 편집 시 비디오 자막 트랙과 동기화 필요.

## 파일 목록

```
new-cut-handoff/
├── 01-home.html
├── 02-settings-template.html
├── 03-progress.html
├── 04-results.html
└── README.md
```
