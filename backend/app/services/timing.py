"""구간별 걸린 시간을 로그로 남긴다 — 어디가 느린지 재기 위한 것. 동작은 바꾸지 않는다."""

import functools
import logging
import time

logger = logging.getLogger("newcut.timing")


def timed(label: str):
    def decorate(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            started = time.perf_counter()
            try:
                return fn(*args, **kwargs)
            finally:
                logger.warning("[timing] %s %.1fs", label, time.perf_counter() - started)

        return wrapper

    return decorate
