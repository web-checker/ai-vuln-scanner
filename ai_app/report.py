"""
최종 보고서 생성 (CSV / Excel).

Excel(.xlsx) 은 외부 양식을 그대로 따른 5개 시트로 구성한다:
  0. 표지            - 문서 메타정보 + 제목(기본값, 엑셀에서 수정 가능)
  1. 진단 대상       - 서버(Hostname/IP/버전/용도) 목록
  2-1. 요약결과(그래프) - 도메인 평균점수 / 양호·취약·N/A / 영역별 취약수 (+ 차트)
  2-2. 요약 진단결과 - 항목별 결과표 + 영역별 점수 + 보안 적용율
  3-1. 진단 결과     - 항목별 상세(진단기준/결과/비고)

점수 규칙: 영역점수 = 양호 / (양호 + 취약)  (N/A 제외). 보안 적용율도 동일.
모두 순수 파이썬(LLM 호출 없음) → 토큰 0.
"""
from __future__ import annotations

import io
from datetime import date

import pandas as pd

from . import config
from .preprocess import restore_multiline

# ── 표지/메타 기본값 (CSV에 없는 값 — 엑셀에서 직접 수정 가능) ──
REPORT_META = {
    "문서번호": "CHECKBANG-VA-2026-001",
    "작성자": "취약점진단팀",
    "보안등급": "Confidential",
    "Ver": "ver 1.0",
    "제목": '"Check방" 취약점 진단',
    "부제": "서버 취약점 진단 상세결과",
}
# 진단대상 시트에서 CSV에 없는 칸의 기본값
TARGET_DEFAULTS = {"버전정보": "-", "용도": "서버", "비고": "-"}


# ════════════════════════════════════════════════════════════════
#  CSV 보고서 (기존)
# ════════════════════════════════════════════════════════════════
def build_csv_report(df: pd.DataFrame, decisions: dict[str, dict]) -> bytes:
    """원본 df + 확정 판정 → CSV 보고서 바이트."""
    return to_csv_bytes(build_report_df(df, decisions))


def build_report_df(df: pd.DataFrame, decisions: dict[str, dict]) -> pd.DataFrame:
    """원본 CSV DataFrame + 확정 판정(decisions)을 보고서 DataFrame으로 변환."""
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
    """보고서 DataFrame → CSV 바이트(UTF-8 BOM, 전체 인용)."""
    import csv

    csv_text = report_df.to_csv(index=False, quoting=csv.QUOTE_ALL, lineterminator="\n")
    return b"\xef\xbb\xbf" + csv_text.encode("utf-8")


# ════════════════════════════════════════════════════════════════
#  Excel 보고서 (5시트 양식)
# ════════════════════════════════════════════════════════════════
SUMMARY_SHEET = "2-2. 요약 진단결과"   # 수식 참조용 시트 이름


def build_xlsx_report(df: pd.DataFrame, decisions: dict[str, dict]) -> bytes:
    """원본 df + 확정 판정 → 5시트 .xlsx 바이트(수식 자동계산 포함)."""
    rdf = build_report_df(df, decisions)
    wb = _build_workbook(rdf)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def build_compare_csv(compare_df: pd.DataFrame) -> bytes:
    """비교 결과 DataFrame(COMPARE_COLUMNS)을 CSV 바이트로(UTF-8 BOM + 전체 인용)."""
    return to_csv_bytes(compare_df)


def _format_sheet(ws, df: pd.DataFrame) -> None:
    """열 너비, 헤더 강조, 결과별 색상 등 기본 서식."""
    from openpyxl.styles import Alignment, Font, PatternFill
# ── 데이터 가공 헬퍼 ────────────────────────────────────────────
def _grouped(rdf: pd.DataFrame):
    """[(분류, [row, ...]), ...] — 등장 순서 유지."""
    groups: dict[str, list] = {}
    order: list[str] = []
    for _, r in rdf.iterrows():
        d = (str(r.get("분류") or "").strip()) or "기타"
        if d not in groups:
            groups[d] = []
            order.append(d)
        groups[d].append(r)
    return [(d, groups[d]) for d in order]


def _counts(rdf: pd.DataFrame) -> dict:
    res = [str(x) for x in rdf["결과"]]
    p = res.count(config.R_PASS)
    v = res.count(config.R_VULN)
    n = res.count(config.R_NA)
    return {"pass": p, "vuln": v, "na": n, "total": len(res),
            "applied": (p / (p + v) if (p + v) else 0)}


