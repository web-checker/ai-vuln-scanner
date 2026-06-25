"""
claude_agent_sdk 백엔드 — 로컬 claude CLI(구독 인증). API 키/추가비용 없음.

토큰 절감형 3단계 판정 흐름:
  1단계  점검파일 + 점검내용(로우데이터) + 판단기준만으로 '바로 판단' 시도
         → 명확하면 여기서 종료 (가이드 PDF/웹검색 비용 0)
  2단계  불충분하면 가이드 '텍스트'(pypdf 추출, 해당 항목 페이지만) 확인
  3단계  그래도 애매하면(최신 버전/CVE 등) WebSearch 도구로 보충

출력은 '판단 결과 + 근거'만. (그 외 필드는 LLM이 만들지 않음)
PDF 읽기는 pypdf로 고정(이미지 첨부 X) → 토큰 대폭 절감.
"""
from __future__ import annotations

import json

import claude_agent_sdk as csdk

from . import aio, config, guide_index

_SYSTEM = """\
당신은 KISA '주요정보통신기반시설 기술적 취약점 분석·평가' 기준으로
보안 점검 항목을 판정하는 전문가다.

[판정값] 양호 / 취약 / N/A
- N/A 는 이 항목이 해당 진단대상의 '점검 대상이 아닐 때'만 사용한다. 그 외 사유로 N/A 금지.
- 증적 부족·확인 불가·확신이 낮으면 보수적으로 '취약'으로 판정한다(양호/N/A 로 묻지 않는다).

[이상치 우선] '검색·열거'형 항목(숨김파일/계정/그룹/SUID/world-writable/서비스 등)은
정상 항목을 나열하는 것만으로 '양호'를 결론내지 마라.
- 표준/정상으로 알려진 패턴에 매칭되지 '않는' 항목을 반드시 '의심'으로 따로 골라내라(화이트리스트 차집합).
- 의심 항목이 하나라도 있으면 '취약'. 다수의 정상에 묻혀 소수 이상치(예: 홈 디렉터리의 비표준 실행 숨김파일)를 누락하지 마라.

[결정론적 사실] 권한·소유자·존재·구동여부는 점검내용의 원시 라인을 그대로 근거로 삼는다.
- 권한 비교는 owner/group/other '칸별 부분집합'으로 한다(예: 644 는 640 의 부분집합 아님 — other 읽기 초과).

[근거 형식] reason 은 한국어 '불릿 여러 줄'(각 줄 '- '로 시작)로 쓴다.
- 불릿과 불릿 사이에는 반드시 '빈 줄 하나'를 넣어 한 줄 띄운다(즉 각 불릿은 "\\n\\n" 로 구분).
  예) "- 첫 번째 근거\\n\\n- 두 번째 근거\\n\\n- 세 번째 근거"
- 각 불릿은 (판단기준의 어느 조건) ↔ (점검내용의 어느 라인/값) 대응을 구체적으로.
- 의심/이상치가 있으면 그 항목을 불릿에 반드시 명시.

지정한 JSON만 출력한다.
"""

# 1단계: 로우데이터만으로 판단 시도
_P1 = """\
점검파일·점검내용(로우데이터)·판단기준만으로 판정 가능하면
result(양호/취약/N/A)와 reason(불릿 형식)을 채우고 need_more=false.
판단에 가이드(점검방법/조치사례) 확인이 꼭 필요할 때만 result 비우고 need_more=true.
JSON만 출력: {"result":"", "reason":"", "need_more":true|false}"""

# 2단계: 가이드 텍스트까지 보고 판단
_P2 = """\
[가이드 발췌]와 점검내용·판단기준을 종합해 판정하라. reason 은 불릿 형식.
명확하면 result/reason 채우고 need_web=false.
외부 최신정보(버전/CVE/EOL)가 꼭 필요할 때만 result 비우고 need_web=true.
JSON만 출력: {"result":"", "reason":"", "need_web":true|false}"""

# 3단계: 웹검색으로 최종 판단
_P3 = """\
WebSearch 로 필요한 최신 정보만 확인해 최종 판정하라. reason 은 불릿 형식이며 확인 출처를 포함.
JSON만 출력: {"result":"양호|취약|N/A", "reason":"근거"}"""


def _item_text(item: dict) -> str:
    return "\n".join([
        f"[항목코드] {item.get('항목코드','')}",
        f"[점검항목] {item.get('항목','')}",
        f"[진단대상] {item.get('진단대상','')}",
        f"[점검파일] {item.get('점검파일','')}",
        f"[판단기준]\n{item.get('판단기준','')}",
        f"[점검내용(로우데이터)]\n{item.get('점검내용','')}",
    ])


def judge_item(item: dict) -> dict:
    """3단계 판정(동기). 반환: {result, reason, source, guide, usage, ...}"""
    return aio.run(_judge_async, item, timeout=config.JUDGE_TIMEOUT_SEC)


