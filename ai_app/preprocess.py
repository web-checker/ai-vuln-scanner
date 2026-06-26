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


# 한글 Windows에서 들어올 수 있는 CSV 인코딩(우선순위).
# was_diag.sh 는 utf-8-sig 를 내지만, 사용자가 Excel로 다시 저장하면 cp949(EUC-KR)가 흔하다.
_CSV_ENCODINGS = ("utf-8-sig", "cp949")


def _decode_csv(data: bytes) -> str:
    """CSV 바이트를 인코딩 폴백 체인으로 디코드. 한글이 깨지더라도 예외로 죽지 않게 한다."""
    for enc in _CSV_ENCODINGS:
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")  # 최후: 손실 허용(진단은 진행)


def load_csv(source) -> pd.DataFrame:
    """CSV 경로 또는 파일 객체/바이트를 DataFrame으로 로드.

    인코딩은 utf-8-sig(was_diag 기본) → cp949(Excel 재저장) 순으로 자동 폴백한다.
    """
    if isinstance(source, (str, Path)):
        data = Path(source).read_bytes()
    else:
        data = source.read() if hasattr(source, "read") else source
    text = _decode_csv(data) if isinstance(data, bytes) else data
    df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)

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
        item["_skip"] = row.get("결과", "").strip() == config.R_NA  # smoke_test 기본항목 선택용(판정엔 미사용)
        items.append(item)
    return items