def _targets(rdf: pd.DataFrame) -> list[dict]:
    seen, out = [], []
    for _, r in rdf.iterrows():
        key = (str(r.get("진단대상", "") or ""), str(r.get("진단대상IP", "") or ""))
        if (key[0] or key[1]) and key not in seen:
            seen.append(key)
            out.append({"hostname": key[0] or "-", "ip": key[1] or "-"})
    return out or [{"hostname": "-", "ip": "-"}]


def _ranges(groups, data_start=6):
    """각 분류의 데이터 행 범위 [(분류, rows, r1, r2), ...] 계산."""
    out, r = [], data_start
    for d, rows in groups:
        out.append((d, rows, r, r + len(rows) - 1))
        r += len(rows)
    return out, data_start, r - 1, r   # ranges, start, end, footer_row


def _crit_lines(text) -> str:
    """판단기준의 '|' 를 줄바꿈으로 (빈 줄 없이)."""
    parts = [p.strip() for p in str(text or "").split("|")]
    return "\n".join(p for p in parts if p)


# ── 서식 상수/헬퍼 ──────────────────────────────────────────────
def _styles():
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    thin = Side(style="thin", color="BFBFBF")
    return {
        "hdr_fill": PatternFill("solid", fgColor="1F4E78"),
        "hdr_font": Font(bold=True, color="FFFFFF"),
        "pass": PatternFill("solid", fgColor="E2EFDA"),
        "vuln": PatternFill("solid", fgColor="FCE4E4"),
        "na": PatternFill("solid", fgColor="EDEDED"),
        "border": Border(left=thin, right=thin, top=thin, bottom=thin),
        "center": Alignment(horizontal="center", vertical="center", wrap_text=True),
        "left": Alignment(horizontal="left", vertical="center", wrap_text=True),
        "leftc": Alignment(horizontal="left", vertical="center", wrap_text=True),
        "topleft": Alignment(horizontal="left", vertical="top", wrap_text=True),
        "Font": Font, "Alignment": Alignment,
    }


def _auto_width(ws, bounds=(5, 55), per_col=None):
    """열별 내용 길이에 맞춰 너비 자동 설정(병합·수식 셀 제외, 한글 2배)."""
    per_col = per_col or {}
    merged = set()
    for mr in ws.merged_cells.ranges:
        for r in range(mr.min_row, mr.max_row + 1):
            for c in range(mr.min_col, mr.max_col + 1):
                merged.add((r, c))
    measured: dict[str, int] = {}
    for row in ws.iter_rows():
        for cell in row:
            if cell.value is None or (cell.row, cell.column) in merged:
                continue
            s = str(cell.value)
            if s.startswith("="):
                s = "000.0%"   # 수식 → 숫자 표시폭으로 가정
            ln = max((sum(2 if ord(ch) > 0x1100 else 1 for ch in line)
                      for line in s.split("\n")), default=0)
            col = cell.column_letter
            measured[col] = max(measured.get(col, 0), ln)
    for col, w in measured.items():
        lo, hi = per_col.get(col, bounds)
        ws.column_dimensions[col].width = min(max(w + 2, lo), hi)


def _result_fill(S, v):
    return {config.R_PASS: S["pass"], config.R_VULN: S["vuln"], config.R_NA: S["na"]}.get(str(v))


def _box(ws, S, r1, c1, r2, c2, align=None):
    """범위에 테두리 + 정렬 적용."""
    align = align or S["topleft"]
    for r in range(r1, r2 + 1):
        for c in range(c1, c2 + 1):
            cell = ws.cell(row=r, column=c)
            cell.border = S["border"]
            cell.alignment = align


def _header(ws, S, cells):
    """[(row, col, value), ...] 단일 헤더 셀에 네이비 강조."""
    for (r, c, v) in cells:
        cell = ws.cell(row=r, column=c, value=v)
        cell.fill = S["hdr_fill"]
        cell.font = S["hdr_font"]
        cell.alignment = S["center"]
        cell.border = S["border"]


