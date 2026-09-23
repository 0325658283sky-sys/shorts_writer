# Claude Code 요청문 — New Cut v2

아래를 그대로 붙여 넣으세요. 이 폴더(`design_handoff_newcut_v2/`)를 레포 루트에 먼저 복사해 두세요.

---

`design_handoff_newcut_v2/README.md`를 끝까지 읽고, 설계를 이 레포(`frontend/`, `backend/`, `remotion/`)에 구현해 줘. 목업은 `design_handoff_newcut_v2/mockup/쇼츠 생성기 UX 개선 검토.dc.html`이야(브라우저로 열어서 섹션 번호로 대조해).

규칙:
1. README의 **"⚠️ 코드와 목업이 다른 곳"** 절이 목업보다 우선이야. 특히 요금 수치는 README의 ⑨-e 표를 따르고, ① 소스 입력은 현재 `CreateStudio` 단일 입력을 유지해.
2. 스타일은 `frontend/src/styles.css`의 `:root` 토큰만 써. 새 하드코딩 색은 넣지 마. 목업의 radius 12–18px와 Inter 폰트는 무시해.
3. **Phase 단위로 진행해.** 이번 세션은 **Phase 1(템플릿)**만 해. 시작 전에 계획(스키마 변경, 마이그레이션, 바뀌는 파일 목록)을 먼저 보여주고 내 확인을 받아.
4. Phase 2의 `MediaPanel` 리팩터는 **동작 변화 없이 상태만 분리하는 커밋**을 먼저 따로 만들어.
5. 각 단계가 끝날 때마다 `cd frontend && npm run build`와 `cd backend && pytest -q`를 통과시키고, 단계마다 커밋을 나눠.
6. 정책 결정이 필요한 것(분석 크레딧, 추가 구매 결제, SNS 연동)은 임의로 채우지 말고 feature flag 뒤에 UI만 두거나 멈추고 물어봐.
7. 끝나면 `design_handoff_newcut_v2/COMPLETION_REPORT.md`에 1차 보고서와 같은 형식으로 결과를 정리해.
