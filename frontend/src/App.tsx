import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, authorizedRequest, request, uploadRequest } from "./api/client";
import { AuthPanel } from "./components/AuthPanel";
import { BlogClipFlow } from "./components/BlogClipFlow";
import { BoardEditor } from "./components/board/BoardEditor";
import { Dashboard } from "./components/Dashboard";
import { FlowCrumbs, type FlowCrumbState } from "./components/FlowCrumbs";
import { StudioShell } from "./components/StudioShell";
import { type YoutubePreview } from "./components/YoutubeConfirmStep";
import { YoutubeClipFlow } from "./components/YoutubeClipFlow";
import { YoutubeWorkspaceEditor } from "./components/YoutubeWorkspaceEditor";
import {
  BLOG_CLIP_POLL_INTERVAL_MS,
  BLOG_CLIP_STATUS_LABELS,
  CLIP_STATUS_LABELS,
  TOKEN_KEY,
  VIDEO_STATUS_LABELS,
  type YoutubeLengthBand,
} from "./constants";
import {
  parseAppRoute,
  routeFromScreenState,
  writeAppRoute,
  type AppRoute,
  type StudioTab,
} from "./lib/appRoute";
import { clearHandoffFromUrl, readInboundDeeplink } from "./lib/inboundDeeplink";
import { buildProjectListItems } from "./lib/projectAdapters";
import type {
  BlogClip,
  Board,
  Clip,
  ClipMetadata,
  Highlight,
  Plan,
  ProjectRecord,
  NarrationLanguage,
  ScriptModel,
  ScriptTone,
  SubtitleStyle,
  TargetLength,
  Transcript,
  TtsMode,
  Usage,
  User,
  Video,
  VideoStatusResponse,
  View,
  VisualStyleSlug,
  WizardBoardsStep,
} from "./types";

function subtitleStyleFromVisual(style: string): SubtitleStyle {
  const slug = style.toLowerCase();
  if (slug.includes("card_white") || slug.includes("fullscreen")) return "basic";
  if (slug.includes("info_") || slug.includes("card_news") || slug.includes("yt_profile")) return "bold";
  return "shorts";
}

type YoutubeProjectMeta = {
  title: string;
  channel: string | null;
  thumbnail_url: string | null;
  channel_avatar_url: string | null;
  visualStyle: string;
};