async def _judge_async(item: dict) -> dict:
    code = item.get("항목코드", "")
    base = _item_text(item)
    cost = 0.0

    # ── 1단계: 로우데이터만으로 ──────────────────────────────
    d1, c1 = await _ask(base + "\n\n" + _P1)
    cost += c1
    if _has_result(d1) and not d1.get("need_more"):
        return _final(d1, "즉시판단(로우데이터)", "", cost)

    # ── 2단계: 가이드 텍스트 ────────────────────────────────
    guide_note = ""
    gtext = None
    guide_path = config.guide_pdf_for_code(code)
    if guide_path is not None:
        gtext = guide_index.section_text(str(guide_path), code)
        rng = guide_index.page_range(str(guide_path), code)
        if gtext and rng:
            guide_note = f"{guide_path.name} (p{rng[0]+1}-{rng[1]+1})"

    carry = d1  # 폴백용
    if gtext:
        prompt2 = f"{base}\n\n[가이드 발췌]\n{gtext}\n\n{_P2}"
        d2, c2 = await _ask(prompt2)
        cost += c2
        carry = d2
        if _has_result(d2) and not d2.get("need_web"):
            return _final(d2, "가이드확인", guide_note, cost)

    # ── 3단계: 웹검색 ───────────────────────────────────────
    prompt3 = base + (f"\n\n[가이드 발췌]\n{gtext}" if gtext else "") + "\n\n" + _P3
    d3, c3 = await _ask(prompt3, web=True)
    cost += c3
    final = d3 if _has_result(d3) else carry
    return _final(final, "웹검색", guide_note, cost)


async def _ask(prompt: str, *, web: bool = False, _attempts: int = 2) -> tuple[dict, float]:
    """단일 SDK 호출 → (파싱된 JSON dict, 환산비용).

    claude CLI 는 모델 답변(턴)을 정상 생성한 뒤에도 후처리에서 비정상 종료(exit≠0,
    is_error=True/subtype=success)하며 ProcessError 를 던질 수 있다. 이때 답변 텍스트는
    이미 수신돼 있으므로 '받아둔 chunks 를 구제'한다. 답변 자체가 없을 때만 재시도한다.
    """
    opts = csdk.ClaudeAgentOptions(
        cli_path=config.CLAUDE_CLI_PATH,
        model=config.MODEL,
        system_prompt=_SYSTEM,
        allowed_tools=(["WebSearch"] if web else []),
        permission_mode=("bypassPermissions" if web else "default"),
        # 도구 없는 단계는 보통 1턴에 끝나지만, 모델이 사고(thinking)/형식정리로 한 턴 더
        # 쓰면 max_turns=1 에서 'Reached maximum number of turns (1)'로 터진다. 여유를 둔다.
        max_turns=(6 if web else 3),
        load_timeout_ms=config.CLI_LOAD_TIMEOUT_MS,   # .cmd→node 콜드스타트 대비
    )
    last_exc: Exception | None = None
    for _ in range(max(1, _attempts)):
        chunks: list[str] = []
        cost = 0.0
        try:
            async for msg in csdk.query(prompt=prompt, options=opts):
                if type(msg).__name__ == "AssistantMessage":
                    for b in getattr(msg, "content", []):
                        t = getattr(b, "text", None)
                        if t:
                            chunks.append(t)
                elif type(msg).__name__ == "ResultMessage":
                    cost = getattr(msg, "total_cost_usd", 0.0) or 0.0
            return _parse_json("\n".join(chunks)), cost
        except Exception as e:  # noqa: BLE001  (CLI 후처리 비정상종료 등)
            last_exc = e
            # 모델 답변을 이미 받았으면(=유효 JSON) 예외와 무관하게 그대로 사용 — 재시도 불필요
            salvaged = _parse_json("\n".join(chunks))
            if salvaged:
                return salvaged, cost
            # 답변 자체가 없을 때만 다음 루프에서 재시도
    raise last_exc if last_exc else RuntimeError("판정 호출 실패(원인 불명)")


def _parse_json(text: str) -> dict:
    text = (text or "").strip()
    try:
        d = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        s, e = text.find("{"), text.rfind("}")
        try:
            d = json.loads(text[s:e + 1]) if s != -1 and e > s else {}
        except json.JSONDecodeError:
            d = {}
    return d if isinstance(d, dict) else {}


def _has_result(d: dict) -> bool:
    return d.get("result", "") in config.VALID_RESULTS


def _final(d: dict, source: str, guide: str, cost: float) -> dict:
    result = d.get("result", "")
    if result not in config.VALID_RESULTS:
        # 결과 파싱 실패/불확실 → 보수적으로 '취약'(N/A로 묻지 않는다). N/A는 대상외 항목만(사전 자동채택).
        result = config.R_VULN
    return {
        "result": result,
        "reason": d.get("reason", "(판단 근거 없음)"),
        "source": source,          # 어느 단계에서 판정했는지(표시용)
        "guide": guide,
        "usage": {"cost_usd": cost},
        "stop_reason": "end_turn",
    }
