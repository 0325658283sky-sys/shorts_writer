import { useEffect, useMemo, useState } from "react";
import { authorizedRequest } from "../api/client";

type Template = {
  slug: string;
  name: string;
  genre: string;
  layout?: { ratio?: string; canvasBg?: string };
  title?: { color?: string; lines?: number };
  caption?: {
    color?: string;
    lines?: number;
    motion?: string;
    highlightColor?: string;
    background?: { enabled?: boolean; color?: string };
  };
};

type Option = { id: string; label: string };

/** 예: "팝 · 2줄 · 4:3" — 목업 카드의 둘째 줄. */
function metaLine(template: Template, motions: Option[]): string {
  const motion = motions.find((item) => item.id === template.caption?.motion)?.label ?? "";
  const lines = template.caption?.lines ? `${template.caption.lines}줄` : "";
  const ratio = template.layout?.ratio ?? "";
  return [motion, lines, ratio].filter(Boolean).join(" · ");
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [genres, setGenres] = useState<Option[]>([]);
  const [motions, setMotions] = useState<Option[]>([]);
  const [genre, setGenre] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      authorizedRequest<{ templates: Template[] }>("/video-templates"),
      authorizedRequest<{ motions: Option[]; genres: Option[] }>("/video-templates/motions"),
    ])
      .then(([list, meta]) => {
        if (cancelled) return;
        setTemplates(list.templates);
        setGenres(meta.genres.filter((item) => item.id !== "any"));
        setMotions(meta.motions);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "템플릿을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(
    () => (genre === "all" ? templates : templates.filter((item) => item.genre === genre)),
    [templates, genre],
  );

  return (
    <section className="tpl-page" aria-label="비디오 템플릿">
      <header className="tpl-head">
        <h1>비디오 템플릿</h1>
        <p>
          클립의 제목·자막·레이아웃을 묶어 둔 스타일이에요. 변환할 때 하나를 고르면 모든 클립에 같은 모양으로
          적용되고, 결과 화면에서 언제든 바꿀 수 있어요.
        </p>
      </header>

      <div className="tpl-section-head">
        <h2>
          기본 제공 템플릿 <span className="ncut-num tpl-count">{templates.length}</span>
        </h2>
      </div>

      <div className="tpl-chips" role="tablist" aria-label="장르">
        {[{ id: "all", label: "전체" }, ...genres].map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={genre === item.id}
            className={`tpl-chip${genre === item.id ? " is-active" : ""}`}
            onClick={() => setGenre(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <p className="muted">불러오는 중…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="tpl-grid">
        {shown.map((template) => {
          const captionBg = template.caption?.background?.enabled ? template.caption.background.color : "transparent";
          return (
            <div className="tpl-card" key={template.slug}>
              <div className="tpl-thumb" style={{ background: template.layout?.canvasBg ?? "#16181f" }}>
                <span className="tpl-thumb-title" style={{ color: template.title?.color ?? "#fff" }}>
                  제목이
                  <br />
                  여기 나와요
                </span>
                <span
                  className="tpl-thumb-caption"
                  style={{
                    color: template.caption?.color ?? "#fff",
                    background: captionBg,
                    padding: captionBg === "transparent" ? 0 : "1px 4px",
                  }}
                >
                  자막{" "}
                  <span style={{ color: template.caption?.highlightColor ?? "#f2a33c" }}>강조</span>
                </span>
              </div>
              <p className="tpl-name">{template.name}</p>
              <p className="tpl-meta">{metaLine(template, motions)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
