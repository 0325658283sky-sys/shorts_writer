# Quality Upgrade — Design Doc

| | |
|---|---|
| **목적** | 쇼츠 생성기 결과물 퀄리티 개선 항목의 구현 설계. Cursor에서 항목별로 독립 구현 가능하도록 파일/함수 단위로 명세. |
| **작성일** | 2026-08-18 |
| **범위 밖** | Remotion 자체 도입 여부(이미 결정됨, `docs/REMOTION_EVAL.md` 참고), 잡큐/멀티워커 인프라(`docs/DEPLOYMENT.md`), 결제/크레딧 |
| **관련 문서** | [ARCHITECTURE.md](ARCHITECTURE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md), [USER_JOURNEYS.md](USER_JOURNEYS.md) |

우선순위: **P0** = 결과물 퀄리티에 가장 크게 기여, **P1** = 파이프라인별 개선, **P2** = 있으면 좋음. 항목은 서로 독립적이라 순서 바꿔 구현해도 무방하다.

---

## A. BGM 실음원 라이브러리 교체 (P0)

### 현재 상태

- [`bgm_mood_catalog.py`](../backend/app/services/bgm_mood_catalog.py) — 무드(`hook_upbeat`/`bright_vlog`/`info_soft`/`calm_mood`/`promo_pulse`/`neutral_bed`) → 톤/스타일별 후보 slug 매핑 로직은 잘 구성되어 있음.
- [`audio_service.py:225`](../backend/app/services/audio_service.py:225) `seed_system_audio_assets()` — 실제 음원이 아니라 FFmpeg로 **합성한 sine/pad 톤**(`generate_soft_pad_mp3`, `generate_pulse_bed_mp3`, `generate_tone_mp3`, [`ffmpeg_service.py`](../backend/app/services/ffmpeg_service.py))을 시드로 채운다. 무드당 slug가 **딱 1개**뿐이라(`pick_default_bgm`이 후보 중 첫 매치를 반환) 같은 무드는 항상 같은 곡이 나온다.
- 라이선스 이슈 회피를 위해 의도적으로 합성음을 썼다는 주석이 있음(`"no third-party music license"`).

### 문제

쇼츠에서 BGM은 체감 퀄리티의 절반 이상을 차지하는데, 무드 로직이 아무리 정교해도 소스가 사인파/패드 합성음이면 결과물이 "진짜 영상"처럼 안 들린다. 곡 다양성도 없어 같은 스타일로 여러 편 만들면 BGM이 반복된다.

### 설계

**소스 전략: 번들 로열티프리 mp3 (API 실시간 연동 아님)**

Pexels(이미지)와 달리 음악은 라이선스 조건이 트랙별로 다르고 상업적 재배포 여부를 매번 확인해야 하므로, 런타임에 외부 API를 호출하는 대신 **CC0 / Pixabay Content License 등으로 사전 확인된 트랙을 리포에 번들**하는 방식을 권장한다. 이유:

1. Pexels 이미지 검색은 "화면에 안 나오는 요청 실패"가 UX적으로 치명적이지 않지만, 렌더 파이프라인 중간에 음악 API가 실패하면 전체 렌더가 막힌다 — 오프라인 안정성이 중요.
2. 음원 개수가 애초에 적어도 됨(무드당 3~5곡, 총 25~30곡선)이라 CDN/스토리지 비용 부담이 없다.
3. 라이선스 출처를 커밋 시점에 고정해두면 추후 감사(audit)가 쉬움.

**데이터 모델**: `audio_assets` 테이블 스키마 변경 없음. `storage_path`가 합성 mp3 → 실제 mp3 파일 경로로 바뀔 뿐.

**구현**:

