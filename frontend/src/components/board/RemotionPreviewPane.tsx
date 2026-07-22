import { Player, type PlayerRef } from "@remotion/player";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BlogShorts,
  BLOG_SHORTS_HEIGHT,
  BLOG_SHORTS_WIDTH,
  boardStartFrames,
  totalBlogShortsFrames,
} from "@new-cut/remotion/BlogShorts";
import { authorizedBlob, authorizedRequest } from "../../api/client";
import { buildBlogShortsProps } from "../../lib/blogShortsProps";
import {
  buildAudioCacheKey,
  buildImageCacheKey,
  shouldAttemptAutoPreview,
} from "../../lib/previewSession";
import { defaultStyleOverlay, mergeStyleOverlay, type StyleOverlay, type StyleOverlayLayer } from "../../lib/styleOverlay";
import type { BlogClip, Board } from "../../types";
import { BoardTimeline } from "./BoardTimeline";
import { PreviewOverlayToolbar, PreviewTextEditor } from "./PreviewTextEditor";

/**
 * ShortsPreviewPlayer session (edit-time Remotion).
 * Keep `<Player>` mounted across image/audio loading — use overlays, never unmount.
 * Remount only via `previewRevision` / clip id (see `previewSession.ts`).
 */
const FPS = 30;

type PreviewAudioResponse = {
  blog_clip_id: number;
  duration_seconds: number;
  board_durations: number[];
  preview_audio_url: string;
};

type LayerKey = "title" | "subtitle" | "caption";

export type RemotionPreviewPaneHandle = {
  /** Persist title/subtitle/overlay drafts to DB (used before final render). */
  flushPendingEdits: () => Promise<void>;
};

export const RemotionPreviewPane = forwardRef<
  RemotionPreviewPaneHandle,
  {
    blogClip: BlogClip;
    boards: Board[];
    selectedBoardId: number | null;
    draftText: string;
    onDraftChange: (value: string) => void;
    onTextBlur: () => void;
    onSelectBoard: (boardId: number) => void;
    onDurationCommit: (boardId: number, durationSec: number) => void;
    onBoardsSynced?: () => void;
    /** Soft-update board durations after TTS preview without a full boards reload. */
    onBoardDurationsSynced?: (updates: { boardId: number; durationSec: number }[]) => void;
    onClipUpdated?: (clip: BlogClip) => void;
    onMessage?: (message: string) => void;
    bgmAssetId?: number | null;
    bgmVolume?: number;
  }
