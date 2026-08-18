# Design System Unification — New Cut ← 블로그 포스트 생성기(Ditodio/blog_writer)

| | |
|---|---|
| **목적** | New Cut(쇼츠 생성기) 프런트엔드의 앱 크롬 디자인을, 같은 Ditodio 허브에 속한 블로그 포스트 생성기(`C:\Users\stkim\Documents\Codex\blog_writer`)의 디자인 언어에 맞춰 통일한다. |
| **작성일** | 2026-08-18 |
| **범위** | `frontend/src/styles.css` 및 컴포넌트의 색상·타이포·spacing·라운드·버튼/카드/배지/인풋/상단 내비 패턴 |
| **범위 밖** | Remotion 영상 비주얼 스타일 팩(`visual_style_catalog.py`의 `impact_full`/`info_black`/... 5종)은 완전히 다른 개념 — **쇼츠 영상 안**의 스타일이지 **앱 UI**가 아니다. 절대 혼동해서 건드리지 말 것. |
| **관련 문서** | [ARCHITECTURE.md](ARCHITECTURE.md) "Frontend Layout", [USER_JOURNEYS.md](USER_JOURNEYS.md) §1 글로벌 IA |

## 배경

`backend/app/core/config.py`의 `ditodio_hub_url`/`platform_handoff_secret`, 최근 커밋(`Ditodio 허브 handoff 로그인과 쇼츠 사용량 연동`)에서 보듯 New Cut은 이제 blog_writer(Ditodio 블로그 포스트 생성기) 허브에서 계정을 넘겨받아 동작하는 서브 제품이다. blog_writer의 `AppNav.tsx`에는 이미 New Cut으로 나가는 링크(`NewCutLink`)가 있다 — 사용자가 두 앱을 같은 세션에서 오가므로, 화면이 다른 제품처럼 보이면 신뢰도가 떨어진다. 두 앱을 같은 디자인 시스템으로 통일하는 것이 목표다.

두 프로젝트는 기술 스택이 다르다: blog_writer는 **Next.js + Tailwind v4 + CVA**, New Cut은 **Vite + 순수 CSS**(`styles.css`, 4500+ 줄, `:root` CSS 변수 기반). Tailwind를 새로 들여오는 건 과잉 작업이므로, **CSS 커스텀 프로퍼티(토큰) 값과 컴포넌트 스타일 규칙만 이식**하는 방식을 취한다 — 다행히 New Cut도 이미 토큰화가 잘 되어 있어(`--accent`, `--radius` 등이 13곳 이상에서 참조됨) 값 교체 위주로 끝낼 수 있다.

## 1. 디자인 톤 비교

| | New Cut (현재) | blog_writer (목표) |
|---|---|---|
| 배경 | `#f0f1f5` | `#F3F3F5` |
| 서피스(카드/모달) | `#ffffff` | `#FFFFFF` |
| 텍스트(본문) | `#15171f` | `#16161A` |
| 보더 | `#e6e8ef` | `#E8E8EC` |
| 강조색(accent) | `#6d5ef5` (바이올렛) | `#4B3BFF` (더 채도 높은 블루-바이올렛) |
| 강조색 hover | `#5746e5` | `#3B2CE0` |
| accent-soft(연한 배경) | `#eeebff` | `#EFEDFF` |
| 라운드(카드) | `16px` | `11px` |
| 라운드(버튼/컨트롤) | `999px`(완전 pill) | `8px` |
| 버튼 높이 | `40px` | `30px`(기본), `28px`(sm), `42px`(lg) |
| 버튼 폰트 크기 | `14px` | `12px` |
| 밀도 | 소비자 앱형(여유로운 여백, 큰 라운드) | 프로 SaaS형(조밀, 각진 라운드) |
| 폰트 | Pretendard(자체 호스팅 woff2) | Inter + Noto Sans KR(Google Fonts) |

**결론**: 색상 계열은 이미 같은 보라 계열이라 크게 위화감은 없지만, **라운드/밀도 차이가 가장 크게 "다른 제품처럼" 보이는 원인**이다(완전 pill 버튼 vs 각진 8px 버튼, 16px 카드 vs 11px 카드). 이 문서는 색상 토큰 + 라운드/밀도 스케일을 blog_writer 값으로 맞추는 데 집중한다.

## 2. 폰트 정책 결정

**권장: Pretendard 유지, Google Font(Inter) 전환은 하지 않는다.**

