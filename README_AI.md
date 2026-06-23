# WAS 진단 AI 판정 대시보드

`was_diag.sh` 가 만든 로우데이터 CSV를 입력받아, Claude가 주통기 가이드(PDF)와
웹 검색을 활용해 항목별로 **양호/취약/N/A** 와 **판단 근거**를 자동 생성하고,
스크립트 자체 판정과 비교·검토한 뒤 Excel 보고서를 만든다.

## 구조

```
frontend/              React(Vite) 대시보드 — V-CHECKER UI
  src/App.jsx          업로드/판정/검토/보고서 화면
  src/api.js           FastAPI(/api/*) 호출 헬퍼
server/
  main.py              FastAPI — ai_app 로직을 /api/* 로 노출 + 빌드된 프론트 정적 서빙
ai_app/
  config.py            컬럼/모델/가이드 PDF 매핑 등 상수
  preprocess.py        CSV 로드 + AI 입력/대시보드 표 가공
  backend.py           판정 진입점(judge_item/ready) — agent_sdk로 위임
  agent_sdk.py         Claude 판정 엔진(claude CLI 구독, 3단계 토큰절감)
  guide_index.py       가이드 PDF 항목 섹션 페이지 탐지/텍스트 추출
  aio.py               async를 전용 스레드에서 안전 실행(Windows 대응)
  report.py            Excel/CSV 보고서 생성(LLM 없음)
guideline/*.pdf        주통기 상세가이드 (WEB-xx → 03_웹_서비스.pdf)
run-app.bat            운영 실행(빌드 후 단일 서버 :8600)
run-dev.bat            개발 실행(백엔드 :8600 + Vite :5173 자동 리로드)
```

## 데이터 흐름

```
CSV(로우데이터)
  → 전처리(preprocess): AI에 넘길 항목 / 대시보드 표
  → AI 판정(agent): ① 가이드 PDF 문서탐색 → ② 로우데이터 대조
                    → ③ (부족시) 웹검색 → ④ 판단근거 + 결과(JSON)
  → 대시보드: 스크립트 결과 vs AI 결과 비교(불일치 하이라이트)
  → 사용자 검토/수정 → 확정
  → Excel 보고서(항목코드/분류/항목/판단기준/결과/판단근거/진단대상/IP/중요도)
```

## AI에 넘기는 것 / 넘기지 않는 것
- 넘김: 항목코드, 항목, 점검파일, 판단기준, **점검내용(로우데이터 원문)**, 진단대상, IP, 중요도
- 넘기지 않음: 스크립트 `결과` → AI가 독립 판단하게 하고, 사후 **교차검증**에만 사용

## LLM 호출 방식
`claude_agent_sdk` + 로컬 **claude CLI(구독 인증)** 단일 경로. **API 키/종량제 과금 없음**
(구독 사용량에서 차감). 모델은 `WAS_DIAG_MODEL`(기본 `claude-opus-4-8`).

## 실행
```powershell
pip install -r requirements.txt          # Python 백엔드 의존성
# claude CLI 설치 + 구독 로그인(한 번):  claude  →  /login
# Node.js LTS 설치 필요(프론트 빌드용)

run-app.bat        # 운영: 프론트 빌드 → http://localhost:8600 자동 오픈
# 또는
run-dev.bat        # 개발: 백엔드 :8600 + Vite :5173(자동 리로드)
```

브라우저에서 CSV 업로드 → "AI 교차 진단 실행" → 검토 → 엑셀 다운로드.
단건 확인(UI 없이):  `python smoke_test.py WEB-16`

## 토큰 절감
- **3단계 에스컬레이션**(agent_sdk): ①로우데이터+판단기준만으로 즉시판단 → ②부족하면
  가이드 해당 섹션 **텍스트**(pypdf 추출, 전체 PDF X) → ③그래도 애매하면 WebSearch.
  → 대부분 1단계에서 종료, 가이드/웹 비용 회피.
- **전 항목 LLM 재판정**: N/A 포함 모든 항목을 LLM이 독립 판정한다(스크립트 결과는 프롬프트에서 제외, 교차검증에만 사용). 대상외 항목은 LLM이 N/A로, 수동확인 목록(SUID·숨김파일 등)은 LLM이 이상치까지 훑어 판정.
- 모델은 `WAS_DIAG_MODEL` 환경변수로 변경 가능(기본 `claude-opus-4-8`).