1. 무드별 실음원 3~5곡을 확보해 `backend/app/storage/audio/system/<slug>.mp3`로 배치. 출처/라이선스는 `backend/app/storage/audio/system/LICENSES.md`에 트랙명·저작자·라이선스·다운로드 URL을 기록(감사 대비, git에 커밋).
2. [`bgm_mood_catalog.py`](../backend/app/services/bgm_mood_catalog.py)의 `slugs` 배열을 무드당 다중 트랙으로 확장:
   ```python
   "hook_upbeat": {
       ...
       "slugs": ["promo_pulse_1", "promo_pulse_2", "bright_lift_1", "bright_lift_2"],
   },
   ```
3. [`audio_service.py:121`](../backend/app/services/audio_service.py:121) `pick_default_bgm()` — 현재 "후보 순서대로 첫 매치"를 **가중 랜덤 선택**으로 변경(같은 blog_clip_id를 해시 시드로 써서 같은 클립 재렌더 시엔 같은 곡 유지, 새 클립은 다른 곡이 나오도록):
   ```python
   import random
   def pick_default_bgm(conn, script_tone, target_length, visual_style=None, *, mood_id=None, seed: int | None = None) -> AudioAsset | None:
       _mood, candidates = resolve_candidate_slugs(...)
       available = [s for s in candidates if get_system_audio_by_slug(conn, s) is not None]
       if not available:
           return None
       rng = random.Random(seed) if seed is not None else random
       return get_system_audio_by_slug(conn, rng.choice(available))
   ```
   호출부(`blog_service.py`의 `start_blog_clip_render` 근처, Stage 23 "SFX on boards after the first" 로직과 동일 위치)에서 `seed=blog_clip.id`를 넘겨 재렌더 시 일관성 유지.
4. `_ensure_seed_file()` / `seed_system_audio_assets()`의 "합성 생성" 분기를 제거하고, 번들 파일이 없으면 경고 로그만 남기고 스킵(현재도 `FFmpegNotAvailableError` 시 best-effort로 넘어가는 패턴과 동일하게 유지).
5. SFX(tick/pop/whoosh/click/swell)는 그대로 합성음 유지해도 무방 — 전환 효과음은 짧고 추상적이라 합성음으로도 충분히 자연스럽다. BGM만 교체 대상.

### 완료 기준

- [ ] 무드 5종 × 최소 3트랙 = 15곡 이상의 실제 음원이 `storage/audio/system/`에 존재
- [ ] 동일 무드로 블로그 쇼츠를 3번 이상 생성하면 BGM이 로테이션됨(항상 같은 곡이 아님)
- [ ] 같은 blog_clip을 재렌더(버전 추가)해도 BGM이 바뀌지 않음(일관성)
- [ ] `LICENSES.md`에 전체 트랙 출처 기록
- [ ] `pytest backend/tests/test_*audio*` 및 기존 BGM 관련 테스트 통과

### 예상 공수

음원 소싱(반나절~1일, 논코딩) + 코드 변경(반나절). 소싱이 병목이므로 먼저 착수 권장.

---

## B. 워드 타이밍 캡션 (카라오케 자막) (P0)

두 파이프라인의 자막 렌더링 경로가 다르므로 설계를 분리한다: 유튜브/MP4 클립은 ASS 번인(FFmpeg), 블로그 쇼츠는 Remotion React 컴포넌트.

### B-1. 유튜브/MP4 클립 — ASS `\k` 카라오케

**현재 상태**:
- [`transcription_service.py:158-159`](../backend/app/services/transcription_service.py:158) — Whisper 호출이 `timestamp_granularities=["segment"]`만 요청. 단어 타임스탬프를 받지 않음.
- [`clip_service.py:214`](../backend/app/services/clip_service.py:214) `_subtitle_events_for_clip()` — 세그먼트 텍스트를 `split_text_for_duration()`([`subtitle_utils.py:56`](../backend/app/services/subtitle_utils.py:56))으로 **글자수 기준 균등 분할**해 타이밍을 만든다. 실제 발화 타이밍과 무관한 추정치.

**설계**:

