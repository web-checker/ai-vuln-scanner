# 코드 작성 가이드 (V-CHECKER / ai-vuln-scanner)

팀 공통 규칙. 새 코드를 올리기 전에 이 문서의 **검증 체크리스트**를 통과시킨다.
과거에 실제로 발생한 사고를 기준으로 정리했다.

---

## 0. 가장 중요한 함정 (실제 사고 사례)

### 0-1. Windows 배치 파일은 반드시 **CRLF** 줄바꿈
- `run-app.bat` / `run-dev.bat` 가 LF(유닉스) 줄바꿈이면 `cmd.exe` 가
  `if errorlevel 1 (...)` 같은 **괄호 블록을 조각내 오파싱**한다.
  → `pushd frontend` 가 안 먹혀 루트에서 `npm run build` 가 돌고 `package.json` 없음(ENOENT)으로 실패.
- **이미 `.gitattributes` 에 `*.bat *.cmd text eol=crlf` 를 강제**해 두었다. 건드리지 말 것.
- 에디터에서 `.bat` 을 새로 만들거나 저장할 때 줄바꿈을 **CRLF** 로 둔다(VS Code 우측 하단 `LF/CRLF` 표시 확인).
- 확인: `python -c "b=open('run-app.bat','rb').read(); print('CRLF',b.count(b'\r\n'),'loneLF',b.count(b'\n')-b.count(b'\r\n'))"`
  → `loneLF 0` 이어야 한다. (`grep -c '\r'` 은 Git Bash 가 CR 을 strip 해서 0 으로 잘못 보이니 쓰지 말 것.)

### 0-2. "데드 코드"를 **정적 grep 만으로 판단 금지** — 동적 className/참조 주의
- CSS 클래스가 문자열 조립으로 동적 적용되는 경우 `grep "pill info"` 로는 안 잡힌다:
  ```jsx
  <span className={`pill ${kind === '최초진단' ? 'info' : 'warn'} sm`}>
  ```
  → `.pill.info` 를 "미사용"으로 오판해 삭제하면 런타임에 스타일만 조용히 깨진다(빌드는 통과).
- 삭제 전 **동적 패턴까지** 확인: `grep -rn "pill " src`, `prefResult`, ``className={`...${`` 등.
- 같은 이유로 `it.match = matchLabel(...)` 처럼 **계산만 하고 렌더 안 하는** 필드는 진짜 데드(둘 다 함께 제거).

### 0-3. Vite 빌드는 **미정의 식별자(no-undef)를 못 잡는다**
- import 를 지웠는데 그 심볼이 **다른 곳에서 아직 쓰이면**, 빌드는 성공하고 **런타임에서만** `ReferenceError`.
  (예: `prefResult` 를 import 에서 뺐는데 `getEdit` 에서 사용 → 화면 진입 시 크래시)
- import 추가/삭제 후 반드시:
  ```bash
  grep -nE "\b(지운심볼1|지운심볼2)\b" src/*.jsx
  ```
  로 잔존 참조 0 을 확인한다.

---

## 1. 검증 체크리스트 (PR 전 필수)

### 프론트엔드
```bash
cd frontend && npm run build          # 컴파일 통과
# import 정리했으면 잔존 참조 grep (위 0-3)
```

### 백엔드
```bash
python -c "import sys; sys.path.insert(0,'.'); \
  import ai_app.report, ai_app.store, ai_app.config, ai_app.agent_sdk, \
  ai_app.preprocess, ai_app.guide_index, ai_app.aio, ai_app.backend, server.main; \
  print('imports OK')"
```
보고서/저장 로직을 건드렸으면 **격리 데이터 디렉터리**로 스모크:
```bash
VCHECKER_DATA_DIR=/tmp/vctest python -c "... build_xlsx_report / build_html_report / store round-trip ..."
```
엔드포인트를 건드렸으면 `fastapi.testclient.TestClient` 로 호출 검증
(특히 path-traversal 가드 `_safe_run_id`, 다운로드 헤더 `_attachment_headers`).

---

## 2. 보안

- **경로 안전**: 사용자 입력(run_id, base/target 등)을 파일 경로에 넣기 전 `_safe_run_id`
  (`^[0-9A-Za-z_-]+$`) 로 검증한다. `..`/`/`/`\` 차단 — 보고서 저장 path-traversal 사고 방지.
- 진단 판정은 **로컬 `claude` CLI(구독 인증)** 만 사용. **API 키/종량제 금지**(`config.MODEL`, 기본 `claude-opus-4-8`).
  스크립트 자체 판정(`결과` 열)은 LLM 에 넘기지 않는다 — AI 가 독립 판정하게 한 뒤 사후 교차검증.

## 3. 인코딩 (Windows + 한글)

- **CSV 읽기/쓰기**: UTF-8 **BOM**(`utf-8-sig`). Excel 한글 호환. (`store._read_index`/`_write_csv` 규칙 통일)
- **HTML 보고서**: UTF-8(BOM 없음) + `<meta charset>`.
- 소스 파일(.py/.jsx/.css/.md)은 UTF-8(BOM 없음).

## 4. pandas

- 인덱스 CSV 는 `dtype=str, encoding="utf-8-sig", keep_default_na=False` 로 읽어 빈칸을 `""` 로 유지.
- df 컬럼 존재를 가정한 직접 인덱싱(`df["X"]`) 대신 행 단위는 `row.get("X","")`.
  단, **중복 컬럼명**이 있으면 `row.get` 이 Series 를 반환해 `or`/`bool` 에서 터지니 컬럼 중복을 만들지 말 것.
- 항목 수가 수십~수백이라 `iterrows()` 는 허용 범위. 단 같은 df 를 여러 번 풀스캔하지 말고 한 번에 집계.

## 5. 구조 / 중복 제거 규칙

- 같은 로직이 2곳 이상이면 헬퍼로 추출(예: `store._upsert`, `report._report_row`,
  `main._attachment_headers`, `api.jpost`, `frontend/src/dashboard.jsx` 공유 컴포넌트).
- 프론트 진단종류 비교는 문자열 리터럴 대신 `ui.jsx` 의 `RUN_FIRST`/`RUN_FOLLOWUP`/`RUN_KINDS` 상수 사용.
- **의도적으로 보존된 비활성 코드**(예: `agent_sdk._remediate`/`_PRM`, `main._guide_remed` — 조치방법 AI 생성)는
  주석에 "[비활성화] … 보존" 표기가 있다. **임의로 지우지 말 것**(재활성화 대비).

## 6. Git / 협업

- 기본 브랜치는 `main`, **PR 로 머지**. 작업은 `feature/...` 또는 `vuln-scanner-{이니셜}` 브랜치에서.
- `.venv/`, `node_modules/`, `dist/`, `data/`, `*.csv`, `*.xlsx` 는 `.gitignore` 대상 — 커밋 금지.
- `core.autocrlf=true` 만 믿지 말 것. `.bat` 의 CRLF 는 `.gitattributes` 가 보장한다(0-1 참고).

## 7. 실행

```bat
run-app.bat   :: 운영 — 프론트 빌드 후 단일 서버 http://localhost:8600
run-dev.bat   :: 개발 — 백엔드(:8600) + Vite(:5173) 핫리로드
```
최초 실행 시 `.venv` 자동 생성 + `requirements.txt` 설치(수 분 소요). Node.js LTS 필요.
