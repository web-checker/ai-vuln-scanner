"""
로컬 CSV 영속 계층 — 진단대상(자산) / 진단실행(Run) 저장·조회·비교.

현재 서버는 세션(메모리)만 쓰므로 재시작 시 진단 이력이 소멸한다. 이 모듈은
진단 결과를 로컬 CSV로 영속화해 "일회용이 아닌" 자산관리/시점별 비교를 가능케 한다.

레이아웃 (config.DATA_DIR 기준):
    assets.csv                       자산 레지스트리(인덱스)
    runs_index.csv                   모든 Run 메타(인덱스)
    runs/{asset_id}/{run_id}.csv     Run별 항목결과(config.RUN_COLUMNS)

자산 식별 키는 '진단대상IP'(사용자 결정). 같은 IP 재업로드는 새 자산이 아니라
기존 자산의 새 Run으로 누적된다.

CSV는 모두 UTF-8 BOM(utf-8-sig) + dtype=str 로 읽고 쓴다(Excel 호환·타입 안정).
"""
from __future__ import annotations

import shutil
import uuid
from datetime import datetime
from pathlib import Path

import pandas as pd

from . import config

# 인덱스 CSV 컬럼
ASSET_COLUMNS = ["asset_id", "진단대상명", "진단대상IP", "분류", "최초등록일", "최근진단일"]
RUN_INDEX_COLUMNS = ["run_id", "asset_id", "종류", "일시", "원본파일명", "총항목", "취약", "양호", "NA"]


# ── 공통 유틸 ──────────────────────────────────────────────────
def _ensure_dirs() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.RUNS_DIR.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _read_index(path: Path, columns: list[str]) -> pd.DataFrame:
    """인덱스 CSV를 DataFrame으로 읽는다. 없으면 빈 표(지정 컬럼)."""
    if not path.exists():
        return pd.DataFrame(columns=columns)
    df = pd.read_csv(path, dtype=str, encoding="utf-8-sig", keep_default_na=False)
    for c in columns:
        if c not in df.columns:
            df[c] = ""
    return df[columns]


