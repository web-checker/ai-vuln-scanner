"""
V-CHECKER 백엔드 API (FastAPI)

기존 ai_app/ 의 로직(preprocess·backend(agent)·report)을 그대로 호출해
React 프론트엔드에 JSON/파일로 제공한다.

실행:
    uvicorn server.main:app --reload --port 8000
흐름:
    /api/upload  → CSV 전처리(세션 생성)
    /api/judge   → AI 교차 진단(항목별 스트리밍)
    /api/decision→ 사람이 확정한 결과 저장
    /api/report* → 최종 보고서 미리보기 / 엑셀 다운로드
"""
from __future__ import annotations

import collections
import io
import json
import sys
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ai_app 패키지 import 보장(프로젝트 루트를 경로에 추가)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ai_app import backend, config, preprocess, report  # noqa: E402

app = FastAPI(title="CHECKER 대시보드")

# 개발 중 Vite(5173)에서의 호출 허용. (Vite 프록시를 쓰면 사실상 불필요하지만 안전망)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 세션(메모리) 저장소 ────────────────────────────────────────
#   {session_id: {"df": DataFrame, "items": [...], "ai_results": {}, "decisions": {}}}
SESSIONS: dict[str, dict] = {}


def _get(sid: str) -> dict:
    state = SESSIONS.get(sid)
    if state is None:
        raise HTTPException(404, "세션을 찾을 수 없습니다. CSV를 다시 업로드하세요.")
    return state


def _items_payload(state: dict) -> list[dict]:
    """프론트가 표/리스트/디테일에 쓸 통합 항목 목록."""
    df = state["df"]
    ai = state["ai_results"]
    dec = state["decisions"]
    out = []
    for _, row in df.iterrows():
        code = row.get("항목코드", "")
        a = ai.get(code, {})
        d = dec.get(code, {})
        script = row.get("결과", "")
        ai_res = a.get("result", "")
        match = "미판정" if not ai_res else ("일치" if ai_res == script else "불일치")
        out.append({
            "code": code,
            "group": row.get("분류", ""),
            "name": row.get("항목", ""),
            "severity": row.get("중요도", ""),
            "criteria": row.get("판단기준", ""),
            "check": preprocess.restore_multiline(row.get("점검내용", "")),
            "target": row.get("진단대상", ""),
            "ip": row.get("진단대상IP", ""),
            "script": script,
            "ai": ai_res,
            "reason": a.get("reason", ""),
            "source": a.get("source", ""),
            "confidence": a.get("confidence", ""),
            "match": match,
            "decided": bool(d),
            "finalResult": d.get("result", ""),
            "finalReason": d.get("reason", ""),
        })
    return out


def _summary(state: dict) -> dict:
    df = state["df"]
    ai = state["ai_results"]
    sres = df["결과"]
    aic = collections.Counter(ai.get(code, {}).get("result", "") for code in df["항목코드"])
    return {
        "script": {"pass": int((sres == config.R_PASS).sum()),
                   "vuln": int((sres == config.R_VULN).sum()),
                   "na": int((sres == config.R_NA).sum())},
        "ai": {"pass": aic.get(config.R_PASS, 0),
               "vuln": aic.get(config.R_VULN, 0),
               "na": aic.get(config.R_NA, 0)},
    }


def _final_decisions(state: dict) -> dict:
    """보고서용: 확정값 우선, 미확정은 자동화 스크립트 결과 + 참고용 AI 근거."""
    df = state["df"]
    ai = state["ai_results"]
    dec = state["decisions"]
    script_by = {row.get("항목코드", ""): row.get("결과", "") for _, row in df.iterrows()}
    fd = dict(dec)
    for code, script in script_by.items():
        fd.setdefault(code, {"result": script, "reason": ai.get(code, {}).get("reason", "")})
    return fd


# ── 엔드포인트 ─────────────────────────────────────────────────
@app.get("/api/health")
def health():
    ok, msg = backend.ready()
    return {"ready": ok, "message": msg, "backend": "claude_cli", "model": config.MODEL}


