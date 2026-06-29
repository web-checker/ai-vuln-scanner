# ai-vuln-scanner (V-CHECKER)

KISA 주요정보통신기반시설 기술적 취약점 분석·평가 자동진단 결과(CSV)를 받아,
Claude가 주통기 상세가이드(PDF)와 웹 검색으로 항목별 양호 / 취약 / N/A 와 판단 근거를
다시 판정하고, 스크립트 자체 판정과 교차검증한 뒤 Excel 보고서를 만드는 대시보드.

로우데이터(CSV)를 만드는 진단 스크립트는
[auto-vuln-scanner](https://github.com/web-checker/auto-vuln-scanner) 참고.

## 기능

- 독립 재판정 / 교차검증 — 스크립트 자체 판정(`결과` 컬럼)은 LLM에 넘기지 않는다. 증적과
  판단기준만 주어 따로 판단하게 한 뒤, 스크립트 결과와 비교해 불일치를 표시한다.
- 로컬 claude CLI(구독) — `claude_agent_sdk`가 로컬 `claude`를 호출한다. API 키나 종량 과금
  없이 구독 사용량으로 동작. 모델은 `WAS_DIAG_MODEL`(기본 `claude-opus-4-8`).
- 토큰 절감 3단계 — ① 로우데이터 + 판단기준으로 즉시 판단 → ② 부족하면 가이드 해당 섹션
  텍스트(pypdf 추출) → ③ 버전 / CVE / EOL이 걸리면 웹검색. 대부분 1단계에서 끝난다.
- 자산 관리 — 진단 결과를 진단대상 IP별로 로컬에 저장한다. 같은 대상의 최초진단 / 이행점검
  기록을 모아 보고, 기록을 클릭하면 그때의 요약과 상세를 다시 볼 수 있다.
- 보고서 — 최초 보고서(단일 진단)와 최종 보고서(최초진단 ↔ 이행점검 비교)를 Excel로 받는다.
  5개 시트(표지 / 진단 대상 / 요약 그래프 / 요약 진단결과 / 상세 결과)와 방사형·원형·막대 차트 포함.
- 조치방법 — CSV에 값이 있으면 그대로 쓰고, 값이 없는 취약 항목은 주통기 가이드 PDF의
  '조치 방법' 절에서 채운다. 양호 / N/A 항목에는 넣지 않는다.

## 구조

```
frontend/              React(Vite) 대시보드
  src/App.jsx          전체 화면 구성 / 상태
  src/Sidebar.jsx      업로드 · 진단 종류 · 보고서 · 자산 트리
  src/dashboard.jsx    요약 KPI · 차트 · 보고서 표(현재 세션 / 저장 기록 공용)
  src/Detail.jsx       항목 상세(스크립트 / AI 근거, 확정)
  src/AssetManager.jsx 자산 · 진단기록 목록
  src/RunDetail.jsx    저장된 진단기록 상세
  src/CompareTab.jsx   두 진단 결과 비교
  src/ReportTab.jsx    최초 / 최종 보고서
  src/charts.jsx · ui.jsx · api.js   차트 · 공용 UI · API 호출
server/main.py         FastAPI — ai_app 로직을 /api/* 로 노출 + 빌드된 프론트 정적 서빙
ai_app/
  config.py            컬럼 / 모델 / 가이드 PDF 매핑 / 진단 종류 상수
  preprocess.py        CSV 로드 + AI 입력 / 대시보드 표 가공
  backend.py           판정 진입점(judge_item / ready) — agent_sdk 위임
  agent_sdk.py         Claude 판정 엔진(claude CLI 구독, 3단계 토큰절감)
  guide_index.py       가이드 PDF 항목 섹션 탐지 / 텍스트 추출
  store.py             진단대상(자산) · 진단실행(Run) 로컬 CSV 저장 / 조회 / 비교
  report.py            Excel / CSV 보고서 생성(LLM 없음)
  aio.py               async를 전용 스레드에서 안전 실행(Windows 대응)
guideline/*.pdf        주통기 상세가이드 (WEB→03_웹_서비스, U→01_Unix, W→02_Windows, D→08_DBMS)
run-app.bat            운영 실행 — 프론트 빌드 후 단일 서버(:8600)
run-dev.bat            개발 실행 — 백엔드(:8600) + Vite(:5173) 자동 리로드
smoke_test.py          UI 없이 단건 판정 확인용 CLI
```

진단 이력은 `config.DATA_DIR` 아래에 CSV로 저장된다(`assets.csv`, `runs_index.csv`,
`runs/{asset_id}/{run_id}.csv`). 자산 식별 키는 진단대상 IP라 같은 IP를 다시 올리면
새 자산이 아니라 같은 자산의 새 진단기록으로 쌓인다.

## 실행

```powershell
pip install -r requirements.txt          # Python 백엔드 의존성
# claude CLI 설치 + 구독 로그인(한 번):  claude  →  /login
# Node.js LTS 설치 필요(프론트 빌드용)

run-app.bat        # 운영: 프론트 빌드 → http://localhost:8600 자동 오픈
# 또는
run-dev.bat        # 개발: 백엔드 :8600 + Vite :5173(자동 리로드)
```

브라우저에서 CSV 업로드 → "AI 교차 진단 실행" → 검토 → 자산 저장 / 엑셀 다운로드.
단건 확인(UI 없이): `python smoke_test.py WEB-16`

## 데이터 흐름

```
CSV(로우데이터)
  → 전처리(preprocess): AI에 넘길 항목 / 대시보드 표
  → AI 판정(agent_sdk): ① 즉시판단 → ② 가이드 텍스트 → ③ (부족 시) 웹검색 → 결과 + 근거(JSON)
  → 대시보드: 스크립트 결과 vs AI 결과 비교(불일치 표시)
  → 사용자 검토 / 수정 → 확정
  → 자산 저장(store): 진단대상 IP별 기록 → 이후 이행점검과 시점 비교
  → 보고서(report): 최초 보고서 또는 최초 ↔ 이행점검 최종 보고서(Excel)
```

## AI에 넘기는 것 / 넘기지 않는 것

- 넘김: 항목코드, 항목, 판단기준, 진단대상, 점검내용(로우데이터 원문), 점검파일
- 안 넘김: 스크립트 `결과` — AI가 독립 판단하게 두고, 사후 교차검증에만 쓴다

## 판정 원칙

- `N/A` 는 해당 진단대상의 점검 대상이 아닐 때만. 증적 부족·확인 불가·저확신은 보수적으로 `취약`.
- 검색·열거형 항목(숨김파일 / 계정 / SUID 등)은 정상 나열만으로 양호 결론 금지 — 화이트리스트
  차집합으로 비표준 이상치를 골라내고, 하나라도 있으면 취약.
- 권한 비교는 owner / group / other 칸별 부분집합으로 판단.
