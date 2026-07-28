import {
  BLOG_CLIP_STATUS_LABELS,
  CLIP_STATUS_LABELS,
  VIDEO_STATUS_LABELS,
  friendlyProgressFromBlogStage,
  friendlyProgressFromVideoStatus,
} from "../constants";
import type { BlogClip, Clip, Video } from "../types";

export type ProjectSource = "blog" | "youtube" | "mp4";
export type ProjectBucket = "in_progress" | "done";
export type ProjectKind = "blog" | "video" | "clip";

export type ProjectListItem = {
  key: string;
  kind: ProjectKind;
  source: ProjectSource;
  bucket: ProjectBucket;
  title: string;
  meta: string;
  statusLabel: string;
  progressLabel: string | null;
  updatedAt: string;
  blogClip?: BlogClip;
  video?: Video;
  clip?: Clip;
};

export const PROJECT_SOURCE_LABELS: Record<ProjectSource, string> = {
  blog: "블로그",
  youtube: "유튜브",
  mp4: "MP4",
};

export function videoSourceKind(video: Video): "youtube" | "mp4" {
  return video.original_filename.startsWith("YouTube - ") ? "youtube" : "mp4";
}

function canDownloadBlog(blogClip: BlogClip): boolean {
  return Boolean(blogClip.subtitled_video_path || blogClip.video_path);
}

export function buildProjectListItems(args: {
  blogClips: BlogClip[];
  videos: Video[];
  clips: Record<number, Clip>;
}): ProjectListItem[] {
  const { blogClips, videos, clips } = args;
  const clipList = Object.values(clips);
  const completedByVideo = new Map<number, Clip[]>();
  for (const clip of clipList) {
    if (clip.status !== "completed") continue;
    const list = completedByVideo.get(clip.video_id) ?? [];
    list.push(clip);
    completedByVideo.set(clip.video_id, list);
  }

  const items: ProjectListItem[] = [];

  for (const blogClip of blogClips) {
    const done = blogClip.status === "completed" && canDownloadBlog(blogClip);
    const friendly = friendlyProgressFromBlogStage(blogClip.progress_stage);
    items.push({
      key: `blog:${blogClip.id}`,
      kind: "blog",
      source: "blog",
      bucket: done ? "done" : "in_progress",
      title: blogClip.blog_title?.trim() || "제목 없는 쇼츠",
      meta: blogClip.source_url,
      statusLabel: BLOG_CLIP_STATUS_LABELS[blogClip.status],
      progressLabel: done ? null : friendly.label,
      updatedAt: blogClip.updated_at || blogClip.created_at,
      blogClip,
    });
  }

  for (const video of videos) {
    const doneClips = completedByVideo.get(video.id) ?? [];
    if (doneClips.length > 0) continue;
    const source = videoSourceKind(video);
    const friendly = friendlyProgressFromVideoStatus(video.status);
    items.push({
      key: `video:${video.id}`,
      kind: "video",
      source,
      bucket: "in_progress",
      title: video.original_filename,
      meta: VIDEO_STATUS_LABELS[video.status],
      statusLabel: VIDEO_STATUS_LABELS[video.status],
      progressLabel: friendly.label,
      updatedAt: video.updated_at || video.created_at,
      video,
    });
  }

  const videoById = new Map(videos.map((item) => [item.id, item]));
  for (const clip of clipList) {
    if (clip.status !== "completed") continue;
    const video = videoById.get(clip.video_id);
    const source = video ? videoSourceKind(video) : "mp4";
    items.push({
      key: `clip:${clip.id}`,
      kind: "clip",
      source,
      bucket: "done",
      title: video?.original_filename ?? `클립 #${clip.id}`,
      meta: `클립 #${clip.id} · ${CLIP_STATUS_LABELS[clip.status]}`,
      statusLabel: CLIP_STATUS_LABELS[clip.status],
      progressLabel: null,
      updatedAt: clip.updated_at || clip.created_at,
      clip,
      video,
    });
  }

  items.sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime();
    const tb = new Date(b.updatedAt).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  return items;
}
