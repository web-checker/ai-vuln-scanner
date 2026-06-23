"""
단건 스모크 테스트 — 웹 UI 없이 AI 판정 한 항목을 실행해 본다.

사용법 (claude CLI 구독 로그인 필요: claude → /login):
  python smoke_test.py                      # CSV 첫 점검대상 항목 자동 선택
  python smoke_test.py WEB-16               # 특정 항목코드 지정
  python smoke_test.py WEB-16 다른파일.csv  # CSV도 지정
"""
from __future__ import annotations

import glob
import sys

from ai_app import backend, config, guide_index, preprocess

# Windows 콘솔(cp949)에서 한글·em-dash 등 출력 시 UnicodeEncodeError 방지
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def main() -> None:
    args = [a for a in sys.argv[1:]]
    code = next((a for a in args if a.upper().startswith(("WEB", "U-", "DB", "W-"))), None)
    csv = next((a for a in args if a.lower().endswith(".csv")), None)
    if csv is None:
        candidates = sorted(glob.glob("was_diag_raw_*.csv"))
        if not candidates:
            sys.exit("CSV를 찾을 수 없습니다. 인자로 .csv 경로를 주세요.")
        csv = candidates[-1]

    df = preprocess.load_csv(csv)
    items = preprocess.to_ai_items(df)

    # 대상 항목 선택: 코드 지정 없으면 첫 '점검대상(N/A 아님)' 항목
    if code:
        item = next((i for i in items if i["항목코드"].upper() == code.upper()), None)
        if item is None:
            sys.exit(f"{code} 항목이 CSV에 없습니다.")
    else:
        item = next((i for i in items if not i["_skip"]), items[0])

    code = item["항목코드"]
    guide = config.guide_pdf_for_code(code)
    rng = guide_index.page_range(str(guide), code) if guide else None

    print("=" * 64)
    print(f"CSV       : {csv}")
    print(f"실행       : Claude CLI(구독)")
    print(f"모델       : {config.MODEL}")
    print(f"항목       : {code} · {item['항목']}")
    print(f"가이드 발췌 : {guide.name if guide else '없음'}"
          + (f" p{rng[0]+1}-{rng[1]+1}" if rng else ""))
    print(f"스크립트 결과: {item['_스크립트결과']}")
    print("=" * 64)
    print("AI 판정 중... (가이드 문서탐색 + 필요시 웹검색)\n")

    res = backend.judge_item(item)

    print(f"[AI 결과]  {res['result']}   (스크립트: {item['_스크립트결과']})")
    print(f"[판정단계] {res.get('source')}  |  {res.get('guide','')}")
    print(f"[stop]    {res.get('stop_reason')}")
    print("\n[판단 근거]")
    print(res["reason"])

    match = "[일치]" if res["result"] == item["_스크립트결과"] else "[불일치]"
    print(f"\n교차검증: {match}")

    # 사용량 (구독: 실제 청구 X, 구독 사용량에서 차감 — 환산비용만 표시)
    u = res.get("usage") or {}
    if "cost_usd" in u:
        cost1 = u["cost_usd"]
        print("\n[사용량 — 이 1항목] (구독: 실제 청구 X, 구독 사용량에서 차감)")
        print(f"  환산비용 ≈ ${cost1:.4f}")


if __name__ == "__main__":
    main()
