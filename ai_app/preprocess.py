"""
로우데이터(CSV) 전처리.

was_diag.sh 가 만든 CSV를 읽어
  (1) AI에 넘길 항목 리스트
  (2) 대시보드에 띄울 표
로 가공한다.

CSV는 UTF-8 BOM(\xEF\xBB\xBF) + 큰따옴표 이스케이프 형식이며,
점검내용(F_RAW) 안의 여러 줄은 " | " 로 연결되어 있다.
"""
from __future__ import annotations

import io
from pathlib import Path

import pandas as pd

from . import config


def load_csv(source) -> pd.DataFrame:
    """CSV 경로 또는 파일 객체/바이트를 DataFrame으로 로드.

    Excel 한글깨짐 방지용 UTF-8 BOM을 자동 처리(utf-8-sig)한다.
    """
    if isinstance(source, (str, Path)):
        df = pd.read_csv(source, dtype=str, encoding="utf-8-sig", keep_default_na=False)
    else:
        data = source.read() if hasattr(source, "read") else source
        if isinstance(data, bytes):
            data = data.decode("utf-8-sig")
        df = pd.read_csv(io.StringIO(data), dtype=str, keep_default_na=False)

    df.columns = [c.strip() for c in df.columns]
    missing = [c for c in config.CSV_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"CSV에 필요한 컬럼이 없습니다: {missing}\n현재 컬럼: {list(df.columns)}"
        )
    return df


def restore_multiline(text: str) -> str:
    """CSV 저장 시 ' | '로 합쳐진 점검내용을 사람이 읽기 좋게 줄바꿈으로 복원."""
    return (text or "").replace(" | ", "\n")


def to_ai_items(df: pd.DataFrame) -> list[dict]:
    """각 행을 AI 입력용 dict로 변환.

    - 모든 항목을 LLM이 독립 재판정한다(N/A 포함). 점검내용(로우데이터)은 요약 없이 원문 전체를 넘긴다.
    - '_' 접두 필드는 파이썬 내부용(교차검증/표시) — LLM 프롬프트엔 절대 넣지 않는다.
    """
    items: list[dict] = []
    for _, row in df.iterrows():
        item = {col: row.get(col, "") for col in config.AI_INPUT_COLUMNS}
        item["점검내용"] = restore_multiline(item.get("점검내용", ""))
        item["_스크립트결과"] = row.get("결과", "")      # 교차검증용
        item["_분류"] = row.get("분류", "")
        item["_skip"] = row.get("결과", "").strip() == config.R_NA  # smoke_test 기본항목 선택용(판정엔 미사용)
        items.append(item)
    return items


def to_dashboard_df(df: pd.DataFrame, ai_results: dict[str, dict] | None = None) -> pd.DataFrame:
    """대시보드 표 생성. ai_results: {항목코드: {result, reason, ...}}"""
    ai_results = ai_results or {}
    rows = []
    # df 가 아직 없거나(미업로드) DataFrame 이 아니면 빈 표 반환 — iterrows 호출 전 방어.
    if df is None or not hasattr(df, "iterrows"):
        return pd.DataFrame(rows, columns=config.DASHBOARD_COLUMNS)
    for _, row in df.iterrows():
        code = row.get("항목코드", "")
        ai = ai_results.get(code, {})
        ai_result = ai.get("result", "")
        script_result = row.get("결과", "")
        if ai_result:
            match = "일치" if ai_result == script_result else "불일치"
        else:
            match = "미판정"
        rows.append({
            "항목코드": code,
            "분류": row.get("분류", ""),
            "항목": row.get("항목", ""),
            "중요도": row.get("중요도", ""),
            "스크립트결과": script_result,
            "AI결과": ai_result,
            "일치여부": match,
            "진단대상": row.get("진단대상", ""),
            "진단대상IP": row.get("진단대상IP", ""),
        })
    return pd.DataFrame(rows, columns=config.DASHBOARD_COLUMNS)
