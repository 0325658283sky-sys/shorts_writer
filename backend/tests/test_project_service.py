from app.services.project_service import classify_project_source_kind, ensure_project_for_blog_clip, list_projects_for_user


def test_classify_product_vs_blog():
    assert classify_project_source_kind(source_type="blog", source_url="https://blog.naver.com/x", original_filename=None) == "blog"
    assert (
        classify_project_source_kind(
            source_type="blog",
            source_url="https://smartstore.naver.com/shop/products/123",
            original_filename=None,
        )
        == "product"
    )


def test_classify_youtube_vs_mp4():
    assert classify_project_source_kind(source_type="video", source_url=None, original_filename="YouTube - Title.mp4") == "youtube"
    assert classify_project_source_kind(source_type="video", source_url=None, original_filename="clip.mp4") == "mp4"


def test_ensure_project_for_blog_clip(conn, awaiting_boards_clip):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            blog_clip_id INTEGER UNIQUE,
            video_id INTEGER UNIQUE,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    first = ensure_project_for_blog_clip(conn, 1, awaiting_boards_clip, "테스트")
    second = ensure_project_for_blog_clip(conn, 1, awaiting_boards_clip, "테스트")
    assert first.id == second.id
    listed = list_projects_for_user(conn, 1)
    assert len(listed) == 1
    assert listed[0].blog_clip_id == awaiting_boards_clip
