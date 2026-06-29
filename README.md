# ai-vuln-scanner (V-CHECKER)

[![repo: ai-vuln-scanner](https://img.shields.io/badge/repo-ai--vuln--scanner-2ea44f?style=flat-square)](https://github.com/web-checker/ai-vuln-scanner)
[![stack: React + FastAPI](https://img.shields.io/badge/stack-React%20%2B%20FastAPI-61dafb?style=flat-square)](#구조)
[![engine: Claude (claude-opus-4-8)](https://img.shields.io/badge/engine-Claude-blueviolet?style=flat-square)](#특징)
[![purpose: educational](https://img.shields.io/badge/purpose-educational-lightgrey?style=flat-square)](#라이선스--용도)

KISA **주요정보통신기반시설 기술적 취약점 분석·평가** 자동진단 결과(CSV)를 입력받아, Claude가 주통기 상세가이드(PDF)와 웹 검색을 활용해 항목별 **양호 / 취약 / N/A** 와 **판단 근거**를 독립적으로 재판정하고, 스크립트 자체 판정과 교차검증한 뒤 Excel 보고서를 만드는 대시보드입니다.

> 로우데이터(CSV)를 생성하는 진단 스크립트는 별도 저장소 [`auto-vuln-scanner`](https://github.com/web-checker/auto-vuln-scanner)에서 관리합니다([관련 저장소](#관련-저장소) 참고).

---

## 목차

- [특징](#특징)
- [설치 및 실행](#설치-및-실행)
- [구조](#구조)
- [데이터 흐름](#데이터-흐름)
- [판정 원칙](#판정-원칙)
- [관련 저장소](#관련-저장소)
- [기여](#기여)
- [라이선스 / 용도](#라이선스--용도)

---

## 특징

- **독립 재판정** — 스크립트 자체 판정(`결과` 컬럼)은 LLM에 넘기지 않습니다. 증적·판단기준만 주어 편향 없이 판단하게 한 뒤, 스크립트 결과와 **사후 교차검증**하여 불일치를 하이라이트합니다.
- **로컬 claude CLI(구독)** — `claude_agent_sdk`가 로컬 `claude`를 호출합니다. **API 키·종량제 과금이 없으며**(구독 사용량에서 차감), 모델은 `WAS_DIAG_MODEL`(기본 `claude-opus-4-8`)로 지정합니다.
- **토큰 절감 3단계** — ① 로우데이터+판단기준만으로 즉시 판단하고, ② 부족하면 가이드 해당 섹션 **텍스트**(pypdf 추출, 전체 PDF 미사용)를 참조하며, ③ 그래도 애매하면(버전·CVE·EOL) WebSearch를 사용합니다. 대부분 1단계에서 종료됩니다.
- **React + FastAPI** — 업로드 → 판정(NDJSON 스트림) → 검토·수정 → Excel/CSV 보고서로 이어지는 단일 화면 워크플로우를 제공합니다.

---

## 설치 및 실행

### 사전 요구사항
- Python 3.x, Node.js LTS (프론트 빌드용)
- `claude` CLI 설치 + 구독 로그인(최초 1회: `claude` 실행 후 `/login`)

```powershell
pip install -r requirements.txt          # Python 백엔드 의존성
```

### 실행
```powershell
run-app.bat        # 운영: 프론트 빌드 → http://localhost:8600 자동 오픈
# 또는
run-dev.bat        # 개발: 백엔드 :8600 + Vite :5173 (자동 리로드)
```

브라우저에서 CSV 업로드 → "AI 교차 진단 실행" → 검토 → 엑셀 다운로드 순으로 진행합니다.
UI 없이 단건만 확인하려면 `python smoke_test.py WEB-16` 을 실행합니다.

---

## 구조

```
frontend/              React(Vite) 대시보드 UI
  src/App.jsx          업로드 / 판정 / 검토 / 보고서 화면
  src/api.js           FastAPI(/api/*) 호출 헬퍼
server/main.py         FastAPI — ai_app 로직을 /api/* 로 노출 + 빌드된 프론트 정적 서빙
ai_app/
  config.py            컬럼 / 모델 / 가이드 PDF 매핑 등 상수
  preprocess.py        CSV 로드 + AI 입력 / 대시보드 표 가공
  backend.py           판정 진입점(judge_item / ready) — agent_sdk 위임
  agent_sdk.py         Claude 판정 엔진(claude CLI 구독, 3단계 토큰절감)
  guide_index.py       가이드 PDF 항목 섹션 페이지 탐지 / 텍스트 추출
  aio.py               async를 전용 스레드에서 안전 실행(Windows 대응)
  report.py            Excel / CSV 보고서 생성(LLM 없음)
guideline/*.pdf        주통기 상세가이드 (WEB→03_웹_서비스, U→01_Unix, W→02_Windows, D→08_DBMS)
run-app.bat            운영 실행 — 프론트 빌드 후 단일 서버(:8600)
run-dev.bat            개발 실행 — 백엔드(:8600) + Vite(:5173) 자동 리로드
smoke_test.py          UI 없이 단건 판정 확인용 CLI
```

---

## 데이터 흐름

```
CSV(로우데이터)
  → 전처리(preprocess): AI에 넘길 항목 / 대시보드 표
  → AI 판정(agent_sdk): ① 즉시판단 → ② 가이드 텍스트 → ③ (부족 시) 웹검색 → 결과+근거(JSON)
  → 대시보드: 스크립트 결과 vs AI 결과 비교(불일치 하이라이트)
  → 사용자 검토 / 수정 → 확정
  → Excel 보고서(항목코드/분류/항목/판단기준/결과/판단근거/진단대상/IP/중요도)
```

**AI에 넘기는 것 / 넘기지 않는 것**

- **넘김**: 항목코드, 항목, 판단기준, 진단대상, 점검내용(로우데이터 원문), 점검파일
- **안 넘김**: 스크립트 `결과` — AI가 독립 판단하게 하고, 사후 **교차검증**에만 사용합니다.

---

## 판정 원칙

- `N/A` 는 해당 진단대상의 **점검 대상이 아닐 때만** 부여합니다. 증적 부족·확인 불가·저확신은 보수적으로 `취약`으로 판정합니다.
- 검색·열거형 항목(숨김파일·계정·SUID 등)은 정상 나열만으로 양호 결론을 내리지 않습니다. **화이트리스트 차집합**으로 비표준 이상치를 골라내고, 하나라도 있으면 취약으로 판정합니다.
- 권한 비교는 owner / group / other **칸별 부분집합**으로 판단합니다.

---

## 관련 저장소

본 프로젝트(web-checker)는 여러 저장소로 구성됩니다(다중 저장소는 서로 README를 링크합니다).

| 저장소 | 역할 |
| --- | --- |
| [web-checker/ai-vuln-scanner](https://github.com/web-checker/ai-vuln-scanner) | 본 저장소 — AI 교차 진단 대시보드(React + FastAPI) |
| [web-checker/auto-vuln-scanner](https://github.com/web-checker/auto-vuln-scanner) | KISA 자동 진단 스크립트 모음(로우데이터 CSV 생성) |
| [web-checker/checkbang](https://github.com/web-checker/checkbang) | 교육용 취약 버전 도서 쇼핑몰 |
| [web-checker/checkbang-secure](https://github.com/web-checker/checkbang-secure) | 보안 버전 도서 쇼핑몰 |

---

## 기여

- 기여 절차는 [`CONTRIBUTING.md`](CONTRIBUTING.md)를 따릅니다.
- 브랜치/커밋 규칙은 프로젝트 가이드라인의 **Git 워크플로우**(feature 브랜치 작업, `main` 직접 푸시 금지, 제목/본문 분리 커밋)를 따릅니다.
  ```sh
  git checkout -b feature/<작업명>
  ```

---

## 라이선스 / 용도

본 프로젝트는 **교육 및 인가된 보안 진단 실습** 목적입니다.
