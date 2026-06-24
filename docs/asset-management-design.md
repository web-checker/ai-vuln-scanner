# 자산관리 · 최초진단↔이행점검 비교 — 설계안

> V-CHECKER에 **자산관리 메뉴**를 추가하고, 진단대상을 **로컬 CSV로 영속 저장**해
> 같은 자산(**진단대상IP** 기준)의 **최초진단 ↔ 이행점검** 결과를 비교한다.
> (현재는 `server/main.py`의 `SESSIONS: dict` — 메모리 휘발성. 재시작 시 소멸.)

---

## 1. 목표 / 비목표

**목표**
- 진단대상(자산)을 등록·목록화하고 재시작 후에도 유지(영속화).
- 한 자산에 여러 진단실행(Run)을 시점별로 누적 저장.
- 최초진단과 이행점검을 항목코드로 조인해 **개선/미조치/악화/유지**를 표시.

**비목표(이번 범위 밖)**
- DB(SQLite 등) 도입 — 이번엔 **로컬 CSV 파일**로만.
- 멀티 사용자/동시성/인증.
- 자산 자동 스캔(자산은 업로드된 CSV에서 등록).

---

## 2. 데이터 모델 (개념)

```
자산(Asset)  1 ──< N  진단실행(Run)  1 ──< N  항목결과(ItemResult)
 ├ asset_id (= 진단대상IP 정규화)        ├ run_id
 ├ 진단대상명                            ├ 종류: 최초진단 | 이행점검
 ├ 진단대상IP   ← 비교 매칭 키           ├ 일시
 └ 분류(Unix/Web/Windows/DBMS)          ├ 원본CSV파일명
                                        └ 요약(총항목/취약/양호/N-A)
```

- **자산 식별 키 = 진단대상IP**(사용자 결정). `asset_id`는 IP를 파일명 안전하게 정규화
  (`.`→`_`, `:`→`-`). 예: `192.168.0.10` → `192_168_0_10`.
- 같은 IP로 또 업로드되면 **새 자산이 아니라 기존 자산의 새 Run**으로 누적.

---

## 3. 저장소 레이아웃 (로컬 CSV)

```
data/                                  ← 신규 영속 저장소 (.gitignore 추가)
├─ assets.csv                          ← 자산 레지스트리(인덱스)
├─ runs_index.csv                      ← 모든 Run 메타(인덱스)
└─ runs/
   └─ {asset_id}/
      ├─ {run_id}.csv                  ← Run별 항목결과(아래 RUN_COLUMNS)
      └─ ...
```

### 3.1 `assets.csv`
| 컬럼 | 의미 |
|---|---|
| `asset_id` | 진단대상IP 정규화 값(PK) |
| `진단대상명` | 호스트명 |
| `진단대상IP` | 원본 IP |
| `분류` | Unix/Web/Windows/DBMS (대표값) |
| `최초등록일` | ISO 일시 |
| `최근진단일` | ISO 일시 |

### 3.2 `runs_index.csv`
| 컬럼 | 의미 |
|---|---|
| `run_id` | `{yyyymmdd-HHMMSS}-{hex4}` (PK) |
| `asset_id` | 자산 FK |
| `종류` | `최초진단` \| `이행점검` |
| `일시` | ISO 일시 |
| `원본파일명` | 업로드 CSV 파일명 |
| `총항목` `취약` `양호` `NA` | 요약 카운트(확정 기준) |

### 3.3 `runs/{asset_id}/{run_id}.csv` — **RUN_COLUMNS (신규)**
세션 복원과 비교를 모두 지원하기 위해 보고서 컬럼의 **상위집합**으로 저장한다.

```
항목코드, 분류, 항목, 판단기준, 중요도, 진단대상, 진단대상IP,
스크립트결과, AI결과, AI근거, 확정결과, 확정근거, 확정여부
```
- 기존 `REPORT_COLUMNS`는 이 중 `확정결과→결과`, `확정근거→판단근거`로 투영해 그대로 재사용.
- 즉 `report.py`는 손대지 않고, RUN_COLUMNS → REPORT_COLUMNS 변환만 추가.

> **종류(최초/이행) 결정 규칙**: 업로드 시 사용자가 **수동 선택**(라디오: 최초진단/이행점검).
> 자동 판정 없음 — 같은 IP를 여러 분야로 진단하거나 재업로드하는 경우를 사용자가 직접 통제.

---

## 4. 비교 로직 (자산 단위)

입력: 한 자산의 `base_run`과 `target_run`을 **사용자가 직접 선택**(자동 기본값 없음).
이행점검이 여러 번이면 사용자가 "최초진단 vs 어느 이행점검" 또는 "이행점검 N vs 이행점검 M"을
드롭다운에서 골라 비교한다. **항목코드로 outer join**, 각 항목의 결과는
`확정결과 우선, 없으면 스크립트결과`(기존 `_final_decisions` 규칙과 동일).

| base → target | status | 표시 |
|---|---|---|
| 취약 → 양호 | `개선` | 🟢 조치완료 |
| 취약 → 취약 | `미조치` | 🔴 유지(취약) |
| 양호 → 취약 | `악화` | 🟠 신규취약 |
| 양호 → 양호 | `유지양호` | ⚪ |
| 한쪽 N/A·결측 | `대상외` | ⚪ |

비교 요약 카드: `개선 n · 미조치 n · 악화 n · 조치율 = 개선/(최초취약) %`.

---

## 5. API 변경 (`server/main.py`)

