"""
가이드 PDF 페이지 인덱서 / 슬라이서.

전체 가이드(예: 03_웹_서비스.pdf 82쪽)를 항목마다 통째로 첨부하면 토큰이 낭비된다.
이 모듈은 PDF를 스캔해 항목코드(WEB-xx)별 섹션 페이지 범위를 동적으로 찾고,
해당 범위만 잘라 base64로 반환한다. (페이지 번호 하드코딩 회피)

탐지 휴리스틱
  - 한 페이지에 코드가 4개 이상 = 목차/요약 → 섹션 시작에서 제외
  - 코드의 섹션 시작 = 그 코드가 처음 등장하는 '비-목차' 페이지
  - 섹션 끝 = 다음 코드의 섹션 시작 직전 페이지 (마지막 코드는 PDF 끝)
"""
from __future__ import annotations

import re
from functools import lru_cache

from pypdf import PdfReader

# KISA 항목코드는 항상 '대문자1~4 - 두자리'(WEB-01, U-05, D-12 …).
# 앞뒤 경계를 둬서 SHA-256 / AES-256 같은 3자리 본문 노이즈를 배제한다.
_CODE_RE = re.compile(r"(?<![A-Za-z0-9])[A-Z]{1,4}-\d{2}(?![0-9])")
_TOC_THRESHOLD = 4  # 한 페이지에 코드가 이 개수 이상이면 목차로 간주


@lru_cache(maxsize=8)
def _page_codes(path_str: str) -> tuple[tuple[int, frozenset[str]], ...]:
    """각 페이지의 (페이지번호, 등장 코드 집합) 목록을 캐시."""
    reader = PdfReader(path_str)
    out = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        codes = frozenset(_CODE_RE.findall(text))
        out.append((i, codes))
    return tuple(out)


@lru_cache(maxsize=8)
def build_index(path_str: str) -> dict[str, tuple[int, int]]:
    """{코드: (시작페이지, 끝페이지)} 인덱스 생성(0-based, 끝 포함)."""
    pages = _page_codes(path_str)
    n_pages = len(pages)

    # 1) 코드별 섹션 시작 페이지 (목차 페이지 제외)
    starts: dict[str, int] = {}
    for page_no, codes in pages:
        if len(codes) >= _TOC_THRESHOLD:
            continue  # 목차/요약 페이지
        for code in codes:
            starts.setdefault(code, page_no)  # 첫 등장만

    if not starts:
        return {}

    # 2) 시작 페이지 순으로 정렬 → 끝 = 다음 섹션 시작 - 1
    ordered = sorted(starts.items(), key=lambda kv: kv[1])
    index: dict[str, tuple[int, int]] = {}
    for idx, (code, start) in enumerate(ordered):
        end = ordered[idx + 1][1] - 1 if idx + 1 < len(ordered) else n_pages - 1
        index[code] = (start, max(start, end))
    return index


@lru_cache(maxsize=64)
def section_text(path_str: str, code: str) -> str | None:
    """항목코드 섹션 페이지의 텍스트를 pypdf로 추출해 반환. 못 찾으면 None.

    PDF를 이미지로 첨부하는 대신 텍스트만 넘겨 토큰을 크게 아낀다.
    (이 가이드들은 pypdf 한글 추출 품질이 양호함을 확인함)
    """
    index = build_index(path_str)
    rng = index.get(code.strip().upper())
    if rng is None:
        return None
    start, end = rng
    reader = PdfReader(path_str)
    parts = []
    for i in range(start, min(end + 1, len(reader.pages))):
        parts.append(reader.pages[i].extract_text() or "")
    text = "\n".join(parts).strip()
    return text or None


def page_range(path_str: str, code: str) -> tuple[int, int] | None:
    """디버그/표시용: 항목의 (시작, 끝) 페이지(0-based)."""
    return build_index(path_str).get(code.strip().upper())