def _hdr_merge(ws, S, r1, c1, r2, c2, value):
    """병합 헤더 — 범위 전체 네이비/테두리, 좌상단에 값."""
    if (r1, c1) != (r2, c2):
        ws.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)
    for r in range(r1, r2 + 1):
        for c in range(c1, c2 + 1):
            cell = ws.cell(row=r, column=c)
            cell.fill = S["hdr_fill"]
            cell.border = S["border"]
    tl = ws.cell(row=r1, column=c1, value=value)
    tl.font = S["hdr_font"]; tl.alignment = S["center"]
    return tl


def _merge_label(ws, S, r1, r2, col, value):
    """col 열의 r1~r2 병합 + 가운데 라벨 + 테두리."""
    if r2 > r1:
        ws.merge_cells(start_row=r1, start_column=col, end_row=r2, end_column=col)
    for r in range(r1, r2 + 1):
        ws.cell(row=r, column=col).border = S["border"]
    cell = ws.cell(row=r1, column=col, value=value)
    cell.alignment = S["center"]
    return cell


def _widths(ws, mapping: dict):
    for col, w in mapping.items():
        ws.column_dimensions[col].width = w


# ── 워크북 조립 ─────────────────────────────────────────────────
def _build_workbook(rdf: pd.DataFrame):
    from openpyxl import Workbook
    S = _styles()
    groups = _grouped(rdf)
    counts = _counts(rdf)
    targets = _targets(rdf)
    ranges, ds, de, footer = _ranges(groups)
    ctx = {"groups": groups, "counts": counts, "targets": targets,
           "ranges": ranges, "ds": ds, "de": de, "footer": footer}

    wb = Workbook()
    wb.calculation.fullCalcOnLoad = True   # 열 때 수식 자동 재계산
    _sheet_cover(wb.active, S)
    _sheet_targets(wb.create_sheet("1. 진단 대상"), S, ctx)
    _sheet_graph(wb.create_sheet("2-1. 요약결과(그래프)"), S, ctx)
    _sheet_summary(wb.create_sheet(SUMMARY_SHEET), S, ctx)
    _sheet_detail(wb.create_sheet("3-1. 진단 결과"), S, ctx)
    return wb


def _sheet_cover(ws, S):
    ws.title = "0. 표지"
    ws.sheet_view.showGridLines = False
    _widths(ws, {"A": 2})
    _widths(ws, {c: 9 for c in "BCDEFGHIJ"})
    _widths(ws, {"K": 13, "L": 30})
    for r in (3, 4, 5, 6):
        ws.row_dimensions[r].height = 22
    # 우상단 메타 박스
    meta = [("문서번호", REPORT_META["문서번호"]), ("작성자", REPORT_META["작성자"]),
            ("보안등급", REPORT_META["보안등급"]), ("Ver", REPORT_META["Ver"])]
    for i, (k, v) in enumerate(meta, start=3):
        kc = ws.cell(row=i, column=11, value=k)
        kc.font = S["Font"](bold=True); kc.border = S["border"]; kc.alignment = S["center"]
        vc = ws.cell(row=i, column=12, value=v)
        vc.border = S["border"]; vc.alignment = S["left"]
    # 제목 / 부제 / 날짜
    ws.row_dimensions[11].height = 40
    ws.row_dimensions[13].height = 30
    ws.merge_cells("B11:L11")
    t = ws.cell(row=11, column=2, value=REPORT_META["제목"])
    t.font = S["Font"](bold=True, size=28); t.alignment = S["center"]
    ws.merge_cells("B13:L13")
    st = ws.cell(row=13, column=2, value=REPORT_META["부제"])
    st.font = S["Font"](bold=True, size=16); st.alignment = S["center"]
    ws.merge_cells("B18:L18")
    dt = ws.cell(row=18, column=2, value=str(date.today()))
    dt.font = S["Font"](size=12); dt.alignment = S["center"]


