"""
판정 진입점 — claude_agent_sdk(로컬 claude CLI + 구독) 단일 경로.

server/main.py(FastAPI) / smoke_test.py 는 이 모듈의 judge_item(item) / ready() 만 호출한다.
"""
from __future__ import annotations

from pathlib import Path

from . import agent_sdk, config


def ready() -> tuple[bool, str]:
    """판정 가능 상태인지 점검. (가능여부, 안내문)"""
    cli = config.CLAUDE_CLI_PATH
    ok = cli == "claude" or Path(cli).exists()
    return ok, (f"claude CLI = {cli}" if ok else f"claude CLI 없음: {cli}")


def judge_item(item: dict) -> dict:
    return agent_sdk.judge_item(item)