@app.get("/api/logo")
def logo():
    from fastapi.responses import FileResponse
    path = config.ROOT_DIR / "assets" / "logo.png"
    if not path.exists():
        raise HTTPException(404, "logo.png 없음")
    return FileResponse(str(path), media_type="image/png")


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    try:
        df = preprocess.load_csv(data)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"CSV 로드 실패: {e}")
    items = preprocess.to_ai_items(df)
    sid = uuid.uuid4().hex
    SESSIONS[sid] = {"df": df, "items": items, "ai_results": {}, "decisions": {}}
    st = SESSIONS[sid]
    return {"session_id": sid, "filename": file.filename,
            "items": _items_payload(st), "summary": _summary(st), "total": len(items)}


class JudgeReq(BaseModel):
    session_id: str
    mode: str = "pending"   # "pending"(미판정만) | "all"(전체 다시)


@app.post("/api/judge")
def judge(req: JudgeReq):
    state = _get(req.session_id)
    items = state["items"]
    ai = state["ai_results"]
    targets = (items if req.mode == "all"
               else [it for it in items if not ai.get(it["항목코드"], {}).get("result")])
    total = len(targets)
    state["cancel"] = False   # 새 진단 시작 시 중지 플래그 초기화

    def gen():
        yield json.dumps({"event": "start", "total": total}, ensure_ascii=False) + "\n"
        done = 0
        cancelled = False
        for it in targets:
            if state.get("cancel"):   # 사용자가 중지를 누르면 다음 항목부터 토큰 사용 안 함
                cancelled = True
                break
            code = it["항목코드"]
            try:
                res = backend.judge_item(it)
            except Exception as e:  # noqa: BLE001
                res = {"result": "", "reason": f"(오류: {e})", "source": "", "confidence": 0.0}
            ai[code] = res
            done += 1
            yield json.dumps({"event": "item", "code": code,
                              "result": res.get("result", ""), "reason": res.get("reason", ""),
                              "source": res.get("source", ""), "confidence": res.get("confidence", ""),
                              "done": done, "total": total}, ensure_ascii=False) + "\n"
<<<<<<< Updated upstream
        yield json.dumps({"event": "done", "total": total}, ensure_ascii=False) + "\n"
=======
        _flush(state)  # 진행된 AI 판정 결과를 Run CSV에 반영(중지 시 부분 결과도 보존)
        state["cancel"] = False
        yield json.dumps({"event": "cancelled" if cancelled else "done",
                          "done": done, "total": total}, ensure_ascii=False) + "\n"
>>>>>>> Stashed changes

    return StreamingResponse(gen(), media_type="application/x-ndjson")


class CancelReq(BaseModel):
    session_id: str


@app.post("/api/judge/cancel")
def judge_cancel(req: CancelReq):
    """진행 중인 AI 교차 진단을 중지. 다음 항목부터 토큰 사용을 멈춘다."""
    state = _get(req.session_id)
    state["cancel"] = True
    return {"ok": True}


class DecisionReq(BaseModel):
    session_id: str
    code: str
    result: str
    reason: str = ""


@app.post("/api/decision")
def decision(req: DecisionReq):
    state = _get(req.session_id)
    state["decisions"][req.code] = {"result": req.result, "reason": req.reason}
    return {"ok": True}


@app.get("/api/state")
def get_state(session_id: str):
    st = _get(session_id)
    return {"items": _items_payload(st), "summary": _summary(st), "total": len(st["items"])}


@app.get("/api/report")
def report_preview(session_id: str):
    st = _get(session_id)
    rdf = report.build_report_df(st["df"], _final_decisions(st))
    return {"columns": list(rdf.columns), "rows": rdf.to_dict(orient="records")}


@app.get("/api/report.xlsx")
def report_xlsx(session_id: str):
    st = _get(session_id)
    data = report.build_xlsx_report(st["df"], _final_decisions(st))
    label = st["df"]["진단대상"].iloc[0] if len(st["df"]) else "report"
    fname = quote(f"was_diag_report_{label}.xlsx")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"},
    )


class SaveReportReq(BaseModel):
    session_id: str