def _sheet_targets(ws, S, ctx):
    targets = ctx["targets"]
    ws.sheet_view.showGridLines = False
    _widths(ws, {"A": 2, "B": 6, "C": 22, "D": 16, "E": 34, "F": 12, "G": 26})
    ws.row_dimensions[1].height = 26
    ws.cell(row=1, column=2,
            value=f"  ※ 진단 대상 리스트 - 서버 {len(targets)}대").font = S["Font"](bold=True)
    # 헤더 (2~3행)
    _hdr_merge(ws, S, 2, 2, 3, 2, "순번")
    _hdr_merge(ws, S, 2, 3, 2, 6, "진단 대상")
    _hdr_merge(ws, S, 2, 7, 3, 7, "비고")
    _header(ws, S, [(3, 3, "Hostname"), (3, 4, "IP Address"),
                    (3, 5, "버전정보"), (3, 6, "용도")])
    # 데이터 — 헤더 바로 아래(4행~)에 붙임
    start = 4
    for i, t in enumerate(targets):
        r = start + i
        ws.row_dimensions[r].height = 24
        ws.cell(row=r, column=2, value=i + 1)
        ws.cell(row=r, column=3, value=t["hostname"])
        ws.cell(row=r, column=4, value=t["ip"])
        ws.cell(row=r, column=5, value=TARGET_DEFAULTS["버전정보"])
        ws.cell(row=r, column=6, value=TARGET_DEFAULTS["용도"])
        ws.cell(row=r, column=7, value=TARGET_DEFAULTS["비고"])
    _box(ws, S, start, 2, start + len(targets) - 1, 7, align=S["center"])
    _auto_width(ws, per_col={"E": (20, 40), "G": (16, 30), "C": (14, 26)})


def _sheet_graph(ws, S, ctx):
    from openpyxl.chart import BarChart, PieChart, RadarChart, Reference
    groups, ranges = ctx["groups"], ctx["ranges"]
    ds, de = ctx["ds"], ctx["de"]
    ref = lambda a: f"'{SUMMARY_SHEET}'!{a}"   # noqa: E731
    ws.sheet_view.showGridLines = False
    _widths(ws, {"A": 2, "B": 16, "C": 11})
    n = len(groups)

    def band(row, text):
        ws.merge_cells(start_row=row, start_column=6, end_row=row, end_column=12)
        c = ws.cell(row=row, column=6, value=text)
        c.font = S["Font"](bold=True, size=12); c.alignment = S["center"]

    # 1) 도메인 평균점수 (2-2 영역점수 셀 참조 → 자동반영)
    band(2, "항목별 양호 비율")
    _header(ws, S, [(4, 2, "진단 도메인"), (4, 3, "평균 점수")])
    for i, (d, rows, r1, r2) in enumerate(ranges):
        r = 5 + i
        ws.cell(row=r, column=2, value=d).alignment = S["center"]
        c = ws.cell(row=r, column=3, value=f"={ref(f'H{r1}')}")
        c.number_format = "0.0%"; c.alignment = S["center"]
    _box(ws, S, 5, 2, 4 + n, 3, align=S["center"])

    # 2) 양호/취약/N/A (2-2 J/K/L 합계)
    band(16, "양호 / 취약 / N/A 비율")
    _header(ws, S, [(18, 2, "상태"), (18, 3, "개수")])
    for i, (lab, col) in enumerate([("양호", "J"), ("취약", "K"), ("N/A", "L")]):
        r = 19 + i
        ws.cell(row=r, column=2, value=lab).alignment = S["center"]
        ws.cell(row=r, column=3, value=f"=SUM({ref(f'{col}{ds}:{col}{de}')})").alignment = S["center"]
    _box(ws, S, 19, 2, 21, 3, align=S["center"])

    # 3) 영역별 취약 수 (분류별 K 합계)
    band(29, "영역별 취약 수")
    _header(ws, S, [(31, 2, "영역"), (31, 3, "취약 수")])
    for i, (d, rows, r1, r2) in enumerate(ranges):
        r = 32 + i
        ws.cell(row=r, column=2, value=d).alignment = S["center"]
        ws.cell(row=r, column=3, value=f"=SUM({ref(f'K{r1}:K{r2}')})").alignment = S["center"]
    _box(ws, S, 32, 2, 31 + n, 3, align=S["center"])

    # 차트1: 도메인 평균점수
    #  - 분류 3개 이상 → 방사형(원본과 동일). 2개 이하면 레이더가 직선으로 찌그러지므로 막대로 대체.
    score_data = Reference(ws, min_col=3, min_row=4, max_row=4 + n)
    score_cats = Reference(ws, min_col=2, min_row=5, max_row=4 + n)
    if n >= 3:
        c1 = RadarChart(); c1.type = "marker"; c1.style = 2
    else:
        c1 = BarChart(); c1.type = "col"; c1.grouping = "clustered"
    c1.height, c1.width = 8, 13
    c1.varyColors = True
    c1.add_data(score_data, titles_from_data=True)
    c1.set_categories(score_cats)
    c1.legend = None
    ws.add_chart(c1, "F3")

    pie = PieChart(); pie.varyColors = True
    pie.height, pie.width = 7, 11
    pie.add_data(Reference(ws, min_col=3, min_row=18, max_row=21), titles_from_data=True)
    pie.set_categories(Reference(ws, min_col=2, min_row=19, max_row=21))
    ws.add_chart(pie, "F17")

    bar = BarChart(); bar.type = "col"; bar.grouping = "clustered"; bar.varyColors = True
    bar.height, bar.width, bar.legend = 7, 13, None
    bar.add_data(Reference(ws, min_col=3, min_row=31, max_row=31 + n), titles_from_data=True)
    bar.set_categories(Reference(ws, min_col=2, min_row=32, max_row=31 + n))
    ws.add_chart(bar, "F31")


