"""
프로젝트 전역 설정 / 상수.

CSV(로우데이터) 컬럼, AI에 넘길 컬럼, 대시보드/보고서 컬럼,
그리고 항목코드 -> 주통기 가이드 PDF 매핑을 한곳에서 관리한다.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

# ── 경로 ────────────────────────────────────────────────────────
# config.py 기준 한 단계 위가 프로젝트 루트("AI agent" 폴더)
ROOT_DIR = Path(__file__).resolve().parent.parent
# 주통기 가이드 PDF 폴더. 'guideline' 우선, 없으면 옛 이름 '가이드라인' 폴백.
GUIDE_DIR = next(
    (ROOT_DIR / n for n in ("guideline", "가이드라인") if (ROOT_DIR / n).is_dir()),
    ROOT_DIR / "guideline",
)

# ── 영속 저장소(로컬 CSV) ──────────────────────────────────────
# 진단대상(자산)·진단실행(Run)을 재시작 후에도 유지하기 위한 CSV 저장소.
# CSV_*는 인덱스(레지스트리), runs/{asset_id}/{run_id}.csv 는 Run별 항목결과.
# (DATA_DIR는 store.py 가 최초 접근 시 생성한다)
DATA_DIR = Path(os.environ.get("VCHECKER_DATA_DIR", str(ROOT_DIR / "data")))
ASSETS_CSV = DATA_DIR / "assets.csv"
RUNS_INDEX_CSV = DATA_DIR / "runs_index.csv"
RUNS_DIR = DATA_DIR / "runs"
# 최종 보고서 HTML 영속 저장소(저장된 보고서 불러오기 기능에서 run_id로 조회).
#   reports/{run_id}.html        보고서 본문(자체 완결형 HTML)
#   reports_index.csv            보고서 메타(인덱스)
# 다운로드 폴더는 자동 정리로 사라질 수 있어, 보고서는 이 '특정 경로'에 영속 저장한다.
# VCHECKER_REPORTS_DIR 로 위치를 바꿀 수 있다(예: C:\취약점진단_보고서).
REPORTS_DIR = Path(os.environ.get("VCHECKER_REPORTS_DIR", str(DATA_DIR / "reports")))
REPORTS_INDEX_CSV = DATA_DIR / "reports_index.csv"

# Run 종류(최초진단/이행점검). 업로드 시 사용자가 수동 선택한다.
RUN_FIRST = "최초진단"
RUN_FOLLOWUP = "이행점검"
VALID_RUN_KINDS = (RUN_FIRST, RUN_FOLLOWUP)

# ── 실행 방식 ───────────────────────────────────────────────────
# claude_agent_sdk + 로컬 claude CLI(구독 인증)만 사용한다. API 키/종량제 과금 없음.
# claude CLI '전체 경로'를 자동 탐지한다 — 파이썬 서버(uvicorn) 프로세스는 셸 PATH/별칭을
# 그대로 못 받거나 Windows에선 확장자(.cmd)가 필요해, bare "claude"로는 SDK가 실행 못 한다.
def _detect_claude_cli() -> str:
    env = os.environ.get("CLAUDE_CLI_PATH")
    if env:
        return env
    home = Path.home()
    # 네이티브 claude.exe 우선 — Windows에서 .cmd 래퍼(cmd→node)는 stdio 제어 프로토콜이 불안정해
    # 'Control request timeout: initialize' + 좀비 프로세스를 유발한다. 네이티브 exe는 안정적.
    native = [
        home / "AppData" / "Roaming" / "npm" / "node_modules" / "@anthropic-ai"
             / "claude-code" / "bin" / "claude.exe",
        home / ".local" / "bin" / "claude.exe",
    ]
    for c in native:
        if c.exists():
            return str(c)
    # PATH 해석(.exe 우선)
    names = ("claude.exe", "claude.cmd", "claude") if sys.platform == "win32" else ("claude",)
    for name in names:
        p = shutil.which(name)
        if p:
            return p
    npm_cmd = home / "AppData" / "Roaming" / "npm" / "claude.cmd"
    if npm_cmd.exists():
        return str(npm_cmd)
    return "claude"


CLAUDE_CLI_PATH = _detect_claude_cli()

# claude CLI 초기화(load) 타임아웃(ms). Windows의 .cmd→node 콜드스타트가 기본값보다 느려
# 'Control request timeout: initialize'가 나므로 넉넉히 둔다.
CLI_LOAD_TIMEOUT_MS = int(os.environ.get("CLAUDE_LOAD_TIMEOUT_MS", "120000"))

# 한 항목 판정(3단계 전체)의 상한 시간(초). 초과하면 그 항목만 오류로 처리하고 넘어간다.
# 기본 2분(120s) — CLI 콜드스타트(CLI_LOAD_TIMEOUT_MS=120s)나 웹검색 단계를 감안한 값.
# 더 느린 환경은 VCHECKER_JUDGE_TIMEOUT(초)로 상향한다.
JUDGE_TIMEOUT_SEC = float(os.environ.get("VCHECKER_JUDGE_TIMEOUT", "120"))

# ── 모델 ────────────────────────────────────────────────────────
# 보안 판단 정확도를 위해 Opus 4.8 기본. (비용 절감 시 claude-sonnet-4-6)
MODEL = os.environ.get("WAS_DIAG_MODEL", "claude-opus-4-8")

# 판정값 (스크립트와 동일 표기)
R_PASS = "양호"
R_VULN = "취약"
R_NA = "N/A"
VALID_RESULTS = (R_PASS, R_VULN, R_NA)


def final_result(confirmed: str, script: str) -> str:
    """최종 결과 선택 규칙: 확정값 우선, 없으면 스크립트결과(양쪽 공백 무시).

    보고서/Run/비교가 공유하는 단일 규칙. 빈 문자열 또는 공백뿐이면 다음으로 폴백.
    """
    return (confirmed or "").strip() or (script or "").strip()


def remediation_for(ai_result: dict, code: str, prefill: dict) -> str:
    """조치방법 선택 규칙: AI 산출값 우선, 없으면 pre-fill 매핑(CSV/가이드).

    대시보드/보고서/Run 저장이 공유하는 단일 규칙.
    """
    return ai_result.get("remediation") or prefill.get(code, "")

# ── CSV(로우데이터) 컬럼 ────────────────────────────────────────
# was_diag.sh 가 출력하는 실제 헤더(필수 — load_csv 가 존재를 검증)
CSV_COLUMNS = [
    "항목코드", "분류", "항목", "판단기준", "결과",
    "점검내용", "진단대상", "진단대상IP", "중요도", "점검파일",
]
# (선택) 스크립트가 가이드 조치방법을 하드코딩해 넣는 열. 있으면 AI 판정 전
#  보고서/엑셀의 '조치방법'을 이 값으로 미리 채운다(없으면 가이드 PDF 자동추출 폴백).
CSV_REMEDIATION_COLUMN = "조치방법"

# (선택) 진단 대상 '사전 항목' — 스크립트가 호스트별로 1회 수집해 넣는 메타.
#  보고서 '1. 진단 대상' 시트의 Hostname/버전정보 칸을 채운다(없으면 공란/'-').
#  ※ CSV 경량화: 전체 행에 반복하지 말고 '첫 행에만' 채워도 된다
#    — 보고서는 '첫 비어있지 않은 값'을 읽으므로 중복 0으로 동일 동작.
CSV_HOSTNAME_COLUMN = "HOSTNAME"
CSV_VERSION_COLUMN = "버전정보"

# AI(LLM)에게 추론 재료로 넘길 컬럼 (토큰 절감 위해 6개로 축소)
#  - '결과'(스크립트 자체 판정)는 넘기지 않는다 → AI가 독립 판단하도록.
#  - 진단대상IP/중요도 등은 대시보드·보고서에서 원본 df로 채우고 AI엔 안 넘긴다.
AI_INPUT_COLUMNS = [
    "항목코드", "항목", "판단기준", "진단대상", "점검내용", "점검파일",
]

# 최종 보고서(Excel) 컬럼
REPORT_COLUMNS = [
    "항목코드", "분류", "중요도", "항목", "판단기준",
    "결과",        # 최종 결과(검토 후 확정)
    "판단근거",    # AI 생성 + 사람 검토(본문만; 결과 라벨은 '결과' 열에 표기)
    "조치방법",    # 취약 항목만: 가이드 PDF 기반 AI 생성 조치문(양호/N/A는 공란)
    "진단대상", "진단대상IP",
]

# Run 영속 CSV 컬럼 — 보고서의 '상위집합'.
# 세션 복원(대시보드 재표시)과 최초↔이행 비교를 모두 지원하기 위해
# 스크립트결과/AI결과/확정결과를 한 행에 모두 보존한다.
RUN_COLUMNS = [
    "항목코드", "분류", "항목", "판단기준", "중요도", "진단대상", "진단대상IP",
    CSV_HOSTNAME_COLUMN, CSV_VERSION_COLUMN,   # 진단대상 시트용 메타(첫 행에만 있어도 됨)
    "스크립트결과", "AI결과", "AI근거", "조치방법",
    "확정결과", "확정근거", "확정여부",
]

# 비교(최초↔이행) 결과 컬럼 + 전이 상태값
COMPARE_COLUMNS = [
    "항목코드", "분류", "항목", "중요도",
    "최초결과", "이행결과", "상태",
]
C_IMPROVED = "개선"      # 취약 → 양호
C_UNFIXED = "미조치"     # 취약 → 취약
C_WORSENED = "악화"      # 양호 → 취약
C_KEPT = "양호유지"      # 양호 → 양호
C_NA = "N/A"            # 한쪽이 N/A·결측

# ── 주통기 가이드 PDF 매핑 ──────────────────────────────────────
# 항목코드 접두어(하이픈 앞) -> 가이드 PDF 파일명.
# 자동화 스크립트가 다루는 5개 분야의 실제 KISA 코드 체계(가이드 PDF에서 확인):
#   WEB-xx → 03_웹_서비스   (Tomcat/WAS + Apache 웹서버, 둘 다 WEB 코드)
#   U-xx   → 01_Unix_서버
#   W-xx   → 02_Windows_서버
#   D-xx   → 08_DBMS
# ※ 매칭은 'PREFIX-' (하이픈 포함)로 해서 W(Windows)와 WEB(웹) 충돌을 방지.
GUIDE_BY_PREFIX = {
    "WEB": "03_웹_서비스.pdf",
    "U":   "01_Unix_서버.pdf",
    "W":   "02_Windows_서버.pdf",
    "D":   "08_DBMS.pdf",
}
DEFAULT_GUIDE = "03_웹_서비스.pdf"


def guide_pdf_for_code(code: str) -> Path | None:
    """항목코드에 맞는 가이드 PDF 경로를 반환. 매칭 실패 시 기본(웹 서비스).

    'PREFIX-' 단위로 매칭하므로 WEB-01 은 WEB 에만, W-01 은 W 에만 매칭된다.
    """
    code = (code or "").strip().upper()
    # 긴 접두어 우선(WEB 가 W 보다 먼저 평가되도록)
    for prefix in sorted(GUIDE_BY_PREFIX, key=len, reverse=True):
        if code.startswith(prefix + "-"):
            path = GUIDE_DIR / GUIDE_BY_PREFIX[prefix]
            return path if path.exists() else None
    path = GUIDE_DIR / DEFAULT_GUIDE
    return path if path.exists() else None
