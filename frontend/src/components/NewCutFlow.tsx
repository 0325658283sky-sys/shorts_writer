import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, authorizedRequest, uploadRequest } from "../api/client";
import { TOKEN_KEY } from "../constants";
import type {
  BlogClip,
  Clip,
  ClipMetadata,
  Highlight,
  NarrationLanguage,
  Plan,
  ProjectRecord,
  ScriptTone,
  SubtitleTemplate,
  TargetLength,
  Usage,
  Video,
  Voice,
} from "../types";

/**
 * New Cut 리뉴얼 4단계 플로우 (design handoff: new-cut-handoff/01~04.html).
 * 단일 플로우로 유튜브/블로그/상품/MP4 소스를 모두 처리하고, 소스 종류에 따라
 * 기존 백엔드 API(/videos/*, /blog-clips/*, /clips/*)로 라우팅한다.
 */

type SourceKind = "youtube" | "blog" | "product" | "upload";
type Step = "home" | "options" | "progress" | "results";
type ClipMode = "ai" | "manual";

const NARRATION_LANG_OPTIONS: { value: NarrationLanguage; label: string }[] = [
  { value: "original", label: "🌐 원문 언어" },
  { value: "ko", label: "🇰🇷 한국어" },
  { value: "en", label: "🇺🇸 영어" },
  { value: "ja", label: "🇯🇵 일본어" },
];

const TARGET_LENGTH_OPTIONS: { value: TargetLength; label: string }[] = [
  { value: "short", label: "짧게 (약 10~20초)" },
  { value: "long", label: "길게 (약 30~45초)" },
];

const PROGRESS_STEP_DEFS = [
  { id: "fetch", label: "원본 영상 가져오기" },
  { id: "transcribe", label: "말소리 받아쓰기" },
  { id: "highlight", label: "볼 만한 구간 고르는 중" },
  { id: "template", label: "템플릿 적용해서 자막 붙이기" },
] as const;
type ProgressStepId = (typeof PROGRESS_STEP_DEFS)[number]["id"];

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function scoreOf(highlight: Highlight): number {
  return typeof highlight.score === "number" ? highlight.score : 0;
}

async function downloadBlob(path: string, filename: string, onError: (msg: string) => void) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    onError("로그인이 필요합니다.");
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(typeof data.detail === "string" ? data.detail : "다운로드에 실패했습니다.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    onError(error instanceof Error ? error.message : "다운로드에 실패했습니다.");
  }
}

async function fetchPreviewBlobUrl(path: string): Promise<string | null> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export type NewCutCandidate = {
  /** youtube/upload: highlight+clip 기반, blog/product: 단일 결과 */
  key: string;
  title: string;
  durationLabel: string;
  score: number | null;
  clip?: Clip;
  blogClip?: BlogClip;
};