@app.post("/api/report/save")
def report_save(req: SaveReportReq):
    """현재 세션의 최종 보고서를 HTML로 서버에 영속 저장.

    저장 위치: data/reports/{run_id}.html  (run_id = 업로드 시 생성, 세션 단위)
    추후 '저장된 보고서 불러오기' 기능이 report_id(run_id)로 조회한다.
    """
    st = _get(req.session_id)
    html = report.build_html_report(
        st["df"], _final_decisions(st),
        meta={"종류": st.get("kind", ""), "원본파일명": st.get("filename", "")})
    meta = store.save_report_html(
        st["run_id"], html, asset_id=st.get("asset_id", ""),
        name=st.get("name", ""), ip=st.get("ip", ""),
        kind=st.get("kind", ""), filename=st.get("filename", ""))
    return {"ok": True, "report_id": meta["report_id"], "filename": meta["파일명"]}


@app.get("/api/reports")
def list_reports():
    """저장된 보고서 목록(추후 불러오기 UI용)."""
    return {"reports": store.list_reports()}


@app.get("/api/reports/{report_id}/report.html")
def get_saved_report(report_id: str, download: int = 0):
    """저장된 보고서 HTML 본문을 반환.

    download=0: 인라인 열람(새 탭). download=1: 파일 다운로드(진단대상명·run_id로 명명).
    """
    from fastapi.responses import HTMLResponse
    html = store.load_report_html(report_id)
    if html is None:
        raise HTTPException(404, "저장된 보고서를 찾을 수 없습니다.")
    headers = {}
    if download:
        meta = store.report_meta(report_id) or {}
        label = (meta.get("진단대상명") or "report").strip() or "report"
        fname = quote(f"진단보고서_{label}_{report_id}.html")
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{fname}"
    return HTMLResponse(html, headers=headers)


class ResetReq(BaseModel):
    session_id: str


@app.post("/api/reset")
def reset(req: ResetReq):
    SESSIONS.pop(req.session_id, None)
    return {"ok": True}


<<<<<<< Updated upstream
=======
# ── 자산관리 / 비교 (영속 CSV) ─────────────────────────────────
def _run_items_payload(run_df) -> list[dict]:
    """Run CSV(RUN_COLUMNS)를 대시보드 항목 페이로드로 변환(읽기전용 조회용)."""
    out = []
    for _, r in run_df.iterrows():
        out.append(_item_payload(
            code=r.get("항목코드", ""), group=r.get("분류", ""), name=r.get("항목", ""),
            severity=r.get("중요도", ""), criteria=r.get("판단기준", ""), check="",
            target=r.get("진단대상", ""), ip=r.get("진단대상IP", ""),
            script=r.get("스크립트결과", ""), ai=r.get("AI결과", ""),
            reason=r.get("AI근거", ""), remediation=r.get("조치방법", ""),
            source="", confidence="",
            decided=bool(str(r.get("확정여부", "")).strip()),
            final_result=r.get("확정결과", ""), final_reason=r.get("확정근거", ""),
        ))
    return out


@app.get("/api/assets")
def get_assets():
    """등록된 자산 목록(진단대상IP 기준) + 자산별 Run 수."""
    return {"assets": store.list_assets()}


@app.get("/api/assets/{asset_id}/runs")
def get_asset_runs(asset_id: str):
    """한 자산의 진단실행(Run) 이력(시간순)."""
    return {"asset_id": asset_id, "runs": store.list_runs(asset_id)}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    """저장된 Run 1건을 대시보드 항목 페이로드로 로드(읽기전용)."""
    run_df = store.load_run_df(run_id)
    if run_df is None:
        raise HTTPException(404, "Run을 찾을 수 없습니다.")
    return {"run_id": run_id, "items": _run_items_payload(run_df), "total": len(run_df),
            "report_saved": store.report_exists(run_id)}