def _sheet_summary(ws, S, ctx):
    counts, ranges = ctx["counts"], ctx["ranges"]
    ds, de, footer = ctx["ds"], ctx["de"], ctx["footer"]
    host = ctx["targets"][0]["hostname"]
    ip = ctx["targets"][0]["ip"]
    ws.sheet_view.showGridLines = False
    _widths(ws, {"A": 2, "B": 15, "C": 8, "D": 56, "E": 7, "F": 11, "G": 2.5,
                 "H": 11, "I": 7, "J": 7, "K": 7, "L": 7})
    ws.row_dimensions[2].height = 28
    ws.merge_cells("B2:L2")
    tc = ws.cell(row=2, column=2,
                 value=f"{REPORT_META['제목']} 요약 진단결과 ({counts['total']}항목)")
    tc.font = S["Font"](bold=True, size=13); tc.alignment = S["center"]
    # 좌측 헤더(3~5행 세로병합)
    _hdr_merge(ws, S, 3, 2, 5, 2, "진단항목")
    _hdr_merge(ws, S, 3, 3, 5, 3, "No.")
    _hdr_merge(ws, S, 3, 4, 5, 4, "세부 진단항목")
    _hdr_merge(ws, S, 3, 5, 5, 5, "중요도")
    # 결과 컬럼(F) — 진단대상 표기 (원본: 1 / hostname / ip)
    _header(ws, S, [(3, 6, "결과"), (4, 6, host), (5, 6, ip)])
    # 우측 집계 헤더(5행) — 원본과 동일 레이아웃
    _header(ws, S, [(5, 8, "영역별점수"), (5, 9, "점수"),
                    (5, 10, "양호"), (5, 11, "취약"), (5, 12, "N/A")])
    # 데이터(6행~) — 모두 엑셀 수식(COUNTIF/AVERAGE) → 결과 바꾸면 자동 % 반영
    for d, rows, r1, r2 in ranges:
        for k, row in enumerate(rows):
            r = r1 + k
            res = str(row.get("결과"))
            ws.cell(row=r, column=3, value=row.get("항목코드"))
            ws.cell(row=r, column=4, value=row.get("항목"))
            ws.cell(row=r, column=5, value=row.get("중요도"))
            rc = ws.cell(row=r, column=6, value=res)
            f = _result_fill(S, res)
            if f:
                rc.fill = f
            # 점수(I): 양호=100%, 취약=0%, N/A 표기 (퍼센트)
            sc = ws.cell(row=r, column=9,
                         value=f'=IF(COUNTIF($F{r}:$F{r},"{config.R_NA}")=COUNTA($F{r}:$F{r}),'
                               f'"{config.R_NA}",$J{r}/(COUNTA($F{r}:$F{r})-$L{r}))')
            sc.number_format = "0.0%"
            ws.cell(row=r, column=10, value=f'=COUNTIF($F{r}:$F{r},"{config.R_PASS}")')
            ws.cell(row=r, column=11, value=f'=COUNTIF($F{r}:$F{r},"{config.R_VULN}")')
            ws.cell(row=r, column=12, value=f'=COUNTIF($F{r}:$F{r},"{config.R_NA}")')
        _box(ws, S, r1, 2, r2, 6, align=S["center"])
        _box(ws, S, r1, 8, r2, 12, align=S["center"])
        # 세부 진단항목(D)만 좌측정렬
        for rr in range(r1, r2 + 1):
            ws.cell(row=rr, column=4).alignment = S["leftc"]
        _merge_label(ws, S, r1, r2, 2, d)
        # 영역별점수(H) = AVERAGE(점수) — 퍼센트 (원본 방식)
        hc = _merge_label(ws, S, r1, r2, 8,
                          f'=IF(COUNTIF(I{r1}:I{r2},"{config.R_NA}")=COUNTA(I{r1}:I{r2}),'
                          f'"{config.R_NA}",AVERAGE(I{r1}:I{r2}))')
        hc.number_format = "0.0%"
    # 푸터 (수식)
    fl = _merge_label(ws, S, footer, footer + 1, 2, "점검결과")
    fl.font = S["Font"](bold=True)
    ws.merge_cells(start_row=footer, start_column=3, end_row=footer, end_column=5)
    ws.cell(row=footer, column=3, value="취약항목 개수")
    fv = ws.cell(row=footer, column=6, value=f'=COUNTIF(F{ds}:F{de},"{config.R_VULN}")')
    fv.number_format = "0"
    ws.merge_cells(start_row=footer + 1, start_column=3, end_row=footer + 1, end_column=5)
    ws.cell(row=footer + 1, column=3, value="보안 적용율 (양호항목 / 진단항목) %")
    ac = ws.cell(row=footer + 1, column=6,
                 value=f'=(COUNTIF(F{ds}:F{de},"{config.R_PASS}"))/'
                       f'(COUNTA(F{ds}:F{de})-COUNTIF(F{ds}:F{de},"{config.R_NA}"))')
    ac.number_format = "0.0%"
    _box(ws, S, footer, 2, footer + 1, 6, align=S["center"])
    ws.freeze_panes = "A6"
    _auto_width(ws, per_col={"D": (24, 60), "B": (12, 20), "E": (10, 12)})


