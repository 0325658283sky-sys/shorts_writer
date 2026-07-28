/** Lightweight hash routes so refresh/back keep studio tabs, Shorts, and video clip flows. */

export type StudioTab = "create" | "projects" | "usage";

/** Blog shorts use `flow`/`edit`. YouTube/MP4 guided flow uses `videoFlow`/`clipEdit`. */
export type AppRoute =
  | { kind: "studio"; tab: StudioTab }
  | { kind: "flow"; clipId: number }
  | { kind: "edit"; clipId: number }
  | { kind: "videoFlow"; videoId: number }
  | { kind: "clipEdit"; clipId: number };

const STUDIO_TABS: StudioTab[] = ["create", "projects", "usage"];

export function isStudioTab(value: string | null | undefined): value is StudioTab {
  return value != null && (STUDIO_TABS as string[]).includes(value);
}

export function parseAppRoute(hash: string = typeof window !== "undefined" ? window.location.hash : ""): AppRoute {
  const raw = hash.replace(/^#\/?/, "").trim();
  const parts = raw.split("/").filter(Boolean);

  // Blog shorts (existing — do not change shape)
  if (parts[0] === "shorts" && parts[1] && /^\d+$/.test(parts[1])) {
    const clipId = Number(parts[1]);
    if (parts[2] === "edit") return { kind: "edit", clipId };
    return { kind: "flow", clipId };
  }
  if (parts[0] === "edit" && parts[1] && /^\d+$/.test(parts[1])) {
    return { kind: "edit", clipId: Number(parts[1]) };
  }

  // YouTube / MP4 guided video flow
  if (parts[0] === "videos" && parts[1] && /^\d+$/.test(parts[1])) {
    return { kind: "videoFlow", videoId: Number(parts[1]) };
  }

  // Clip detailed editor (YouTube/MP4)
  if (parts[0] === "clips" && parts[1] && /^\d+$/.test(parts[1]) && parts[2] === "edit") {
    return { kind: "clipEdit", clipId: Number(parts[1]) };
  }

  if (parts[0] === "studio") {
    const tab = isStudioTab(parts[1]) ? parts[1] : "create";
    return { kind: "studio", tab };
  }
  if (isStudioTab(parts[0])) {
    return { kind: "studio", tab: parts[0] };
  }
  return { kind: "studio", tab: "create" };
}

export function formatAppRoute(route: AppRoute): string {
  if (route.kind === "edit") return `#/shorts/${route.clipId}/edit`;
  if (route.kind === "flow") return `#/shorts/${route.clipId}`;
  if (route.kind === "videoFlow") return `#/videos/${route.videoId}`;
  if (route.kind === "clipEdit") return `#/clips/${route.clipId}/edit`;
  const tab = route.tab === "create" ? "create" : route.tab;
  return `#/studio/${tab}`;
}

export function writeAppRoute(route: AppRoute, mode: "replace" | "push" = "replace"): void {
  const next = formatAppRoute(route);
  if (typeof window === "undefined") return;
  if (window.location.hash === next) return;
  if (mode === "push") {
    window.history.pushState(null, "", next);
  } else {
    window.history.replaceState(null, "", next);
  }
}

export function routeFromScreenState(args: {
  editingYoutubeClipId?: number | null;
  editingBlogClipId: number | null;
  focusYoutubeVideoId?: number | null;
  focusBlogClipId: number | null;
  studioTab?: StudioTab;
}): AppRoute {
  const {
    editingYoutubeClipId = null,
    editingBlogClipId,
    focusYoutubeVideoId = null,
    focusBlogClipId,
    studioTab = "create",
  } = args;
  // Match App.tsx overlay priority: Youtube editor → Blog editor → Youtube flow → Blog flow
  if (editingYoutubeClipId != null) return { kind: "clipEdit", clipId: editingYoutubeClipId };
  if (editingBlogClipId != null) return { kind: "edit", clipId: editingBlogClipId };
  if (focusYoutubeVideoId != null) return { kind: "videoFlow", videoId: focusYoutubeVideoId };
  if (focusBlogClipId != null) return { kind: "flow", clipId: focusBlogClipId };
  return { kind: "studio", tab: studioTab };
}