1. `transcription_service.py`의 Whisper 호출을 `timestamp_granularities=["segment", "word"]`로 확장. 응답의 `words: [{word, start, end}]`를 세그먼트별로 저장 — `transcripts.segments_json`의 각 세그먼트 dict에 `"words": [...]` 키를 추가(스키마 마이그레이션 불필요, JSON 컬럼이라 그대로 확장 가능). Whisper가 word timestamp를 못 준 구간(드묾)은 `words: []`로 두고 폴백.
2. [`subtitle_utils.py`](../backend/app/services/subtitle_utils.py)에 신규 함수 추가:
   ```python
   def build_karaoke_text(words: list[dict], line_start: float) -> str:
       """words: [{word, start, end}] (절대 초) → ASS \\k 태그 텍스트.
       \\k는 centisecond 단위 duration(다음 \\k까지 유지되는 하이라이트 길이)."""
       parts = []
       for w in words:
           dur_cs = max(1, round((w["end"] - w["start"]) * 100))
           parts.append(f"{{\\k{dur_cs}}}{w['word']}")
       return "".join(parts)
   ```
   `AssStyleParams`에 `karaoke_color: str = "#FFFF00"` 필드 추가 — `\k` 하이라이트는 `SecondaryColour`가 담당하므로 `ass_style_line()`에서 `secondary = hex_to_ass_color(params.karaoke_color)`로 교체(현재 `secondary`는 하드코딩된 `"&H000000FF"` — [`subtitle_utils.py:179`](../backend/app/services/subtitle_utils.py:179)).
3. `clip_service._subtitle_events_for_clip()`을 확장: 세그먼트에 `words`가 있으면 단어 그룹(현재처럼 최대 2줄 wrap 유지하되, 각 청크 텍스트를 `build_karaoke_text()`로 생성)으로 이벤트 생성, 없으면 기존 균등분배 폴백 그대로 사용.
4. **제품 결정**: 별도 `karaoke` DB 컬럼/프론트 토글은 두지 않는다. word timestamp가 있으면 항상 `\k` 카라오케를 적용하고, 없으면 기존 균등분배로 폴백한다. 기존 `basic`/`bold`/`shorts` 프리셋의 폰트·색·박스 스타일은 그대로 쓰되, SecondaryColour만 카라오케 하이라이트에 사용한다.

**완료 기준**:
- [x] 새 자막 mp4에서 발화 중인 단어가 실시간으로 강조색 표시(word timestamp가 있을 때)
- [x] word timestamp 없는 세그먼트는 기존 방식대로 정상 동작(회귀 없음)
- [x] 기존 `basic`/`bold`/`shorts` 프리셋의 박스/폰트 스타일은 유지. 카라오케는 토글이 아니라 word timestamp 유무로만 분기

### B-2. 블로그 쇼츠 — Remotion 워드 하이라이트

**현재 상태**:
- OpenAI TTS는 워드 타임스탬프를 제공하지 않음(텍스트→오디오만 반환). 보드별 나레이션은 [`tts_service.py`](../backend/app/services/tts_service.py)에서 합성 후 보드 duration에 맞춰 배분됨.
- [`remotion_props_service.py:160`](../backend/app/services/remotion_props_service.py:160) `_props_from_boards()` — 보드마다 `text`(전체 문자열)와 `durationSec`만 props로 내려줌.
- [`BlogShorts.tsx:388`](../remotion/src/BlogShorts.tsx:388) `CaptionBlock` — `text` 전체를 정적으로 렌더링(카라오케 없음). REMOTION_EVAL.md가 "kinetic captions"를 유일하게 강한 Remotion 도입 근거로 꼽았는데, 정작 Remotion 채택 후에도 미구현 상태.

**설계 — 2단계 접근**:

**Phase 1 (추정 타이밍, 추가 비용 없음)**

