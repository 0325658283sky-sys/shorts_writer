import {
  BLOG_CLIP_STATUS_LABELS,
  CLIP_STATUS_LABELS,
  VIDEO_STATUS_LABELS,
  friendlyProgressFromBlogStage,
  friendlyProgressFromVideoStatus,
} from "../constants";
import type { BlogClip, Clip, ProjectRecord, Video } from "../types";

export type ProjectSource = "blog" | "product" | "youtube" | "mp4";
export type ProjectBucket = "in_progress" | "done";
export type ProjectKind = "blog" | "video";

export type ProjectListItem = {
  key: string;
  projectId: number;
  kind: ProjectKind;
  source: ProjectSource;
  bucket: ProjectBucket;
  title: string;
  meta: string;
  statusLabel: string;
  progressLabel: string | null;
  updatedAt: string;
  shortsCount: number;
  blogClip?: BlogClip;
  video?: Video;
};

export const PROJECT_SOURCE_LABELS: Record<ProjectSource, string> = {
  blog: "블로그",
  product: "상품",
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
  projects: ProjectRecord[];
  blogClips: BlogClip[];
  videos: Video[];
  clips: Record<number, Clip>;
}): ProjectListItem[] {
  const { projects, blogClips, videos, clips } = args;
  const blogById = new Map(blogClips.map((item) => [item.id, item]));
  const videoById = new Map(videos.map((item) => [item.id, item]));
  const completedByVideo = new Map<number, number>();
  for (const clip of Object.values(clips)) {
    if (clip.status !== "completed") continue;
    completedByVideo.set(clip.video_id, (completedByVideo.get(clip.video_id) ?? 0) + 1);
  }

  const items: ProjectListItem[] = [];
  for (const project of projects) {
    if (project.source_type === "blog" && project.blog_clip_id != null) {
      const blogClip = blogById.get(project.blog_clip_id);
      const done = Boolean(blogClip && blogClip.status === "completed" && canDownloadBlog(blogClip));
      const friendly = blogClip ? friendlyProgressFromBlogStage(blogClip.progress_stage) : null;
      items.push({
        key: `project:${project.id}`,
        projectId: project.id,
        kind: "blog",
        source: project.source_kind === "product" ? "product" : "blog",
        bucket: done ? "done" : "in_progress",
        title: (blogClip?.blog_title || project.title || "제목 없는 쇼츠").trim(),
        meta: blogClip?.source_url || project.source_url || "",
        statusLabel: blogClip ? BLOG_CLIP_STATUS_LABELS[blogClip.status] : project.status || "작업 중",
        progressLabel: done ? null : friendly?.label ?? null,
        updatedAt: blogClip?.updated_at || project.updated_at,
        shortsCount: done ? 1 : 0,
        blogClip,
      });
      continue;
    }

    if (project.source_type === "video" && project.video_id != null) {
      const video = videoById.get(project.video_id);
      const localCount = video ? completedByVideo.get(video.id) ?? 0 : 0;
      const shortsCount = Math.max(project.shorts_count, localCount);
      const source = project.source_kind === "youtube" || project.source_kind === "mp4" ? project.source_kind : video ? videoSourceKind(video) : "mp4";
      const done = shortsCount > 0;
      const friendly = video ? friendlyProgressFromVideoStatus(video.status) : null;
      items.push({
        key: `project:${project.id}`,
        projectId: project.id,
        kind: "video",
        source,
        bucket: done ? "done" : "in_progress",
        title: video?.original_filename || project.title,
        meta: done ? `쇼츠 ${shortsCount}편` : VIDEO_STATUS_LABELS[video?.status ?? "uploaded"],
        statusLabel: done ? CLIP_STATUS_LABELS.completed : video ? VIDEO_STATUS_LABELS[video.status] : project.status || "작업 중",
        progressLabel: done ? null : friendly?.label ?? null,
        updatedAt: video?.updated_at || project.updated_at,
        shortsCount,
        video,
      });
    }
  }

  items.sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime();
    const tb = new Date(b.updatedAt).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  return items;
}
