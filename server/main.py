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

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ai_app 패키지 import 보장(프로젝트 루트를 경로에 추가)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ai_app import backend, config, preprocess, report, store  # noqa: E402

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


def _flush(state: dict) -> None:
    """세션 상태를 영속 Run CSV로 저장(덮어쓰기).

    사용자가 '자산목록에 추가'(/api/asset/save)를 누른 세션(persist=True)만 저장한다.
    아직 추가하지 않은 세션은 일회용(메모리)으로만 동작 → AI판정/확정해도 디스크 미기록.
    추가 이후엔 AI판정 완료·확정 저장 시점마다 호출돼 이력이 갱신된다.
    """
    if not state.get("persist"):
        return
    run_df = store.build_run_df(state["df"], state["ai_results"], state["decisions"])
    store.save_run(state["asset_id"], state["run_id"], state["kind"],
                   state.get("filename", ""), run_df)


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
async def upload(file: UploadFile = File(...), run_kind: str = Form(config.RUN_FIRST)):
    """CSV 업로드 → 세션 생성 + 자산 등록 + Run 영속화.

    run_kind: '최초진단' | '이행점검' (사용자가 수동 선택). 같은 진단대상IP면
    기존 자산에 새 Run으로 누적된다.
    """
    if run_kind not in config.VALID_RUN_KINDS:
        run_kind = config.RUN_FIRST
    data = await file.read()
    try:
        df = preprocess.load_csv(data)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"CSV 로드 실패: {e}")
    items = preprocess.to_ai_items(df)
    sid = uuid.uuid4().hex

    # 자산 키(진단대상IP) + Run 메타만 미리 준비. 영속화(register/save)는
    # 사용자가 '자산목록에 추가'를 누를 때까지 하지 않는다(persist=False).
    name, ip, group = store.asset_fields_from_df(df)
    asset_id = store.asset_id_for(ip)
    run_id = store.new_run_id()
    asset_exists = any(a["asset_id"] == asset_id for a in store.list_assets())

    SESSIONS[sid] = {
        "df": df, "items": items, "ai_results": {}, "decisions": {},
        "asset_id": asset_id, "run_id": run_id, "kind": run_kind,
        "filename": file.filename, "name": name, "ip": ip, "group": group,
        "persist": False,
    }
    st = SESSIONS[sid]
    return {"session_id": sid, "filename": file.filename,
            "asset_id": asset_id, "run_id": run_id, "run_kind": run_kind,
            "asset_name": name, "asset_ip": ip,
            "asset_exists": asset_exists, "saved": False,
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

    def gen():
        yield json.dumps({"event": "start", "total": total}, ensure_ascii=False) + "\n"
        done = 0
        for it in targets:
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
        _flush(state)  # AI 판정 결과를 Run CSV에 반영
        yield json.dumps({"event": "done", "total": total}, ensure_ascii=False) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


class DecisionReq(BaseModel):
    session_id: str
    code: str
    result: str
    reason: str = ""


@app.post("/api/decision")
def decision(req: DecisionReq):
    state = _get(req.session_id)
    state["decisions"][req.code] = {"result": req.result, "reason": req.reason}
    _flush(state)  # 확정 결과를 Run CSV에 반영
    return {"ok": True}


class SaveAssetReq(BaseModel):
    session_id: str


@app.post("/api/asset/save")
def save_asset(req: SaveAssetReq):
    """현재 세션을 자산목록에 추가(영속화). 사용자가 확인창에서 '추가'를 누를 때 호출.

    자산을 진단대상IP로 등록하고 persist=True 로 전환한 뒤 Run CSV를 저장한다.
    이후의 AI판정/확정도 같은 Run에 누적 저장된다.
    """
    state = _get(req.session_id)
    store.register_asset(state["name"], state["ip"], state["group"])
    state["persist"] = True
    _flush(state)
    return {"ok": True, "saved": True,
            "asset_id": state["asset_id"], "run_id": state["run_id"]}


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


class ResetReq(BaseModel):
    session_id: str


@app.post("/api/reset")
def reset(req: ResetReq):
    SESSIONS.pop(req.session_id, None)
    return {"ok": True}


# ── 자산관리 / 비교 (영속 CSV) ─────────────────────────────────
def _run_items_payload(run_df) -> list[dict]:
    """Run CSV(RUN_COLUMNS)를 대시보드 항목 페이로드로 변환(읽기전용 조회용)."""
    out = []
    for _, r in run_df.iterrows():
        script = r.get("스크립트결과", "")
        ai_res = r.get("AI결과", "")
        final = r.get("확정결과", "")
        match = "미판정" if not ai_res else ("일치" if ai_res == script else "불일치")
        out.append({
            "code": r.get("항목코드", ""), "group": r.get("분류", ""),
            "name": r.get("항목", ""), "severity": r.get("중요도", ""),
            "criteria": r.get("판단기준", ""), "check": "",
            "target": r.get("진단대상", ""), "ip": r.get("진단대상IP", ""),
            "script": script, "ai": ai_res, "reason": r.get("AI근거", ""),
            "source": "", "confidence": "", "match": match,
            "decided": bool(str(r.get("확정여부", "")).strip()),
            "finalResult": final, "finalReason": r.get("확정근거", ""),
        })
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
    return {"run_id": run_id, "items": _run_items_payload(run_df), "total": len(run_df)}


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


# ── (프로덕션) 빌드된 프론트 정적 서빙: frontend/dist 가 있을 때만 ──
_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _dist.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