보드 오디오 길이는 이미 알고 있으므로(TTS 합성 후 `board_durations`), 단어별 타이밍을 **글자 수 비례로 추정**한다. 한국어 TTS는 속도가 비교적 일정해 이 근사가 꽤 잘 맞는다.

1. `remotion_props_service._props_from_boards()`에 헬퍼 추가:
   ```python
   def _estimate_word_timings(text: str, duration_sec: float) -> list[dict]:
       words = text.split()
       if not words:
           return []
       weights = [max(1, len(w)) for w in words]
       total = sum(weights)
       cursor = 0.0
       out = []
       for word, weight in zip(words, weights):
           span = duration_sec * (weight / total)
           out.append({"text": word, "startSec": round(cursor, 3), "endSec": round(cursor + span, 3)})
           cursor += span
       return out
   ```
   `board_props` 딕셔너리에 `"words": _estimate_word_timings(board.text or "", duration_sec)` 추가.
2. `remotion/src/types.ts`의 보드 props 타입에 `words: { text: string; startSec: number; endSec: number }[]` 추가.
3. `BlogShorts.tsx`에 `KineticCaptionBlock` 신규 컴포넌트 — 기존 `CaptionBlock`을 감싸되, `useCurrentFrame()` + `fps`로 현재 재생 시각을 구해 `words` 배열에서 현재 활성 단어 index를 찾고, 해당 단어만 강조 스타일(색상 변경 + `scale(1.08)` pop, 짧은 spring 애니메이션)을 적용. 나머지 텍스트는 기존 스타일 유지. 캡션 스타일(`center_stroke`/`bottom_outline`/`black_box`/`white_pill`) 4종 모두에 적용되도록 공통 로직으로 구현.
4. [`visual_style_catalog.py`](../backend/app/services/visual_style_catalog.py)의 `VISUAL_STYLES` 각 항목에 `"captionAnimation": "highlight"` 필드 추가(기본 전 스타일 on). 사용자가 끌 수 있게 `style_overlay_json`에 `captionAnimation: "none" | "highlight"` 오버라이드 허용(`sanitize_style_overlay`/`merge_style_overlay`에 필드 추가).

**Phase 2 (정밀 정합, 선택형 — 나중에)**

TTS 합성이 끝난 보드별 mp3를 Whisper `timestamp_granularities=["word"]`로 재전사해 실제 발화 타이밍을 얻는다. 추가 OpenAI 호출 1회/보드 → 렌더 시간/비용 증가.

1. `blog_clips`에 `caption_precision TEXT DEFAULT 'estimated'` (`'estimated' | 'precise'`) 컬럼 추가.
2. `precise`일 때만 `run_blog_clip_render_pipeline()`의 TTS 합성 직후, 보드별 mp3에 대해 Whisper 재전사 호출 → 단어 타임스탬프로 Phase 1의 추정치를 덮어씀.
3. 프론트 `StyleAudioStep.tsx` 또는 `QuickSettingsStep.tsx`에 "정밀 자막(느림)" 토글 추가.
4. Phase 1만으로도 체감 품질 개선이 크므로, Phase 2는 사용자 피드백을 보고 착수 여부 결정 — 지금 설계만 남기고 구현은 보류 가능.

**완료 기준 (Phase 1)**:
- [x] 모든 시각 스타일에서 단어별 하이라이트가 표시되고 TTS 속도와 체감상 300ms 이내로 맞음
- [x] 보드 텍스트가 빈 문자열이거나 1단어일 때도 크래시 없음
- [x] `captionAnimation: "none"` 오버라이드 시 기존 정적 캡션과 동일하게 렌더
- [x] FFmpeg 폴백 경로(`blog_render_ffmpeg_fallback`)는 이 기능 영향 없음(ASS 캡션은 그대로 정적 — B-1과는 별개 경로이므로 필요 시 B-1 방식을 폴백에도 이식할지는 별도 판단)

---

## C. 상품 이미지 Vision 필터링 (P1)

### 현재 상태

