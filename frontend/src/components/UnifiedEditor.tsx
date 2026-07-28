import type { BlogClip, Clip, ClipMetadata, Highlight, SubtitleStyle, TtsMode } from "../types";
import { BoardEditor } from "./board/BoardEditor";
import { YoutubeClipEditor } from "./YoutubeClipEditor";

/**
 * Compatibility shell: switches BoardEditor (blog/Remotion) vs YoutubeClipEditor (FFmpeg).
 * Does not merge engines — Phase 3 identity/routing only.
 */
export function UnifiedEditor({
  mode,
  blogClip,
  onBlogClose,
  onBlogRendered,
  onBlogClipUpdated,
  onMessage,
  youtube,
}: {
  mode: "blog" | "youtube";
  blogClip?: BlogClip | null;
  onBlogClose: () => void;
  onBlogRendered: (updated: BlogClip) => void;
  onBlogClipUpdated?: (updated: BlogClip) => void;
  onMessage: (message: string) => void;
  youtube?: {
    clip: Clip;
    highlight: Highlight | null;
    videoTitle: string;
    metadata?: ClipMetadata;
    copiedKey: string | null;
    selectedStyle: SubtitleStyle;
    selectedTtsMode: TtsMode;
    downloadingClipId: number | null;
    generatingMetadataId: number | null;
    narratingClipId: number | null;
    subtitlingClipId: number | null;
    onClose: () => void;
    onBurnSubtitles: (clip: Clip, style?: SubtitleStyle) => Promise<Clip | null>;
    onApplyNarration: (clip: Clip) => void | Promise<void>;
    onGenerateMetadata: (clip: Clip) => void | Promise<void>;
    onDownloadClip: (clip: Clip) => void;
    onCopyText: (key: string, text: string) => void;
    onStyleChange: (clipId: number, style: SubtitleStyle) => void;
    onTtsModeChange: (clipId: number, mode: TtsMode) => void;
  } | null;
}) {
  if (mode === "blog" && blogClip) {
    return (
      <BoardEditor
        blogClip={blogClip}
        onClose={onBlogClose}
        onRendered={onBlogRendered}
        onClipUpdated={onBlogClipUpdated}
        onMessage={onMessage}
      />
    );
  }

  if (mode === "youtube" && youtube) {
    return (
      <YoutubeClipEditor
        clip={youtube.clip}
        highlight={youtube.highlight}
        videoTitle={youtube.videoTitle}
        metadata={youtube.metadata}
        copiedKey={youtube.copiedKey}
        selectedStyle={youtube.selectedStyle}
        selectedTtsMode={youtube.selectedTtsMode}
        downloadingClipId={youtube.downloadingClipId}
        generatingMetadataId={youtube.generatingMetadataId}
        narratingClipId={youtube.narratingClipId}
        subtitlingClipId={youtube.subtitlingClipId}
        onClose={youtube.onClose}
        onBurnSubtitles={youtube.onBurnSubtitles}
        onApplyNarration={youtube.onApplyNarration}
        onGenerateMetadata={youtube.onGenerateMetadata}
        onDownloadClip={youtube.onDownloadClip}
        onCopyText={youtube.onCopyText}
        onStyleChange={youtube.onStyleChange}
        onTtsModeChange={youtube.onTtsModeChange}
        onMessage={onMessage}
      />
    );
  }

  return null;
}
