import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { authorizedBlob, authorizedRequest } from "../../api/client";
import { SHORTS_FONTS } from "../../lib/shortsFonts";
import type { BlogClip, Board, BoardTextStyle, StockSearchResponse, Voice } from "../../types";
import { BgmPanel } from "./BgmPanel";
import { VisualStylePanel } from "../VisualStylePanel";
import { useBoardImageUrl } from "./useBoardImageUrl";

type MediaTab = "text" | "narration" | "bgm" | "trim" | "style";

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

const TEXT_ACCENT_SWATCHES = ["#FFE500", "#FF5C5C", "#7CFF6B", "#FFFFFF"];
const TEXT_ANIMATIONS: { id: "highlight" | "none"; label: string }[] = [
  { id: "highlight", label: "글자 튀기기" },
  { id: "none", label: "없음" },
];

/** ⑤ 편집기 "텍스트" 탭 — 선택한 장면의 자막 폰트·크기·강조색·등장 애니메이션.
 *  비워 둔 항목은 ④ 템플릿/전체 스타일 값을 그대로 쓰고, "되돌리기"로 장면 값을 지운다. */
function SceneTextStyleEditor({
  style,
  saving,
  onChange,
}: {
  style: BoardTextStyle | null;
  saving: boolean;
  onChange: (textStyle: BoardTextStyle | null) => Promise<void>;
}) {
  const [sizeDraft, setSizeDraft] = useState(style?.fontSize ? String(style.fontSize) : "");
  const [colorDraft, setColorDraft] = useState(style?.accentColor ?? "");
  const [error, setError] = useState("");

  async function apply(patch: Partial<BoardTextStyle>) {
    const merged: BoardTextStyle = { ...(style ?? {}), ...patch };
    const cleaned: BoardTextStyle = {};
    if (merged.fontFamily) cleaned.fontFamily = merged.fontFamily;
    if (merged.fontSize) cleaned.fontSize = merged.fontSize;
    if (merged.accentColor) cleaned.accentColor = merged.accentColor;
    if (merged.animation) cleaned.animation = merged.animation;
    setError("");
    try {
      await onChange(Object.keys(cleaned).length > 0 ? cleaned : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    }
  }

  function commitSize() {
    const trimmed = sizeDraft.trim();
    if (!trimmed) {
      if (style?.fontSize) void apply({ fontSize: null });
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 20 || value > 120) {
      setError("크기는 20~120 사이 숫자로 입력하세요.");
      setSizeDraft(style?.fontSize ? String(style.fontSize) : "");
      return;
    }
    if (Math.round(value) !== style?.fontSize) void apply({ fontSize: Math.round(value) });
  }

  function commitColor() {
    const trimmed = colorDraft.trim();
    if (!trimmed) {
      if (style?.accentColor) void apply({ accentColor: null });
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      setError("색상은 #RRGGBB 형식으로 입력하세요.");
      setColorDraft(style?.accentColor ?? "");
      return;
    }
    if (trimmed !== style?.accentColor) void apply({ accentColor: trimmed });
  }

  return (
    <div className="scene-text-style">
      <p className="muted">바꾸지 않은 항목은 ④ 템플릿 값을 따릅니다.</p>

      <label className="voice-speed">
        폰트
        <select
          value={style?.fontFamily ?? ""}
          disabled={saving}
          onChange={(event) => void apply({ fontFamily: event.target.value || null })}
        >
          <option value="">템플릿 기본</option>
          {SHORTS_FONTS.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
      </label>

      <label className="voice-speed">
        크기(px)
        <input
          type="number"
          min={20}
          max={120}
          step={2}
          placeholder="템플릿 기본"
          value={sizeDraft}
          disabled={saving}
          onChange={(event) => setSizeDraft(event.target.value)}
          onBlur={commitSize}
        />
      </label>

      <div>
        <span className="scene-text-style-label">강조색</span>
        <div className="scene-text-style-swatches">
          {TEXT_ACCENT_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              className={`scene-text-swatch${style?.accentColor?.toLowerCase() === color.toLowerCase() ? " is-active" : ""}`}
              style={{ background: color }}
              aria-label={`강조색 ${color}`}
              disabled={saving}
              onClick={() => {
                setColorDraft(color);
                void apply({ accentColor: color });
              }}
            />
          ))}
          <input
            type="text"
            className="scene-text-hex"
            placeholder="#RRGGBB"
            maxLength={7}
            value={colorDraft}
            disabled={saving}
            onChange={(event) => setColorDraft(event.target.value)}
            onBlur={commitColor}
          />
        </div>
      </div>

      <div>
        <span className="scene-text-style-label">등장 애니메이션</span>
        <div className="scene-text-style-swatches">
          {TEXT_ANIMATIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`small-button${style?.animation === item.id ? " is-active" : ""}`}
              disabled={saving}
              onClick={() => void apply({ animation: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="form-message">{error}</p> : null}
      {style ? (
        <button
          type="button"
          className="ghost-button"
          disabled={saving}
          onClick={() => {
            setSizeDraft("");
            setColorDraft("");
            void onChange(null);
          }}
        >
          이 장면 스타일 되돌리기
        </button>
      ) : null}
    </div>
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
  onTextStyleChange,
  savingTextStyle,
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
  onTextStyleChange: (textStyle: BoardTextStyle | null) => Promise<void>;
  savingTextStyle: boolean;
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
  const [tab, setTab] = useState<MediaTab>("text");
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
    if (tab !== "narration" || voices.length > 0 || voicesLoading) return;
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
            ["text", "텍스트"],
            ["narration", "나레이션"],
            ["bgm", "배경음악"],
            ["trim", "구간편집"],
            ["style", "전체 스타일"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`media-tab ${tab === id ? "active" : ""}`} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "text" ? (
        <div className="media-tab-body">
          <p className="media-scope-label">이 장면</p>
          {selectedBoard ? (
            <SceneTextStyleEditor
              key={selectedBoard.id}
              style={selectedBoard.text_style ?? null}
              saving={savingTextStyle}
              onChange={onTextStyleChange}
            />
          ) : (
            <p className="muted">장면을 선택한 뒤 자막 스타일을 바꾸세요. 바꾸지 않은 항목은 ④ 템플릿 값을 따릅니다.</p>
          )}
        </div>
      ) : null}

      {tab === "narration" ? (
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
        </div>
      ) : null}

      {tab === "bgm" ? (
        <div className="media-tab-body">
          <p className="media-scope-label">영상 전체</p>
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

      {tab === "trim" ? (
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
        </div>
      ) : null}

      {tab === "style" ? (
        <div className="media-tab-body">
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
