"""
In-memory async background job queue for development.
For production, swap to Redis + RQ or Celery.
"""

import asyncio
import logging
from collections import deque
from typing import Callable, Any, Coroutine

logger = logging.getLogger(__name__)


class InMemoryQueue:
    """Simple FIFO async queue that processes jobs with a configurable concurrency limit."""

    def __init__(self, concurrency: int = 3):
        self._queue: deque = deque()
        self._semaphore = asyncio.Semaphore(concurrency)
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._worker_loop())
        logger.info("🚀 Job queue started (concurrency=%d)", self._semaphore._value)

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("🛑 Job queue stopped")

    def enqueue(self, coro_fn: Callable, *args, **kwargs):
        """Add a coroutine function + args to the queue."""
        self._queue.append((coro_fn, args, kwargs))
        logger.debug("📥 Job enqueued. Queue size: %d", len(self._queue))

    async def _worker_loop(self):
        while self._running:
            if self._queue:
                coro_fn, args, kwargs = self._queue.popleft()
                asyncio.create_task(self._run_job(coro_fn, *args, **kwargs))
            else:
                await asyncio.sleep(0.1)

    async def _run_job(self, coro_fn: Callable, *args, **kwargs):
        async with self._semaphore:
            try:
                await coro_fn(*args, **kwargs)
            except Exception as e:
                logger.error("❌ Job failed: %s", e, exc_info=True)


# Singleton queue used by all routers
job_queue = InMemoryQueue(concurrency=3)
