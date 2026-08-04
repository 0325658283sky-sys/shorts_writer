/** Inbound links from Ditodio / blog_writer. Query params + optional hash. */

export type InboundDeeplink = {
  from: string | null;
  brandId: string | null;
  postId: string | null;
  url: string | null;
  source: "blog" | "youtube" | "upload" | null;
  /** Short-lived Ditodio hub SSO token */
  handoff: string | null;
};

export function readInboundDeeplink(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): InboundDeeplink {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const sourceRaw = (params.get("source") || "").trim().toLowerCase();
  const source =
    sourceRaw === "blog" || sourceRaw === "youtube" || sourceRaw === "upload" ? sourceRaw : null;

  const url = (params.get("url") || params.get("source_url") || "").trim();

  return {
    from: (params.get("from") || "").trim() || null,
    brandId: (params.get("brandId") || "").trim() || null,
    postId: (params.get("postId") || "").trim() || null,
    url: url || null,
    source,
    handoff: (params.get("handoff") || "").trim() || null,
  };
}

/** Strip handoff from the address bar after consuming it. */
export function clearHandoffFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("handoff")) return;
  url.searchParams.delete("handoff");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
}
