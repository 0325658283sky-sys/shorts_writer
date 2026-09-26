#!/bin/sh
# Remotion 렌더 서비스(127.0.0.1:3100)를 백그라운드로 띄운 뒤 FastAPI 를 포그라운드로 실행한다.
# 렌더 서비스가 죽어도 백엔드는 계속 떠서 FFmpeg 폴백으로 동작한다(blog_render_ffmpeg_fallback).
set -u

export REMOTION_SERVICE_HOST=127.0.0.1
export REMOTION_SERVICE_PORT=3100

(
  cd /app/remotion
  while true; do
    node server.mjs
    echo "[start-backend] remotion service exited ($?), restarting in 5s" >&2
    sleep 5
  done
) &

cd /app/backend
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}"