export function NewCutFlow({
  usage,
  projects,
  onExit,
  onMessage,
  onRefreshProjects,
  resumeVideoId = null,
  resumeBlogClipId = null,
}: {
  usage: Usage | null;
  plans?: Plan[];
  projects: ProjectRecord[];
  onExit: () => void;
  onMessage: (message: string) => void;
  onRefreshProjects: () => void;
  resumeVideoId?: number | null;
  resumeBlogClipId?: number | null;
}) {
  const [step, setStep] = useState<Step>("home");
  // NewCutFlow는 App.tsx의 uploadMessage 배너가 렌더되는 Dashboard 자리를 대체하므로,
  // onMessage(setUploadMessage)만 호출하면 그 배너가 화면에 없어 사용자가 에러를 볼 수 없다.
  // 이 화면 자체에 토스트를 띄우기 위해 로컬 notice 상태를 함께 둔다.
  const [notice, setNotice] = useState<string | null>(null);
  function showMessage(message: string) {
    setNotice(message);
    onMessage(message);
  }
  const [sourceTab, setSourceTab] = useState<SourceKind>("youtube");
  const [sourceUrl, setSourceUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [starting, setStarting] = useState(false);

  // Source entities once created.
  const [video, setVideo] = useState<Video | null>(null);
  const [videoMeta, setVideoMeta] = useState<{ title: string; thumbnail_url: string | null } | null>(null);
  const [blogClip, setBlogClip] = useState<BlogClip | null>(null);

  // Options (step 2)
  const [mode, setMode] = useState<ClipMode>("ai");
  const [clipCount, setClipCount] = useState(5);
  const [hideSubtitles, setHideSubtitles] = useState(false);
  const [sourceLang, setSourceLang] = useState<NarrationLanguage>("original");
  const [targetLang, setTargetLang] = useState<NarrationLanguage>("ko");
  const [targetLength, setTargetLength] = useState<TargetLength>("short");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [templates, setTemplates] = useState<SubtitleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Progress (step 3)
  const [progressStepId, setProgressStepId] = useState<ProgressStepId>("fetch");
  const [progressPercent, setProgressPercent] = useState(4);
  const [stepDoneUntil, setStepDoneUntil] = useState(-1); // index of last completed step
  const [foundSegment, setFoundSegment] = useState<string | null>(null);
  const [progressCaption, setProgressCaption] = useState("시작하는 중…");
  const pollRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pollFailRef = useRef<number>(0);
  const renderFailRef = useRef<number>(0);
  const scriptFailRef = useRef<number>(0);

  // Results (step 4)
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [resultClips, setResultClips] = useState<Clip[]>([]);
  const [clipMetadataMap, setClipMetadataMap] = useState<Record<number, ClipMetadata>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [titleValue, setTitleValue] = useState("");
  const [subtitlesValue, setSubtitlesValue] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [regeneratingTitle, setRegeneratingTitle] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Resume an in-flight/completed project directly into progress/results.
  useEffect(() => {
    if (resumeVideoId != null) {
      authorizedRequest<Video>(`/videos/${resumeVideoId}`)
        .then((v) => {
          setVideo(v);
          setStep("progress");
          startedAtRef.current = Date.now();
          runYoutubePipeline(v, { resumed: true });
        })
        .catch((error) => showMessage(error instanceof Error ? error.message : "영상을 불러오지 못했습니다."));
    } else if (resumeBlogClipId != null) {
      authorizedRequest<BlogClip>(`/blog-clips/${resumeBlogClipId}`)
        .then((bc) => {
          setBlogClip(bc);
          if (bc.status === "completed") {
            enterBlogResults(bc);
          } else {
            setStep("progress");
            pollBlogUntilDone(bc.id);
          }
        })
        .catch((error) => showMessage(error instanceof Error ? error.message : "쇼츠를 불러오지 못했습니다."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeVideoId, resumeBlogClipId]);

  const recentItems = useMemo(() => projects.slice(0, 4), [projects]);
  const creditLabel = usage
    ? `쇼츠 크레딧 ${usage.shorts_used ?? usage.monthly_usage}/${usage.shorts_limit ?? usage.usage_limit}`
    : "쇼츠 크레딧 정보 없음";
  const creditLimit = (usage?.shorts_limit ?? usage?.usage_limit) || 1;
  const creditPercent = usage
    ? Math.min(100, Math.round(((usage.shorts_used ?? usage.monthly_usage) / creditLimit) * 100))
    : 0;

  // ---------- Step 1: home ----------

  async function handleStartConvert() {
    if (sourceTab === "upload") {
      if (!uploadFile) {
        showMessage("먼저 MP4 파일을 선택해주세요.");
        return;
      }
      setStarting(true);
      try {
        const formData = new FormData();
        formData.append("file", uploadFile);
        const uploaded = await uploadRequest<Video>("/videos/upload", formData);
        setVideo(uploaded);
        setVideoMeta({ title: uploaded.original_filename, thumbnail_url: null });
        setStep("options");
        await loadOptionsData();
      } catch (error) {
        showMessage(error instanceof Error ? error.message : "업로드에 실패했습니다.");
      } finally {
        setStarting(false);
      }
      return;
    }

    if (!sourceUrl.trim() || !isValidUrl(sourceUrl)) {
      showMessage("올바른 URL을 입력해주세요.");
      return;
    }
    setStarting(true);
    try {
      if (sourceTab === "youtube") {
        const preview = await authorizedRequest<{ url: string; title: string; thumbnail_url: string | null }>(
          "/videos/youtube-preview",
          { method: "POST", body: JSON.stringify({ url: sourceUrl.trim() }) },
        );
        const imported = await authorizedRequest<Video>("/videos/import-youtube", {
          method: "POST",
          body: JSON.stringify({ url: sourceUrl.trim() }),
        });
        setVideo(imported);
        setVideoMeta({ title: preview.title || imported.original_filename, thumbnail_url: preview.thumbnail_url });
        setStep("options");
        await loadOptionsData();
      } else {
        // blog / product 모두 blog-clips 파이프라인(blog_service/product_service)으로 처리됨.
        // 실제 생성(create_blog_clip)은 옵션 확정 후(step2 "이 설정으로 만들기")에 호출하고,
        // 여기서는 URL만 검증해 옵션 화면으로 넘어간다.
        setStep("options");
        await loadOptionsData();
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "변환 시작에 실패했습니다.");
    } finally {
      setStarting(false);
    }
  }

  // ---------- Step 2: options ----------

  async function loadOptionsData() {
    setLoadingOptions(true);
    try {
      const [voiceList, templateList] = await Promise.all([
        authorizedRequest<Voice[]>("/voices"),
        authorizedRequest<SubtitleTemplate[]>("/subtitle-templates?category=gallery"),
      ]);
      setVoices(voiceList);
      if (voiceList.length > 0) setSelectedVoiceId((current) => current || voiceList[0].id);
      setTemplates(templateList);
      if (templateList.length > 0) setSelectedTemplateId((current) => current ?? templateList[0].id);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "옵션 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingOptions(false);
    }
  }

  function handleCreateBrandTemplate() {
    // TODO(api): 커스텀(브랜드) 템플릿 생성 백엔드 엔드포인트가 아직 없음.
    // POST /subtitle-templates 로 일반 템플릿 생성은 가능하지만, "내 브랜드" 전용 업로드/추출
    // 플로우는 미구현 상태라 지금은 안내만 하고 실제 이동은 하지 않는다.
    console.log("[NewCutFlow] TODO(api): brand template builder flow not implemented on backend yet");
    showMessage("브랜드 템플릿 만들기는 준비 중이에요. (백엔드 전용 엔드포인트 필요)");
  }

  async function handleGenerate() {
    if (mode === "manual") {
      // TODO(api): manual segment selection not yet supported by backend.
      showMessage("직접 구간 설정은 아직 지원되지 않아요. AI 클립생성으로 진행해주세요.");
      return;
    }
    setStep("progress");
    startedAtRef.current = Date.now();
    setStepDoneUntil(-1);
    setProgressStepId("fetch");
    setProgressPercent(4);
    setFoundSegment(null);

    if (sourceTab === "youtube" || sourceTab === "upload") {
      if (!video) {
        showMessage("원본 영상 정보를 찾을 수 없습니다.");
        setStep("options");
        return;
      }
      await runYoutubePipeline(video, { resumed: false });
    } else {
      try {
        const created = await authorizedRequest<BlogClip>("/blog-clips", {
          method: "POST",
          body: JSON.stringify({
            url: sourceUrl.trim(),
            style: hideSubtitles ? "basic" : "shorts",
            target_length: targetLength,
            narration_language: targetLang,
            script_model: "gpt-4o-mini",
          }),
        });
        setBlogClip(created);
        onRefreshProjects();
        pollBlogUntilDone(created.id);
      } catch (error) {
        showMessage(error instanceof Error ? error.message : "생성 시작에 실패했습니다.");
        setStep("options");
      }
    }
  }

  // ---------- Step 3: progress (youtube/upload pipeline) ----------

  async function runYoutubePipeline(sourceVideo: Video, opts: { resumed: boolean }) {
    try {
      let currentVideo = sourceVideo;
      setProgressCaption("원본 영상을 가져오는 중…");
      if (currentVideo.status === "uploaded" || currentVideo.status === "failed") {
        const analyzed = await authorizedRequest<Video>(`/videos/${currentVideo.id}/analyze`, { method: "POST" }).catch(
          () => null,
        );
        if (analyzed) currentVideo = { ...currentVideo, ...analyzed };
      }
      setStepDoneUntil(0);
      setProgressStepId("transcribe");
      setProgressPercent(28);
      setProgressCaption("말소리를 받아쓰는 중…");

      const transcript = await authorizedRequest<{ status: string; text: string | null }>(
        `/videos/${currentVideo.id}/transcript`,
      );
      if (transcript.status === "failed") {
        throw new Error("음성 인식에 실패했습니다.");
      }
      setStepDoneUntil(1);
      setProgressStepId("highlight");
      setProgressPercent(56);
      setProgressCaption("볼 만한 구간을 고르는 중…");

      const foundHighlights = await authorizedRequest<Highlight[]>(`/videos/${currentVideo.id}/highlights`);
      const sorted = [...foundHighlights].sort((a, b) => scoreOf(b) - scoreOf(a));
      setHighlights(sorted);
      if (sorted.length > 0) {
        const top = sorted[0];
        setFoundSegment(`"${top.title}" — ${formatTime(top.start_time)}부터 ${Math.round(top.end_time - top.start_time)}초`);
      }
      setStepDoneUntil(2);
      setProgressStepId("template");
      setProgressPercent(78);
      setProgressCaption("템플릿을 적용해서 자막을 붙이는 중…");

      const chosen = sorted.slice(0, Math.max(1, clipCount));
      // 재방문(새로고침)/재시도 시 이미 만들어둔 클립을 다시 만들지 않도록,
      // 이 영상의 하이라이트에 대해 기존에 생성된 클립이 있으면 재사용한다.
      const existingClips = await authorizedRequest<Clip[]>("/clips").catch(() => [] as Clip[]);
      const existingByHighlight = new Map(existingClips.map((c) => [c.highlight_id, c]));
      const madeClips: Clip[] = [];
      for (let i = 0; i < chosen.length; i += 1) {
        const highlight = chosen[i];
        const already = existingByHighlight.get(highlight.id);
        let finalClip: Clip;
        if (already) {
          finalClip = already;
        } else {
          const created = await authorizedRequest<Clip>("/clips/create", {
            method: "POST",
            body: JSON.stringify({ highlight_id: highlight.id, visual_style: "yt_profile" }),
          });
          const rendered = await authorizedRequest<Clip>(`/clips/${created.id}/render-template`, {
            method: "POST",
            body: JSON.stringify({
              visual_style: "yt_profile",
              video_title: videoMeta?.title ?? currentVideo.original_filename,
              burn_subtitles: !hideSubtitles,
              subtitle_style: "shorts",
            }),
          }).catch(() => created);
          finalClip = rendered;
          if (selectedTemplateId != null) {
            finalClip = await authorizedRequest<Clip>(`/clips/${rendered.id}/template`, {
              method: "PATCH",
              body: JSON.stringify({ template_id: selectedTemplateId }),
            }).catch(() => rendered);
          }
        }
        madeClips.push(finalClip);
        setProgressPercent(78 + Math.round(((i + 1) / chosen.length) * 20));
      }
      setResultClips(madeClips);
      setStepDoneUntil(3);
      setProgressPercent(100);
      setProgressCaption("완료되었습니다.");
      onRefreshProjects();
      enterYoutubeResults(madeClips, sorted);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "쇼츠 생성 중 오류가 발생했습니다.");
      if (!opts.resumed) setStep("options");
    }
  }

  function pollBlogUntilDone(blogClipId: number) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    pollFailRef.current = 0;
    renderFailRef.current = 0;
    scriptFailRef.current = 0;
    // NOTE: 실제 웹소켓/서버 푸시가 없어 클라이언트 setInterval 폴링만 사용한다.
    // 즉 "닫아도 계속 만듭니다"는 서버 작업 자체는 계속 진행되지만, 이 화면(탭)을 벗어나면
    // 폴링이 멈추고, 다시 New Cut 화면으로 돌아왔을 때(재방문 시) 상태를 다시 조회해야 한다.
    pollRef.current = window.setInterval(async () => {
      try {
        const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClipId}`);
        pollFailRef.current = 0;
        setBlogClip(updated);
        applyBlogProgress(updated);

        if (updated.status === "awaiting_script" && !updated.script_tone) {
          // 자동 파일럿: 훅형 대본을 기본으로 선택해 파이프라인을 계속 진행시킨다.
          try {
            await authorizedRequest<BlogClip>(`/blog-clips/${blogClipId}/select-script`, {
              method: "POST",
              body: JSON.stringify({ tone: "hook" as ScriptTone }),
            });
            scriptFailRef.current = 0;
          } catch (scriptError) {
            scriptFailRef.current += 1;
            if (scriptFailRef.current >= 5) {
              if (pollRef.current) window.clearInterval(pollRef.current);
              showMessage(scriptError instanceof Error ? scriptError.message : "대본 생성에 실패했습니다.");
              setStep("options");
            }
          }
          return;
        }
        if (updated.status === "awaiting_images") {
          const candidates = await authorizedRequest<{ id: number }[]>(`/blog-clips/${blogClipId}/images`).catch(
            () => [],
          );
          // 이미지 후보가 백엔드 최소 개수(기본 3장) 미만이면 자동선택 PUT은 항상 400으로
          // 거부되어 재시도해도 영원히 같은 결과가 나온다 — 재시도 대신 바로 실패 처리한다.
          if (candidates.length < 3) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            showMessage(
              `이 소스에서 찾은 이미지가 ${candidates.length}장뿐이라 쇼츠를 만들 수 없어요(최소 3장 필요). 다른 글/상품 URL로 시도해주세요.`,
            );
            setStep("options");
            return;
          }
          try {
            await authorizedRequest<BlogClip>(`/blog-clips/${blogClipId}/images/selection`, {
              method: "PUT",
              body: JSON.stringify({ image_ids: candidates.map((c) => c.id) }),
            });
          } catch (selectionError) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            showMessage(selectionError instanceof Error ? selectionError.message : "이미지 선택에 실패했습니다.");
            setStep("options");
          }
          return;
        }
        if (updated.status === "awaiting_boards") {
          // 장면(보드) 세부 편집은 New Cut 4단계 플로우 범위를 벗어남 — 기본 구성 그대로 렌더 시작.
          try {
            await authorizedRequest<BlogClip>(`/blog-clips/${blogClipId}/render`, { method: "POST" });
            renderFailRef.current = 0;
          } catch (renderError) {
            renderFailRef.current += 1;
            if (renderFailRef.current >= 5) {
              if (pollRef.current) window.clearInterval(pollRef.current);
              showMessage(renderError instanceof Error ? renderError.message : "렌더 시작에 실패했습니다.");
              setStep("options");
            }
          }
          return;
        }
        if (updated.status === "completed") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          if (selectedTemplateId != null) {
            await authorizedRequest<BlogClip>(`/blog-clips/${blogClipId}/template`, {
              method: "PATCH",
              body: JSON.stringify({ template_id: selectedTemplateId }),
            }).catch(() => null);
          }
          onRefreshProjects();
          enterBlogResults(updated);
        } else if (updated.status === "failed") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          showMessage(updated.error_message || "생성에 실패했습니다.");
          setStep("options");
        }
      } catch (error) {
        // 일시적 오류는 무시하고 재시도하되, 연속 실패가 계속되면(약 20초) 멈춰서 사용자에게 알린다.
        // 그렇지 않으면 요청이 계속 실패해도 화면이 "시작하는 중…" 상태로 영원히 멈춰 보인다.
        pollFailRef.current += 1;
        if (pollFailRef.current >= 10) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          showMessage(error instanceof Error ? error.message : "진행 상태를 확인하지 못했습니다. 다시 시도해주세요.");
          setStep("options");
        }
      }
    }, 2000);
  }

  function applyBlogProgress(bc: BlogClip) {
    const stage = bc.progress_stage;
    let stepId: ProgressStepId = "fetch";
    let done = -1;
    if (["queued", "scraping", "downloading_images"].includes(stage)) {
      stepId = "fetch";
      done = -1;
    } else if (["generating_script"].includes(stage)) {
      stepId = "transcribe";
      done = 0;
    } else if (["awaiting_images", "awaiting_script", "awaiting_boards"].includes(stage)) {
      stepId = "highlight";
      done = 1;
    } else if (["synthesizing_audio", "rendering_video", "burning_subtitles"].includes(stage)) {
      stepId = "template";
      done = 2;
    } else if (stage === "done" || bc.status === "completed") {
      stepId = "template";
      done = 3;
    }
    setProgressStepId(stepId);
    setStepDoneUntil(done);
    setProgressPercent(Math.max(4, Math.min(100, bc.progress_percent || 0)));
    setProgressCaption(`경과 ${Math.round((Date.now() - startedAtRef.current) / 1000)}초`);
  }

  // ---------- Step 4: results ----------

  function enterYoutubeResults(madeClips: Clip[], sortedHighlights: Highlight[]) {
    setStep("results");
    if (madeClips.length > 0) {
      const first = madeClips[0];
      const h = sortedHighlights.find((item) => item.id === first.highlight_id);
      selectYoutubeCandidate(first, h ?? null);
    }
  }

  function enterBlogResults(bc: BlogClip) {
    setStep("results");
    setTitleValue(bc.title_candidates?.[0] || bc.blog_title || "");
    setSubtitlesValue(bc.narration_script || "");
    setSelectedKey(`blog-${bc.id}`);
    fetchPreviewBlobUrl(`/blog-clips/${bc.id}/stream`).then((url) => {
      if (url) setPreviewUrl(url);
    });
  }

  async function selectYoutubeCandidate(clip: Clip, highlight: Highlight | null) {
    setSelectedKey(`clip-${clip.id}`);
    setTitleValue(highlight?.title || clipMetadataMap[clip.id]?.title_candidates?.[0] || "");
    setSubtitlesValue(""); // TODO(api): burned-in ASS subtitle has no editable text track endpoint yet.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    const url = await fetchPreviewBlobUrl(`/clips/${clip.id}/preview`);
    if (url) setPreviewUrl(url);
  }

  const candidates: NewCutCandidate[] = useMemo(() => {
    if (blogClip) {
      return [
        {
          key: `blog-${blogClip.id}`,
          title: blogClip.title_candidates?.[0] || blogClip.blog_title || "생성된 쇼츠",
          durationLabel: "",
          score: null,
          blogClip,
        },
      ];
    }
    return resultClips.map((clip) => {
      const highlight = highlights.find((item) => item.id === clip.highlight_id);
      const duration = highlight ? Math.round(highlight.end_time - highlight.start_time) : 0;
      return {
        key: `clip-${clip.id}`,
        title: highlight?.title || `클립 #${clip.id}`,
        durationLabel: duration ? `0:${String(duration).padStart(2, "0")}` : "",
        score: highlight ? Math.round(scoreOf(highlight)) : null,
        clip,
      };
    });
  }, [resultClips, highlights, blogClip]);

  async function handleRegenerateTitle() {
    const selected = candidates.find((c) => c.key === selectedKey);
    if (!selected) return;
    setRegeneratingTitle(true);
    try {
      if (selected.clip) {
        const metadata = await authorizedRequest<ClipMetadata>(`/clips/${selected.clip.id}/metadata`, {
          method: "POST",
        });
        setClipMetadataMap((current) => ({ ...current, [selected.clip!.id]: metadata }));
        if (metadata.title_candidates.length > 0) setTitleValue(metadata.title_candidates[0]);
      } else if (selected.blogClip) {
        const updated = await authorizedRequest<BlogClip>(`/blog-clips/${selected.blogClip.id}/metadata`, {
          method: "POST",
        });
        setBlogClip(updated);
        if (updated.title_candidates.length > 0) setTitleValue(updated.title_candidates[0]);
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "제목 재생성에 실패했습니다.");
    } finally {
      setRegeneratingTitle(false);
    }
  }

  function handleSaveSubtitles() {
    // TODO(api): 자막은 ASS 파일(subtitle_path)로 굽혀 저장되며, 텍스트 트랙을 별도로 저장/동기화하는
    // 엔드포인트가 없다. 지금은 편집 내용을 로컬 상태로만 유지한다.
    showMessage("자막 텍스트 저장 API가 아직 없어 화면에서만 반영됩니다. (TODO(api))");
  }

  async function handleDownloadSelected() {
    const selected = candidates.find((c) => c.key === selectedKey);
    if (!selected) return;
    setDownloading(true);
    try {
      if (selected.clip) {
        await downloadBlob(`/clips/${selected.clip.id}/download`, `new-cut-clip-${selected.clip.id}.mp4`, showMessage);
      } else if (selected.blogClip) {
        await downloadBlob(
          `/blog-clips/${selected.blogClip.id}/download`,
          `new-cut-blog-${selected.blogClip.id}.mp4`,
          showMessage,
        );
      }
    } finally {
      setDownloading(false);
    }
  }

  function handleRegenerateLanguage() {
    // 다른 언어로 재생성: 현재 옵션 화면의 target_length/narration_language를 그대로 재사용해
    // 블로그 클립은 /blog-clips/{id}/versions(다국어 버전 생성)를, 유튜브 클립은 새 나레이션
    // 적용을 사용할 수 있다. 언어 선택 모달까지는 이번 범위에서 생략하고 옵션 화면으로 되돌린다.
    setStep("options");
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }

  // ---------- render ----------

  if (step === "home") {
    return (
      <div className="ncf">
        {notice ? (
          <div className="ncf-toast" role="alert" onClick={() => setNotice(null)}>
            {notice}
          </div>
        ) : null}
        <header className="ncf-main-header">
          <h1>나만의 숏폼을 바로 제작해보세요</h1>
        </header>

        <section className="ncf-input-card">
          <div className="ncf-tabs" role="tablist" aria-label="입력 소스 선택">
            {(
              [
                { id: "youtube", label: "유튜브 링크" },
                { id: "blog", label: "블로그 URL" },
                { id: "product", label: "상품 URL" },
                { id: "upload", label: "MP4 업로드" },
              ] as { id: SourceKind; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`ncf-tab${sourceTab === tab.id ? " active" : ""}`}
                role="tab"
                aria-selected={sourceTab === tab.id}
                data-source={tab.id}
                onClick={() => setSourceTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {sourceTab === "upload" ? (
            <div className="ncf-dropzone">
              <input
                type="file"
                accept="video/mp4"
                id="input-upload-file"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              />
              <label htmlFor="input-upload-file" className="ncf-dropzone-label">
                {uploadFile ? uploadFile.name : "여기를 클릭하거나 MP4 파일을 끌어다 놓으세요"}
              </label>
            </div>
          ) : (
            <div className="ncf-input-row">
              <label className="ncf-input-field">
                <input
                  type="url"
                  id="input-source-url"
                  placeholder={
                    sourceTab === "youtube"
                      ? "youtube.com/watch?v=... 붙여넣기"
                      : sourceTab === "blog"
                        ? "블로그 글 URL 붙여넣기"
                        : "상품 상세페이지 URL 붙여넣기"
                  }
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                />
              </label>
            </div>
          )}

          <button
            className="ncf-btn-primary"
            id="btn-convert-start"
            type="button"
            disabled={starting}
            onClick={handleStartConvert}
          >
            {starting ? "변환 준비 중…" : "변환 시작하기"}
          </button>
          <div className="ncf-credit-note">
            10분 영상 = 크레딧 1개 소모 · {creditLabel} ({creditPercent}%)
          </div>
        </section>

        <section className="ncf-recent">
          <h2>내 영상</h2>
          <div className="ncf-recent-grid">
            {recentItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="ncf-thumb"
                data-clip-id={item.id}
                style={{ background: ["#20342E", "#2C2440", "#3A2418", "#1E2A3A"][index % 4] }}
                onClick={onExit}
              >
                <span className="cap">{item.title}</span>
              </button>
            ))}
            {recentItems.length === 0 ? (
              <div className="ncf-thumb-empty">
                아직 생성한
                <br />
                영상이 없어요
              </div>
            ) : null}
            <button type="button" className="ncf-thumb-more" onClick={onExit}>
              전체 보기 →
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (step === "options") {
    return (
      <div className="ncf ncf-options-screen">
        {notice ? (
          <div className="ncf-toast" role="alert" onClick={() => setNotice(null)}>
            {notice}
          </div>
        ) : null}
        <header className="ncf-topbar">
          <button className="ncf-back" type="button" aria-label="이전으로" onClick={() => setStep("home")}>
            ←
          </button>
          <div className="ncf-video-thumb" style={{ background: "#20342E" }} />
          <div>
            <div className="ncf-title">{videoMeta?.title || sourceUrl || "원본 소스"}</div>
            <div className="ncf-duration">{sourceTab}</div>
          </div>
          <button className="ncf-btn-primary ncf-btn-generate" id="btn-generate" type="button" onClick={handleGenerate}>
            이 설정으로 만들기
          </button>
        </header>

        <div className="ncf-body-row">
          <aside className="ncf-options-panel">
            <div className="ncf-mode-switch" role="tablist" aria-label="클립 생성 방식">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "ai"}
                className={mode === "ai" ? "active" : ""}
                onClick={() => setMode("ai")}
              >
                AI 클립생성
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "manual"}
                className={mode === "manual" ? "active" : ""}
                onClick={() => setMode("manual")}
              >
                직접 구간 설정
              </button>
            </div>
            {mode === "manual" ? (
              <div className="ncf-field-hint">
                직접 구간 설정은 아직 지원되지 않아요. (TODO(api): manual segment selection not yet supported by backend)
              </div>
            ) : null}

            <div className="ncf-slider-row">
              <div className="ncf-field-label">몇 개의 쇼츠를 만들까요?</div>
              <input
                type="range"
                id="slider-clip-count"
                min={1}
                max={10}
                step={1}
                value={clipCount}
                aria-label="생성할 쇼츠 개수"
                onChange={(event) => setClipCount(Number(event.target.value))}
              />
              <div className="ncf-slider-scale">
                <span>1개</span>
                <span className="now" id="slider-clip-count-label">
                  약 {clipCount}개
                </span>
                <span>10개</span>
              </div>
            </div>

            <div className="ncf-field-toggle">
              <div>
                <div className="ncf-field-title">원본 자막 가리기</div>
                <div className="ncf-field-desc">원본 영상의 자막을 흐리게 처리해요</div>
              </div>
              <button
                className="ncf-switch"
                id="toggle-hide-subtitles"
                role="switch"
                aria-checked={hideSubtitles}
                type="button"
                onClick={() => setHideSubtitles((v) => !v)}
              >
                <span className="knob" />
              </button>
            </div>

            <div>
              <div className="ncf-field-label">언어 설정</div>
              <div className="ncf-lang-row">
                <select
                  id="select-source-lang"
                  aria-label="원본 언어"
                  value={sourceLang}
                  onChange={(event) => setSourceLang(event.target.value as NarrationLanguage)}
                >
                  {NARRATION_LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  id="select-target-lang"
                  aria-label="번역 언어"
                  value={targetLang}
                  onChange={(event) => setTargetLang(event.target.value as NarrationLanguage)}
                >
                  {NARRATION_LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="ncf-field-label">나레이션 (TTS)</div>
              <select
                className="ncf-select-box"
                id="btn-select-tts"
                aria-label="TTS 보이스 선택"
                value={selectedVoiceId}
                onChange={(event) => setSelectedVoiceId(event.target.value)}
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
              <div className="ncf-field-hint">원본 음성 유지도 가능해요</div>
            </div>

            <div>
              <div className="ncf-field-label">클립 길이</div>
              <select
                className="ncf-select-box"
                id="btn-select-clip-length"
                aria-label="클립 길이 프리셋"
                value={targetLength}
                onChange={(event) => setTargetLength(event.target.value as TargetLength)}
              >
                {TARGET_LENGTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {sourceTab === "youtube" || sourceTab === "upload" ? (
                <div className="ncf-field-hint">
                  {/* TODO(api): 유튜브/업로드 파이프라인은 클립 길이 프리셋을 백엔드에 아직 전달하지 않음(하이라이트 길이는 AI가 자동 결정). */}
                  유튜브/업로드는 AI가 구간 길이를 자동으로 정해요.
                </div>
              ) : null}
            </div>
          </aside>

          <section className="ncf-templates">
            <div className="ncf-templates-header">
              <h2>템플릿 선택</h2>
            </div>
            {loadingOptions ? (
              <div className="ncf-field-hint">템플릿을 불러오는 중…</div>
            ) : (
              <div className="ncf-template-grid" role="listbox" aria-label="템플릿 목록">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="ncf-tcard"
                    role="option"
                    aria-selected={selectedTemplateId === tpl.id}
                    data-template-id={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                  >
                    <div className="ncf-tcard-bg" style={{ background: tpl.accent_color || "#1B1B22" }} />
                    <div className="ncf-tcard-check">✓</div>
                    <div className="ncf-tcard-cap">{tpl.name}</div>
                  </button>
                ))}
                <button type="button" className="ncf-tcard-new" id="btn-create-brand-template" onClick={handleCreateBrandTemplate}>
                  <span>
                    내 브랜드
                    <br />
                    만들기
                  </span>
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (step === "progress") {
    const activeIndex = PROGRESS_STEP_DEFS.findIndex((s) => s.id === progressStepId);
    return (
      <div className="ncf ncf-progress-screen">
        {notice ? (
          <div className="ncf-toast" role="alert" onClick={() => setNotice(null)}>
            {notice}
          </div>
        ) : null}
        <section className="ncf-panel" role="status" aria-live="polite">
          <div>
            <div className="ncf-kicker">쇼츠 만드는 중</div>
            <h1 className="ncf-headline" id="progress-headline">
              {PROGRESS_STEP_DEFS[Math.max(activeIndex, 0)]?.label}
            </h1>
          </div>

          <ol className="ncf-steps" id="progress-steps">
            {PROGRESS_STEP_DEFS.map((s, index) => {
              const status = index <= stepDoneUntil ? "done" : index === activeIndex ? "active" : "pending";
              return (
                <li key={s.id} className="ncf-step" data-status={status} data-step={s.id}>
                  <span className="ncf-step-icon">{status === "done" ? "✓" : ""}</span>
                  <span className="ncf-step-label">{s.label}</span>
                </li>
              );
            })}
          </ol>

          <div>
            <div className="ncf-progress-track">
              <div className="ncf-progress-fill" id="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="ncf-progress-caption" id="progress-caption">
              {progressCaption}
            </div>
          </div>

          {foundSegment ? (
            <div className="ncf-found-segment" id="found-segment">
              <div className="label">먼저 찾은 구간</div>
              <div className="text">{foundSegment}</div>
            </div>
          ) : null}

          <button className="ncf-btn-ghost" id="btn-close-keep-running" type="button" onClick={onExit}>
            닫아도 계속 만듭니다
          </button>
        </section>
      </div>
    );
  }

  // step === "results"
  const selected = candidates.find((c) => c.key === selectedKey) ?? candidates[0] ?? null;
  return (
    <div className="ncf ncf-results-screen">
      {notice ? (
        <div className="ncf-toast" role="alert" onClick={() => setNotice(null)}>
          {notice}
        </div>
      ) : null}
      <aside className="ncf-candidates">
        <div className="ncf-candidates-header">
          <h2 id="candidates-count">생성된 쇼츠 {candidates.length}개</h2>
          <span className="sort">점수 높은 순</span>
        </div>
        <ul className="ncf-candidate-list" id="candidate-list" role="listbox" aria-label="생성된 쇼츠 후보">
          {candidates.map((candidate) => (
            <li key={candidate.key}>
              <button
                type="button"
                className={`ncf-candidate${candidate.key === selected?.key ? " selected" : ""}`}
                role="option"
                aria-selected={candidate.key === selected?.key}
                data-clip-id={candidate.key}
                onClick={() => {
                  if (candidate.clip) {
                    const h = highlights.find((item) => item.id === candidate.clip!.highlight_id) ?? null;
                    void selectYoutubeCandidate(candidate.clip, h);
                  } else if (candidate.blogClip) {
                    enterBlogResults(candidate.blogClip);
                  }
                }}
              >
                <span className="thumb" style={{ background: "#20342E" }} />
                <span className="meta">
                  <span className="cap">{candidate.title}</span>
                  <span className="dur">{candidate.durationLabel}</span>
                </span>
                {candidate.score != null ? <span className="score">{candidate.score}점</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="ncf-preview">
        <div className="ncf-preview-actions">
          <button className="primary" id="btn-regenerate-lang" type="button" onClick={handleRegenerateLanguage}>
            다른 언어로 재생성
          </button>
          <button className="secondary" id="btn-open-editor" type="button" onClick={onExit}>
            편집
          </button>
        </div>
        <div className="ncf-phone" id="video-preview">
          {previewUrl ? (
            <video ref={videoRef} src={previewUrl} className="ncf-phone-video" playsInline onEnded={() => setIsPlaying(false)} />
          ) : (
            <div className="ncf-phone-placeholder" />
          )}
          {selected?.score != null ? <span className="badge-score">{selected.score}점</span> : null}
          <button className="play" type="button" aria-label={isPlaying ? "일시정지" : "재생"} onClick={togglePlay}>
            {isPlaying ? "❚❚" : "▶"}
          </button>
        </div>
        <button className="ncf-btn-download" id="btn-download-mp4" type="button" disabled={downloading} onClick={handleDownloadSelected}>
          {downloading ? "다운로드 중…" : "MP4 다운로드"}
        </button>
      </section>

      <aside className="ncf-side-panel">
        <div>
          <div className="ncf-guide-header">
            <h3>AI 품질 가이드</h3>
          </div>
          <div className="ncf-guide-text" id="guide-text">
            {/* TODO(api): 클립/블로그 클립 모델에 "AI 품질 가이드" 전용 텍스트 필드가 없어 고정 안내 문구로 대체. */}
            선택한 템플릿과 자막 설정으로 생성된 결과예요. 제목/자막을 다듬은 뒤 다운로드하세요.
          </div>
        </div>

        <div className="ncf-field">
          <h3>제목</h3>
          <div className="ncf-title-row">
            <input type="text" id="input-title" value={titleValue} onChange={(event) => setTitleValue(event.target.value)} />
            <button
              className="ncf-btn-regen"
              id="btn-regenerate-title"
              type="button"
              disabled={regeneratingTitle}
              onClick={handleRegenerateTitle}
            >
              재생성
            </button>
          </div>
        </div>

        <div className="ncf-field ncf-subtitles">
          <h3>자막</h3>
          <textarea
            id="textarea-subtitles"
            value={subtitlesValue}
            onChange={(event) => setSubtitlesValue(event.target.value)}
            onBlur={handleSaveSubtitles}
          />
        </div>
      </aside>
    </div>
  );
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
