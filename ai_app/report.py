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

<<<<<<< Updated upstream
=======
# ── 표지/메타 기본값 (CSV에 없는 값 — 엑셀에서 직접 수정 가능) ──
REPORT_META = {
    "문서번호": "CHECKBANG-VA-2026-001",
    "작성자": "취약점진단팀",
    "보안등급": "Confidential",
    "Ver": "ver 1.0",
    "제목": 'Check방 취약점 진단',
    "부제": "서버 취약점 진단 상세결과",
}
# 진단대상 시트에서 CSV에 없는 칸의 기본값
TARGET_DEFAULTS = {"버전정보": "-", "용도": "서버", "비고": "-"}
>>>>>>> Stashed changes

def build_csv_report(df: pd.DataFrame, decisions: dict[str, dict]) -> bytes:
    """[보고서 양식 함수] 원본 df + 확정 판정 → CSV 보고서 바이트(한 번에).

    순수 파이썬으로 양식(REPORT_COLUMNS)대로 조립한다. LLM 호출 없음 → 토큰 0.
    """
    return to_csv_bytes(build_report_df(df, decisions))


<<<<<<< Updated upstream
def build_xlsx_report(df: pd.DataFrame, decisions: dict[str, dict]) -> bytes:
    """[보고서 양식 함수] 원본 df + 확정 판정 → Excel(.xlsx) 바이트(한 번에). 토큰 0."""
    return to_excel_bytes(build_report_df(df, decisions))
=======
def _label_reason(result: str, reason: str) -> str:
    """판단근거 본문만 반환. 결과(양호/취약)는 '결과' 열에 이미 표기되므로 머리말은 붙이지 않는다."""
    return (reason or "").strip()
>>>>>>> Stashed changes


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


<<<<<<< Updated upstream
def to_excel_bytes(report_df: pd.DataFrame, sheet_name: str = "진단결과") -> bytes:
    """보고서 DataFrame을 서식 적용된 .xlsx 바이트로 변환."""
=======
# ════════════════════════════════════════════════════════════════
#  Excel 보고서 (5시트 양식)
# ════════════════════════════════════════════════════════════════
SUMMARY_SHEET = "2-2. 요약 진단결과"   # 수식 참조용 시트 이름


def build_xlsx_from_report_df(rdf: pd.DataFrame) -> bytes:
    """보고서 DataFrame(REPORT_COLUMNS) → 5시트 .xlsx 바이트."""
    wb = _build_workbook(rdf)
>>>>>>> Stashed changes
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        report_df.to_excel(writer, index=False, sheet_name=sheet_name)
        _format_sheet(writer.sheets[sheet_name], report_df)
    buf.seek(0)
    return buf.getvalue()


<<<<<<< Updated upstream
def _format_sheet(ws, df: pd.DataFrame) -> None:
    """열 너비, 헤더 강조, 결과별 색상 등 기본 서식."""
    from openpyxl.styles import Alignment, Font, PatternFill
=======
def build_xlsx_report(df: pd.DataFrame, decisions: dict[str, dict]) -> bytes:
    """원본 df + 확정 판정 → 5시트 .xlsx 바이트(수식 자동계산 포함)."""
    return build_xlsx_from_report_df(build_report_df(df, decisions))


def build_compare_csv(compare_df: pd.DataFrame) -> bytes:
    """비교 결과 DataFrame(COMPARE_COLUMNS)을 CSV 바이트로(UTF-8 BOM + 전체 인용)."""
    return to_csv_bytes(compare_df)
>>>>>>> Stashed changes

    header_fill = PatternFill("solid", fgColor="1F4E78")
    header_font = Font(bold=True, color="FFFFFF")
    pass_fill = PatternFill("solid", fgColor="E2EFDA")   # 연녹
    vuln_fill = PatternFill("solid", fgColor="FCE4E4")   # 연적
    na_fill = PatternFill("solid", fgColor="EDEDED")     # 회색

