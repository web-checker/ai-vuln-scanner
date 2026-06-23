"""
최종 보고서(Excel) 생성.

검토 완료된 결과를 보고서 양식(REPORT_COLUMNS)으로 변환해 .xlsx 바이트를 반환한다.
보고서 컬럼: 항목코드, 분류, 항목, 판단기준, 결과, 판단근거, 진단대상, 진단대상IP, 중요도
"""
from __future__ import annotations

import io

import pandas as pd

from . import config
from .preprocess import restore_multiline


def build_csv_report(df: pd.DataFrame, decisions: dict[str, dict]) -> bytes:
    """[보고서 양식 함수] 원본 df + 확정 판정 → CSV 보고서 바이트(한 번에).

    순수 파이썬으로 양식(REPORT_COLUMNS)대로 조립한다. LLM 호출 없음 → 토큰 0.
    """
    return to_csv_bytes(build_report_df(df, decisions))


def build_xlsx_report(df: pd.DataFrame, decisions: dict[str, dict]) -> bytes:
    """[보고서 양식 함수] 원본 df + 확정 판정 → Excel(.xlsx) 바이트(한 번에). 토큰 0."""
    return to_excel_bytes(build_report_df(df, decisions))


def build_report_df(df: pd.DataFrame, decisions: dict[str, dict]) -> pd.DataFrame:
    """원본 CSV DataFrame + 확정된 판정(decisions)을 보고서 DataFrame으로 변환.

    decisions: {항목코드: {"result": ..., "reason": ...}}
      - result/reason 이 없으면 스크립트 결과/점검요약으로 폴백.
    """
    rows = []
    for _, row in df.iterrows():
        code = row.get("항목코드", "")
        dec = decisions.get(code, {})
        result = dec.get("result") or row.get("결과", "")
        reason = dec.get("reason") or restore_multiline(row.get("점검내용", ""))
        rows.append({
            "항목코드": code,
            "분류": row.get("분류", ""),
            "항목": row.get("항목", ""),
            "판단기준": row.get("판단기준", ""),
            "결과": result,
            "판단근거": reason,
            "진단대상": row.get("진단대상", ""),
            "진단대상IP": row.get("진단대상IP", ""),
            "중요도": row.get("중요도", ""),
        })
    return pd.DataFrame(rows, columns=config.REPORT_COLUMNS)


def to_csv_bytes(report_df: pd.DataFrame) -> bytes:
    """보고서 DataFrame을 CSV 바이트로 변환.

    Excel 한글깨짐 방지 UTF-8 BOM + 모든 필드 큰따옴표 인용(줄바꿈 포함 안전).
    """
    import csv

    csv_text = report_df.to_csv(index=False, quoting=csv.QUOTE_ALL, lineterminator="\n")
    return b"\xef\xbb\xbf" + csv_text.encode("utf-8")


def to_excel_bytes(report_df: pd.DataFrame, sheet_name: str = "진단결과") -> bytes:
    """보고서 DataFrame을 서식 적용된 .xlsx 바이트로 변환."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        report_df.to_excel(writer, index=False, sheet_name=sheet_name)
        _format_sheet(writer.sheets[sheet_name], report_df)
    buf.seek(0)
    return buf.getvalue()


def _format_sheet(ws, df: pd.DataFrame) -> None:
    """열 너비, 헤더 강조, 결과별 색상 등 기본 서식."""
    from openpyxl.styles import Alignment, Font, PatternFill

    header_fill = PatternFill("solid", fgColor="1F4E78")
    header_font = Font(bold=True, color="FFFFFF")
    pass_fill = PatternFill("solid", fgColor="E2EFDA")   # 연녹
    vuln_fill = PatternFill("solid", fgColor="FCE4E4")   # 연적
    na_fill = PatternFill("solid", fgColor="EDEDED")     # 회색

    widths = {
        "항목코드": 12, "분류": 14, "항목": 32, "판단기준": 55,
        "결과": 8, "판단근거": 60, "진단대상": 14, "진단대상IP": 16, "중요도": 8,
    }
    for idx, col in enumerate(df.columns, start=1):
        letter = ws.cell(row=1, column=idx).column_letter
        ws.column_dimensions[letter].width = widths.get(col, 16)
        cell = ws.cell(row=1, column=idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center", horizontal="center")

    result_col = list(df.columns).index("결과") + 1
    for r in range(2, len(df) + 2):
        for c in range(1, len(df.columns) + 1):
            ws.cell(row=r, column=c).alignment = Alignment(vertical="top", wrap_text=True)
        result = ws.cell(row=r, column=result_col).value
        fill = {config.R_PASS: pass_fill, config.R_VULN: vuln_fill, config.R_NA: na_fill}.get(result)
        if fill:
            ws.cell(row=r, column=result_col).fill = fill
    ws.freeze_panes = "A2"
