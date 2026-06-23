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


class ResetReq(BaseModel):
    session_id: str


@app.post("/api/reset")
def reset(req: ResetReq):
    SESSIONS.pop(req.session_id, None)
    return {"ok": True}


# ── (프로덕션) 빌드된 프론트 정적 서빙: frontend/dist 가 있을 때만 ──
_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _dist.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
