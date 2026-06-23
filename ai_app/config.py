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

# ── 모델 ────────────────────────────────────────────────────────
# 보안 판단 정확도를 위해 Opus 4.8 기본. (비용 절감 시 claude-sonnet-4-6)
MODEL = os.environ.get("WAS_DIAG_MODEL", "claude-opus-4-8")

# 판정값 (스크립트와 동일 표기)
R_PASS = "양호"
R_VULN = "취약"
R_NA = "N/A"
VALID_RESULTS = (R_PASS, R_VULN, R_NA)

# ── CSV(로우데이터) 컬럼 ────────────────────────────────────────
# was_diag.sh 가 출력하는 실제 헤더
CSV_COLUMNS = [
    "항목코드", "분류", "항목", "판단기준", "결과",
    "점검내용", "진단대상", "진단대상IP", "중요도", "점검파일",
]

# AI(LLM)에게 추론 재료로 넘길 컬럼 (토큰 절감 위해 6개로 축소)
#  - '결과'(스크립트 자체 판정)는 넘기지 않는다 → AI가 독립 판단하도록.
#  - 진단대상IP/중요도 등은 대시보드·보고서에서 원본 df로 채우고 AI엔 안 넘긴다.
AI_INPUT_COLUMNS = [
    "항목코드", "항목", "판단기준", "진단대상", "점검내용", "점검파일",
]

# 대시보드 테이블에 띄울 컬럼 (스크립트 결과 vs AI 결과 비교 포함)
DASHBOARD_COLUMNS = [
    "항목코드", "분류", "항목", "중요도",
    "스크립트결과",  # 스크립트 자체 판정
    "AI결과",        # AI 판단 결과
    "일치여부",
    "진단대상", "진단대상IP",
]

# 최종 보고서(Excel) 컬럼
REPORT_COLUMNS = [
    "항목코드", "분류", "항목", "판단기준",
    "결과",        # 최종 결과(검토 후 확정)
    "판단근거",    # AI 생성 + 사람 검토
    "진단대상", "진단대상IP", "중요도",
]

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
