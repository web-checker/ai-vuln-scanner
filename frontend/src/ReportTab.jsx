// 보고서 탭: 최초 보고서(파일 선택) / 최종 보고서(최초진단 ↔ 이행점검 2파일 비교).
import React, { useEffect, useState } from 'react'
import * as api from './api.js'
import { Pill, formatCriteria, fmtRunOpt, RUN_FIRST, RUN_FOLLOWUP } from './ui.jsx'
import { useReportSort, ReportSortButtons, ReportTable } from './dashboard.jsx'

// 최종 보고서 비교 표(최초/최종 결과·근거 + 진단대상)
function FinalReportTable({ rows }) {
  return (
    <div className="tbl-wrap">
      <table className="report">
        <thead><tr>
          <th>항목코드</th><th>분류</th><th className="c">중요도</th><th>항목</th><th>판단 기준</th>
          <th className="c">최초 진단 결과</th><th>최초 판단 근거</th>
          <th className="c">최종 진단 결과</th><th>최종 판단 근거</th>
          <th className="c">진단 대상</th><th className="c">진단 대상 IP</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td className="code c">{r.code}</td>
              <td className="c">{r.group}</td>
              <td className="c"><span className={`sev ${r.severity}`}>{r.severity}</span></td>
              <td className="nm">{r.name}</td>
              <td className="reason" style={{ minWidth: 200 }}>{formatCriteria(r.criteria)}</td>
              <td className="c"><Pill v={r.firstResult} /></td>
              <td className="reason">{r.firstReason}</td>
              <td className="c"><Pill v={r.finalResult} /></td>
              <td className="reason">{r.finalReason}</td>
              <td className="c">{r.target}</td>
              <td className="c">{r.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ReportTab({ reportKind, session, sessionItems }) {
  const [assets, setAssets] = useState([])
  const [err, setErr] = useState('')

  // 최초 보고서: 자산 → 최초진단 run 선택(또는 현재 세션)
  const [firstAsset, setFirstAsset] = useState('')
  const [firstRuns, setFirstRuns] = useState([])
  const [firstRunId, setFirstRunId] = useState('session')   // 'session' = 현재 세션
  const [runItems, setRunItems] = useState(null)

  // 최종 보고서: 자산 + base(최초진단) + target(이행점검)
  const [finalAsset, setFinalAsset] = useState('')
  const [finalRuns, setFinalRuns] = useState([])
  const [base, setBase] = useState('')
  const [target, setTarget] = useState('')
  const [finalRows, setFinalRows] = useState(null)

  useEffect(() => { api.getAssets().then((r) => setAssets(r.assets || [])).catch((e) => setErr(String(e.message || e))) }, [])

  // 최초 보고서 표 항목(현재 세션 또는 선택한 run) — 항상 호출(훅 순서 보존)
  const firstItems = firstRunId === 'session' ? (sessionItems || []) : (runItems || [])
  const { sortKey, toggleSort, sortArrow, reportRows } = useReportSort(firstItems)

  async function loadFirstAsset(aid) {
    setFirstAsset(aid); setRunItems(null); setFirstRunId('session')
    if (!aid) { setFirstRuns([]); return }
    try { const r = await api.getAssetRuns(aid); setFirstRuns((r.runs || []).filter((x) => x.kind === RUN_FIRST)) }
    catch (e) { setErr(String(e.message || e)) }
  }
  async function pickFirstRun(rid) {
    setFirstRunId(rid)
    if (rid === 'session') { setRunItems(null); return }
    try { const r = await api.getRun(rid); setRunItems(r.items || []) }
    catch (e) { setErr(String(e.message || e)) }
  }

  async function loadFinalAsset(aid) {
    setFinalAsset(aid); setFinalRows(null)
    if (!aid) { setFinalRuns([]); setBase(''); setTarget(''); return }
    try {
      const r = await api.getAssetRuns(aid); const rs = r.runs || []
      setFinalRuns(rs)
      setBase(rs.find((x) => x.kind === RUN_FIRST)?.run_id || '')
      setTarget(rs.find((x) => x.kind === RUN_FOLLOWUP)?.run_id || '')
    } catch (e) { setErr(String(e.message || e)) }
  }
  async function runFinal() {
    if (!base || !target) { setErr('최초진단 파일과 이행점검 파일을 모두 선택하세요.'); return }
    setErr('')
    try { const r = await api.getFinalReport(base, target); setFinalRows(r.rows || []) }
    catch (e) { setErr(String(e.message || e)) }
  }

  // ───────── 최종 보고서 ─────────
  if (reportKind === 'final') {
    const firstOpts = finalRuns.filter((x) => x.kind === RUN_FIRST)
    const followOpts = finalRuns.filter((x) => x.kind === RUN_FOLLOWUP)
    return (
      <section className="card">
        <div className="card-head">
          <div className="card-ico" style={{ background: '#dcf5ec', color: '#047857' }}>📄</div>
          <div style={{ flex: 1 }}><h2 className="card-title">최종 보고서</h2>
            <p className="card-sub">최초 진단 파일 및 이행 점검 파일 비교</p></div>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="cmp-pick" style={{ padding: '4px 22px 18px' }}>
          <div className="cmp-pick-field">
            <label>진단 대상</label>
            <select value={finalAsset} onChange={(e) => loadFinalAsset(e.target.value)}
              style={{ color: finalAsset ? '' : '#9ca3af' }}>
              <option value="">대상을 선택하세요</option>
              {assets.map((a) => <option key={a.asset_id} value={a.asset_id} style={{ color: 'var(--ink)' }}>{(a.name || a.ip)} · {a.ip}</option>)}
            </select>
          </div>
          <div className="cmp-pick-field">
            <label>최초 진단 파일</label>
            <select value={base} onChange={(e) => setBase(e.target.value)}
              style={{ color: base ? '' : '#9ca3af' }}>
              <option value="">파일을 선택하세요</option>
              {firstOpts.map((r) => <option key={r.run_id} value={r.run_id} style={{ color: 'var(--ink)' }}>{fmtRunOpt(r)}</option>)}
            </select>
          </div>
          <div className="cmp-vs">→</div>
          <div className="cmp-pick-field">
            <label>이행 점검 파일</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)}
              style={{ color: target ? '' : '#9ca3af' }}>
              <option value="">파일을 선택하세요</option>
              {followOpts.map((r) => <option key={r.run_id} value={r.run_id} style={{ color: 'var(--ink)' }}>{fmtRunOpt(r)}</option>)}
            </select>
          </div>
          <button className="btn primary" style={{ width: 'auto', padding: '11px 22px' }}
            disabled={!base || !target} onClick={runFinal}>확인</button>
        </div>
        {finalRows && (
          <>
            <FinalReportTable rows={finalRows} />
            <div className="report-actions">
              <a href={api.finalReportXlsxUrl(base, target)}>
                <button className="btn good" style={{ width: 'auto', padding: '13px 22px' }}>⬇ 엑셀 다운로드 (.xlsx)</button>
              </a>
            </div>
          </>
        )}
      </section>
    )
  }

  // ───────── 최초 보고서 ─────────
  const xlsxHref = firstRunId === 'session'
    ? (session ? api.reportXlsxUrl(session.id) : null)
    : api.runReportXlsxUrl(firstRunId)
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-ico" style={{ background: '#dcf5ec', color: '#047857' }}>📄</div>
        <div style={{ flex: 1 }}><h2 className="card-title">최초 보고서</h2>
          <p className="card-sub">확정 항목은 확정값, 미확정 항목은 자동화 스크립트 결과 사용</p></div>
        <div className="rep-pick">
          <select value={firstAsset} onChange={(e) => loadFirstAsset(e.target.value)}>
            <option value="">(대상 선택)</option>
            {assets.map((a) => <option key={a.asset_id} value={a.asset_id}>{(a.name || a.ip)}</option>)}
          </select>
          {firstAsset && (
            <select value={firstRunId} onChange={(e) => pickFirstRun(e.target.value)}>
              {session && <option value="session">(현재 세션)</option>}
              {firstRuns.map((r) => <option key={r.run_id} value={r.run_id}>{fmtRunOpt(r)}</option>)}
            </select>
          )}
        </div>
        <ReportSortButtons sortKey={sortKey} toggleSort={toggleSort} sortArrow={sortArrow} />
      </div>
      {firstItems.length === 0
        ? <div className="detail-empty" style={{ padding: 24 }}>표시할 보고서가 없습니다. 파일을 선택하거나 CSV를 업로드하세요.</div>
        : <ReportTable rows={reportRows} />}
      {xlsxHref && firstItems.length > 0 && (
        <div className="report-actions">
          <a href={xlsxHref}>
            <button className="btn good" style={{ width: 'auto', padding: '13px 22px' }}>⬇ 엑셀 다운로드 (.xlsx)</button>
          </a>
        </div>
      )}
    </section>
  )
}