def _sheet_detail(ws, S, ctx):
    counts, ranges = ctx["counts"], ctx["ranges"]
    host = ctx["targets"][0]["hostname"]
    ws.sheet_view.showGridLines = False
    _widths(ws, {"A": 2, "B": 14, "C": 9, "D": 44, "E": 70, "F": 10, "G": 50})
    ws.row_dimensions[2].height = 26
    ws.merge_cells("B2:G2")
    tc = ws.cell(row=2, column=2,
                 value=f"{REPORT_META['제목']} 상세 진단결과 ({counts['total']}항목)")
    tc.font = S["Font"](bold=True, size=13); tc.alignment = S["center"]
    # 헤더(3~5행)
    _hdr_merge(ws, S, 3, 2, 5, 2, "진단항목")
    _hdr_merge(ws, S, 3, 3, 5, 3, "No.")
    _hdr_merge(ws, S, 3, 4, 5, 4, "세부 진단항목")
    _hdr_merge(ws, S, 3, 5, 5, 5, "진단기준")
    _hdr_merge(ws, S, 3, 6, 5, 6, "결과")
    _hdr_merge(ws, S, 3, 7, 5, 7, "판단 근거")   # 비고 → 판단 근거
    for d, rows, r1, r2 in ranges:
        for k, row in enumerate(rows):
            r = r1 + k
            res = str(row.get("결과"))
            ws.cell(row=r, column=3, value=row.get("항목코드"))
            ws.cell(row=r, column=4, value=row.get("항목"))
            ws.cell(row=r, column=5, value=_crit_lines(row.get("판단기준")))   # '|' → 줄바꿈
            rc = ws.cell(row=r, column=6, value=res)
            f = _result_fill(S, res)
            if f:
                rc.fill = f
            ws.cell(row=r, column=7, value=row.get("판단근거"))
        _box(ws, S, r1, 2, r2, 7, align=S["leftc"])
        for rr in range(r1, r2 + 1):
            ws.cell(row=rr, column=3).alignment = S["center"]   # No.
            ws.cell(row=rr, column=6).alignment = S["center"]   # 결과
        _merge_label(ws, S, r1, r2, 2, d)
    ws.freeze_panes = "A6"
    _auto_width(ws, per_col={"D": (24, 48), "E": (55, 100), "G": (24, 55), "B": (12, 18)})