이유:
- New Cut은 이미 Pretendard/Paperlogy/Gmarket Sans/SUIT/Jalnan 5종을 자체 호스팅 woff2로 서빙 중이고(`styles.css:1-63`), 이는 **쇼츠 영상 스타일 팩의 브랜드 폰트**([`visual_style_catalog.py`](../backend/app/services/visual_style_catalog.py) `ALLOWED_FONT_IDS`)와 물려 있어 앱 폰트만 따로 바꾸면 오히려 영상 미리보기(앱 내 헤더 등)와 UI 폰트가 어긋나 보인다.
- Pretendard는 한글 렌더링 품질이 Noto Sans KR보다 좋다는 평가가 일반적이고, 외부 Google Fonts 요청이 없어 오프라인/속도 이점이 있다.
- 폰트 통일의 체감 효과는 색상/라운드/밀도 통일보다 훨씬 작다 — 비용 대비 우선순위 낮음.

blog_writer 쪽에 폰트를 맞추고 싶다면(선택, 이 문서 범위 밖): blog_writer의 `layout.tsx`에서 `--font-sans-app`를 Pretendard로 바꾸는 게 반대 방향으로는 더 쉽다. New Cut을 Inter로 바꾸는 건 권장하지 않는다.

## 3. 토큰 매핑 (`frontend/src/styles.css` `:root`)

[`styles.css:65-92`](../frontend/src/styles.css:65)의 `:root` 블록을 아래처럼 교체한다. 변수 **이름**은 기존 그대로 유지(코드베이스 전체에서 `var(--accent)` 등으로 광범위하게 참조되므로 이름을 바꾸면 diff가 불필요하게 커진다) — **값만** blog_writer 팔레트로 교체.

```css
:root {
  --font-display: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif;
  --font-body: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", ui-sans-serif, system-ui, sans-serif;

  /* ---- blog_writer 팔레트로 교체 ---- */
  --ink: #16161A;            /* 기존 #15171f */
  --ink-soft: #6B6B75;       /* 기존 #5b6170 → blog_writer --muted */
  --muted: #9C9CA6;          /* 기존 #8b91a1 → blog_writer --faint */
  --surface: #FFFFFF;        /* 동일 */
  --surface-2: #FBFBFC;      /* 기존 #f4f5f8 → blog_writer --surface-2 */
  --page-bg: #F3F3F5;        /* 기존 #f0f1f5 → blog_writer --background */
  --line: #E8E8EC;           /* 기존 #e6e8ef → blog_writer --border */
  --line-strong: #E0E0E6;    /* 기존 #d8dbe5 → blog_writer --border-strong */
  --accent: #4B3BFF;         /* 기존 #6d5ef5 → blog_writer --accent */
  --accent-strong: #3B2CE0;  /* 기존 #5746e5 → blog_writer --accent-hover */
  --accent-soft: #EFEDFF;    /* 기존 #eeebff → blog_writer --accent-soft (거의 동일) */
  --accent-2: #fb7185;       /* 유지 — New Cut 전용 보조색(경고/하이라이트 등), blog_writer엔 대응값 없음 */
  --warm: #fb7185;           /* 유지 */
  --danger: #C2453C;         /* 기존 #d64545 → blog_writer badge danger 계열과 통일 */

  /* ---- 라운드/밀도: blog_writer는 조밀한 SaaS 톤. 카드/컨트롤 분리 도입 ---- */
  --radius: 11px;            /* 기존 16px → blog_writer --radius-card */
  --radius-control: 8px;     /* 신규 — 버튼/인풋/뱃지용, blog_writer --radius-control */
  --radius-pill: 999px;      /* 유지 — 프로그레스바 등 실제로 pill이어야 하는 요소용으로 좁혀서 사용 */

  --shadow: 0 1px 2px rgba(22, 22, 26, 0.06);   /* 기존 0 8px 24px(과한 플로팅 섀도) → 훨씬 절제된 값 */
  --focus-ring: 0 0 0 2px rgb(75 59 255 / 22%); /* --accent 기준으로 재계산 */
  --select-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1.5 1.75L6 6.25L10.5 1.75' stroke='%2316161A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");

  font-family: var(--font-body);
  color: var(--ink);
  background: var(--page-bg);
  color-scheme: light;
}
```