def _write_csv(path: Path, df: pd.DataFrame) -> None:
    """DataFrame을 UTF-8 BOM CSV로 저장(Excel 한글 호환)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8-sig")


def asset_id_for(ip: str) -> str:
    """진단대상IP를 파일시스템 안전한 asset_id로 정규화.

    192.168.0.10 -> 192_168_0_10,  fe80::1 -> fe80--1.
    IP가 비면 'unknown'.
    """
    ip = (ip or "").strip()
    if not ip:
        return "unknown"
    safe = "".join(ch if ch.isalnum() else ("_" if ch == "." else "-") for ch in ip)
    return safe.strip("_-") or "unknown"


def asset_fields_from_df(df: pd.DataFrame) -> tuple[str, str, str]:
    """업로드된 진단 CSV에서 자산 대표값(진단대상명, IP, 분류)을 추출.

    한 CSV는 보통 단일 진단대상이라 첫 비어있지 않은 값을 대표로 쓴다.
    """
    def first(col: str) -> str:
        if col not in df.columns:
            return ""
        for v in df[col]:
            if str(v).strip():
                return str(v).strip()
        return ""
    return first("진단대상"), first("진단대상IP"), first("분류")


# ── 자산 ───────────────────────────────────────────────────────
def register_asset(name: str, ip: str, group: str) -> str:
    """진단대상IP로 자산을 조회/생성(upsert)하고 asset_id를 반환.

    이미 있으면 최근진단일·대표값을 갱신, 없으면 새로 등록(최초등록일 기록).
    """
    _ensure_dirs()
    aid = asset_id_for(ip)
    now = _now_iso()
    df = _read_index(config.ASSETS_CSV, ASSET_COLUMNS)
    mask = df["asset_id"] == aid
    if mask.any():
        i = df.index[mask][0]
        df.at[i, "진단대상명"] = name or df.at[i, "진단대상명"]
        df.at[i, "진단대상IP"] = ip or df.at[i, "진단대상IP"]
        df.at[i, "분류"] = group or df.at[i, "분류"]
        df.at[i, "최근진단일"] = now
    else:
        df = pd.concat([df, pd.DataFrame([{
            "asset_id": aid, "진단대상명": name, "진단대상IP": ip, "분류": group,
            "최초등록일": now, "최근진단일": now,
        }])], ignore_index=True)
    _write_csv(config.ASSETS_CSV, df)
    return aid


def list_assets() -> list[dict]:
    """자산 목록 + 자산별 Run 수. 최근진단일 내림차순."""
    df = _read_index(config.ASSETS_CSV, ASSET_COLUMNS)
    runs = _read_index(config.RUNS_INDEX_CSV, RUN_INDEX_COLUMNS)
    counts = runs.groupby("asset_id").size().to_dict() if len(runs) else {}
    out = []
    for _, row in df.iterrows():
        aid = row["asset_id"]
        out.append({
            "asset_id": aid,
            "name": row["진단대상명"],
            "ip": row["진단대상IP"],
            "group": row["분류"],
            "firstSeen": row["최초등록일"],
            "lastSeen": row["최근진단일"],
            "runCount": int(counts.get(aid, 0)),
        })
    out.sort(key=lambda a: a["lastSeen"], reverse=True)
    return out


# ── Run(진단실행) ──────────────────────────────────────────────
def new_run_id() -> str:
    """정렬 가능한 Run ID: {yyyymmdd-HHMMSS}-{hex4}."""
    return datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:4]


def _final_result(row: pd.Series) -> str:
    """확정결과 우선, 없으면 스크립트결과(config.final_result 공통 규칙)."""
    return config.final_result(row.get("확정결과", ""), row.get("스크립트결과", ""))


def build_run_df(df: pd.DataFrame, ai_results: dict[str, dict], decisions: dict[str, dict],
                 guide_remed: dict[str, str] | None = None) -> pd.DataFrame:
    """세션 상태(원본 df + AI결과 + 확정 + 조치방법)를 RUN_COLUMNS DataFrame으로 조립."""
    from .preprocess import restore_multiline

    gr = guide_remed or {}
    rows = []
    for _, row in df.iterrows():
        code = row.get("항목코드", "")
        ai = ai_results.get(code, {})
        dec = decisions.get(code, {})
        rows.append({
            "항목코드": code,
            "분류": row.get("분류", ""),
            "항목": row.get("항목", ""),
            "판단기준": row.get("판단기준", ""),
            "중요도": row.get("중요도", ""),
            "진단대상": row.get("진단대상", ""),
            "진단대상IP": row.get("진단대상IP", ""),
            "스크립트결과": row.get("결과", ""),
            "AI결과": ai.get("result", ""),
            "AI근거": ai.get("reason", "") or restore_multiline(row.get("점검내용", "")),
            # 조치방법: AI 산출값 우선, 없으면 가이드 매핑(pre-fill)
            "조치방법": ai.get("remediation") or gr.get(code, ""),
            "확정결과": dec.get("result", ""),
            "확정근거": dec.get("reason", ""),
            "확정여부": "Y" if dec else "",
        })
    return pd.DataFrame(rows, columns=config.RUN_COLUMNS)


def save_run(asset_id: str, run_id: str, kind: str, filename: str, run_df: pd.DataFrame) -> dict:
    """Run 항목결과 CSV를 저장(덮어쓰기)하고 runs_index를 upsert. 메타를 반환.

    확정 갱신마다 다시 호출 → run_id 단위 덮어쓰기라 동시성 충돌이 적다.
    """
    _ensure_dirs()
    run_path = config.RUNS_DIR / asset_id / f"{run_id}.csv"
    _write_csv(run_path, run_df)

    finals = run_df.apply(_final_result, axis=1) if len(run_df) else pd.Series([], dtype=str)
    meta = {
        "run_id": run_id,
        "asset_id": asset_id,
        "종류": kind,
        "일시": _now_iso(),
        "원본파일명": filename or "",
        "총항목": str(len(run_df)),
        "취약": str(int((finals == config.R_VULN).sum())),
        "양호": str(int((finals == config.R_PASS).sum())),
        "NA": str(int((finals == config.R_NA).sum())),
    }
    idx = _read_index(config.RUNS_INDEX_CSV, RUN_INDEX_COLUMNS)
    mask = idx["run_id"] == run_id
    if mask.any():
        i = idx.index[mask][0]
        # 최초 등록 일시는 보존하고 카운트/종류/파일명만 갱신
        meta["일시"] = idx.at[i, "일시"] or meta["일시"]
        for k, v in meta.items():
            idx.at[i, k] = v
    else:
        idx = pd.concat([idx, pd.DataFrame([meta])], ignore_index=True)
    _write_csv(config.RUNS_INDEX_CSV, idx)
    return meta


def list_runs(asset_id: str) -> list[dict]:
    """자산의 Run 목록(일시 오름차순 = 시간순)."""
    idx = _read_index(config.RUNS_INDEX_CSV, RUN_INDEX_COLUMNS)
    rows = idx[idx["asset_id"] == asset_id]
    out = [{
        "run_id": r["run_id"], "asset_id": r["asset_id"], "kind": r["종류"],
        "at": r["일시"], "filename": r["원본파일명"],
        "total": int(r["총항목"] or 0), "vuln": int(r["취약"] or 0),
        "pass": int(r["양호"] or 0), "na": int(r["NA"] or 0),
    } for _, r in rows.iterrows()]
    out.sort(key=lambda x: x["at"])
    return out


def _run_meta(run_id: str) -> dict | None:
    idx = _read_index(config.RUNS_INDEX_CSV, RUN_INDEX_COLUMNS)
    m = idx[idx["run_id"] == run_id]
    return m.iloc[0].to_dict() if len(m) else None


def load_run_df(run_id: str) -> pd.DataFrame | None:
    """Run 항목결과 CSV를 RUN_COLUMNS DataFrame으로 로드. 없으면 None."""
    meta = _run_meta(run_id)
    if meta is None:
        return None
    path = config.RUNS_DIR / meta["asset_id"] / f"{run_id}.csv"
    if not path.exists():
        return None
    return pd.read_csv(path, dtype=str, encoding="utf-8-sig", keep_default_na=False)


# ── 비교(최초 ↔ 이행) ─────────────────────────────────────────
def _status(base: str, target: str) -> str:
    b = (base or "").strip()
    t = (target or "").strip()
    if b == config.R_VULN and t == config.R_PASS:
        return config.C_IMPROVED
    if b == config.R_VULN and t == config.R_VULN:
        return config.C_UNFIXED
    if b == config.R_PASS and t == config.R_VULN:
        return config.C_WORSENED
    if b == config.R_PASS and t == config.R_PASS:
        return config.C_KEPT
    return config.C_NA


def compare(base_run_id: str, target_run_id: str) -> dict:
    """두 Run을 항목코드로 outer join해 전이 상태를 계산.

    각 항목 결과는 _final_result(확정 우선, 없으면 스크립트). base/target은
    사용자가 직접 고른 run_id(최초·이행 자유 조합).
    반환: {"columns", "rows", "summary", "base", "target"}.
    """
    bdf = load_run_df(base_run_id)
    tdf = load_run_df(target_run_id)
    if bdf is None or tdf is None:
        raise ValueError("비교할 Run을 찾을 수 없습니다.")

    def fin_map(d: pd.DataFrame) -> dict[str, str]:
        return {str(r["항목코드"]): _final_result(r) for _, r in d.iterrows()}

    bfin, tfin = fin_map(bdf), fin_map(tdf)
    # 메타(분류/항목/중요도)는 base 우선, 없으면 target
    meta: dict[str, dict] = {}
    for d in (tdf, bdf):  # base가 나중에 덮어쓰도록 target 먼저
        for _, r in d.iterrows():
            meta[str(r["항목코드"])] = {
                "분류": r.get("분류", ""), "항목": r.get("항목", ""), "중요도": r.get("중요도", ""),
            }

    codes = sorted(set(bfin) | set(tfin), key=lambda c: (c is None, c))
    rows = []
    counts = {config.C_IMPROVED: 0, config.C_UNFIXED: 0, config.C_WORSENED: 0,
              config.C_KEPT: 0, config.C_NA: 0}
    for code in codes:
        b, t = bfin.get(code, ""), tfin.get(code, "")
        st = _status(b, t)
        counts[st] += 1
        m = meta.get(code, {})
        rows.append({
            "항목코드": code, "분류": m.get("분류", ""), "항목": m.get("항목", ""),
            "중요도": m.get("중요도", ""), "최초결과": b, "이행결과": t, "상태": st,
        })

    base_vuln = counts[config.C_IMPROVED] + counts[config.C_UNFIXED]  # 최초 취약 모수
    fix_rate = round(counts[config.C_IMPROVED] / base_vuln * 100) if base_vuln else None
    return {
        "columns": config.COMPARE_COLUMNS,
        "rows": rows,
        "summary": {
            "improved": counts[config.C_IMPROVED],
            "unfixed": counts[config.C_UNFIXED],
            "worsened": counts[config.C_WORSENED],
            "kept": counts[config.C_KEPT],
            "na": counts[config.C_NA],
            "baseVuln": base_vuln,
            "fixRate": fix_rate,
        },
        "base": _run_meta(base_run_id),
        "target": _run_meta(target_run_id),
    }


def compare_df(base_run_id: str, target_run_id: str) -> pd.DataFrame:
    """비교 결과를 COMPARE_COLUMNS DataFrame으로(엑셀 변환용)."""
    res = compare(base_run_id, target_run_id)
    return pd.DataFrame(res["rows"], columns=config.COMPARE_COLUMNS)


# ── 삭제 ───────────────────────────────────────────────────────
def _remove_asset_entry(asset_id: str) -> None:
    assets = _read_index(config.ASSETS_CSV, ASSET_COLUMNS)
    assets = assets[assets["asset_id"] != asset_id]
    _write_csv(config.ASSETS_CSV, assets)


def delete_run(run_id: str) -> bool:
    """진단 기록(Run) 1건 삭제. Run CSV + runs_index 행 제거.

    삭제 후 해당 자산에 Run이 하나도 없으면 자산 자체도 목록에서 제거한다.
    """
    idx = _read_index(config.RUNS_INDEX_CSV, RUN_INDEX_COLUMNS)
    row = idx[idx["run_id"] == run_id]
    if not len(row):
        return False
    asset_id = row.iloc[0]["asset_id"]
    csv_path = config.RUNS_DIR / asset_id / f"{run_id}.csv"
    if csv_path.exists():
        csv_path.unlink()
    idx = idx[idx["run_id"] != run_id]
    _write_csv(config.RUNS_INDEX_CSV, idx)
    if not len(idx[idx["asset_id"] == asset_id]):
        _remove_asset_entry(asset_id)
        shutil.rmtree(config.RUNS_DIR / asset_id, ignore_errors=True)
    return True


def delete_asset(asset_id: str) -> bool:
    """자산 + 그 자산의 모든 Run 기록을 삭제."""
    _remove_asset_entry(asset_id)
    idx = _read_index(config.RUNS_INDEX_CSV, RUN_INDEX_COLUMNS)
    idx = idx[idx["asset_id"] != asset_id]
    _write_csv(config.RUNS_INDEX_CSV, idx)
    shutil.rmtree(config.RUNS_DIR / asset_id, ignore_errors=True)
    return True