### 변경
- `POST /api/upload` — 업로드 시 진단대상IP로 자산을 **조회/생성**하고, 종류(최초/이행)
  를 받아 Run 메타를 예약. 기존 응답(items/summary)은 그대로 + `asset_id`, `run_id` 추가.
  - 요청에 `run_kind`(옵션) 추가. 미지정 시 4절 규칙으로 자동.
- `POST /api/decision` / `POST /api/judge` 완료 후 — 해당 Run을 **`runs/{asset_id}/{run_id}.csv`로 저장(flush)**.
  → 이걸로 "일회용 X" 달성. (확정 갱신 시마다 덮어쓰기)

### 신규
| 메서드 | 경로 | 역할 |
|---|---|---|
| `GET` | `/api/assets` | 자산 목록(assets.csv) + 자산별 Run 수/최근진단일 |
| `GET` | `/api/assets/{asset_id}/runs` | 해당 자산의 Run 목록(runs_index.csv) |
| `GET` | `/api/runs/{run_id}` | Run 1건을 세션처럼 로드(대시보드 재표시용) |
| `GET` | `/api/compare?asset_id=&base=&target=` | 4절 비교 결과(rows + summary). base/target은 사용자가 고른 run_id |
| `GET` | `/api/compare.xlsx?asset_id=&base=&target=` | **비교 결과 엑셀(이번 범위 포함)** — 항목코드·최초결과·이행결과·상태(개선/미조치/악화) + 상태별 색상 |
| `DELETE` | `/api/assets/{asset_id}` / `/api/runs/{run_id}` | 삭제(선택) |

> 세션(SESSIONS)은 **작업 중 캐시**로 유지하되, 영속 진실원본은 `data/`의 CSV.
> 서버 재시작 후 자산/Run 목록은 인덱스 CSV에서 항상 복원.

---

## 6. 신규/변경 모듈

| 파일 | 변경 |
|---|---|
| `ai_app/store.py` **(신규)** | CSV 영속 계층: `register_asset`, `save_run`, `list_assets`, `list_runs`, `load_run`, `compare(base, target)`. pandas로 read/write, UTF-8 BOM 유지. |
| `ai_app/config.py` | `DATA_DIR`, `ASSETS_CSV`, `RUNS_DIR`, `RUNS_INDEX_CSV`, `RUN_COLUMNS`, `R_*` 전이 상수(개선/미조치/악화) 추가. |
| `ai_app/report.py` | `build_report_df`가 RUN_COLUMNS도 입력으로 받게 소폭 일반화(선택) + **`build_compare_xlsx`(비교 결과 엑셀)** 추가. |
| `server/main.py` | 5절 엔드포인트 추가 + upload/judge/decision에 store flush 연결 + `/api/compare.xlsx`. |
| `frontend/src/api.js` | `getAssets/getRuns/loadRun/getCompare` 헬퍼 + `compareXlsxUrl` 추가. |
| `frontend/src/App.jsx` | 사이드바에 **자산관리** 메뉴 + 자산목록/이력/비교 화면 추가. |

---

## 7. 프론트엔드 화면 흐름

```
사이드바 메뉴: [요약 및 결과] [최종 보고서] [자산관리] ← 신규
                                              │
   ┌──────────────────────────────────────────┘
   ▼
자산 목록 (assets.csv)
   행 클릭 ▼
자산 상세 = Run 이력 타임라인 (최초진단 ●──● 이행점검 ●──● 이행점검 …)
   ├ Run 클릭 → 해당 Run을 대시보드로 로드(읽기전용)
   └ 비교 대상 선택: [base 드롭다운] vs [target 드롭다운] → "비교" 버튼
        · Run이 3개 이상이면 두 드롭다운에서 사용자가 직접 선택
        · 자동 기본값 없음(둘 다 사용자가 고름)
        ▼
비교 화면
   ├ 요약 카드: 개선 / 미조치 / 악화 / 조치율
   ├ 항목 테이블: 항목코드 | base결과 | target결과 | 상태(개선/미조치/악화)
   │             (상태별 필터·색상)
   └ [⬇ 비교 결과 엑셀 다운로드] → /api/compare.xlsx
```

업로드 패널에는 **종류 선택 라디오(최초진단/이행점검)** 추가 — 사용자가 매번 수동 선택.

---

## 8. 마이그레이션 / 호환성

- 기존 단발 업로드 흐름은 **그대로 동작**(자산이 1개 생기고 Run이 1개 쌓일 뿐).
- `data/`는 `.gitignore`에 추가(진단 데이터는 커밋하지 않음).
- 인덱스 CSV는 append, Run CSV는 run_id 단위 덮어쓰기 → 동시성 충돌 최소화.

## 9. 구현 단계(승인 후)

1. `config.py` 상수 + `store.py`(CSV 영속 계층) — 단위테스트로 round-trip 검증.
2. `server/main.py` upload/judge/decision에 flush 연결 + assets/runs/compare 엔드포인트.
3. `api.js` 헬퍼 + `App.jsx` 자산관리/비교 화면.
4. `smoke_test.py`에 영속/비교 경로 추가.

## 10. 확정된 결정 (2026-06-24)

- **Run 종류**: 업로드 시 항상 **수동 선택**(최초진단/이행점검 라디오). 자동 판정 없음.
- **비교 대상 선택**: base/target 모두 **사용자가 수동 선택**. 이행점검이 여러 번이면
  드롭다운에서 "최초 vs 특정 이행" 또는 "이행 N vs 이행 M"을 직접 고름. 자동 기본값 없음.
- **비교 엑셀 다운로드**: **이번 범위 포함** — `/api/compare.xlsx` + `report.build_compare_xlsx`.