> **주의**: `--radius`는 현재 카드/모달/패널 등 13곳 이상에서 재사용 중([styles.css:329,431,441,698,770,960,1124,1844,2890,3632,3773,3816](../frontend/src/styles.css) 등). 값을 16px→11px로 한 번에 바꾸면 전 화면이 동시에 좁은 라운드로 바뀐다 — 의도된 변경이니 OK, 다만 반드시 각 화면을 시각적으로 스팟체크(§6 체크리스트)한다. `--radius-control`은 새로 도입하는 변수라 버튼/인풋류에 한해 별도 적용이 필요(§4).

## 4. 컴포넌트별 마이그레이션

### 4.1 버튼 — `.btn-primary` / `.btn-outline` / `.btn-ghost` ([styles.css:149-194](../frontend/src/styles.css:149))

현재: `min-height: 40px`, `padding: 0 18px`, `border-radius: var(--radius-pill)`(완전 pill), `font-size: 14px`.

blog_writer `Button` 컴포넌트([button.tsx](../../blog_writer/src/components/ui/button.tsx)) 기준으로 교체:

```css
.btn-primary,
.btn-outline,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 14px;
  border-radius: var(--radius-control); /* 999px pill → 8px */
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.btn-primary {
  border: 0;
  background: var(--accent);
  color: #fff;
  box-shadow: 0 1px 2px rgba(75, 59, 255, 0.4);
}
.btn-primary:hover { background: var(--accent-strong); }

.btn-outline {
  background: #fff;
  border: 1px solid var(--line-strong);
  color: #3A3A44;
}
.btn-outline:hover { border-color: #C6C6CE; }

.btn-ghost {
  border: 0;
  background: transparent;
  color: var(--ink-soft);
}
.btn-ghost:hover { color: var(--ink); background: var(--page-bg); }
```

주 CTA(렌더링 시작, 다음 단계 등 큰 버튼)는 blog_writer의 `size="lg"`(42px, 10px 라운드, 13.5px 폰트)에 대응하는 `.btn-lg` 모디파이어를 새로 추가해 기존 대형 버튼 자리에 적용한다. 기존 `.btn-primary`를 무조건 30px로 줄이면 CreateStudio의 "쇼츠 만들기" 같은 1차 CTA가 너무 작아 보일 수 있으니, 화면별로 `default`(30px)/`lg`(42px) 구분해서 적용한다.

### 4.2 카드 — 신규 `.card` 패턴 (blog_writer [card.tsx](../../blog_writer/src/components/ui/card.tsx))

New Cut에는 통일된 `.card` 클래스가 없고 화면마다 개별 클래스(`.blog-clip-card`, `.result-card` 등)로 라운드/보더를 직접 지정하는 구조로 보인다. 전면 리팩터 대신, **공통 톤만 맞추는 낮은 리스크 접근**을 권장:

```css
/* 카드류 공통 톤 — 기존 클래스들에 이 3개 선언만 맞춰 넣는다 */
border: 1px solid var(--line);
border-radius: var(--radius); /* 11px */
background: var(--surface);
box-shadow: var(--shadow); /* 절제된 그림자 또는 none */
```

카드 헤더가 있는 곳(`BlogClipCard`, `ResultActionsCard` 등)은 blog_writer `CardHeader`처럼 `height: 40px`, `border-bottom: 1px solid var(--line)`, `padding: 0 16px`로 통일하면 톤이 확 맞아떨어진다.

### 4.3 배지/칩 (blog_writer [badge.tsx](../../blog_writer/src/components/ui/badge.tsx))

New Cut의 상태 라벨(진행중/완료/실패, 플랜 배지 등)에 아래 톤 팔레트를 적용:

```css
.badge-neutral { background: #F0F0F3; color: #6B6B75; }
.badge-accent  { background: var(--accent-soft); color: var(--accent); }
.badge-success { background: #E7F5EF; color: #0F7B52; }
.badge-warning { background: #F4EDD8; color: #8A6410; }
.badge-danger  { background: #F7E7E5; color: #C2453C; }
/* 공통 */
height: 20px; border-radius: 5px; padding: 0 8px; font-size: 10.5px; font-weight: 700;
```

`BlogClipCard.tsx`/`ProjectsPage.tsx`의 상태 라벨, `MembershipPage.tsx`의 플랜 뱃지에 적용.

### 4.4 인풋 (blog_writer [input.tsx](../../blog_writer/src/components/ui/input.tsx))

```css
input, textarea, select {
  border-radius: var(--radius-control); /* 8px, 기존엔 아마 --radius(16px) 그대로 썼을 것 */
  border: 1px solid var(--line);
  background: #fff;
  padding: 8px 12px;
  font-size: 14px;
}
input:focus, textarea:focus, select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
  outline: none;
}
```