>(function RemotionPreviewPane(
  {
    blogClip,
    boards,
    selectedBoardId,
    draftText,
    onDraftChange,
    onTextBlur,
    onSelectBoard,
    onDurationCommit,
    onBoardsSynced,
    onBoardDurationsSynced,
    onClipUpdated,
    onMessage,
    bgmAssetId,
    bgmVolume,
  },
  ref,
) {
  const playerRef = useRef<PlayerRef>(null);
  const inputPropsRef = useRef(buildBlogShortsProps({
    blogClip,
    boards,
    imageUrls: {},
    selectedBoardId,
    draftText,
  }));
  const suppressSeekRef = useRef(false);
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const [currentFrame, setCurrentFrame] = useState(0);
  const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<"missing" | "ready" | "loading" | "error">("missing");
  const [audioError, setAudioError] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<LayerKey | null>(null);
  const [overlayDraft, setOverlayDraft] = useState<StyleOverlay>(() =>
    mergeStyleOverlay(blogClip.visual_style, blogClip.style_overlay),
  );
  const [titleDraft, setTitleDraft] = useState(blogClip.style_title || blogClip.blog_title || "");
  const [subtitleDraft, setSubtitleDraft] = useState(blogClip.style_subtitle || "");
  const [savingOverlay, setSavingOverlay] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const editModeRef = useRef(false);
  editModeRef.current = editMode;
  const autoPreviewKeyRef = useRef<string | null>(null);
  const autoPreviewFailKeyRef = useRef<string | null>(null);
  const autoPreviewFailAtRef = useRef<number | null>(null);
  const narrationUrlRef = useRef<string | null>(null);
  const overlayDraftRef = useRef(overlayDraft);
  const titleDraftRef = useRef(titleDraft);
  const subtitleDraftRef = useRef(subtitleDraft);
  overlayDraftRef.current = overlayDraft;
  titleDraftRef.current = titleDraft;
  subtitleDraftRef.current = subtitleDraft;

  useEffect(() => {
    narrationUrlRef.current = narrationUrl;
  }, [narrationUrl]);

  useEffect(() => {
    return () => {
      if (narrationUrlRef.current) URL.revokeObjectURL(narrationUrlRef.current);
    };
  }, []);

  useEffect(() => {
    // Don't clobber in-progress edits when parent clip object identity changes.
    if (editModeRef.current) return;
    setOverlayDraft(mergeStyleOverlay(blogClip.visual_style, blogClip.style_overlay));
    setTitleDraft(blogClip.style_title || blogClip.blog_title || "");
    setSubtitleDraft(blogClip.style_subtitle || "");
  }, [blogClip.id, blogClip.visual_style, blogClip.style_overlay, blogClip.style_title, blogClip.style_subtitle, blogClip.blog_title]);

  const imageCacheKey = useMemo(() => buildImageCacheKey(boards), [boards]);

  const resolvedBgmAssetId = bgmAssetId !== undefined ? bgmAssetId : blogClip.bgm_asset_id;
  const resolvedBgmVolume = bgmVolume !== undefined ? bgmVolume : blogClip.bgm_volume;

  // Duration is an *output* of TTS preview — do not put it in the cache key or every
  // preview generation → duration persist → key change → remount/regen loop.
  const audioCacheKey = useMemo(
    () =>
      buildAudioCacheKey({
        clipId: blogClip.id,
        ttsSpeed: blogClip.tts_speed,
        bgmAssetId: resolvedBgmAssetId,
        bgmVolume: resolvedBgmVolume,
        boards,
      }),
    [blogClip.id, blogClip.tts_speed, resolvedBgmAssetId, resolvedBgmVolume, boards],
  );

  useEffect(() => {
    if (previewRevision <= 0) return;
    if (import.meta.env.DEV) {
      console.info("[preview] remount reason: previewRevision", {
        clipId: blogClip.id,
        previewRevision,
        imageCacheKey,
      });
    }
  }, [previewRevision, blogClip.id, imageCacheKey]);

  // Stable board id order for image fetch; avoid depending on `boards` identity
  // (loadBoards after TTS used to remount the Player every few seconds).
  const boardImageSpecs = useMemo(
    () => boards.map((board) => ({ id: board.id, imagePath: board.image_path ?? "" })),
    [imageCacheKey],
  );

  useEffect(() => {
    if (boardImageSpecs.length === 0) {
      setImageUrls({});
      setImagesError("");
      return;
    }

    let cancelled = false;
    const created: string[] = [];
    setImagesLoading(true);
    setImagesError("");

    void (async () => {
      try {
        const entries = await Promise.all(
          boardImageSpecs.map(async (board) => {
            const blob = await authorizedBlob(`/blog-clips/${blogClip.id}/boards/${board.id}/image`);
            const isGif = /\.gif$/i.test(board.imagePath) || blob.type === "image/gif";
            const typed =
              isGif && blob.type !== "image/gif" ? new Blob([blob], { type: "image/gif" }) : blob;
            const url = URL.createObjectURL(typed);
            created.push(url);
            return [board.id, url] as const;
          }),
        );
        if (!cancelled) {
          setImageUrls(Object.fromEntries(entries));
        }
      } catch (err) {
        if (!cancelled) {
          setImagesError(err instanceof Error ? err.message : "보드 이미지를 불러오지 못했습니다.");
          setImageUrls({});
        }
      } finally {
        if (!cancelled) setImagesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [blogClip.id, boardImageSpecs]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setAudioStatus("loading");
    setAudioError("");

    void (async () => {
      try {
        const blob = await authorizedBlob(`/blog-clips/${blogClip.id}/preview-audio`);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setNarrationUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
        setAudioStatus("ready");
      } catch {
        if (cancelled) return;
        setNarrationUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        setAudioStatus("missing");
      }
    })();

    return () => {
      cancelled = true;
      // Do not revoke here — the replacement effect / unmount handlers own URL lifetime.
      // Revoking in cleanup raced the next effect and killed audio mid-playback.
    };
  }, [blogClip.id, audioCacheKey]);

  async function generatePreviewAudio(opts?: { intentional?: boolean }) {
    setAudioBusy(true);
    setAudioError("");
    try {
      const result = await authorizedRequest<PreviewAudioResponse>(`/blog-clips/${blogClip.id}/preview-audio`, {
        method: "POST",
      });
      const blob = await authorizedBlob(`/blog-clips/${blogClip.id}/preview-audio`);
      setNarrationUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setAudioStatus("ready");
      autoPreviewKeyRef.current = audioCacheKey;
      autoPreviewFailKeyRef.current = null;
      autoPreviewFailAtRef.current = null;
      // Soft-patch durations only — never loadBoards() / remount Player.
      if (result.board_durations?.length === boards.length) {
        onBoardDurationsSynced?.(
          boards.map((board, index) => ({
            boardId: board.id,
            durationSec: result.board_durations[index] ?? board.duration_seconds ?? 2.5,
          })),
        );
      }
      // Intentional regen may remount; auto success must not.
      if (opts?.intentional) {
        setPreviewRevision((value) => value + 1);
      }
    } catch (err) {
      setAudioStatus("error");
      autoPreviewKeyRef.current = null;
      autoPreviewFailKeyRef.current = audioCacheKey;
      autoPreviewFailAtRef.current = Date.now();
      setAudioError(err instanceof Error ? err.message : "미리듣기 오디오 생성에 실패했습니다.");
    } finally {
      setAudioBusy(false);
    }
  }

  // Auto-build preview mix when cache is missing after BGM/TTS/text changes.
  useEffect(() => {
    if (
      !shouldAttemptAutoPreview({
        audioStatus,
        audioBusy,
        boardCount: boards.length,
        audioCacheKey,
        lastAttemptKey: autoPreviewKeyRef.current,
        lastFailKey: autoPreviewFailKeyRef.current,
        lastFailAtMs: autoPreviewFailAtRef.current,
      })
    ) {
      return;
    }
    autoPreviewKeyRef.current = audioCacheKey;
    void generatePreviewAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioStatus, audioCacheKey, audioBusy, boards.length]);

  async function flushPendingEdits() {
    const [copyUpdated, overlayUpdated] = await Promise.all([
      authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/style-copy`, {
        method: "PATCH",
        body: JSON.stringify({
          style_title: titleDraftRef.current,
          style_subtitle: subtitleDraftRef.current,
        }),
      }),
      authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/style-overlay`, {
        method: "PATCH",
        body: JSON.stringify({ overlay: overlayDraftRef.current }),
      }),
    ]);
    const merged: BlogClip = {
      ...blogClip,
      ...copyUpdated,
      ...overlayUpdated,
      style_title: titleDraftRef.current,
      style_subtitle: subtitleDraftRef.current,
      style_overlay: overlayDraftRef.current,
    };
    onClipUpdated?.(merged);
  }

  useImperativeHandle(ref, () => ({ flushPendingEdits }), [blogClip, onClipUpdated]);

  const liveClip = useMemo(
    () => ({
      ...blogClip,
      // Always prefer local drafts so save → exit keeps preview in sync before parent re-fetch.
      style_title: titleDraft,
      style_subtitle: subtitleDraft,
      style_overlay: overlayDraft,
    }),
    [blogClip, titleDraft, subtitleDraft, overlayDraft],
  );

  const inputProps = useMemo(
    () =>
      buildBlogShortsProps({
        blogClip: liveClip,
        boards,
        imageUrls,
        selectedBoardId,
        draftText,
        narrationUrl,
        styleTitle: titleDraft,
        styleSubtitle: subtitleDraft,
        suppressText: editMode,
      }),
    [liveClip, boards, imageUrls, selectedBoardId, draftText, narrationUrl, editMode, titleDraft, subtitleDraft],
  );
  inputPropsRef.current = inputProps;

  const durationInFrames = useMemo(() => totalBlogShortsFrames(inputProps), [inputProps]);
  const boardDurationsSec = useMemo(
    () => inputProps.boards.map((board) => board.durationSec),
    [inputProps.boards],
  );
  const boardStartFramesList = useMemo(() => boardStartFrames(inputProps), [inputProps]);
  const captionVariant = inputProps.style?.caption || "bottom_outline";

  useEffect(() => {
    if (selectedBoardId == null || boards.length === 0) return;
    if (suppressSeekRef.current) {
      suppressSeekRef.current = false;
      return;
    }
    const index = boards.findIndex((board) => board.id === selectedBoardId);
    if (index < 0) return;
    const starts = boardStartFrames(inputPropsRef.current);
    const frame = starts[index] ?? 0;
    playerRef.current?.seekTo(frame);
    setCurrentFrame(frame);
  }, [selectedBoardId, boards]);

  useEffect(() => {
    const player = playerRef.current;
    // Keep listeners even while images/audio overlay is busy — Player stays mounted.
    if (!player || imagesError || editMode) return;

    const onFrame = () => {
      const frame = player.getCurrentFrame();
      setCurrentFrame(frame);
      const props = inputPropsRef.current;
      const starts = boardStartFrames(props);
      let index = 0;
      for (let i = 0; i < starts.length; i += 1) {
        if (frame >= (starts[i] ?? 0)) index = i;
      }
      const board = boards[index];
      if (board && board.id !== selectedBoardId) {
        suppressSeekRef.current = true;
        onSelectBoard(board.id);
      }
    };

    player.addEventListener("frameupdate", onFrame);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
    };
  }, [imagesError, boards, selectedBoardId, onSelectBoard, durationInFrames, editMode]);

  function seekFrame(frame: number) {
    const clamped = Math.max(0, Math.min(durationInFrames - 1, frame));
    playerRef.current?.seekTo(clamped);
    setCurrentFrame(clamped);
    const props = inputPropsRef.current;
    const starts = boardStartFrames(props);
    let index = 0;
    for (let i = 0; i < starts.length; i += 1) {
      if (clamped >= (starts[i] ?? 0)) index = i;
    }
    const board = boards[index];
    if (board && board.id !== selectedBoardId) {
      suppressSeekRef.current = true;
      onSelectBoard(board.id);
    }
  }

  function handleOverlayChange(key: LayerKey, patch: Partial<StyleOverlayLayer>) {
    setOverlayDraft((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  function handleDraftField(key: "title" | "subtitle" | "caption", value: string) {
    if (key === "title") setTitleDraft(value);
    else if (key === "subtitle") setSubtitleDraft(value);
    else onDraftChange(value);
  }

  async function saveOverlayEdits() {
    setSavingOverlay(true);
    try {
      await flushPendingEdits();
      if (selectedBoardId != null) {
        await authorizedRequest<Board>(`/blog-clips/${blogClip.id}/boards/${selectedBoardId}`, {
          method: "PATCH",
          body: JSON.stringify({ text: draftText }),
        });
      }
      onBoardsSynced?.();
      setPreviewRevision((value) => value + 1);
      setEditMode(false);
      setSelectedLayer(null);
      onMessage?.("타이틀·자막을 미리보기에 적용했습니다.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "텍스트 스타일 저장에 실패했습니다.");
    } finally {
      setSavingOverlay(false);
    }
  }

  async function toggleEditMode() {
    if (editMode) {
      await saveOverlayEdits();
      return;
    }
    setEditMode(true);
    setSelectedLayer(null);
    playerRef.current?.pause();
  }

  function beginEditLayer(key: LayerKey) {
    setEditMode(true);
    setSelectedLayer(key);
    playerRef.current?.pause();
  }

  function resetOverlay() {
    setOverlayDraft(defaultStyleOverlay(blogClip.visual_style));
  }

  if (boards.length === 0) {
    return (
      <section className="preview-pane" aria-label="Remotion 미리보기">
        <div className="preview-empty">
          <p>보드가 없습니다. 보드를 추가하세요.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="preview-pane preview-pane-remotion" aria-label="Remotion 미리보기">
      <div className="preview-edit-bar">
        <button
          type="button"
          className={`small-button ${editMode ? "is-active" : ""}`}
          disabled={savingOverlay}
          onClick={() => void toggleEditMode()}
        >
          {savingOverlay ? "적용 중…" : editMode ? "적용하고 편집 종료" : "텍스트 편집"}
        </button>
        <p className="muted">
          {editMode
            ? "점선 박스만 드래그 · 텍스트 입력으로 줄바꿈 · 라벨은 왼쪽에 고정"
            : "미리보기 텍스트를 클릭하면 바로 편집됩니다."}
        </p>
      </div>

      <div className="preview-player-wrap">
        {imagesError ? (
          <>
            <p className="form-message preview-player-status" role="alert">
              {imagesError}
            </p>
            <div className="preview-frame preview-frame-waiting" />
          </>
        ) : (
          <>
            <Player
              key={`blog-shorts-${blogClip.id}-${previewRevision}`}
              ref={playerRef}
              component={BlogShorts}
              inputProps={inputProps}
              durationInFrames={durationInFrames}
              compositionWidth={BLOG_SHORTS_WIDTH}
              compositionHeight={BLOG_SHORTS_HEIGHT}
              fps={FPS}
              style={{ width: "100%", aspectRatio: "9 / 16" }}
              controls={!editMode}
              loop={!editMode}
              clickToPlay={!editMode}
              acknowledgeRemotionLicense
            />
            <PreviewTextEditor
              enabled={editMode}
              overlay={overlayDraft}
              drafts={{ title: titleDraft, subtitle: subtitleDraft, caption: draftText }}
              captionVariant={captionVariant}
              onDraftChange={handleDraftField}
              onOverlayChange={handleOverlayChange}
              onSelectLayer={setSelectedLayer}
              onBeginEdit={beginEditLayer}
              selectedLayer={selectedLayer}
            />
            {imagesLoading || audioBusy || audioStatus === "loading" ? (
              <div className="preview-player-overlay" aria-busy="true">
                <p className="muted preview-player-status">
                  {imagesLoading ? "이미지 불러오는 중…" : "TTS/BGM 미리듣기 준비 중…"}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {editMode ? (
        <PreviewOverlayToolbar
          selectedLayer={selectedLayer}
          overlay={overlayDraft}
          onOverlayChange={handleOverlayChange}
          onFontsChange={(next) => {
            setOverlayDraft((prev) =>
              mergeStyleOverlay(blogClip.visual_style, {
                ...prev,
                titleFont: next.titleFont,
                captionFont: next.captionFont,
              }),
            );
          }}
          onSave={() => void saveOverlayEdits()}
          onReset={resetOverlay}
          saving={savingOverlay}
        />
      ) : null}

      <div className="preview-audio-bar">
        {audioStatus === "ready" ? (
          <p className="muted">TTS/BGM 미리듣기 연결됨 (최종 렌더와 동일 믹스·덕킹)</p>
        ) : audioStatus === "loading" || audioBusy ? (
          <p className="muted">TTS/BGM 미리듣기 준비 중…</p>
        ) : audioStatus === "error" ? (
          <p className="muted">미리듣기 생성에 실패했습니다. 다시 시도해 주세요.</p>
        ) : (
          <p className="muted">미리듣기가 없으면 자동 생성합니다. BGM은 오디오 설정에서 켜 주세요.</p>
        )}
        <button
          type="button"
          className="small-button"
          disabled={audioBusy}
          onClick={() => void generatePreviewAudio({ intentional: true })}
        >
          {audioBusy ? "생성 중…" : audioStatus === "ready" ? "TTS/BGM 다시 생성" : "TTS/BGM 미리듣기 생성"}
        </button>
        {audioError ? (
          <p className="form-message" role="alert">
            {audioError}
          </p>
        ) : null}
      </div>

      {!imagesError && !editMode ? (
        <BoardTimeline
          boards={boards}
          selectedBoardId={selectedBoardId}
          boardDurationsSec={boardDurationsSec}
          boardStartFramesList={boardStartFramesList}
          currentFrame={currentFrame}
          durationInFrames={durationInFrames}
          fps={FPS}
          onSelectBoard={onSelectBoard}
          onSeekFrame={seekFrame}
          onDurationCommit={onDurationCommit}
        />
      ) : null}

      <p className="muted preview-remotion-note">
        타임라인 길이는 TTS 보드 길이와 같고, 오디오는 최종 Remotion 렌더와 같은 믹스(사이드체인 덕킹)를 씁니다.
      </p>
      {!editMode ? (
        <label className="preview-text-editor">
          나레이션 텍스트
          <textarea value={draftText} onChange={(event) => onDraftChange(event.target.value)} onBlur={onTextBlur} rows={4} />
        </label>
      ) : null}
    </section>
  );
});

