// 백엔드(FastAPI) 호출 헬퍼. Vite 프록시 덕에 같은 출처(/api/...)로 호출.

async function jfetch(url, opts) {
  const r = await fetch(url, opts)
  if (!r.ok) {
    let detail = r.statusText
    try { detail = (await r.json()).detail || detail } catch { /* noop */ }
    throw new Error(detail)
  }
  return r.json()
}

// JSON 본문 POST 공통 헬퍼
const jpost = (url, body) =>
  jfetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const getHealth = () => jfetch('/api/health')

export function uploadCsv(file, runKind = '최초진단') {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('run_kind', runKind)
  return jfetch('/api/upload', { method: 'POST', body: fd })
}

// ── 자산관리 / 비교 ──
export const getAssets = () => jfetch('/api/assets')
export const getAssetRuns = (assetId) => jfetch(`/api/assets/${encodeURIComponent(assetId)}/runs`)
export const deleteRun = (runId) => jfetch(`/api/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' })
export const deleteAsset = (assetId) => jfetch(`/api/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' })
export const getRun = (runId) => jfetch(`/api/runs/${encodeURIComponent(runId)}`)
// 진단기록 종류(최초진단/이행점검) 변경 — 비교 탭에서 지정
export const setRunKind = (runId, kind) =>
  jpost(`/api/runs/${encodeURIComponent(runId)}/kind`, { kind })
export const getCompare = (base, target) =>
  jfetch(`/api/compare?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`)
export const compareCsvUrl = (base, target) =>
  `/api/compare.csv?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`

// 현재 세션을 자산목록에 추가(영속화)
export const saveAsset = (session_id) => jpost('/api/asset/save', { session_id })

export const getState = (sid) => jfetch(`/api/state?session_id=${sid}`)

export const saveDecision = (session_id, code, result, reason) =>
  jpost('/api/decision', { session_id, code, result, reason })

export const resetSession = (session_id) => jpost('/api/reset', { session_id })

export const reportXlsxUrl = (sid) => `/api/report.xlsx?session_id=${sid}`

// 저장된 Run의 최종 보고서를 HTML로 서버에 저장(report_id = run_id 반환)
export const saveRunReportHtml = (runId) =>
  jfetch(`/api/runs/${encodeURIComponent(runId)}/report/save`, { method: 'POST' })

// 비교 결과를 HTML 보고서로 저장(report_id = cmp-{base}__{target})
export const saveCompareReport = (base, target) =>
  jfetch(`/api/compare/report/save?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`,
    { method: 'POST' })

// 저장된 보고서 URL. download=true면 첨부(파일 다운로드), 아니면 인라인 열람(새 탭).
export const savedReportUrl = (reportId, download = false) =>
  `/api/reports/${encodeURIComponent(reportId)}/report.html${download ? '?download=1' : ''}`

// 진행 중인 AI 교차 진단 중지(다음 항목부터 토큰 사용 중단)
export const cancelJudge = (session_id) => jpost('/api/judge/cancel', { session_id })

// AI 판정 스트림(NDJSON). for await (const ev of judgeStream(sid)) { ... }
export async function* judgeStream(session_id, mode = 'pending') {
  const r = await fetch('/api/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id, mode }),
  })
  if (!r.ok || !r.body) throw new Error('판정 요청 실패')
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield JSON.parse(line)
    }
  }
  // 스트림 종료 시 개행으로 끝나지 않은 마지막 레코드도 처리(마지막 판정/end 이벤트 유실 방지).
  const tail = buf.trim()
  if (tail) yield JSON.parse(tail)
}