### 4.5 상단 내비 — `.studio-topbar` 계열 ([styles.css:482-576](../frontend/src/styles.css:482))

이미 구조(sticky, blur, 좌측 브랜드 + 내비 링크, 활성 링크 = accent-soft 배경 + accent 텍스트)가 blog_writer `AppNav.tsx`와 패턴이 거의 동일하다. 값만 맞춘다:

| 클래스 | 현재 | 목표 |
|---|---|---|
| `.studio-topbar` | `padding: 12px ...` | 유지(살짝만 축소 가능, `10px`) |
| `.brand-mark` | 28×28px, 그라디언트 박스 + 그림자 | **제거 검토** — blog_writer는 아이콘 없이 텍스트 워드마크("Ditodio")만 사용. New Cut도 `.brand-name` 텍스트만 남기고 `.brand-mark` 그라디언트 박스를 빼면 훨씬 "허브 계열사" 느낌이 남 |
| `.brand-name` | `18px/700/var(--accent)` | 유지 가능(색만 새 `--accent`로 자동 반영) |
| `.studio-nav-link` | `min-height:36px`, `border-radius: var(--radius-pill)`, `14px` | `min-height:32px`, `border-radius: var(--radius-control)`(8px), `13px` |
| `.studio-nav-link.is-active` | `background: var(--accent-soft); color: var(--accent)` | 그대로 — 이미 blog_writer와 동일한 패턴 |

브랜드 영역에 "Ditodio" 계열 표기(예: "New Cut by Ditodio" 또는 상단바에 blog_writer로 돌아가는 링크)를 추가할지는 제품 결정 사항 — 이 문서는 시각 톤 통일까지만 다루고, 상호 링크 여부는 별도 논의로 남긴다.

## 5. 적용 순서 (리스크 낮은 순)

```text
1. 토큰 값 교체(§3) — :root 블록만 수정. 전체 화면에 영향이 즉시 퍼지므로 먼저 하고 스팟체크.
2. 버튼(§4.1) — 클래스 3개, 사용처 많지만 선언부만 바꾸면 전역 반영.
3. 인풋(§4.4) — 폼이 많은 CreateStudio/BoardEditor에서 눈에 띄게 체감됨.
4. 배지(§4.3) — 상태 라벨류, 영향 범위 작고 안전.
5. 카드(§4.2) — 화면별 클래스가 제각각이라 가장 손이 많이 감. 자주 보이는 화면(Dashboard, BlogClipCard, ProjectsPage)부터.
6. 상단 내비(§4.5) — 브랜드 마크 제거 여부는 사용자 확인 후 진행.
```

## 6. 검증 체크리스트

프런트 변경 후 `npm run dev`로 아래 화면을 직접 띄워 스팟체크(디자인 리뷰는 자동화 테스트로 못 잡음):

- [ ] 로그인/회원가입 (`AuthPanel.tsx`)
- [ ] Dashboard 3탭(만들기/프로젝트/요금제) 전환
- [ ] CreateStudio 소스 선택 카드(블로그/유튜브/상품/MP4)
- [ ] BlogClipFlow 진행바 + 스텝 전환(이미지 선택/대본 톤/보드 편집)
- [ ] BoardEditor 3분할(리스트/프리뷰/미디어 패널) — 특히 탭 버튼들
- [ ] YoutubeClipFlow / YoutubeClipEditor
- [ ] MembershipPage 플랜 카드
- [ ] 완료 화면(`ResultActionsCard`, `CompletedShortPlayer`)

라운드/버튼 밀도가 바뀌면서 텍스트 줄바꿈이 깨지는 좁은 버튼이 없는지 특히 확인(패딩이 18px→14px로 줄어듦).

## 7. 완료 기준

- [ ] `:root` 토큰이 §3 값으로 교체되고 `--radius-control` 신설
- [ ] 버튼/인풋/배지가 새 라운드·크기 스케일 적용
- [ ] §6 체크리스트 전 화면 스팟체크 통과(레이아웃 깨짐 없음)
- [ ] `npm run build` (`tsc -b && vite build`) 타입 에러 없이 통과
- [ ] Remotion 영상 비주얼 스타일(`visual_style_catalog.py`, `remotion/src/BlogShorts.tsx`)은 이 작업으로 **전혀 변경되지 않음** — 앱 UI와 영상 내부 스타일은 완전히 분리된 관심사임을 재확인
