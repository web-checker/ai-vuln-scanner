"""
비동기 코루틴을 동기 코드에서 안전하게 실행하는 유틸.

FastAPI 동기 엔드포인트는 uvicorn의 워커 스레드(비-메인)에서 실행되고, 그 스레드에는
실행 중인 이벤트 루프가 없을 수도/있을 수도 있다. 어느 경우든 충돌 없이
claude_agent_sdk 의 서브프로세스 호출이 돌도록, 전용 스레드 + 새 이벤트 루프에서
코루틴을 실행한다. (Windows에서도 검증됨)
"""
from __future__ import annotations

import asyncio
import sys
import threading
from typing import Any, Awaitable, Callable


def _new_loop() -> asyncio.AbstractEventLoop:
    """서브프로세스 실행 가능한 이벤트 루프 생성.

    Windows에서 실행 환경이 SelectorEventLoop 정책을 걸어두면 서브프로세스
    (claude.exe) 실행이 'Failed to start Claude Code'로 실패한다. 정책과 무관하게
    ProactorEventLoop(서브프로세스 지원)를 직접 만든다.
    """
    if sys.platform == "win32":
        return asyncio.ProactorEventLoop()
    return asyncio.new_event_loop()


# 타임아웃 후 task 취소가 코루틴(claude.exe 서브프로세스)을 정리할 때까지 기다리는 유예(초).
# 이 시간 안에 정리되면 좀비 프로세스/스레드가 남지 않는다.
_CLEANUP_GRACE_SEC = 10.0


def run(async_func: Callable[..., Awaitable[Any]], *args: Any,
        timeout: float | None = None) -> Any:
    """async 함수를 전용 스레드의 새 이벤트 루프에서 실행하고 결과를 반환.

    timeout(초)을 주면 그 시간 안에 끝나지 않을 때 TimeoutError 를 던진다.
    이때 실행 중인 task 를 스레드 안전하게 취소해 코루틴의 정리(async with/async for
    __aexit__)를 트리거 → claude.exe 서브프로세스와 이벤트 루프가 종료되어 좀비가 남지 않는다.
    None 이면 무한 대기(기존 동작).
    """
    box: dict[str, Any] = {}
    handle: dict[str, Any] = {}        # {"loop": ..., "task": ...} — 취소용 핸들
    started = threading.Event()

    def _worker() -> None:
        loop = _new_loop()
        asyncio.set_event_loop(loop)
        task = loop.create_task(async_func(*args))
        handle["loop"], handle["task"] = loop, task
        started.set()
        try:
            box["value"] = loop.run_until_complete(task)
        except BaseException as exc:  # noqa: BLE001  (CancelledError 포함)
            box["error"] = exc
        finally:
            try:
                loop.run_until_complete(loop.shutdown_asyncgens())
            except BaseException:  # noqa: BLE001
                pass
            loop.close()

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        # 타임아웃 → 실행 중인 task 를 그 루프 안에서 취소해 서브프로세스를 정리시킨다.
        started.wait(1)
        loop, task = handle.get("loop"), handle.get("task")
        if loop is not None and task is not None and not loop.is_closed():
            loop.call_soon_threadsafe(task.cancel)
            t.join(_CLEANUP_GRACE_SEC)   # 취소 전파 + 서브프로세스 종료 대기
        raise TimeoutError(f"비동기 작업이 제한시간({timeout}s) 내에 끝나지 않았습니다.")
    if "error" in box:
        raise box["error"]
    return box.get("value")