[`product_service.py`](../backend/app/services/product_service.py)가 아마존/스마트스토어에서 이미지 URL을 스크래핑 순서 그대로 반환한다. `_ensure_min_images()`([:517](../backend/app/services/product_service.py:517))는 개수만 보장하고, 워터마크/사이즈표/배너성 이미지와 실제 제품 클로즈업을 구분하지 않는다. 보드로 그대로 들어가면 "상세페이지 스크린샷" 느낌의 이미지가 섞여 쇼츠 퀄리티를 떨어뜨린다.

### 설계

1. 신규 모듈 함수(`product_service.py` 또는 신규 `product_image_filter.py`):
   ```python
   def classify_product_images(image_urls: list[str], product_title: str) -> list[dict]:
       """반환: [{"url": ..., "category": "product_shot"|"banner_text"|"size_chart"|"lifestyle"|"other", "score": 0-100}]"""
   ```
   `gpt-4o-mini`(비전 지원)에 이미지 URL을 4~6장 배치로 묶어 전달, JSON 응답으로 분류/점수 요청. 프롬프트는 "제품이 화면 대부분을 차지하는 깨끗한 컷 = 고득점, 텍스트 배너/워터마크/사이즈표/스크린샷 = 저득점"으로 지시.
2. 파이프라인 연결 지점: `blog_service.py`의 이미지 다운로드 단계(상품 URL이 소스일 때, `downloading_images` 스테이지) 직후 — 다운로드된 이미지에 대해 `classify_product_images()` 호출 → 점수 내림차순 정렬 → `blog_clip_image_candidates.selected` 초기값을 상위 N개(`blog_image_max_count`)로 설정. 나머지는 후보 풀에 남겨 W2(`ImageSelectStep`)에서 사용자가 수동으로 바꿀 수 있게 유지(기존 UX 그대로).
3. 실패/쿼터 초과 시 폴백: 예외를 삼키고 기존 스크래핑 순서를 그대로 사용(회귀 없음, 다른 Vision/OpenAI 실패 처리 패턴과 동일).
4. 비용 관리: 상품 URL 플로우에서만 호출(블로그 텍스트 소스는 대상 아님 — 스크래핑 이미지가 이미 본문 맥락과 연결되어 있어 우선순위가 낮음). 클립당 이미지 수가 최대 `blog_image_candidate_max_count`(36장)까지 갈 수 있으므로, Vision 호출은 상위 후보 확보 목적상 처음 20장 정도로 캡을 둬서 비용 억제.

### 완료 기준

- [x] 아마존/스마트스토어 테스트 URL 세트에서 워터마크·배너·사이즈표 이미지가 자동 선택 상위권에서 배제됨
- [x] Vision 호출 실패 시 기존 동작과 동일하게 폴백(에러로 파이프라인이 죽지 않음)
- [x] `test_product_amazon.py`/`test_product_smartstore.py`에 분류 폴백 케이스 테스트 추가

---

## D. 훅 나레이션 스크립트 모델 정책 개선 (P1)

### 현재 상태

- 온스크린 타이틀(`style_title`/`style_subtitle`)은 이미 `openai_title_model = gpt-4o`로 격상되어 있다([`config.py:17`](../backend/app/core/config.py:17), [`blog_service.py:2504`](../backend/app/services/blog_service.py:2504) `_resolve_title_model`).
- **나레이션 본문**(`summary`/`hook`/`detailed` 3톤)은 [`generate_blog_narration_script_candidates`](../backend/app/services/blog_service.py:2208)에서 **한 번의 GPT 호출로 3톤을 동시 생성**하며, 모델은 `_resolve_script_model()` → 기본 `gpt-4o-mini`([:2198](../backend/app/services/blog_service.py:2198)). 프론트에 `script_model` 수동 선택 옵션이 있지만 "UI상 임시"(USER_JOURNEYS.md 2.1)로 기본은 mini.

