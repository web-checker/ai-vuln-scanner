// 진단기록 상세: 요약 및 결과 대시보드(KPI + 차트) + 최종 보고서 표 + HTML 저장.
import React, { useEffect, useMemo, useState } from 'react'
import * as api from './api.js'
import { useReportSort, ReportSortButtons, ReportTable, SummaryCharts } from './dashboard.jsx'

export default function RunDetail({ run, asset, dark, onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [donutMode, setDonutMode] = useState('ai')
  const { sortKey, toggleSort, sortArrow, reportRows } = useReportSort(items)

  useEffect(() => {
    setLoading(true); setErr('')
    api.getRun(run.run_id).then((r) => setItems(r.items || []))
      .catch((e) => setErr(String(e.message || e))).finally(() => setLoading(false))
  }, [run.run_id])

  const summary = useMemo(() => {
    const c = (key, v) => items.filter((it) => it[key] === v).length
    return {
      script: { pass: c('script', '양호'), vuln: c('script', '취약'), na: c('script', 'N/A') },
      ai: { pass: c('ai', '양호'), vuln: c('ai', '취약'), na: c('ai', 'N/A') },
    }
  }, [items])

  const total = items.length
  const decided = items.filter((it) => it.decided).length
  const judged = items.filter((it) => it.ai)
  const matched = judged.filter((it) => it.ai === it.script).length
  const matchRate = judged.length ? Math.round((matched / judged.length) * 100) : null

  async function onSaveReport() {
    if (saving) return
    setSaving(true); setErr('')
    try {
      const res = await api.saveRunReportHtml(run.run_id)
      setNotice(`보고서가 저장되었습니다 → ${res.path}`)
      setTimeout(() => setNotice(''), 8000)
      window.open(api.savedReportUrl(res.report_id), '_blank', 'noopener')
    } catch (e) { setErr(String(e.message || e)) }
    finally { setSaving(false) }
  }


  return (
    <>
      <div className="detail-bar">
        <div className="crumb">{asset?.name || asset?.ip} <span>/</span> 진단기록 상세 <span>/</span> {run.kind} · {(run.at || '').slice(0, 16).replace('T', ' ')}</div>
        <button className="sort-btn" onClick={onBack}>← 진단 기록</button>
      </div>

      {notice && <div className="notice">{notice}</div>}
      {err && <div className="err">{err}</div>}

      {loading ? (
        <div className="placeholder"><div className="ph-title">불러오는 중…</div></div>
      ) : (
        <>
          <SummaryCharts summary={summary} total={total} decided={decided} matchRate={matchRate}
            donutMode={donutMode} setDonutMode={setDonutMode} dark={dark} />

          {/* 최종 보고서 표 */}
          <section className="card">
            <div className="card-head">
              <div className="card-ico" style={{ background: '#dcf5ec', color: '#047857' }}>📄</div>
              <div style={{ flex: 1 }}><h2 className="card-title">진단 결과</h2>
                <p className="card-sub">확정 항목은 확정값, 미확정 항목은 자동화 스크립트 결과 사용</p></div>
              <ReportSortButtons sortKey={sortKey} toggleSort={toggleSort} sortArrow={sortArrow} />
            </div>
            <ReportTable rows={reportRows} />
            <div className="report-actions">
              <button className="btn good" style={{ width: 'auto', padding: '13px 22px' }}
                onClick={onSaveReport} disabled={saving}>
                {saving ? '저장 중…' : '🗎 보고서 저장 (HTML)'}
              </button>
            </div>
          </section>
        </>
      )}
    </>
  )
}
