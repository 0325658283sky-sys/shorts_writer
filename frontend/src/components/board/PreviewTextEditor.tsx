import { useEffect, useRef, useState } from "react";
import { FontRolePicker } from "../FontRolePicker";
import { shortsFontCss } from "../../lib/shortsFonts";
import type { StyleOverlay, StyleOverlayLayer } from "../../lib/styleOverlay";

type LayerKey = "title" | "subtitle" | "caption";

type Drafts = {
  title: string;
  subtitle: string;
  caption: string;
};

function lineCount(text: string): number {
  return Math.max(1, text.split("\n").length);
}

export function PreviewTextEditor({
  enabled,
  overlay,
  drafts,
  captionVariant,
  onDraftChange,
  onOverlayChange,
  onSelectLayer,
  onBeginEdit,
  selectedLayer,
}: {
  enabled: boolean;
  overlay: StyleOverlay;
  drafts: Drafts;
  captionVariant: string;
  onDraftChange: (key: keyof Drafts, value: string) => void;
  onOverlayChange: (key: LayerKey, patch: Partial<StyleOverlayLayer>) => void;
  onSelectLayer: (key: LayerKey | null) => void;
  /** Called when a text hit-target is clicked while not yet in edit mode. */
  onBeginEdit: (key: LayerKey) => void;
  selectedLayer: LayerKey | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: LayerKey;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      const root = rootRef.current;
      if (!drag || !root) return;
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dx = (event.clientX - drag.startX) / rect.width;
      const dy = (event.clientY - drag.startY) / rect.height;
      onOverlayChange(drag.key, {
        x: Math.max(0.08, Math.min(0.92, drag.originX + dx)),
        y: Math.max(0.02, Math.min(0.9, drag.originY + dy)),
      });
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [enabled, onOverlayChange]);

  // Focus the selected layer textarea when entering edit mode / switching layers.
  useEffect(() => {
    if (!enabled || !selectedLayer) return;
    const timer = window.setTimeout(() => {
      const node = rootRef.current?.querySelector<HTMLTextAreaElement>(
        `[data-layer="${selectedLayer}"] textarea`,
      );
      node?.focus();
      const len = node?.value.length ?? 0;
      node?.setSelectionRange(len, len);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enabled, selectedLayer]);

  const layers: { key: LayerKey; label: string; text: string; layer: StyleOverlayLayer }[] = [
    { key: "title", label: "타이틀", text: drafts.title, layer: overlay.title },
    { key: "subtitle", label: "보조", text: drafts.subtitle, layer: overlay.subtitle },
    { key: "caption", label: "자막", text: drafts.caption, layer: overlay.caption },
  ];

  return (
    <div className={`preview-text-overlay ${enabled ? "is-editing" : "is-hit"}`} ref={rootRef}>
      {layers.map(({ key, label, text, layer }) => {
        if (!layer.visible) return null;
        const selected = enabled && selectedLayer === key;
        const lines = lineCount(text);
        const isCaption = key === "caption";
        const fontCss = shortsFontCss(
          isCaption ? overlay.captionFont : overlay.titleFont,
          isCaption ? "caption" : "title",
        );
        return (
          <div
            key={key}
            data-layer={key}
            className={`preview-overlay-layer ${selected ? "is-selected" : ""} ${
              isCaption ? `caption-${captionVariant}` : ""
            }`}
            style={{
              left: `${layer.x * 100}%`,
              top: `${layer.y * 100}%`,
              width: `${layer.maxWidth * 100}%`,
              color: layer.color,
              fontSize: `calc(${layer.fontSize} * 100cqw / 1080)`,
              fontFamily: fontCss.fontFamily,
              fontWeight: fontCss.fontWeight,
              textAlign: layer.align,
              zIndex: selected ? 6 : 5,
            }}
            onPointerDown={(event) => {
              if (!enabled) {
                event.preventDefault();
                event.stopPropagation();
                onBeginEdit(key);
                return;
              }
              // Drag from frame chrome / empty area; typing uses textarea stopPropagation.
              if ((event.target as HTMLElement).closest("textarea")) return;
              event.preventDefault();
              event.stopPropagation();
              onSelectLayer(key);
              dragRef.current = {
                key,
                startX: event.clientX,
                startY: event.clientY,
                originX: layer.x,
                originY: layer.y,
              };
            }}
          >
            {enabled ? (
              <>
                <span className="preview-overlay-tag" aria-hidden="true">
                  {label}
                </span>
                <div className="preview-overlay-frame">
                  <textarea
                    className="preview-overlay-textarea"
                    value={text}
                    rows={lines}
                    style={{ height: `calc(${lines} * 1.25em)` }}
                    onChange={(event) => onDraftChange(key, event.target.value)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelectLayer(key);
                    }}
                    placeholder={label}
                  />
                </div>
              </>
            ) : (
              <button
                type="button"
                className="preview-overlay-hit"
                aria-label={`${label} 편집`}
                style={{ height: `calc(${lines} * 1.25em)` }}
              >
                <span className="preview-overlay-hit-label">{label} 편집</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PreviewOverlayToolbar({
  selectedLayer,
  overlay,
  onOverlayChange,
  onFontsChange,
  onSave,
  onReset,
  saving,
}: {
  selectedLayer: LayerKey | null;
  overlay: StyleOverlay;
  onOverlayChange: (key: LayerKey, patch: Partial<StyleOverlayLayer>) => void;
  onFontsChange: (next: { titleFont: string; captionFont: string }) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
}) {
  const layer = selectedLayer ? overlay[selectedLayer] : null;
  const [localSize, setLocalSize] = useState(layer?.fontSize ?? 40);

  useEffect(() => {
    setLocalSize(layer?.fontSize ?? 40);
  }, [layer?.fontSize, selectedLayer]);

  if (!selectedLayer || !layer) {
    return (
      <div className="preview-overlay-toolbar">
        <p className="muted">텍스트를 클릭한 뒤 위치·크기·색을 조정하세요. 완료 시 아래 저장을 눌러주세요.</p>
        <FontRolePicker
          titleFont={overlay.titleFont}
          captionFont={overlay.captionFont}
          disabled={saving}
          onChange={onFontsChange}
        />
        <div className="preview-overlay-toolbar-actions">
          <button type="button" className="ghost-small" disabled={saving} onClick={onReset}>
            템플릿 기본값
          </button>
          <button type="button" className="small-button" disabled={saving} onClick={onSave}>
            {saving ? "저장 중…" : "적용하고 편집 종료"}
          </button>
        </div>
      </div>
    );
  }

  const fontRole = selectedLayer === "caption" ? "caption" : "title";

  return (
    <div className="preview-overlay-toolbar">
      <strong>{selectedLayer === "title" ? "타이틀" : selectedLayer === "subtitle" ? "보조 타이틀" : "자막"}</strong>
      <FontRolePicker
        titleFont={overlay.titleFont}
        captionFont={overlay.captionFont}
        disabled={saving}
        focusRole={fontRole}
        onChange={onFontsChange}
      />
      <label>
        크기 {localSize}px
        <input
          type="range"
          min={20}
          max={140}
          value={localSize}
          onChange={(event) => {
            const next = Number(event.target.value);
            setLocalSize(next);
            onOverlayChange(selectedLayer, { fontSize: next });
          }}
        />
      </label>
      <label>
        색상
        <input
          type="color"
          value={/^#([0-9a-f]{6})$/i.test(layer.color) ? layer.color : "#ffffff"}
          onChange={(event) => onOverlayChange(selectedLayer, { color: event.target.value })}
        />
      </label>
      <div className="motion-settings-row">
        {(["left", "center", "right"] as const).map((align) => (
          <button
            key={align}
            type="button"
            className={`motion-chip ${layer.align === align ? "is-selected" : ""}`}
            onClick={() => onOverlayChange(selectedLayer, { align })}
          >
            {align === "left" ? "왼쪽" : align === "right" ? "오른쪽" : "가운데"}
          </button>
        ))}
      </div>
      <div className="preview-overlay-toolbar-actions">
        <button type="button" className="ghost-small" disabled={saving} onClick={onReset}>
          템플릿 기본값
        </button>
        <button type="button" className="small-button" disabled={saving} onClick={onSave}>
          {saving ? "저장 중…" : "적용하고 편집 종료"}
        </button>
      </div>
    </div>
  );
}
