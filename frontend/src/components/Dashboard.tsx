import { useState, type FormEvent } from "react";
import type { StudioTab } from "../lib/appRoute";
import type {
  BlogClip,
  Clip,
  ClipMetadata,
  Highlight,
  NarrationLanguage,
  ScriptModel,
  SubtitleStyle,
  TargetLength,
  Transcript,
  TtsMode,
  Usage,
  Video,
  VisualStyleSlug,
} from "../types";
import { CreateStudio, type CreateSource } from "./CreateStudio";
import { MembershipPage } from "./MembershipPage";
import { ProjectsPage } from "./ProjectsPage";
import { YoutubeConfirmStep, type YoutubePreview } from "./YoutubeConfirmStep";

export function Dashboard({
  usage,
  uploadMessage,
  selectedFile,
  isUploading,
  youtubeUrl,
  isImportingYoutube,
  blogUrl,
  blogSubtitleStyle,
  blogTargetLength,
  blogNarrationLanguage,
  blogScriptModel,
  isCreatingBlogShort,
  blogClips,
  copiedKey,
  videos,
  transcripts,
  highlights,
  clips,
  clipMetadata,
  creatingClipId,
  downloadingClipId,
  generatingMetadataId,
  narratingClipId,
  subtitleStyles,
  ttsModes,
  subtitlingClipId,
  analyzingId,
  transcribingId,
  highlightingId,
  onUpload,
  onSelectedFileChange,
  onPreviewYoutube,
  onConfirmYoutubeImport,
  onCancelYoutubePreview,
  onYoutubeUrlChange,
  onToastMessage,
  youtubePreview,
  isPreviewingYoutube,
  onCreateBlogShort,
  onBlogUrlChange,
  onBlogSubtitleStyleChange,
  onBlogTargetLengthChange,
  onBlogNarrationLanguageChange,
  onBlogScriptModelChange,
  onCopyText,
  onOpenBlogClip,
  onDownloadBlogClip,
  onResumeVideo,
  onResumeClip,
  downloadingBlogClipId,
  onAnalyze,
  onTranscript,
  onHighlights,
  onRefreshStatus,
  onApplyNarration,
  onBurnSubtitles,
  onCreateClip,
  onDownloadClip,
  onGenerateMetadata,
  onStyleChange,
  onTtsModeChange,
  studioNav,
  onStudioNavChange,
  projectsTabRequest,
  focusVideoId,
  onProjectsTabRequestConsumed,
}: {
  usage: Usage | null;
  uploadMessage: string;
  selectedFile: File | null;
  isUploading: boolean;
  youtubeUrl: string;
  isImportingYoutube: boolean;
  isPreviewingYoutube: boolean;
  youtubePreview: YoutubePreview | null;
  blogUrl: string;
  blogSubtitleStyle: SubtitleStyle;
  blogTargetLength: TargetLength;
  blogNarrationLanguage: NarrationLanguage;
  blogScriptModel: ScriptModel;
  isCreatingBlogShort: boolean;
  blogClips: BlogClip[];
  copiedKey: string | null;
  videos: Video[];
  transcripts: Record<number, Transcript>;
  highlights: Record<number, Highlight[]>;
  clips: Record<number, Clip>;
  clipMetadata: Record<number, ClipMetadata>;
  creatingClipId: number | null;
  downloadingClipId: number | null;
  generatingMetadataId: number | null;
  narratingClipId: number | null;
  subtitleStyles: Record<number, SubtitleStyle>;
  ttsModes: Record<number, TtsMode>;
  subtitlingClipId: number | null;
  analyzingId: number | null;
  transcribingId: number | null;
  highlightingId: number | null;
  onUpload: (event: FormEvent<HTMLFormElement>) => void;
  onSelectedFileChange: (file: File | null) => void;
  onPreviewYoutube: (event: FormEvent<HTMLFormElement>) => void;
  onConfirmYoutubeImport: (visualStyle: VisualStyleSlug | string) => void;
  onCancelYoutubePreview: () => void;
  onYoutubeUrlChange: (value: string) => void;
  onToastMessage: (message: string) => void;
  onCreateBlogShort: (event: FormEvent<HTMLFormElement>) => void;
  onBlogUrlChange: (value: string) => void;
  onBlogSubtitleStyleChange: (value: SubtitleStyle) => void;
  onBlogTargetLengthChange: (value: TargetLength) => void;
  onBlogNarrationLanguageChange: (value: NarrationLanguage) => void;
  onBlogScriptModelChange: (value: ScriptModel) => void;
  onCopyText: (key: string, text: string) => void;
  onOpenBlogClip: (blogClip: BlogClip) => void;
  onDownloadBlogClip: (blogClip: BlogClip) => void;
  onResumeVideo: (video: Video) => void;
  onResumeClip: (clip: Clip) => void;
  downloadingBlogClipId: number | null;
  onAnalyze: (videoId: number) => void;
  onTranscript: (videoId: number) => void;
  onHighlights: (videoId: number) => void;
  onRefreshStatus: (videoId: number) => void;
  onApplyNarration: (clip: Clip) => void;
  onBurnSubtitles: (clip: Clip) => void;
  onCreateClip: (highlightId: number) => void;
  onDownloadClip: (clip: Clip) => void;
  onGenerateMetadata: (clip: Clip) => void;
  onStyleChange: (clipId: number, style: SubtitleStyle) => void;
  onTtsModeChange: (clipId: number, mode: TtsMode) => void;
  studioNav: StudioTab;
  onStudioNavChange: (tab: StudioTab) => void;
  projectsTabRequest?: "in_progress" | "done" | "advanced" | null;
  focusVideoId?: number | null;
  onProjectsTabRequestConsumed?: () => void;
}) {
  const [source, setSource] = useState<CreateSource>("blog");

  return (
    <div className="studio-main">
      {studioNav === "create" ? (
          <>
            {youtubePreview ? (
              <YoutubeConfirmStep
                preview={youtubePreview}
                importing={isImportingYoutube}
                onCancel={onCancelYoutubePreview}
                onConfirm={onConfirmYoutubeImport}
                onMessage={onToastMessage}
              />
            ) : (
              <CreateStudio
                source={source}
                onSourceChange={setSource}
                blogUrl={blogUrl}
                blogSubtitleStyle={blogSubtitleStyle}
                blogTargetLength={blogTargetLength}
                blogNarrationLanguage={blogNarrationLanguage}
                blogScriptModel={blogScriptModel}
                isCreatingBlogShort={isCreatingBlogShort}
                youtubeUrl={youtubeUrl}
                isImportingYoutube={isImportingYoutube}
                isPreviewingYoutube={isPreviewingYoutube}
                selectedFile={selectedFile}
                isUploading={isUploading}
                onBlogUrlChange={onBlogUrlChange}
                onBlogSubtitleStyleChange={onBlogSubtitleStyleChange}
                onBlogTargetLengthChange={onBlogTargetLengthChange}
                onBlogNarrationLanguageChange={onBlogNarrationLanguageChange}
                onBlogScriptModelChange={onBlogScriptModelChange}
                onCreateBlogShort={onCreateBlogShort}
                onYoutubeUrlChange={onYoutubeUrlChange}
                onPreviewYoutube={onPreviewYoutube}
                onSelectedFileChange={onSelectedFileChange}
                onUpload={onUpload}
              />
            )}
            {uploadMessage ? (
              <p className="studio-toast" role="status">
                {uploadMessage}
              </p>
            ) : null}
          </>
        ) : null}
        {studioNav === "projects" ? (
          <>
            {uploadMessage ? (
              <p className="studio-toast" role="status">
                {uploadMessage}
              </p>
            ) : null}
            <ProjectsPage
              blogClips={blogClips}
              videos={videos}
              transcripts={transcripts}
              highlights={highlights}
              clips={clips}
              clipMetadata={clipMetadata}
              copiedKey={copiedKey}
              creatingClipId={creatingClipId}
              downloadingClipId={downloadingClipId}
              downloadingBlogClipId={downloadingBlogClipId}
              generatingMetadataId={generatingMetadataId}
              narratingClipId={narratingClipId}
              subtitleStyles={subtitleStyles}
              ttsModes={ttsModes}
              subtitlingClipId={subtitlingClipId}
              analyzingId={analyzingId}
              transcribingId={transcribingId}
              highlightingId={highlightingId}
              onResumeBlogClip={onOpenBlogClip}
              onDownloadBlogClip={onDownloadBlogClip}
              onResumeVideo={onResumeVideo}
              onResumeClip={onResumeClip}
              onCreateNew={() => onStudioNavChange("create")}
              onAnalyze={onAnalyze}
              onTranscript={onTranscript}
              onHighlights={onHighlights}
              onRefreshStatus={onRefreshStatus}
              onApplyNarration={onApplyNarration}
              onBurnSubtitles={onBurnSubtitles}
              onCreateClip={onCreateClip}
              onCopyText={onCopyText}
              onDownloadClip={onDownloadClip}
              onGenerateMetadata={onGenerateMetadata}
              onStyleChange={onStyleChange}
              onTtsModeChange={onTtsModeChange}
              projectsTabRequest={projectsTabRequest}
              focusVideoId={focusVideoId}
              onProjectsTabRequestConsumed={onProjectsTabRequestConsumed}
            />
          </>
        ) : null}
        {studioNav === "usage" ? <MembershipPage usage={usage} /> : null}
    </div>
  );
}
