// 요약 대시보드 공유 조각 — App(현재 세션)과 RunDetail(저장된 Run)이 함께 쓴다.
// KPI·차트·보고서 표·정렬 로직이 두 화면에서 동일하므로 한곳에 모은다.
import React, { useMemo, useState } from 'react'
import { Kpi, Pill, formatCriteria, prefResult, isVuln, labelReason } from './ui.jsx'
import { Chart, Donut, VulnCompare } from './charts.jsx'

const SEV_RANK = { 상: 3, 중: 2, 하: 1 }

// 보고서 정렬 상태(항목코드/중요도) + 정렬된 행. App·RunDetail 공통.
export function useReportSort(items) {
  const [sortKey, setSortKey] = useState('code')
  const [sortDir, setSortDir] = useState('asc')
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortArrow = (k) => (sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅')
  const reportRows = useMemo(() => [...items].sort((a, b) => {
    let r
    if (sortKey === 'severity') r = (SEV_RANK[a.severity] || 0) - (SEV_RANK[b.severity] || 0)
    else r = String(a.code).localeCompare(String(b.code), undefined, { numeric: true })
    return sortDir === 'asc' ? r : -r
  }), [items, sortKey, sortDir])
  return { sortKey, sortDir, toggleSort, sortArrow, reportRows }
}

// 정렬 버튼 2개(항목코드/중요도) — useReportSort 의 값을 그대로 받는다.
export function ReportSortButtons({ sortKey, toggleSort, sortArrow }) {
  return (
    <div className="sort-bar">
      <button className={`sort-btn${sortKey === 'code' ? ' on' : ''}`} onClick={() => toggleSort('code')}>항목코드 {sortArrow('code')}</button>
      <button className={`sort-btn${sortKey === 'severity' ? ' on' : ''}`} onClick={() => toggleSort('severity')}>중요도 {sortArrow('severity')}</button>
    </div>
  )
}

// 최종 보고서 표(thead + 행). rows 는 useReportSort().reportRows.
export function ReportTable({ rows }) {
  return (
    <div className="tbl-wrap">
      <table className="report">
        <thead>
          <tr>
            <th>항목코드</th><th>분류</th><th className="c">중요도</th><th>항목</th><th>판단 기준</th>
            <th className="c">진단 결과</th><th>판단 근거</th><th>조치 방법</th>
            <th className="c">진단 대상</th><th className="c">진단 대상 IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => {
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
  )
}

// 요약 KPI + 차트(막대/도넛). children 은 막대 차트 아래에 끼워넣을 추가 요소(App 의 판정 진행바).
export function SummaryCharts({ summary, total, decided, matchRate, donutMode, setDonutMode, dark, children }) {
  const donutCounts = donutMode === 'ai' ? summary.ai : summary.script
  return (
    <>
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
            {children}
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
    </>
  )
}