@app.post("/api/runs/{run_id}/report/save")
def save_run_report(run_id: str):
    """저장된 Run의 최종 보고서를 HTML로 영속 저장(report_id = run_id).

    자산관리 → 진단기록 상세 화면 하단의 '보고서 저장(HTML)' 버튼이 호출한다.
    """
    run_df = store.load_run_df(run_id)
    if run_df is None:
        raise HTTPException(404, "Run을 찾을 수 없습니다.")
    rmeta = store.run_meta(run_id) or {}
    name = run_df["진단대상"].iloc[0] if len(run_df) else ""
    ip = run_df["진단대상IP"].iloc[0] if len(run_df) else ""
    html = report.build_html_report_from_run(
        run_df, meta={"종류": rmeta.get("종류", ""), "일시": rmeta.get("일시", ""),
                      "원본파일명": rmeta.get("원본파일명", "")})
    meta = store.save_report_html(
        run_id, html, asset_id=rmeta.get("asset_id", ""),
        name=name, ip=ip, kind=rmeta.get("종류", ""), filename=rmeta.get("원본파일명", ""))
    path = str((config.REPORTS_DIR / meta["파일명"]).resolve())
    return {"ok": True, "report_id": meta["report_id"], "filename": meta["파일명"], "path": path}


class RunKindReq(BaseModel):
    kind: str


@app.post("/api/runs/{run_id}/kind")
def update_run_kind(run_id: str, req: RunKindReq):
    """진단기록의 종류(최초진단/이행점검) 변경 — 비교 탭에서 지정."""
    if req.kind not in config.VALID_RUN_KINDS:
        raise HTTPException(400, "잘못된 진단 종류")
    if not store.set_run_kind(run_id, req.kind):
        raise HTTPException(404, "Run을 찾을 수 없습니다.")
    return {"ok": True, "kind": req.kind}


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: str):
    """진단 기록(Run) 1건 삭제(자산의 마지막 Run이면 자산도 제거)."""
    if not store.delete_run(run_id):
        raise HTTPException(404, "Run을 찾을 수 없습니다.")
    return {"ok": True}


@app.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: str):
    """자산 + 모든 Run 기록 삭제."""
    store.delete_asset(asset_id)
    return {"ok": True}


@app.get("/api/compare")
def compare(base: str, target: str, asset_id: str = ""):
    """두 Run(base·target)을 항목코드로 비교. base/target은 사용자가 고른 run_id."""
    try:
        return store.compare(base, target)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/compare/report/save")
def save_compare_report(base: str, target: str):
    """두 Run 비교 결과를 HTML 보고서로 영속 저장(report_id = 'cmp-{base}__{target}')."""
    try:
        cmp = store.compare(base, target)
    except ValueError as e:
        raise HTTPException(404, str(e))
    bdf = store.load_run_df(base)
    name = bdf["진단대상"].iloc[0] if (bdf is not None and len(bdf)) else ""
    ip = bdf["진단대상IP"].iloc[0] if (bdf is not None and len(bdf)) else ""
    asset_id = (cmp.get("base") or {}).get("asset_id", "")
    html = report.build_html_report_compare(cmp, meta={"대상": f"{name} ({ip})" if name or ip else ""})
    report_id = f"cmp-{base}__{target}"
    meta = store.save_report_html(
        report_id, html, report_type="비교", asset_id=asset_id,
        name=name, ip=ip, kind="비교",
        filename=f"{(cmp.get('base') or {}).get('원본파일명', '')} → {(cmp.get('target') or {}).get('원본파일명', '')}")
    path = str((config.REPORTS_DIR / meta["파일명"]).resolve())
    return {"ok": True, "report_id": meta["report_id"], "filename": meta["파일명"], "path": path}


@app.get("/api/compare.csv")
def compare_csv(base: str, target: str, asset_id: str = ""):
    """비교 결과 CSV 다운로드(UTF-8 BOM — Excel 한글 호환)."""
    try:
        cdf = store.compare_df(base, target)
    except ValueError as e:
        raise HTTPException(404, str(e))
    data = report.build_compare_csv(cdf)
    fname = quote(f"compare_{base}_vs_{target}.csv")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"},
    )


>>>>>>> Stashed changes
# ── (프로덕션) 빌드된 프론트 정적 서빙: frontend/dist 가 있을 때만 ──
_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _dist.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
