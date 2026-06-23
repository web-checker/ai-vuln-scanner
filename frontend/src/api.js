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

export const getHealth = () => jfetch('/api/health')

export function uploadCsv(file) {
  const fd = new FormData()
  fd.append('file', file)
  return jfetch('/api/upload', { method: 'POST', body: fd })
}

export const getState = (sid) => jfetch(`/api/state?session_id=${sid}`)

export const saveDecision = (session_id, code, result, reason) =>
  jfetch('/api/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id, code, result, reason }),
  })

export const resetSession = (session_id) =>
  jfetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id }),
  })

export const reportXlsxUrl = (sid) => `/api/report.xlsx?session_id=${sid}`

export const getReport = (sid) => jfetch(`/api/report?session_id=${sid}`)

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
}