<<<<<<< Updated upstream
    widths = {
        "항목코드": 12, "분류": 14, "항목": 32, "판단기준": 55,
        "결과": 8, "판단근거": 60, "진단대상": 14, "진단대상IP": 16, "중요도": 8,
=======
# ════════════════════════════════════════════════════════════════
#  HTML 보고서 (자체 완결형 — 인라인 CSS, 오프라인 열람·인쇄 가능)
# ════════════════════════════════════════════════════════════════
def _esc(text) -> str:
    """HTML 이스케이프 + 줄바꿈을 <br>로."""
    import html as _html
    return _html.escape(str(text or "")).replace("\n", "<br>")


def build_report_df_from_run(run_df: pd.DataFrame) -> pd.DataFrame:
    """저장된 Run CSV(RUN_COLUMNS) → 보고서 DataFrame(REPORT_COLUMNS).

    최종결과=확정값 우선·없으면 스크립트결과, 근거=확정근거 우선·없으면 AI근거.
    스크립트/AI 중 하나라도 취약이면 조치방법 표기(보고서/엑셀 규칙과 동일).
    """
    rows = []
    for _, r in run_df.iterrows():
        script = r.get("스크립트결과", "")
        ai = r.get("AI결과", "")
        result = config.final_result(r.get("확정결과", ""), script)
        reason = r.get("확정근거", "") or r.get("AI근거", "")
        show_remed = config.R_VULN in (script, ai)
        rows.append({
            "항목코드": r.get("항목코드", ""),
            "분류": r.get("분류", ""),
            "중요도": r.get("중요도", ""),
            "항목": r.get("항목", ""),
            "판단기준": _crit_lines(r.get("판단기준", "")),
            "결과": result,
            "판단근거": _label_reason(result, reason),
            "조치방법": r.get("조치방법", "") if show_remed else "",
            "진단대상": r.get("진단대상", ""),
            "진단대상IP": r.get("진단대상IP", ""),
        })
    return pd.DataFrame(rows, columns=config.REPORT_COLUMNS)


def build_html_report(df: pd.DataFrame, decisions: dict[str, dict],
                      meta: dict | None = None) -> str:
    """원본 df + 확정 판정 → 자체 완결형 HTML 보고서 문자열(엑셀과 표 내용 일치)."""
    return _render_html_report(build_report_df(df, decisions), meta)


def build_html_report_compare(cmp: dict, meta: dict | None = None) -> str:
    """비교 결과(store.compare 반환 dict) → 자체 완결형 HTML 비교 보고서."""
    m = meta or {}
    s = cmp.get("summary", {})
    base = cmp.get("base") or {}
    target = cmp.get("target") or {}
    fix = s.get("fixRate")
    meta_rows = [
        ("진단 대상", m.get("대상", "") or "-"),
        ("기준 파일", f"{base.get('종류', '')} · {base.get('일시', '')} · {base.get('원본파일명', '')}"),
        ("비교 파일", f"{target.get('종류', '')} · {target.get('일시', '')} · {target.get('원본파일명', '')}"),
        ("생성 일시", m.get("일시", str(date.today()))),
    ]
    meta_html = "".join(
        f"<tr><th>{_esc(k)}</th><td>{_esc(v)}</td></tr>" for k, v in meta_rows)

    kpis = [
        ("조치 완료", s.get("improved", 0), "취약 → 양호", "k-pass"),
        ("미조치", s.get("unfixed", 0), "취약 → 취약", "k-vuln"),
        ("신규 취약", s.get("worsened", 0), "양호 → 취약", "k-vuln"),
        ("조치율", "-" if fix is None else f"{fix}%", f"기준 취약 {s.get('baseVuln', 0)}건", "k-total"),
    ]
    kpi_html = "".join(
        f'<div class="kcard {cls}"><div class="knum">{v}</div>'
        f'<div class="klabel">{_esc(label)}</div><div class="ksub">{_esc(sub)}</div></div>'
        for label, v, sub, cls in kpis)

    st_cls = {config.C_IMPROVED: "pass", config.C_KEPT: "pass", config.C_UNFIXED: "vuln",
              config.C_WORSENED: "warn", config.C_NA: "na"}
    rcls = {config.R_PASS: "pass", config.R_VULN: "vuln", config.R_NA: "na"}
    body_rows = []
    for r in cmp.get("rows", []):
        b = str(r.get("최초결과") or "")
        t = str(r.get("이행결과") or "")
        stt = str(r.get("상태") or "")
        body_rows.append(
            "<tr>"
            f'<td class="code">{_esc(r.get("항목코드"))}</td>'
            f'<td>{_esc(r.get("분류"))}</td>'
            f'<td class="nm">{_esc(r.get("항목"))}</td>'
            f'<td class="c"><span class="sev s-{_esc(r.get("중요도"))}">{_esc(r.get("중요도"))}</span></td>'
            f'<td class="c"><span class="pill {rcls.get(b, "na")}">{_esc(b or "-")}</span></td>'
            f'<td class="c"><span class="pill {rcls.get(t, "na")}">{_esc(t or "-")}</span></td>'
            f'<td class="c"><span class="pill {st_cls.get(stt, "na")}">{_esc(stt)}</span></td>'
            "</tr>")

    return _HTML_COMPARE_TEMPLATE.format(
        title="진단 결과 비교 보고서", meta_html=meta_html, kpi_html=kpi_html,
        body_rows="".join(body_rows))


def build_html_report_from_run(run_df: pd.DataFrame, meta: dict | None = None) -> str:
    """저장된 Run CSV → 자체 완결형 HTML 보고서 문자열."""
    return _render_html_report(build_report_df_from_run(run_df), meta)


def _render_html_report(rdf: pd.DataFrame, meta: dict | None = None) -> str:
    """보고서 DataFrame(REPORT_COLUMNS)을 자체 완결형 HTML 문자열로 렌더링.

    meta: {"종류","일시","원본파일명"} 등 상단 표기 정보(선택).
    """
    counts = _counts(rdf)
    targets = _targets(rdf)
    m = meta or {}
    has_base = (counts["pass"] + counts["vuln"]) > 0
    applied_pct = f"{counts['applied'] * 100:.1f}%" if has_base else "-"
    applied_w = round(counts["applied"] * 100, 1) if has_base else 0

    target_line = ", ".join(
        f"{t['hostname']} ({t['ip']})" for t in targets) or "-"
    meta_rows = [
        ("진단 대상", target_line),
        ("진단 종류", m.get("종류", "")),
        ("진단 일시", m.get("일시", str(date.today()))),
        ("원본 파일", m.get("원본파일명", "")),
    ]
    meta_html = "".join(
        f"<tr><th>{_esc(k)}</th><td>{_esc(v)}</td></tr>" for k, v in meta_rows if v != "")

    # 양호/취약/N·A 세그먼트 — 개수에 비례해 폭이 달라져 대략적 비율을 시각화(0건은 생략)
    segs = [("양호", counts["pass"], "s-pass"), ("취약", counts["vuln"], "s-vuln"),
            ("N/A", counts["na"], "s-na")]
    seg_html = "".join(
        f'<div class="seg {cls}" style="flex-grow:{n}">'
        f'<span class="segn">{n}</span><span class="segl">{_esc(label)}</span></div>'
        for label, n, cls in segs if n > 0)

    body_rows = []
    for _, r in rdf.iterrows():
        res = str(r.get("결과") or "")
        cls = {config.R_PASS: "pass", config.R_VULN: "vuln", config.R_NA: "na"}.get(res, "na")
        body_rows.append(
            "<tr>"
            f'<td class="code">{_esc(r.get("항목코드"))}</td>'
            f'<td>{_esc(r.get("분류"))}</td>'
            f'<td class="c"><span class="sev s-{_esc(r.get("중요도"))}">{_esc(r.get("중요도"))}</span></td>'
            f'<td class="nm">{_esc(r.get("항목"))}</td>'
            f'<td class="wrap">{_esc(r.get("판단기준"))}</td>'
            f'<td class="c"><span class="pill {cls}">{_esc(res or "N/A")}</span></td>'
            f'<td class="wrap">{_esc(r.get("판단근거"))}</td>'
            f'<td class="wrap">{_esc(r.get("조치방법"))}</td>'
            f'<td class="c">{_esc(r.get("진단대상"))}</td>'
            f'<td class="c">{_esc(r.get("진단대상IP"))}</td>'
            "</tr>")

    return _HTML_TEMPLATE.format(
        title=_esc(REPORT_META["제목"]), subtitle=_esc(REPORT_META["부제"]),
        meta_html=meta_html, total=counts["total"], seg_html=seg_html,
        applied_pct=_esc(applied_pct), applied_w=applied_w,
        body_rows="".join(body_rows))


_HTML_TEMPLATE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} - {subtitle}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; padding: 28px 24px 60px; background: #f4f6fb; color: #1f2738;
    font-family: "Malgun Gothic","맑은 고딕",-apple-system,Segoe UI,Roboto,sans-serif; font-size: 13px; }}
  .doc {{ max-width: 1400px; margin: 0 auto; }}
  h1 {{ font-size: 24px; margin: 0 0 4px; }}
  .sub {{ color: #5b677e; margin: 0 0 18px; font-weight: 600; }}
  .meta {{ flex: 1 1 0; min-width: 0; align-self: stretch; border-collapse: collapse; margin: 0; background: #fff;
    border: 1px solid #cdd7e8; border-radius: 12px; overflow: hidden; }}
  .meta th, .meta td {{ padding: 8px 12px; text-align: left; border-bottom: 1px solid #e3e9f3; }}
  .meta th {{ background: #d6e2f5; color: #1c3f74; width: 84px; font-weight: 700; }}
  .meta td {{ font-weight: 500; background: #f3f7fd; }}
  .meta tr:last-child th, .meta tr:last-child td {{ border-bottom: 0; }}
  /* 요약: 메타표 + (총항목 + 양호/취약/N·A 세그먼트) + 보안 적용율 — 한 줄에 1/3씩 */
  .summary {{ display: flex; gap: 14px; align-items: flex-start; margin: 0 0 22px; flex-wrap: wrap; }}
  .counts {{ flex: 1 1 0; min-width: 220px; background: #fff; border: 1px solid #cdd7e8;
    border-radius: 12px; padding: 14px 16px; }}
  .totbar {{ display: flex; align-items: center; justify-content: center; height: 26px; padding: 0 12px;
    border-radius: 7px; background: #1f4e78; color: #fff; font-weight: 800; font-size: 13px; margin-bottom: 8px; }}
  .segbar {{ display: flex; gap: 3px; height: 46px; }}
  .seg {{ display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #fff; min-width: 50px; border-radius: 7px; padding: 0 6px; }}
  .seg .segn {{ font-size: 18px; font-weight: 800; line-height: 1.05; }}
  .seg .segl {{ font-size: 11px; font-weight: 700; opacity: .95; }}
  .seg.s-pass {{ background: #2f9e54; }}
  .seg.s-vuln {{ background: #e23b3b; }}
  .seg.s-na {{ background: #9aa3b2; }}
  .appliedmini {{ flex: 1 1 0; min-width: 220px; align-self: stretch; background: #fff; border: 1px solid #cdd7e8;
    border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; justify-content: center; }}
  .appliedmini .amlabel {{ color: #5b677e; font-weight: 700; font-size: 12px; }}
  .appliedmini .ampct {{ font-size: 22px; font-weight: 800; color: #1f4e78; margin: 2px 0 8px; }}
  .amtrack {{ height: 10px; background: #eef1f6; border-radius: 999px; overflow: hidden; }}
  .amfill {{ height: 100%; border-radius: 999px; background: linear-gradient(90deg, #2f9e54, #2563eb); }}
  table.report {{ width: 100%; border-collapse: collapse; background: #fff;
    border: 1px solid #d8deea; border-radius: 10px; overflow: hidden; table-layout: fixed; }}
  .report th, .report td {{ padding: 9px 10px; border-bottom: 1px solid #eef1f6;
    border-right: 1px solid #f1f3f8; vertical-align: middle; text-align: center; }}
  .report thead th {{ position: sticky; top: 0; background: #1f4e78; color: #fff;
    font-weight: 700; text-align: center; white-space: nowrap; }}
  .report tbody tr:nth-child(even) {{ background: #fafbfe; }}
  .report .c {{ text-align: center; }}
  .report .code {{ font-family: ui-monospace,Consolas,monospace; white-space: nowrap; }}
  .report .nm {{ font-weight: 600; }}
  .wrap {{ white-space: pre-wrap; word-break: break-word; line-height: 1.5; }}
  /* 열 너비: 긴 텍스트 열(판단기준/판단근거/조치방법)에 넉넉히 배분 */
  col.c-code {{ width: 78px; }} col.c-grp {{ width: 90px; }} col.c-sev {{ width: 56px; }}
  col.c-nm {{ width: 150px; }} col.c-crit {{ width: 16%; }} col.c-res {{ width: 72px; }}
  col.c-reason {{ width: 24%; }} col.c-remed {{ width: 22%; }}
  col.c-tgt {{ width: 90px; }} col.c-ip {{ width: 110px; }}
  .pill {{ display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; white-space: nowrap; }}
  .pill.pass {{ background: #e2efda; color: #2f7d32; }}
  .pill.vuln {{ background: #fce4e4; color: #c0392b; }}
  .pill.na {{ background: #ededed; color: #555; }}
  .sev {{ display: inline-block; padding: 1px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }}
  .sev.s-상 {{ background: #fde2e1; color: #c0392b; }}
  .sev.s-중 {{ background: #fef3d6; color: #b8860b; }}
  .sev.s-하 {{ background: #e3ecfb; color: #2563eb; }}
  @media print {{
    body {{ background: #fff; padding: 0; font-size: 11px; }}
    .report thead th {{ position: static; }}
    table.report, .meta {{ border-radius: 0; }}
  }}
</style></head>
<body><div class="doc">
  <h1>{title}</h1>
  <p class="sub">{subtitle}</p>
  <div class="summary">
    <table class="meta">{meta_html}</table>
    <div class="counts">
      <div class="totbar">총 {total} 항목</div>
      <div class="segbar">{seg_html}</div>
    </div>
    <div class="appliedmini">
      <div class="amlabel">보안 적용율 (양호 / (양호 + 취약))</div>
      <div class="ampct">{applied_pct}</div>
      <div class="amtrack"><div class="amfill" style="width:{applied_w}%"></div></div>
    </div>
  </div>
  <table class="report">
    <colgroup>
      <col class="c-code"><col class="c-grp"><col class="c-sev"><col class="c-nm">
      <col class="c-crit"><col class="c-res"><col class="c-reason"><col class="c-remed">
      <col class="c-tgt"><col class="c-ip">
    </colgroup>
    <thead><tr>
      <th>항목코드</th><th>분류</th><th>중요도</th><th>항목</th><th>판단 기준</th>
      <th>결과</th><th>판단 근거</th><th>조치 방법</th><th>진단 대상</th><th>진단 대상 IP</th>
    </tr></thead>
    <tbody>{body_rows}</tbody>
  </table>
</div></body></html>"""


_HTML_COMPARE_TEMPLATE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; padding: 28px 24px 60px; background: #f4f6fb; color: #1f2738;
    font-family: "Malgun Gothic","맑은 고딕",-apple-system,Segoe UI,Roboto,sans-serif; font-size: 13px; }}
  .doc {{ max-width: 1100px; margin: 0 auto; }}
  h1 {{ font-size: 24px; margin: 0 0 14px; }}
  .meta {{ border-collapse: collapse; margin: 0 0 18px; background: #fff; width: 100%;
    border: 1px solid #d8deea; border-radius: 10px; overflow: hidden; }}
  .meta th, .meta td {{ padding: 9px 14px; text-align: left; border-bottom: 1px solid #eef1f6; }}
  .meta th {{ background: #d6e2f5; color: #1c3f74; width: 120px; font-weight: 700; }}
  .meta td {{ font-weight: 500; background: #f3f7fd; }}
  .meta tr:last-child th, .meta tr:last-child td {{ border-bottom: 0; }}
  .kpis {{ display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 18px; }}
  .kcard {{ flex: 1; min-width: 150px; background: #fff; border: 1px solid #d8deea;
    border-top: 4px solid #c9d2e3; border-radius: 12px; padding: 14px 16px; }}
  .kcard .knum {{ font-size: 28px; font-weight: 800; line-height: 1.1; }}
  .kcard .klabel {{ margin-top: 4px; color: #3a455c; font-weight: 700; font-size: 13px; }}
  .kcard .ksub {{ color: #7e8aa0; font-weight: 600; font-size: 11px; }}
  .kcard.k-total {{ border-top-color: #2563eb; }} .kcard.k-total .knum {{ color: #1f4e78; }}
  .kcard.k-vuln {{ border-top-color: #e23b3b; background: #fff6f6; }} .kcard.k-vuln .knum {{ color: #c0392b; }}
  .kcard.k-pass {{ border-top-color: #2f9e54; background: #f5fbf6; }} .kcard.k-pass .knum {{ color: #2f7d32; }}
  table.report {{ width: 100%; border-collapse: collapse; background: #fff;
    border: 1px solid #d8deea; border-radius: 10px; overflow: hidden; }}
  .report th, .report td {{ padding: 9px 10px; border-bottom: 1px solid #eef1f6;
    border-right: 1px solid #f1f3f8; vertical-align: top; }}
  .report thead th {{ background: #1f4e78; color: #fff; font-weight: 700; text-align: center; }}
  .report tbody tr:nth-child(even) {{ background: #fafbfe; }}
  .report .c {{ text-align: center; }}
  .report .code {{ font-family: ui-monospace,Consolas,monospace; white-space: nowrap; }}
  .report .nm {{ font-weight: 600; }}
  .pill {{ display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; white-space: nowrap; }}
  .pill.pass {{ background: #e2efda; color: #2f7d32; }}
  .pill.vuln {{ background: #fce4e4; color: #c0392b; }}
  .pill.warn {{ background: #fef3d6; color: #b8860b; }}
  .pill.na {{ background: #ededed; color: #555; }}
  .sev {{ display: inline-block; padding: 1px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }}
  .sev.s-상 {{ background: #fde2e1; color: #c0392b; }}
  .sev.s-중 {{ background: #fef3d6; color: #b8860b; }}
  .sev.s-하 {{ background: #e3ecfb; color: #2563eb; }}
  @media print {{ body {{ background: #fff; padding: 0; }} }}
</style></head>
<body><div class="doc">
  <h1>{title}</h1>
  <table class="meta">{meta_html}</table>
  <div class="kpis">{kpi_html}</div>
  <table class="report">
    <thead><tr>
      <th>항목코드</th><th>분류</th><th>항목</th><th>중요도</th>
      <th>기준 결과</th><th>대상 결과</th><th>상태</th>
    </tr></thead>
    <tbody>{body_rows}</tbody>
  </table>
</div></body></html>"""


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
>>>>>>> Stashed changes
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
