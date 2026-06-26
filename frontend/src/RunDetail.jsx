// 진단기록 상세: 요약 및 결과 대시보드(KPI + 차트) + 최종 보고서 표 + HTML 저장.
import React, { useEffect, useMemo, useState } from 'react'
import * as api from './api.js'
import { Kpi, Pill, formatCriteria, prefResult, isVuln, labelReason } from './ui.jsx'
import { Chart, Donut, VulnCompare } from './charts.jsx'

const SEV_RANK = { 상: 3, 중: 2, 하: 1 }

export default function RunDetail({ run, asset, dark, onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [donutMode, setDonutMode] = useState('ai')
  const [sortKey, setSortKey] = useState('code')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    setLoading(true); setErr('')
    api.getRun(run.run_id).then((r) => setItems(r.items || []))
      .catch((e) => setErr(String(e.message || e))).finally(() => setLoading(false))
  }, [run.run_id])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortArrow = (k) => (sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅')

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
  const donutCounts = donutMode === 'ai' ? summary.ai : summary.script

  const reportRows = useMemo(() => [...items].sort((a, b) => {
    let r
    if (sortKey === 'severity') r = (SEV_RANK[a.severity] || 0) - (SEV_RANK[b.severity] || 0)
    else r = String(a.code).localeCompare(String(b.code), undefined, { numeric: true })
    return sortDir === 'asc' ? r : -r
  }), [items, sortKey, sortDir])

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
          {/* KPI */}
          <div className="kpis">
            <div className="kpi-left">
              <Kpi title="전체 항목" value={total} sub="진단 대상" />
              <VulnCompare summary={summary} total={total} />
            </div>
            <div className="kpi-right">
              <Kpi title="확정 완료" value={`${decided}/${total}`} sub="검토 진행률" />
              <Kpi title="AI 일치율" value={matchRate === null ? '—' : `${matchRate}%`} sub="스크립트 / AI" accent />
            </div>
          </div>

          {/* 차트: 막대 + 도넛 */}
          <div className="charts">
            <section className="card">
              <div className="card-head">
                <div className="card-ico">📊</div>
                <div style={{ flex: 1 }}>
                  <h2 className="card-title">진단 결과 요약</h2>
                  <p className="card-sub">자동화 스크립트 / AI 등급별 비교</p>
                </div>
                <div className="chart-legend">
                  <span className="row"><span className="sw" style={{ background: '#FFBB00' }} /> 스크립트</span>
                  <span className="row"><span className="sw" style={{ background: '#2563eb' }} /> AI</span>
                </div>
              </div>
              <div style={{ padding: '18px 22px 12px' }}>
                <Chart summary={summary} dark={dark} />
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-ico" style={{ background: '#dcf5ec', color: '#047857' }}>✓</div>
                <div style={{ flex: 1 }}>
                  <h2 className="card-title">결과 분포</h2>
                  <p className="card-sub">{donutMode === 'ai' ? 'AI 판단' : '자동화 스크립트 판단'} 등급 비율</p>
                </div>
                <button className="chart-toggle" onClick={() => setDonutMode((m) => (m === 'ai' ? 'script' : 'ai'))}>
                  ⇄ {donutMode === 'ai' ? '자동화 스크립트 결과' : 'AI 결과'}
                </button>
              </div>
              <div className="donut-body" style={{ padding: '14px 22px 18px' }}>
                <Donut counts={donutCounts} dark={dark} />
              </div>
            </section>
          </div>

          {/* 최종 보고서 표 */}
          <section className="card">
            <div className="card-head">
              <div className="card-ico" style={{ background: '#dcf5ec', color: '#047857' }}>📄</div>
              <div style={{ flex: 1 }}><h2 className="card-title">진단 결과</h2>
                <p className="card-sub">확정 항목은 확정값, 미확정 항목은 자동화 스크립트 결과 사용</p></div>
              <div className="sort-bar">
                <button className={`sort-btn${sortKey === 'code' ? ' on' : ''}`} onClick={() => toggleSort('code')}>항목코드 {sortArrow('code')}</button>
                <button className={`sort-btn${sortKey === 'severity' ? ' on' : ''}`} onClick={() => toggleSort('severity')}>중요도 {sortArrow('severity')}</button>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="report">
                <thead>
                  <tr>
                    <th>항목코드</th><th>분류</th><th className="c">중요도</th><th>항목</th><th>판단 기준</th>
                    <th className="c">결과</th><th>판단 근거</th><th>조치 방법</th>
                    <th className="c">진단 대상</th><th className="c">진단 대상 IP</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((it) => {
                    const r = prefResult(it)
                    const reason = it.finalReason || it.reason || it.check || ''
                    return (
                      <tr key={it.code}>
                        <td className="code">{it.code}</td>
                        <td>{it.group}</td>
                        <td className="c"><span className={`sev ${it.severity}`}>{it.severity}</span></td>
                        <td className="nm">{it.name}</td>
                        <td className="reason" style={{ minWidth: 240 }}>{formatCriteria(it.criteria)}</td>
                        <td className="c"><Pill v={r} /></td>
                        <td className="reason">{labelReason(r, reason)}</td>
                        <td className="reason">{isVuln(it) ? (it.remediation || '') : ''}</td>
                        <td className="c">{it.target}</td>
                        <td className="c">{it.ip}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
