# Preview · Render Stability Checklist

Manual smoke checks for board-editor continuity and WYSIWYG render. AlphaCut hub UI is out of scope; reuse `CompletedShortPlayer` / preview session rules when the hub lands.

## PreviewSession (board editor)

Remount Player only when:

- `blogClip.id` changes
- image identity (`boardId:image_path`) changes
- intentional `previewRevision++` (overlay apply, manual TTS/BGM regenerate)

Do **not** remount for `loadBoards()`, duration soft-patch, board selection (seek only), draft typing, or auto preview-audio success.

### Continuous playback

1. Open a clip with ≥7 boards including at least one GIF.
2. Enter board editor; wait until TTS/BGM overlay clears (Player stays mounted).
3. Press play and leave it alone through the last board.
4. **Pass:** no auto-reset / blank flash around scene 2; playback reaches the end.

### Pause freezes GIF

1. Play until a GIF board is visible.
2. Pause the Remotion Player.
3. **Pass:** GIF frame stays frozen (no background animation).

### Duration soft-patch

1. With preview playing, trigger auto TTS once (or wait for first auto mix).
2. Confirm durations update on the timeline without Player remount (no full reload flash).
3. **Pass:** audio continues; boards are not fully re-fetched solely for duration.

## Completed short (hub primitive)

1. Finish a render until status is `completed`.
2. On the project card, use the inline `CompletedShortPlayer` (no download required).
3. **Pass:** MP4 plays with controls via `/blog-clips/{id}/stream` (or version stream).

## Render WYSIWYG

1. In the editor, set style overlay / fonts / BGM / GIF boards.
2. Click **지금 렌더링** (must flush overlay first).
3. When complete:
   - Remotion path: output matches preview (style, fonts, GIF motion, BGM).
   - Fallback: yellow warning + open render-spec footer (`fallback_used`).

## GIF / selection regression (automated)

```bash
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_preview_render_stability.py tests/test_remotion_props_service.py -q

cd ..\remotion
node scripts/assert-gif-media-fit.mjs

cd ..\frontend
node scripts/assert-preview-session.mjs
```

Covers: `animated` flag, letterbox `mediaFit: cover`, image selection ≤ `blog_image_max_count`, AnimatedImage band sizing, Player overlay / audio cache key rules.