export function App() {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("stage2-test@example.com");
  const [password, setPassword] = useState("Password123!");
  const [user, setUser] = useState<User | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [flowCrumb, setFlowCrumb] = useState<FlowCrumbState | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transcripts, setTranscripts] = useState<Record<number, Transcript>>({});
  const [highlights, setHighlights] = useState<Record<number, Highlight[]>>({});
  const [clips, setClips] = useState<Record<number, Clip>>({});
  const [clipMetadata, setClipMetadata] = useState<Record<number, ClipMetadata>>({});
  const [subtitleStyles, setSubtitleStyles] = useState<Record<number, SubtitleStyle>>({});
  const [ttsModes, setTtsModes] = useState<Record<number, TtsMode>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubePreview, setYoutubePreview] = useState<YoutubePreview | null>(null);
  const [isPreviewingYoutube, setIsPreviewingYoutube] = useState(false);
  const [preferredYoutubeVisualStyle, setPreferredYoutubeVisualStyle] = useState<string | null>(null);
  const [youtubeProjectMetaByVideoId, setYoutubeProjectMetaByVideoId] = useState<
    Record<number, YoutubeProjectMeta>
  >({});
  const [blogUrl, setBlogUrl] = useState("");
  const [blogSubtitleStyle, setBlogSubtitleStyle] = useState<SubtitleStyle>("shorts");
  const [blogTargetLength, setBlogTargetLength] = useState<TargetLength>("short");
  const [blogNarrationLanguage, setBlogNarrationLanguage] = useState<NarrationLanguage>("original");
  const [blogScriptModel, setBlogScriptModel] = useState<ScriptModel>("gpt-4o-mini");
  const [blogClips, setBlogClips] = useState<BlogClip[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isCreatingBlogShort, setIsCreatingBlogShort] = useState(false);
  const [selectingBlogScriptId, setSelectingBlogScriptId] = useState<number | null>(null);
  const [confirmingImageSelectionId, setConfirmingImageSelectionId] = useState<number | null>(null);
  const [savingVoiceId, setSavingVoiceId] = useState<number | null>(null);
  const [savingStyleId, setSavingStyleId] = useState<number | null>(null);
  const [savingVisualStyleId, setSavingVisualStyleId] = useState<number | null>(null);
  const [renderingFromFlowId, setRenderingFromFlowId] = useState<number | null>(null);
  const [editingBlogClipId, setEditingBlogClipId] = useState<number | null>(null);
  const [focusBlogClipId, setFocusBlogClipId] = useState<number | null>(null);
  const [studioNav, setStudioNav] = useState<StudioTab>("create");
  const [youtubeShortsCount, setYoutubeShortsCount] = useState(2);
  const [youtubeLengthBand, setYoutubeLengthBand] = useState<YoutubeLengthBand>("medium");
  const [projectsTabRequest, setProjectsTabRequest] = useState<"in_progress" | "done" | "advanced" | null>(null);
  const [focusVideoId, setFocusVideoId] = useState<number | null>(null);
  const [focusYoutubeVideoId, setFocusYoutubeVideoId] = useState<number | null>(null);
  const [editingYoutubeClipId, setEditingYoutubeClipId] = useState<number | null>(null);
  const [blogBoardCounts, setBlogBoardCounts] = useState<Record<number, number>>({});
  const [generatingBlogMetadataId, setGeneratingBlogMetadataId] = useState<number | null>(null);
  const [downloadingBlogClipId, setDownloadingBlogClipId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isImportingYoutube, setIsImportingYoutube] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [transcribingId, setTranscribingId] = useState<number | null>(null);
  const [highlightingId, setHighlightingId] = useState<number | null>(null);
  const [creatingClipId, setCreatingClipId] = useState<number | null>(null);
  const [subtitlingClipId, setSubtitlingClipId] = useState<number | null>(null);
  const [downloadingClipId, setDownloadingClipId] = useState<number | null>(null);
  const [narratingClipId, setNarratingClipId] = useState<number | null>(null);
  const [generatingMetadataId, setGeneratingMetadataId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const editingBlogClip = blogClips.find((clip) => clip.id === editingBlogClipId) ?? null;
  const focusBlogClip = blogClips.find((clip) => clip.id === focusBlogClipId) ?? null;
  const focusYoutubeVideo = videos.find((item) => item.id === focusYoutubeVideoId) ?? null;
  const editingYoutubeClip =
    editingYoutubeClipId == null
      ? null
      : Object.values(clips).find((item) => item.id === editingYoutubeClipId) ?? null;
  const editingYoutubeVideo =
    editingYoutubeClip == null ? null : videos.find((item) => item.id === editingYoutubeClip.video_id) ?? null;
  const editingYoutubeMeta =
    editingYoutubeClip == null ? null : youtubeProjectMetaByVideoId[editingYoutubeClip.video_id] ?? null;
  const editingWorkspaceClips =
    editingYoutubeClip == null
      ? []
      : Object.values(clips)
          .filter((item) => item.video_id === editingYoutubeClip.video_id)
          .sort((a, b) => {
            const ha = (highlights[a.video_id] ?? []).find((h) => h.id === a.highlight_id);
            const hb = (highlights[b.video_id] ?? []).find((h) => h.id === b.highlight_id);
            return (ha?.start_time ?? 0) - (hb?.start_time ?? 0) || a.id - b.id;
          });
  const editingYoutubeHighlight =
    editingYoutubeClip == null
      ? null
      : (highlights[editingYoutubeClip.video_id] ?? []).find((item) => item.id === editingYoutubeClip.highlight_id) ?? null;
  const focusYoutubeMeta =
    focusYoutubeVideoId == null ? null : youtubeProjectMetaByVideoId[focusYoutubeVideoId] ?? null;
  const skipHashSyncRef = useRef(false);
  const [routeReady, setRouteReady] = useState(false);

  async function applyAppRoute(route: AppRoute, blogList: BlogClip[]) {
    if (route.kind === "videoFlow") {
      setEditingBlogClipId(null);
      setFocusBlogClipId(null);
      setEditingYoutubeClipId(null);
      setFocusYoutubeVideoId(route.videoId);
      return;
    }

    if (route.kind === "clipEdit") {
      setEditingBlogClipId(null);
      setFocusBlogClipId(null);
      let clip = Object.values(clips).find((item) => item.id === route.clipId) ?? null;
      if (!clip) {
        try {
          clip = await authorizedRequest<Clip>(`/clips/${route.clipId}`);
          setClips((current) => ({ ...current, [clip!.highlight_id]: clip! }));
        } catch {
          writeAppRoute({ kind: "studio", tab: "create" }, "replace");
          setEditingYoutubeClipId(null);
          setFocusYoutubeVideoId(null);
          setStudioNav("create");
          return;
        }
      }
      setFocusYoutubeVideoId(clip.video_id);
      setEditingYoutubeClipId(clip.id);
      return;
    }

    // Blog routes clear YouTube focus so overlays don't fight.
    setFocusYoutubeVideoId(null);
    setEditingYoutubeClipId(null);

    if (route.kind === "edit") {
      const clip = blogList.find((item) => item.id === route.clipId);
      if (clip && clip.status === "awaiting_boards") {
        setFocusBlogClipId(clip.id);
        setEditingBlogClipId(clip.id);
        return;
      }
      if (clip) {
        setEditingBlogClipId(null);
        setFocusBlogClipId(clip.id);
        writeAppRoute({ kind: "flow", clipId: clip.id }, "replace");
        return;
      }
    }
    if (route.kind === "flow") {
      const clip = blogList.find((item) => item.id === route.clipId);
      if (clip) {
        setEditingBlogClipId(null);
        setFocusBlogClipId(clip.id);
        return;
      }
    }
    setEditingBlogClipId(null);
    setFocusBlogClipId(null);
    const tab = route.kind === "studio" ? route.tab : "create";
    setStudioNav(tab);
    if (route.kind !== "studio") {
      writeAppRoute({ kind: "studio", tab }, "replace");
    }
  }

  function handleStudioNavChange(tab: StudioTab) {
    if (
      tab === studioNav &&
      focusBlogClipId == null &&
      editingBlogClipId == null &&
      focusYoutubeVideoId == null &&
      editingYoutubeClipId == null
    ) {
      return;
    }
    setFocusBlogClipId(null);
    setFocusYoutubeVideoId(null);
    setEditingYoutubeClipId(null);
    setEditingBlogClipId(null);
    setStudioNav(tab);
    skipHashSyncRef.current = true;
    writeAppRoute({ kind: "studio", tab }, "push");
  }

  function handleGoToProjectsBucket(bucket: "in_progress" | "done") {
    handleStudioNavChange("projects");
    setProjectsTabRequest(bucket);
  }

  const projectBucketCounts = useMemo(() => {
    const items = buildProjectListItems({ projects, blogClips, videos, clips });
    let inProgress = 0;
    let done = 0;
    for (const item of items) {
      if (item.bucket === "in_progress") inProgress += 1;
      else done += 1;
    }
    return { inProgress, done };
  }, [projects, blogClips, videos, clips]);

  useEffect(() => {
    const inbound = readInboundDeeplink();
    if (inbound.handoff) {
      void (async () => {
        setIsLoading(true);
        setMessage("");
        try {
          const data = await request<{ access_token: string }>("/auth/ditodio-handoff", {
            method: "POST",
            body: JSON.stringify({ handoff: inbound.handoff }),
          });
          localStorage.setItem(TOKEN_KEY, data.access_token);
          clearHandoffFromUrl();
          if (inbound.url) setBlogUrl(inbound.url);
          if (
            inbound.from === "ditodio" ||
            inbound.from === "blog_writer" ||
            inbound.source === "blog" ||
            inbound.url
          ) {
            setStudioNav("create");
            if (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/") {
              writeAppRoute({ kind: "studio", tab: "create" }, "replace");
            }
          }
          await loadCurrentUser(data.access_token);
        } catch (error) {
          clearHandoffFromUrl();
          setMessage(error instanceof Error ? error.message : "Ditodio 로그인 연동에 실패했습니다.");
          const existing = localStorage.getItem(TOKEN_KEY);
          if (existing) await loadCurrentUser(existing);
        } finally {
          setIsLoading(false);
        }
      })();
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    loadCurrentUser(token);
  }, []);

  // Ditodio / blog_writer: ?from=&url=&brandId=&postId=#/studio/create
  useEffect(() => {
    const inbound = readInboundDeeplink();
    if (inbound.handoff) return;
    if (!inbound.from && !inbound.url && !inbound.source) return;
    if (inbound.url) setBlogUrl(inbound.url);
    if (
      inbound.from === "ditodio" ||
      inbound.from === "blog_writer" ||
      inbound.source === "blog" ||
      inbound.url
    ) {
      setStudioNav("create");
      if (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/") {
        writeAppRoute({ kind: "studio", tab: "create" }, "replace");
      }
    }
    if (inbound.from) {
      console.info("[inbound]", {
        from: inbound.from,
        brandId: inbound.brandId,
        postId: inbound.postId,
        hasUrl: Boolean(inbound.url),
      });
    }
  }, []);

  // Keep URL hash in sync so refresh/back restore Shorts / video flows and studio tabs.
  useEffect(() => {
    if (view !== "dashboard" || !user || !routeReady) return;
    if (skipHashSyncRef.current) {
      skipHashSyncRef.current = false;
      return;
    }
    writeAppRoute(
      routeFromScreenState({
        editingYoutubeClipId,
        editingBlogClipId,
        focusYoutubeVideoId,
        focusBlogClipId,
        studioTab: studioNav,
      }),
      "replace",
    );
  }, [
    view,
    user,
    routeReady,
    editingYoutubeClipId,
    editingBlogClipId,
    focusYoutubeVideoId,
    focusBlogClipId,
    studioNav,
  ]);

  useEffect(() => {
    if (view !== "dashboard" || !user || !routeReady) return;
    function onHashChange() {
      skipHashSyncRef.current = true;
      void applyAppRoute(parseAppRoute(window.location.hash), blogClips);
    }
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, [view, user, routeReady, blogClips, clips]);

  async function loadProjects() {
    try {
      setProjects(await authorizedRequest<ProjectRecord[]>("/projects"));
    } catch {
      setProjects([]);
    }
  }

  async function loadVideos() {
    setVideos(await authorizedRequest<Video[]>("/videos"));
  }

  async function loadClips() {
    const loaded = await authorizedRequest<Clip[]>("/clips");
    setClips(Object.fromEntries(loaded.map((clip) => [clip.highlight_id, clip])));
  }

  async function loadUsage() {
    setUsage(await authorizedRequest<Usage>("/usage"));
  }

  async function loadPlans() {
    setPlans(await request<Plan[]>("/plans"));
  }

  async function loadBlogClips(): Promise<BlogClip[]> {
    const loaded = await authorizedRequest<BlogClip[]>("/blog-clips");
    setBlogClips(loaded);
    loaded.filter((clip) => clip.status === "pending" || clip.status === "processing").forEach((clip) => pollBlogClip(clip.id));

    const awaitingBoards = loaded.filter((clip) => clip.status === "awaiting_boards");
    if (awaitingBoards.length > 0) {
      const counts = await Promise.all(
        awaitingBoards.map(async (clip) => {
          try {
            const boards = await authorizedRequest<Board[]>(`/blog-clips/${clip.id}/boards`);
            return [clip.id, boards.length] as const;
          } catch {
            return [clip.id, 0] as const;
          }
        }),
      );
      setBlogBoardCounts((current) => {
        const next = { ...current };
        for (const [id, count] of counts) next[id] = count;
        return next;
      });
    }
    return loaded;
  }

  function pollBlogClip(blogClipId: number) {
    if (editingBlogClipId === blogClipId) return;
    const intervalId = window.setInterval(async () => {
      try {
        const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClipId}`);
        setBlogClips((current) => {
          const exists = current.some((item) => item.id === updated.id);
          return exists
            ? current.map((item) => (item.id === updated.id ? updated : item))
            : [updated, ...current];
        });
        if (updated.status === "completed") {
          try {
            if (
              localStorage.getItem("nc_notify_on_done") === "1" &&
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              new Notification("쇼츠가 완성됐어요", {
                body: updated.blog_title || "결과를 확인해 보세요",
              });
            }
          } catch {
            /* notifications unavailable */
          }
        }
        if (
          updated.status === "completed" ||
          updated.status === "failed" ||
          updated.status === "awaiting_images" ||
          updated.status === "awaiting_script" ||
          updated.status === "awaiting_boards"
        ) {
          window.clearInterval(intervalId);
        }
      } catch {
        window.clearInterval(intervalId);
      }
    }, BLOG_CLIP_POLL_INTERVAL_MS);
  }

  async function loadCurrentUser(token: string) {
    setRouteReady(false);
    try {
      const me = await request<User>("/me", { headers: { Authorization: `Bearer ${token}` } });
      setUser(me);
      setView("dashboard");
      setMessage("");
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      setVideos([]);
      setUsage(null);
      setPlans([]);
      setView("login");
      setRouteReady(false);
      return;
    }

    try {
      const [, , , , loadedBlogClips] = await Promise.all([
        loadVideos(),
        loadClips(),
        loadUsage(),
        loadPlans(),
        loadBlogClips(),
        loadProjects(),
      ]);
      skipHashSyncRef.current = true;
      await applyAppRoute(parseAppRoute(window.location.hash), loadedBlogClips);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "대시보드 데이터를 불러오지 못했습니다. 새로고침을 눌러보세요.");
    } finally {
      setRouteReady(true);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    try {
      const data = await request<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      await loadCurrentUser(data.access_token);
      setEmail("");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    try {
      await request<User>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
      setMessage("계정이 생성되었습니다. 로그인해주세요.");
      setView("login");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "회원가입에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setUploadMessage("먼저 MP4 파일을 선택해주세요.");
      return;
    }
    setIsUploading(true);
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const video = await uploadRequest<Video>("/videos/upload", formData);
      setSelectedFile(null);
      setYoutubeUrl("");
      setUploadMessage("업로드가 완료되었습니다. 음성·하이라이트를 자동으로 추출합니다.");
      setVideos((current) => (current.some((item) => item.id === video.id) ? current : [video, ...current]));
      await Promise.all([loadVideos(), loadUsage(), loadPlans(), loadProjects()]);
      setFocusVideoId(video.id);
      setFocusBlogClipId(null);
      setEditingYoutubeClipId(null);
      setFocusYoutubeVideoId(video.id);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "업로드에 실패했습니다.");
    } finally {
      setIsUploading(false);
    }
  }


  async function handlePreviewYoutube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!youtubeUrl.trim()) {
      setUploadMessage("먼저 유튜브 URL을 입력해주세요.");
      return;
    }
    setIsPreviewingYoutube(true);
    setUploadMessage("");
    try {
      const preview = await authorizedRequest<YoutubePreview>("/videos/youtube-preview", {
        method: "POST",
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });
      setYoutubePreview(preview);
      setUploadMessage("영상을 확인한 뒤 템플릿을 고르고 생성하기를 눌러주세요.");
    } catch (error) {
      setYoutubePreview(null);
      setUploadMessage(error instanceof Error ? error.message : "유튜브 미리보기에 실패했습니다.");
    } finally {
      setIsPreviewingYoutube(false);
    }
  }

  function handleCancelYoutubePreview() {
    setYoutubePreview(null);
    setUploadMessage("");
  }

  async function handleConfirmYoutubeImport(visualStyle: VisualStyleSlug | string) {
    if (!youtubePreview?.url) {
      setUploadMessage("먼저 유튜브 영상을 확인해 주세요.");
      return;
    }
    setIsImportingYoutube(true);
    setUploadMessage("");
    const styleSlug = String(visualStyle);
    setPreferredYoutubeVisualStyle(styleSlug);
    const previewSnapshot = youtubePreview;
    try {
      const video = await authorizedRequest<Video>("/videos/import-youtube", {
        method: "POST",
        body: JSON.stringify({ url: previewSnapshot.url }),
      });
      setYoutubeProjectMetaByVideoId((current) => ({
        ...current,
        [video.id]: {
          title: previewSnapshot.title || video.original_filename,
          channel: previewSnapshot.channel,
          thumbnail_url: previewSnapshot.thumbnail_url,
          channel_avatar_url: previewSnapshot.channel_avatar_url ?? null,
          visualStyle: styleSlug,
        },
      }));
      setYoutubeUrl("");
      setYoutubePreview(null);
      setUploadMessage("유튜브 영상을 가져왔습니다. AI가 편집점을 잡아 쇼츠를 생성합니다.");
      setVideos((current) => (current.some((item) => item.id === video.id) ? current : [video, ...current]));
      await Promise.all([loadVideos(), loadUsage(), loadPlans(), loadProjects()]);
      setFocusVideoId(video.id);
      setFocusBlogClipId(null);
      setFocusYoutubeVideoId(video.id);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "유튜브 영상 가져오기에 실패했습니다.");
    } finally {
      setIsImportingYoutube(false);
    }
  }

  async function handleCreateBlogShort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blogUrl.trim()) {
      setUploadMessage("먼저 URL을 입력해주세요.");
      return;
    }
    setIsCreatingBlogShort(true);
    setUploadMessage("");
    try {
      const blogClip = await authorizedRequest<BlogClip>("/blog-clips", {
        method: "POST",
        body: JSON.stringify({
          url: blogUrl.trim(),
          style: blogSubtitleStyle,
          target_length: blogTargetLength,
          narration_language: blogNarrationLanguage,
          script_model: blogScriptModel,
        }),
      });
      setBlogClips((current) => [blogClip, ...current.filter((item) => item.id !== blogClip.id)]);
      void loadProjects();
      setBlogUrl("");
      setFocusBlogClipId(blogClip.id);
      pollBlogClip(blogClip.id);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "블로그 쇼츠 생성에 실패했습니다.");
    } finally {
      setIsCreatingBlogShort(false);
    }
  }

  async function handleConfirmBlogImages(
    blogClip: BlogClip,
    imageIds: number[],
    visualStyle?: VisualStyleSlug | string,
  ) {
    setConfirmingImageSelectionId(blogClip.id);
    setUploadMessage("");
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/images/selection`, {
        method: "PUT",
        body: JSON.stringify({
          image_ids: imageIds,
          ...(visualStyle ? { visual_style: String(visualStyle) } : {}),
        }),
      });
      setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFocusBlogClipId(updated.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지 선택에 실패했습니다.";
      setUploadMessage(message);
      // Server may already have moved past awaiting_images; refresh clip so UI can recover.
      try {
        const refreshed = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}`);
        setBlogClips((current) => current.map((item) => (item.id === refreshed.id ? refreshed : item)));
      } catch {
        /* ignore refresh errors */
      }
    } finally {
      setConfirmingImageSelectionId(null);
    }
  }

  async function handleSaveDefaultVoice(blogClip: BlogClip, voiceId: string, ttsSpeed: number) {
    setSavingVoiceId(blogClip.id);
    setUploadMessage("");
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/default-voice`, {
        method: "PATCH",
        body: JSON.stringify({ voice_id: voiceId, tts_speed: ttsSpeed, apply_to_all_boards: true }),
      });
      setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "보이스 저장에 실패했습니다.");
      throw error;
    } finally {
      setSavingVoiceId(null);
    }
  }

  async function handleApplyVisualStyle(
    blogClip: BlogClip,
    visualStyle: string,
    copy?: { style_title?: string; style_subtitle?: string },
  ) {
    setSavingVisualStyleId(blogClip.id);
    setUploadMessage("");
    try {
      let updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/visual-style`, {
        method: "PATCH",
        body: JSON.stringify({ visual_style: visualStyle, apply_pack: true }),
      });
      // Keep server-generated hook titles unless the user edited the drafts before continue.
      if (copy) {
        const prevTitle = (blogClip.style_title || blogClip.blog_title || "").trim();
        const prevSubtitle = (blogClip.style_subtitle || "").trim();
        const nextTitle = (copy.style_title || "").trim();
        const nextSubtitle = (copy.style_subtitle || "").trim();
        const userEdited =
          (nextTitle.length > 0 && nextTitle !== prevTitle) || nextSubtitle !== prevSubtitle;
        if (userEdited) {
          updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/style-copy`, {
            method: "PATCH",
            body: JSON.stringify(copy),
          });
        }
      }
      setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "영상 스타일 저장에 실패했습니다.");
      throw error;
    } finally {
      setSavingVisualStyleId(null);
    }
  }

  async function handleAudioSettings(
    blogClip: BlogClip,
    body: { auto_bgm?: boolean; auto_sfx?: boolean; bgm_asset_id?: number | null },
  ) {
    setSavingStyleId(blogClip.id);
    setUploadMessage("");
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/audio-settings`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "오디오 설정에 실패했습니다.");
      throw error;
    } finally {
      setSavingStyleId(null);
    }
  }

  function handleWizardStepChange(blogClip: BlogClip, step: WizardBoardsStep) {
    setBlogClips((current) =>
      current.map((item) => (item.id === blogClip.id ? { ...item, wizard_step: step } : item)),
    );
    void authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/wizard-step`, {
      method: "PATCH",
      body: JSON.stringify({ wizard_step: step }),
    })
      .then((updated) => {
        setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      })
      .catch((error) => {
        setUploadMessage(error instanceof Error ? error.message : "단계 저장에 실패했습니다.");
      });
  }

  async function handleRenderFromFlow(blogClip: BlogClip) {
    setRenderingFromFlowId(blogClip.id);
    setUploadMessage("");
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/render`, { method: "POST" });
      setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFocusBlogClipId(updated.id);
      pollBlogClip(updated.id);
      setUploadMessage("렌더링을 시작했습니다.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "렌더링 시작에 실패했습니다.");
    } finally {
      setRenderingFromFlowId(null);
    }
  }

  async function handleSelectBlogScript(blogClip: BlogClip, tone: ScriptTone, options?: { openEditor?: boolean }) {
    setSelectingBlogScriptId(blogClip.id);
    setUploadMessage("");
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/select-script`, {
        method: "POST",
        body: JSON.stringify({ tone }),
      });
      setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFocusBlogClipId(updated.id);
      const boards = await authorizedRequest<Board[]>(`/blog-clips/${updated.id}/boards`);
      setBlogBoardCounts((current) => ({ ...current, [updated.id]: boards.length }));
      if (options?.openEditor) {
        handleOpenBoardEditor(updated);
      }
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "대본 선택에 실패했습니다.");
    } finally {
      setSelectingBlogScriptId(null);
    }
  }

  function handleOpenBoardEditor(blogClip: BlogClip) {
    if (blogClip.status !== "awaiting_boards") return;
    setFocusYoutubeVideoId(null);
    setEditingYoutubeClipId(null);
    setFocusBlogClipId(blogClip.id);
    setEditingBlogClipId(blogClip.id);
  }

  /** Projects list: awaiting_boards also goes to Flow so default render can start. */
  function handleResumeBlogClip(blogClip: BlogClip) {
    setUploadMessage("");
    setFocusYoutubeVideoId(null);
    setEditingYoutubeClipId(null);
    setEditingBlogClipId(null);
    setFocusBlogClipId(blogClip.id);
    if (blogClip.status === "pending" || blogClip.status === "processing") {
      pollBlogClip(blogClip.id);
    }
  }

  function handleResumeVideo(video: Video) {
    setUploadMessage("");
    setFocusBlogClipId(null);
    setEditingBlogClipId(null);
    setEditingYoutubeClipId(null);
    setFocusYoutubeVideoId(video.id);
  }

  function handleOpenBlogClip(blogClip: BlogClip) {
    handleResumeBlogClip(blogClip);
  }

  function handleBackToStudio() {
    setFocusBlogClipId(null);
    setFocusYoutubeVideoId(null);
    setEditingYoutubeClipId(null);
    setUploadMessage("");
    setStudioNav("projects");
    skipHashSyncRef.current = true;
    writeAppRoute({ kind: "studio", tab: "projects" }, "push");
  }

  function handleCloseBoardEditor() {
    const clipId = editingBlogClipId;
    setEditingBlogClipId(null);
    if (clipId == null) return;
    setFocusBlogClipId(clipId);
    void authorizedRequest<Board[]>(`/blog-clips/${clipId}/boards`)
      .then((boards) => {
        setBlogBoardCounts((current) => ({ ...current, [clipId]: boards.length }));
      })
      .catch(() => {
        /* keep previous count */
      });
  }

  function handleBoardEditorRendered(updated: BlogClip) {
    setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEditingBlogClipId(null);
    setFocusBlogClipId(updated.id);
    pollBlogClip(updated.id);
  }

  async function handleGenerateBlogMetadata(blogClip: BlogClip) {
    setGeneratingBlogMetadataId(blogClip.id);
    setUploadMessage("");
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/metadata`, { method: "POST" });
      setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setUploadMessage("업로드용 메타데이터가 생성되었습니다.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "메타데이터 생성에 실패했습니다.");
    } finally {
      setGeneratingBlogMetadataId(null);
    }
  }

  async function handleDownloadBlogClip(blogClip: BlogClip) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUploadMessage("로그인이 필요합니다.");
      return;
    }
    setDownloadingBlogClipId(blogClip.id);
    setUploadMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/blog-clips/${blogClip.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : "다운로드에 실패했습니다.";
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `new-cut-blog-${blogClip.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "다운로드에 실패했습니다.");
    } finally {
      setDownloadingBlogClipId(null);
    }
  }

  async function handleAnalyze(videoId: number) {
    setAnalyzingId(videoId);
    try {
      mergeVideoStatus(await authorizedRequest<VideoStatusResponse>(`/videos/${videoId}/analyze`, { method: "POST" }));
      await loadUsage();
    } catch (error) {
      await Promise.all([loadVideos(), loadUsage(), loadPlans(), loadProjects()]);
      setUploadMessage(error instanceof Error ? error.message : "오디오 추출에 실패했습니다.");
    } finally {
      setAnalyzingId(null);
    }
  }

  async function handleTranscript(videoId: number) {
    setTranscribingId(videoId);
    try {
      const transcript = await authorizedRequest<Transcript>(`/videos/${videoId}/transcript`);
      setTranscripts((current) => ({ ...current, [videoId]: transcript }));
      await Promise.all([loadVideos(), loadUsage(), loadPlans(), loadProjects()]);
    } catch (error) {
      await Promise.all([loadVideos(), loadUsage(), loadPlans(), loadProjects()]);
      setUploadMessage(error instanceof Error ? error.message : "음성 인식에 실패했습니다.");
    } finally {
      setTranscribingId(null);
    }
  }

  async function handleHighlights(videoId: number) {
    setHighlightingId(videoId);
    setUploadMessage("");
    try {
      let video = videos.find((item) => item.id === videoId) ?? null;
      const needsAudio =
        !video ||
        !video.audio_path ||
        video.status === "uploaded" ||
        video.status === "extracting_audio" ||
        video.status === "failed";
      if (needsAudio) {
        setUploadMessage("오디오 추출 중…");
        const analyzed = await authorizedRequest<VideoStatusResponse>(`/videos/${videoId}/analyze`, { method: "POST" });
        mergeVideoStatus(analyzed);
        video = video ? { ...video, ...analyzed } : null;
      }

      const hasTranscript =
        (transcripts[videoId]?.status === "transcribed" && Boolean(transcripts[videoId]?.text)) ||
        video?.status === "transcribed";
      if (!hasTranscript || !transcripts[videoId]?.text) {
        setUploadMessage("음성 인식 중… (하이라이트 전에 필요)");
        setTranscribingId(videoId);
        try {
          const transcript = await authorizedRequest<Transcript>(`/videos/${videoId}/transcript`);
          setTranscripts((current) => ({ ...current, [videoId]: transcript }));
          await Promise.all([loadVideos(), loadUsage(), loadPlans(), loadProjects()]);
        } finally {
          setTranscribingId(null);
        }
      }

      setUploadMessage("하이라이트 추천 중…");
      const candidates = await authorizedRequest<Highlight[]>(`/videos/${videoId}/highlights`);
      setHighlights((current) => ({ ...current, [videoId]: candidates }));
      setUploadMessage(candidates.length ? `하이라이트 ${candidates.length}개를 추천했습니다.` : "추천된 하이라이트가 없습니다.");
    } catch (error) {
      await Promise.all([loadVideos(), loadUsage(), loadPlans(), loadProjects()]);
      setUploadMessage(error instanceof Error ? error.message : "하이라이트 추천에 실패했습니다.");
    } finally {
      setHighlightingId(null);
    }
  }

  async function handleCreateClip(highlightId: number, removeSilence = false): Promise<Clip | null> {
    setCreatingClipId(highlightId);
    setUploadMessage("");
    try {
      const highlight =
        Object.values(highlights)
          .flat()
          .find((item) => item.id === highlightId) ?? null;
      const meta = highlight ? youtubeProjectMetaByVideoId[highlight.video_id] : undefined;
      const visualStyle =
        meta?.visualStyle || preferredYoutubeVisualStyle || "yt_profile";
      const clip = await authorizedRequest<Clip>("/clips/create", {
        method: "POST",
        body: JSON.stringify({ highlight_id: highlightId, visual_style: visualStyle, remove_silence: removeSilence }),
      });
      setClips((current) => ({ ...current, [highlightId]: clip }));
      setClipMetadata((current) => {
        const next = { ...current };
        delete next[clip.id];
        return next;
      });
      setSubtitleStyles((current) => ({ ...current, [clip.id]: "shorts" }));
      setTtsModes((current) => ({ ...current, [clip.id]: "original_audio" }));
      setUploadMessage(clip.status === "completed" ? "클립이 생성되었습니다." : `클립 상태: ${CLIP_STATUS_LABELS[clip.status]}`);
      return clip;
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "클립 생성에 실패했습니다.");
      return null;
    } finally {
      setCreatingClipId(null);
    }
  }

  async function handleBurnSubtitles(clip: Clip, styleOverride?: SubtitleStyle): Promise<Clip | null> {
    const style = styleOverride ?? subtitleStyles[clip.id] ?? "bold";
    const meta = youtubeProjectMetaByVideoId[clip.video_id];
    const visualStyle =
      meta?.visualStyle || preferredYoutubeVisualStyle || clip.visual_style || "yt_profile";
    setSubtitlingClipId(clip.id);
    setUploadMessage("");
    try {
      // Remotion template wrap (includes best-effort ASS burn + chrome).
      const updated = await authorizedRequest<Clip>(`/clips/${clip.id}/render-template`, {
        method: "POST",
        body: JSON.stringify({
          visual_style: visualStyle,
          channel_name: meta?.channel ?? null,
          channel_avatar_url: meta?.channel_avatar_url ?? null,
          video_title: meta?.title ?? null,
          burn_subtitles: true,
          subtitle_style: style,
        }),
      });
      setClips((current) => ({ ...current, [updated.highlight_id]: updated }));
      setSubtitleStyles((current) => ({ ...current, [updated.id]: style }));
      setUploadMessage("템플릿이 적용된 쇼츠가 준비되었습니다.");
      return updated;
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "템플릿 렌더에 실패했습니다.");
      return null;
    } finally {
      setSubtitlingClipId(null);
    }
  }

  async function handleApplyNarration(clip: Clip) {
    const mode = ttsModes[clip.id] ?? "original_audio";
    setNarratingClipId(clip.id);
    setUploadMessage("");
    try {
      const updated = await authorizedRequest<Clip>(`/clips/${clip.id}/narration`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      setClips((current) => ({ ...current, [updated.highlight_id]: updated }));
      setUploadMessage(mode === "ai_narration" ? "AI 나레이션이 적용되었습니다." : "원본 음성이 선택되었습니다.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "나레이션 적용에 실패했습니다.");
    } finally {
      setNarratingClipId(null);
    }
  }

  async function handleGenerateMetadata(clip: Clip) {
    setGeneratingMetadataId(clip.id);
    setUploadMessage("");
    try {
      const metadata = await authorizedRequest<ClipMetadata>(`/clips/${clip.id}/metadata`, { method: "POST" });
      setClipMetadata((current) => ({ ...current, [clip.id]: metadata }));
      setUploadMessage("업로드용 메타데이터가 생성되었습니다.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "메타데이터 생성에 실패했습니다.");
    } finally {
      setGeneratingMetadataId(null);
    }
  }

  async function handleCopyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1400);
    } catch {
      setUploadMessage("복사에 실패했습니다.");
    }
  }

  async function handleDownloadClip(clip: Clip) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUploadMessage("로그인이 필요합니다.");
      return;
    }
    setDownloadingClipId(clip.id);
    setUploadMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/clips/${clip.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : "다운로드에 실패했습니다.";
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = clip.subtitled_output_path ? `new-cut-subtitled-${clip.id}.mp4` : `new-cut-clip-${clip.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "다운로드에 실패했습니다.");
    } finally {
      setDownloadingClipId(null);
    }
  }

  async function handleRefreshStatus(videoId: number) {
    mergeVideoStatus(await authorizedRequest<VideoStatusResponse>(`/videos/${videoId}/status`));
  }

  function mergeVideoStatus(status: VideoStatusResponse) {
    setVideos((currentVideos) => currentVideos.map((video) => (video.id === status.id ? { ...video, ...status } : video)));
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setVideos([]);
    setTranscripts({});
    setHighlights({});
    setClips({});
    setClipMetadata({});
    setSubtitleStyles({});
    setTtsModes({});
    setSelectedFile(null);
    setYoutubeUrl("");
    setYoutubePreview(null);
    setPreferredYoutubeVisualStyle(null);
    setBlogUrl("");
    setBlogClips([]);
    setProjects([]);
    setBlogBoardCounts({});
    setSelectingBlogScriptId(null);
    setEditingBlogClipId(null);
    setFocusBlogClipId(null);
    setFocusYoutubeVideoId(null);
    setEditingYoutubeClipId(null);
    setRouteReady(false);
    setView("login");
    setMessage("");
    setUploadMessage("");
    setStudioNav("create");
    writeAppRoute({ kind: "studio", tab: "create" }, "replace");
  }

  if (view === "dashboard" && user) {
    const isBoardEditor = Boolean(editingBlogClip && editingBlogClip.status === "awaiting_boards");
    const isYoutubeEditor = Boolean(editingYoutubeClip);
    const isEditor = isBoardEditor || isYoutubeEditor;
    const isFlow = !isEditor && Boolean(focusYoutubeVideo || focusBlogClip);
    const bodyMode = isEditor ? "editor" : isFlow ? "flow" : "page";
    const title = isYoutubeEditor
      ? "쇼츠 세부 편집"
      : isBoardEditor
        ? "장면 편집"
        : focusBlogClip
          ? focusBlogClip.blog_title || "쇼츠"
          : focusYoutubeVideo
            ? focusYoutubeMeta?.title || focusYoutubeVideo.original_filename || "영상"
            : studioNav === "projects"
              ? "프로젝트"
              : studioNav === "usage"
                ? "요금 · 사용량"
                : "만들기";

    let body;
    if (editingYoutubeClip) {
      const workspaceTitle =
        editingYoutubeMeta?.title ||
        editingYoutubeVideo?.original_filename ||
        `영상 #${editingYoutubeClip.video_id}`;
      const workspaceStyle = editingYoutubeMeta?.visualStyle || preferredYoutubeVisualStyle || "yt_profile";
      body = (
        <YoutubeWorkspaceEditor
          clips={editingWorkspaceClips.length > 0 ? editingWorkspaceClips : [editingYoutubeClip]}
          highlights={highlights[editingYoutubeClip.video_id] ?? []}
          selectedClipId={editingYoutubeClip.id}
          videoTitle={workspaceTitle}
          channel={editingYoutubeMeta?.channel ?? null}
          channelAvatarUrl={editingYoutubeMeta?.channel_avatar_url ?? null}
          visualStyleSlug={workspaceStyle}
          metadata={clipMetadata[editingYoutubeClip.id]}
          copiedKey={copiedKey}
          selectedStyle={subtitleStyles[editingYoutubeClip.id] ?? "shorts"}
          selectedTtsMode={
            ttsModes[editingYoutubeClip.id] ?? (editingYoutubeClip.tts_mode as TtsMode) ?? "original_audio"
          }
          downloadingClipId={downloadingClipId}
          generatingMetadataId={generatingMetadataId}
          narratingClipId={narratingClipId}
          subtitlingClipId={subtitlingClipId}
          onSelectClip={(clipId) => setEditingYoutubeClipId(clipId)}
          onClose={() => setEditingYoutubeClipId(null)}
          onBurnSubtitles={handleBurnSubtitles}
          onApplyNarration={handleApplyNarration}
          onGenerateMetadata={handleGenerateMetadata}
          onDownloadClip={handleDownloadClip}
          onCopyText={handleCopyText}
          onStyleChange={(clipId, style) => setSubtitleStyles((current) => ({ ...current, [clipId]: style }))}
          onTtsModeChange={(clipId, mode) => setTtsModes((current) => ({ ...current, [clipId]: mode }))}
          onMessage={setUploadMessage}
        />
      );
    } else if (isBoardEditor && editingBlogClip) {
      body = (
        <BoardEditor
          blogClip={editingBlogClip}
          onClose={handleCloseBoardEditor}
          onRendered={handleBoardEditorRendered}
          onClipUpdated={(updated) => {
            setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          }}
          onMessage={setUploadMessage}
        />
      );
    } else if (focusYoutubeVideo) {
      body = (
        <YoutubeClipFlow
          video={focusYoutubeVideo}
          highlights={highlights[focusYoutubeVideo.id] ?? []}
          clips={clips}
          projectTitle={focusYoutubeMeta?.title}
          projectChannel={focusYoutubeMeta?.channel}
          projectThumbnailUrl={focusYoutubeMeta?.thumbnail_url}
          downloadingClipId={downloadingClipId}
          initialSubtitleStyle={subtitleStyleFromVisual(
            focusYoutubeMeta?.visualStyle || preferredYoutubeVisualStyle || "yt_profile",
          )}
          shortsCount={youtubeShortsCount}
          lengthBand={youtubeLengthBand}
          usage={usage}
          onCrumbChange={setFlowCrumb}
          onBackToStudio={handleBackToStudio}
          onVideoUpdated={mergeVideoStatus}
          onHighlightsReady={(videoId, items) => {
            setHighlights((current) => ({ ...current, [videoId]: items }));
          }}
          onTranscriptReady={(videoId, transcript) => {
            setTranscripts((current) => ({ ...current, [videoId]: transcript }));
          }}
          onCreateClip={handleCreateClip}
          onBurnSubtitles={handleBurnSubtitles}
          onStyleChange={(clipId, style) => setSubtitleStyles((current) => ({ ...current, [clipId]: style }))}
          onOpenDetailedEditor={(clip) => setEditingYoutubeClipId(clip.id)}
          onMessage={setUploadMessage}
        />
      );
    } else if (focusBlogClip) {
      body = (
        <BlogClipFlow
          blogClip={focusBlogClip}
          copiedKey={copiedKey}
          downloadingBlogClipId={downloadingBlogClipId}
          generatingBlogMetadataId={generatingBlogMetadataId}
          selectingBlogScriptId={selectingBlogScriptId}
          confirmingImageSelection={confirmingImageSelectionId === focusBlogClip.id}
          renderingFromFlow={renderingFromFlowId === focusBlogClip.id}
          onBackToStudio={handleBackToStudio}
          onCopyText={handleCopyText}
          onDownloadBlogClip={handleDownloadBlogClip}
          onGenerateMetadata={handleGenerateBlogMetadata}
          onSelectScript={handleSelectBlogScript}
          onConfirmImages={handleConfirmBlogImages}
          onRender={handleRenderFromFlow}
          onOpenBoardEditor={handleOpenBoardEditor}
          onBlogClipUpdated={(updated) => {
            setBlogClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          }}
          onMessage={setUploadMessage}
          flowMessage={uploadMessage}
          onCrumbChange={setFlowCrumb}
        />
      );
    } else {
      body = (
        <Dashboard
          usage={usage}
          uploadMessage={uploadMessage}
          selectedFile={selectedFile}
          isUploading={isUploading}
          youtubeUrl={youtubeUrl}
          isImportingYoutube={isImportingYoutube}
          isPreviewingYoutube={isPreviewingYoutube}
          youtubePreview={youtubePreview}
          blogUrl={blogUrl}
          blogSubtitleStyle={blogSubtitleStyle}
          blogTargetLength={blogTargetLength}
          blogNarrationLanguage={blogNarrationLanguage}
          blogScriptModel={blogScriptModel}
          isCreatingBlogShort={isCreatingBlogShort}
          projects={projects}
          blogClips={blogClips}
          copiedKey={copiedKey}
          videos={videos}
          transcripts={transcripts}
          highlights={highlights}
          clips={clips}
          clipMetadata={clipMetadata}
          creatingClipId={creatingClipId}
          downloadingClipId={downloadingClipId}
          generatingMetadataId={generatingMetadataId}
          narratingClipId={narratingClipId}
          subtitleStyles={subtitleStyles}
          ttsModes={ttsModes}
          subtitlingClipId={subtitlingClipId}
          analyzingId={analyzingId}
          transcribingId={transcribingId}
          highlightingId={highlightingId}
          onUpload={handleUpload}
          onSelectedFileChange={setSelectedFile}
          onPreviewYoutube={handlePreviewYoutube}
          onConfirmYoutubeImport={handleConfirmYoutubeImport}
          onCancelYoutubePreview={handleCancelYoutubePreview}
          onYoutubeUrlChange={setYoutubeUrl}
          onToastMessage={setUploadMessage}
          onCreateBlogShort={handleCreateBlogShort}
          onBlogUrlChange={setBlogUrl}
          onBlogSubtitleStyleChange={setBlogSubtitleStyle}
          onBlogTargetLengthChange={setBlogTargetLength}
          onBlogNarrationLanguageChange={setBlogNarrationLanguage}
          onBlogScriptModelChange={setBlogScriptModel}
          onCopyText={handleCopyText}
          onOpenBlogClip={handleOpenBlogClip}
          onDownloadBlogClip={handleDownloadBlogClip}
          onResumeVideo={handleResumeVideo}
          downloadingBlogClipId={downloadingBlogClipId}
          onAnalyze={handleAnalyze}
          onTranscript={handleTranscript}
          onHighlights={handleHighlights}
          onRefreshStatus={handleRefreshStatus}
          onApplyNarration={handleApplyNarration}
          onBurnSubtitles={handleBurnSubtitles}
          onCreateClip={handleCreateClip}
          onDownloadClip={handleDownloadClip}
          onGenerateMetadata={handleGenerateMetadata}
          onStyleChange={(clipId, style) => setSubtitleStyles((current) => ({ ...current, [clipId]: style }))}
          onTtsModeChange={(clipId, mode) => setTtsModes((current) => ({ ...current, [clipId]: mode }))}
          studioNav={studioNav}
          onStudioNavChange={handleStudioNavChange}
          projectsTabRequest={projectsTabRequest}
          focusVideoId={focusVideoId}
          onProjectsTabRequestConsumed={() => setProjectsTabRequest(null)}
          youtubeShortsCount={youtubeShortsCount}
          youtubeLengthBand={youtubeLengthBand}
          onYoutubeShortsCountChange={setYoutubeShortsCount}
          onYoutubeLengthBandChange={setYoutubeLengthBand}
        />
      );
    }

    return (
      <StudioShell
        title={title}
        activeTab={studioNav}
        projectCount={projects.length || blogClips.length + videos.length}
        inProgressCount={projectBucketCounts.inProgress}
        doneCount={projectBucketCounts.done}
        usage={usage}
        email={user.email}
        planLabel={usage?.plan_name ?? usage?.plan}
        bodyMode={bodyMode}
        titleAside={
          isEditor && editingBlogClip ? (
            <span className={`status-badge status-${editingBlogClip.status}`}>
              {BLOG_CLIP_STATUS_LABELS[editingBlogClip.status]}
            </span>
          ) : isEditor && editingYoutubeClip ? (
            <span className={`status-badge status-${editingYoutubeClip.status}`}>
              {CLIP_STATUS_LABELS[editingYoutubeClip.status]}
            </span>
          ) : isFlow && flowCrumb ? (
            <FlowCrumbs source={flowCrumb.source} step={flowCrumb.step} />
          ) : null
        }
        onNavChange={handleStudioNavChange}
        onProjectsBucket={handleGoToProjectsBucket}
        onLogout={handleLogout}
      >
        {body}
      </StudioShell>
    );
  }

  return (
    <main className="app-root landing-shell">
      <div className="landing-atmosphere" aria-hidden="true" />
      <section className="landing-hero">
        <p className="create-kicker">AI 쇼츠 스튜디오</p>
        <h1 className="landing-brand">New Cut</h1>
        <p className="landing-tagline">블로그·유튜브·MP4로 쇼츠를 만들고, 대본부터 자막까지 한 흐름으로.</p>
        <ul className="landing-points">
          <li>소스 선택 → 생성 → 편집</li>
          <li>말투별 대본 · 장면 에디터</li>
          <li>버전 다운로드 · 메타데이터</li>
        </ul>
      </section>
      <AuthPanel
        view={view}
        email={email}
        password={password}
        message={message}
        isLoading={isLoading}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={view === "login" ? handleLogin : handleRegister}
        onToggleView={() => {
          setView(view === "login" ? "register" : "login");
          setMessage("");
        }}
      />
    </main>
  );
}
