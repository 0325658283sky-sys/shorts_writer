import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { authorizedBlob, authorizedRequest } from "../../api/client";
import type { BlogClip, Board, StockSearchResponse, Voice } from "../../types";
import { BgmPanel } from "./BgmPanel";
import { VisualStylePanel } from "../VisualStylePanel";
import { useBoardImageUrl } from "./useBoardImageUrl";

type MediaTab = "screen" | "voice" | "motion";

function MediaThumb({
  blogClipId,
  boardId,
  imagePath,
  active,
  onSelect,
}: {
  blogClipId: number;
  boardId: number;
  imagePath: string;
  active: boolean;
  onSelect: () => void;
}) {
  const { url, error } = useBoardImageUrl(blogClipId, boardId, imagePath);
  return (
    <button className={`media-thumb ${active ? "active" : ""}`} type="button" onClick={onSelect}>
      {url && !error ? <img src={url} alt="" /> : <span className="board-thumb-fallback">?</span>}
    </button>
  );
}

export function MediaPanel({
  blogClipId,
  boards,
  selectedBoard,
  onSwapImage,
  onApplyStock,
  applyingStock,
  ttsSpeed,
  onTtsSpeedChange,
  onAssignSpeaker,
  onApplyVoiceToAll,
  assigningSpeaker,
  appliedVisualStyle,
  styleTitle,
  styleSubtitle,
  styleOverlay,
  transitionSec,
  transitionType,
  onApplyVisualStyle,
  onStyleCopyChange,
  onMotionChange,
  onTitlesGenerated,
  onOverlayUpdated,
  applyingVisualStyle,
  savingStyleCopy,
  savingMotion,
  onMessage,
  bgmAssetId,
  bgmVolume,
  onBgmChange,
  onSfxChange,
  audioSaving,
  durationInput,
  onDurationChange,
  onDurationBlur,
  autoDuration,
  onAutoDurationChange,
}: {
  blogClipId: number;
  boards: Board[];
  selectedBoard: Board | null;
  onSwapImage: (imagePath: string) => void;
  onApplyStock: (downloadUrl: string) => Promise<void>;
  applyingStock: boolean;
  ttsSpeed: number;
  onTtsSpeedChange: (speed: number) => void;
  onAssignSpeaker: (voiceId: string | null) => Promise<void>;
  onApplyVoiceToAll: (voiceId: string) => Promise<void>;
  assigningSpeaker: boolean;
  appliedVisualStyle?: string | null;
  styleTitle?: string | null;
  styleSubtitle?: string | null;
  styleOverlay?: BlogClip["style_overlay"];
  transitionSec?: number | null;
  transitionType?: string | null;
  onApplyVisualStyle: (style: string) => Promise<void>;
  onStyleCopyChange: (body: { style_title?: string; style_subtitle?: string }) => Promise<void>;
  onMotionChange: (body: {
    transition_sec?: number;
    transition_type?: "fade" | "none" | "slide";
  }) => Promise<void>;
  onTitlesGenerated?: (clip: BlogClip) => void;
  onOverlayUpdated?: (clip: BlogClip) => void;
  applyingVisualStyle: boolean;
  savingStyleCopy: boolean;
  savingMotion: boolean;
  onMessage: (message: string) => void;
  bgmAssetId: number | null;
  bgmVolume: number;
  onBgmChange: (bgmAssetId: number | null, bgmVolume?: number) => Promise<void>;
  onSfxChange: (sfxAssetId: number | null) => Promise<void>;
  audioSaving: boolean;
  durationInput: string;
  onDurationChange: (value: string) => void;
  onDurationBlur: () => void;
  autoDuration: boolean;
  onAutoDurationChange: (value: boolean) => void;
}) {
  const [tab, setTab] = useState<MediaTab>("screen");
  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<StockSearchResponse | null>(null);
  const [stockSearching, setStockSearching] = useState(false);
  const [stockError, setStockError] = useState("");

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [speedDraft, setSpeedDraft] = useState(String(ttsSpeed));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrlRef = useRef<string | null>(null);

  const uniqueImages = useMemo(() => {
    const seen = new Set<string>();
    const items: { imagePath: string; boardId: number }[] = [];
    for (const board of boards) {
      if (seen.has(board.image_path)) continue;
      seen.add(board.image_path);
      items.push({ imagePath: board.image_path, boardId: board.id });
    }
    return items;
  }, [boards]);

  useEffect(() => {
    setSpeedDraft(String(ttsSpeed));
  }, [ttsSpeed]);

  useEffect(() => {
    if (tab !== "voice" || voices.length > 0 || voicesLoading) return;
    setVoicesLoading(true);
    setVoiceError("");
    void authorizedRequest<Voice[]>("/voices")
      .then((loaded) => setVoices(loaded))
      .catch((err) => setVoiceError(err instanceof Error ? err.message : "보이스 목록을 불러오지 못했습니다."))
      .finally(() => setVoicesLoading(false));
  }, [tab, voices.length, voicesLoading]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (sampleUrlRef.current) {
        URL.revokeObjectURL(sampleUrlRef.current);
        sampleUrlRef.current = null;
      }
    };
  }, []);

  async function handleStockSearch(event?: FormEvent) {
    event?.preventDefault();
    const query = stockQuery.trim();
    if (!query || stockSearching) return;
    setStockSearching(true);
    setStockError("");
    try {
      const params = new URLSearchParams({ query, page: "1", per_page: "12" });
      const result = await authorizedRequest<StockSearchResponse>(
        `/blog-clips/${blogClipId}/stock-search?${params.toString()}`,
      );
      setStockResults(result);
      if (result.photos.length === 0) {
        setStockError("검색 결과가 없습니다. 다른 키워드를 시도하세요.");
      }
    } catch (err) {
      setStockResults(null);
      setStockError(err instanceof Error ? err.message : "스톡 검색에 실패했습니다.");
    } finally {
      setStockSearching(false);
    }
  }

  async function handleApplyStock(downloadUrl: string) {
    if (!selectedBoard || applyingStock) return;
    setStockError("");
    try {
      await onApplyStock(downloadUrl);
    } catch (err) {
      setStockError(err instanceof Error ? err.message : "스톡 이미지 적용에 실패했습니다.");
    }
  }

  async function handlePlaySample(voiceId: string) {
    setVoiceError("");
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (sampleUrlRef.current) {
        URL.revokeObjectURL(sampleUrlRef.current);
        sampleUrlRef.current = null;
      }
      setPlayingVoiceId(voiceId);
      const blob = await authorizedBlob(`/voices/${encodeURIComponent(voiceId)}/sample`);
      const url = URL.createObjectURL(blob);
      sampleUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingVoiceId(null);
      audio.onerror = () => {
        setPlayingVoiceId(null);
        setVoiceError("샘플 재생에 실패했습니다.");
      };
      await audio.play();
    } catch (err) {
      setPlayingVoiceId(null);
      setVoiceError(err instanceof Error ? err.message : "샘플을 불러오지 못했습니다.");
    }
  }

  function handleSpeedBlur() {
    const value = Number(speedDraft);
    if (!Number.isFinite(value) || value < 0.25 || value > 4) {
      setVoiceError("재생 속도는 0.25~4.0 사이여야 합니다.");
      setSpeedDraft(String(ttsSpeed));
      return;
    }
    setVoiceError("");
    if (Math.abs(value - ttsSpeed) > 0.001) {
      onTtsSpeedChange(value);
    }
  }

  async function handleAssign(voiceId: string | null) {
    if (!selectedBoard || assigningSpeaker) return;
    setVoiceError("");
    try {
      await onAssignSpeaker(voiceId);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "보이스 지정에 실패했습니다.");
    }
  }

  return (
    <aside className="media-panel" aria-label="미디어 패널">
      <div className="media-tabs" role="tablist">
        {(
          [
            ["screen", "화면"],
            ["voice", "음성"],
            ["motion", "모션"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`media-tab ${tab === id ? "active" : ""}`} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "screen" ? (
        <div className="media-tab-body">
          <p className="media-scope-label">이 장면</p>
          <p className="muted">다운로드된 이미지로 선택 장면을 교체합니다.</p>
          <div className="media-grid">
            {uniqueImages.map((item) => (
              <MediaThumb
                key={item.imagePath}
                blogClipId={blogClipId}
                boardId={item.boardId}
                imagePath={item.imagePath}
                active={selectedBoard?.image_path === item.imagePath}
                onSelect={() => onSwapImage(item.imagePath)}
              />
            ))}
          </div>

          <section className="stock-search" aria-label="스톡 이미지 검색">
            <h3 className="stock-search-title">스톡 검색 (Pexels)</h3>
            <form className="stock-search-form" onSubmit={(event) => void handleStockSearch(event)}>
              <input
                type="search"
                value={stockQuery}
                onChange={(event) => setStockQuery(event.target.value)}
                placeholder="예: cafe, travel, food"
                disabled={stockSearching}
              />
              <button className="small-button" type="submit" disabled={stockSearching || !stockQuery.trim()}>
                {stockSearching ? "검색 중" : "검색"}
              </button>
            </form>
            {stockError ? <p className="form-message">{stockError}</p> : null}
            {stockResults && stockResults.photos.length > 0 ? (
              <div className="stock-grid">
                {stockResults.photos.map((photo) => (
                  <button
                    key={`${photo.id ?? photo.download_url}`}
                    className="stock-thumb"
                    type="button"
                    disabled={!selectedBoard || applyingStock}
                    title={photo.photographer ? `${photo.alt} — ${photo.photographer}` : photo.alt}
                    onClick={() => void handleApplyStock(photo.download_url)}
                  >
                    <img src={photo.preview_url} alt={photo.alt || "stock"} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : null}
            {!selectedBoard ? <p className="muted">장면을 선택한 뒤 스톡 이미지를 적용하세요.</p> : null}
            {applyingStock ? <p className="muted">이미지를 장면에 적용하는 중…</p> : null}
          </section>

          <p className="muted media-upload-note">로컬 업로드 — 곧 제공</p>
          <p className="media-scope-label">영상 전체</p>
          <VisualStylePanel
            blogClipId={blogClipId}
            appliedStyle={appliedVisualStyle}
            styleTitle={styleTitle}
            styleSubtitle={styleSubtitle}
            styleOverlay={styleOverlay}
            transitionSec={transitionSec}
            transitionType={transitionType}
            onApply={onApplyVisualStyle}
            onStyleCopyChange={onStyleCopyChange}
            onMotionChange={onMotionChange}
            onTitlesGenerated={onTitlesGenerated}
            onOverlayUpdated={onOverlayUpdated}
            applying={applyingVisualStyle}
            savingCopy={savingStyleCopy}
            savingMotion={savingMotion}
            onMessage={onMessage}
            variant="screen"
          />
        </div>
      ) : null}

      {tab === "voice" ? (
        <div className="media-tab-body">
          <p className="media-scope-label">영상 전체</p>
          <label className="voice-speed">
            재생 속도
            <input
              type="number"
              min={0.25}
              max={4}
              step={0.05}
              value={speedDraft}
              onChange={(event) => setSpeedDraft(event.target.value)}
              onBlur={handleSpeedBlur}
            />
            <span className="muted">0.25–4.0 (기본 1.0 · 전체 장면)</span>
          </label>

          <p className="media-scope-label">이 장면</p>
          <p className="muted">
            장면별로 보이스를 지정하거나, <strong>모든 장면에 적용</strong>으로 일괄 설정하세요.
          </p>
          {selectedBoard ? (
            <p className="muted">
              선택 장면: {selectedBoard.speaker ? `보이스 ${selectedBoard.speaker}` : "기본 보이스 (환경설정)"}
            </p>
          ) : (
            <p className="muted">장면을 선택한 뒤 보이스를 지정하세요.</p>
          )}
          {voiceError ? <p className="form-message">{voiceError}</p> : null}
          {voicesLoading ? <p className="muted">보이스 목록 불러오는 중…</p> : null}
          <ul className="voice-list">
            {voices.map((voice) => {
              const active = selectedBoard?.speaker === voice.id;
              return (
                <li key={voice.id} className={`voice-card ${active ? "active" : ""}`}>
                  <div className="voice-card-copy">
                    <strong>{voice.name}</strong>
                    <span className="muted">{voice.description}</span>
                  </div>
                  <div className="voice-card-actions">
                    <button className="ghost-small" type="button" onClick={() => void handlePlaySample(voice.id)} disabled={playingVoiceId === voice.id}>
                      {playingVoiceId === voice.id ? "재생 중" : "미리듣기"}
                    </button>
                    <button
                      className="small-button"
                      type="button"
                      disabled={!selectedBoard || assigningSpeaker || active}
                      onClick={() => void handleAssign(voice.id)}
                    >
                      {active ? "적용됨" : "이 장면에"}
                    </button>
                    <button
                      className="small-button"
                      type="button"
                      disabled={assigningSpeaker}
                      onClick={() => void onApplyVoiceToAll(voice.id)}
                    >
                      모든 장면에
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {selectedBoard?.speaker ? (
            <button className="ghost-button" type="button" disabled={assigningSpeaker} onClick={() => void handleAssign(null)}>
              이 장면만 기본 보이스로
            </button>
          ) : null}
          <BgmPanel
            selectedBoard={selectedBoard}
            bgmAssetId={bgmAssetId}
            bgmVolume={bgmVolume}
            onBgmChange={onBgmChange}
            onSfxChange={onSfxChange}
            saving={audioSaving}
          />
        </div>
      ) : null}

      {tab === "motion" ? (
        <div className="media-tab-body">
          <p className="media-scope-label">이 장면</p>
          {selectedBoard ? (
            <div className="duration-controls">
              <label className="duration-auto">
                <input type="checkbox" checked={autoDuration} onChange={(event) => onAutoDurationChange(event.target.checked)} />
                길이 자동
              </label>
              {!autoDuration ? (
                <label>
                  길이(초)
                  <input type="number" min={0.5} step={0.1} value={durationInput} onChange={(event) => onDurationChange(event.target.value)} onBlur={onDurationBlur} />
                </label>
              ) : null}
            </div>
          ) : (
            <p className="muted">장면을 선택한 뒤 길이를 조절하세요.</p>
          )}

          <p className="media-scope-label">영상 전체</p>
          <VisualStylePanel
            blogClipId={blogClipId}
            appliedStyle={appliedVisualStyle}
            styleTitle={styleTitle}
            styleSubtitle={styleSubtitle}
            styleOverlay={styleOverlay}
            transitionSec={transitionSec}
            transitionType={transitionType}
            onApply={onApplyVisualStyle}
            onStyleCopyChange={onStyleCopyChange}
            onMotionChange={onMotionChange}
            onTitlesGenerated={onTitlesGenerated}
            onOverlayUpdated={onOverlayUpdated}
            applying={applyingVisualStyle}
            savingCopy={savingStyleCopy}
            savingMotion={savingMotion}
            onMessage={onMessage}
            variant="motion"
          />
        </div>
      ) : null}
    </aside>
  );
}
