import type { ReactNode } from "react";

/**
 * Shared download / metadata / re-edit actions for completed Flow results.
 * Keeps Blog and YouTube finish surfaces consistent without merging editors.
 */
export function ResultActionsCard({
  kicker = "결과",
  title,
  lead,
  canDownload,
  downloading,
  onDownload,
  hasMetadata,
  generatingMetadata,
  onGenerateMetadata,
  metadataSlot,
  reEditLabel = "다시 편집",
  onReEdit,
  secondary,
}: {
  kicker?: string;
  title: string;
  lead?: string;
  canDownload: boolean;
  downloading: boolean;
  onDownload: () => void;
  hasMetadata?: boolean;
  generatingMetadata?: boolean;
  onGenerateMetadata?: () => void;
  metadataSlot?: ReactNode;
  reEditLabel?: string;
  onReEdit?: () => void;
  secondary?: ReactNode;
}) {
  return (
    <section className="result-actions-card" aria-label="결과 액션">
      <p className="create-kicker">{kicker}</p>
      <h2 className="result-actions-title">{title}</h2>
      {lead ? <p className="flow-lead result-actions-lead">{lead}</p> : null}
      <div className="result-actions-row">
        <button className="cta-button" type="button" disabled={!canDownload || downloading} onClick={onDownload}>
          {downloading ? "다운로드 중…" : "다운로드"}
        </button>
        {onGenerateMetadata ? (
          <button
            className="small-button metadata-button"
            type="button"
            disabled={generatingMetadata || hasMetadata}
            onClick={onGenerateMetadata}
          >
            {generatingMetadata ? "작성 중…" : hasMetadata ? "메타데이터 준비됨" : "메타데이터 생성"}
          </button>
        ) : null}
        {onReEdit ? (
          <button className="ghost-button" type="button" onClick={onReEdit}>
            {reEditLabel}
          </button>
        ) : null}
      </div>
      {metadataSlot}
      {secondary ? <div className="result-actions-secondary">{secondary}</div> : null}
    </section>
  );
}