### 문제

시청 지속률을 좌우하는 건 나레이션의 오프닝 훅 문장인데, 정작 훅 톤도 summary/detailed와 같은 mini 모델·같은 프롬프트 안에서 생성된다. 3톤을 한 호출로 묶은 구조라 톤별로 다른 모델을 못 씀.

### 설계

3톤 생성 호출을 분리한다:

1. `generate_blog_narration_script_candidates()`를 두 호출로 분리:
   - 호출 1 (`gpt-4o-mini`, 기존 프롬프트에서 summary/detailed만 요청): 비용 절감 유지.
   - 호출 2 (`gpt-4o` 고정, hook 전용 프롬프트): 기존 `_narration_hook_guidance()` 가이드를 더 훅 중심으로 강화하고, 온스크린 타이틀 생성부([:2536](../backend/app/services/blog_service.py:2536) `generate_style_hook_titles`)와 동일한 "curiosity gap / FOMO / contrast / concrete scene / result-first" 규칙을 나레이션 훅에도 명시적으로 재사용.
   - 두 응답을 병합해 기존과 동일한 `{"summary":..., "hook":..., "detailed":...}` 반환 — 호출부(`run_blog_clip_pipeline`) 변경 불필요.
2. `script_model` 프론트 파라미터는 "hook 호출에만 적용되는 오버라이드"로 의미 재정의(요청 시 `gpt-4o-mini`를 명시하면 hook도 mini로 강제 — 비용 민감 사용자 대응).
3. 실패 시 폴백: 훅 전용 호출이 실패하면 mini 결과의 hook 필드로 대체(전체 파이프라인이 죽지 않도록).

### 완료 기준

- [x] 기본 설정에서 hook 톤 후보만 `gpt-4o`로 생성됨(응답 JSON 키 구조는 기존과 동일해 프론트/DB 변경 불필요)
- [x] `script_model=gpt-4o-mini` 명시 요청 시 hook도 mini로 생성(과거 동작과 동일하게 되돌릴 수 있음)
- [x] 비용 영향 로그: 요청당 GPT 호출이 1회 → 2회로 증가하므로 모델별 호출 기록 남기기(추후 비용 분석용)

---

## E. (보류/참고) 유튜브 클립에 비주얼 스타일 팩 적용 (P2)

블로그 쇼츠는 `visual_style_catalog.py`의 5개 스타일 팩(폰트/색상/헤더/전환)을 쓰지만, 유튜브 클립(`YoutubeClipEditor.tsx`)은 자막 3종(`basic`/`bold`/`shorts`)만 있고 동일한 스타일 팩이 적용되지 않는다(USER_JOURNEYS.md §8-7 "세부 편집 깊이 차이"). 같은 Remotion 엔진을 공유하도록 만들면 유튜브 클립도 블로그 쇼츠와 동일한 비주얼 퀄리티를 낼 수 있지만, 이는 유튜브 클립 렌더 경로 자체를 FFmpeg→Remotion으로 옮기는 큰 작업이라 별도 설계 문서가 필요하다. 이번 라운드는 범위에서 제외하고 백로그로만 남긴다.

---

## 구현 순서 제안

```text
1. A. BGM 실음원 (음원 소싱이 병목 → 먼저 착수)
2. B-1. 유튜브 카라오케 자막 (ASS \k, 기존 인프라 재사용 커서 활용도 높음)
3. B-2 Phase 1. 블로그 쇼츠 추정 워드 하이라이트
4. D. 훅 스크립트 모델 분리
5. C. 상품 이미지 Vision 필터링
6. B-2 Phase 2 (필요 시 나중에)
```

A, B-1, B-2, C, D는 서로 파일이 거의 겹치지 않아 병렬 진행 가능. 단 B-2 Phase 1은 `remotion/`(TS)과 `backend/`(Python) 양쪽을 같이 건드리므로 한 세션에서 끝내는 걸 권장.
