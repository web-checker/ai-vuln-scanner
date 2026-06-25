import React, { useEffect, useState } from 'react'
import * as api from './api.js'
import { Kpi, MoonIcon, Pill, VALID, matchLabel } from './ui.jsx'
import { Chart, Donut, VulnCompare } from './charts.jsx'
import Sidebar from './Sidebar.jsx'
import Detail from './Detail.jsx'
import AssetManager from './AssetManager.jsx'
import CompareTab from './CompareTab.jsx'
import SaveAssetModal from './SaveAssetModal.jsx'

const prefResult = (it) =>
  it.finalResult || (VALID.includes(it.script) ? it.script : '') ||
  (VALID.includes(it.ai) ? it.ai : '') || 'N/A'

// ── 메인 ───────────────────────────────────────────────────────
export default function App() {
  const [health, setHealth] = useState(null)
  const [session, setSession] = useState(null)
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ script: { pass: 0, vuln: 0, na: 0 }, ai: { pass: 0, vuln: 0, na: 0 } })
  const [tab, setTab] = useState('summary')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [judging, setJudging] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [edits, setEdits] = useState({})
  const [savedCode, setSavedCode] = useState(null)
  const [saveAsk, setSaveAsk] = useState(null)     // 업로드 직후 확인 모달 정보(null=닫힘)
  const [assetSaved, setAssetSaved] = useState(false)  // 현재 세션이 자산목록에 추가됐는지
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [sideOpen, setSideOpen] = useState(true)
  const [runKind, setRunKind] = useState('최초진단')  // 업로드 시 진단 종류(수동 선택)
  const [donutMode, setDonutMode] = useState('ai')   // 'ai' | 'script'
  const [sortKey, setSortKey] = useState('code')     // 'code' | 'severity'
  const [sortDir, setSortDir] = useState('asc')      // 'asc' | 'desc'

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  useEffect(() => { api.getHealth().then(setHealth).catch(() => setHealth({ ready: false, message: '백엔드 연결 실패', backend: '-' })) }, [])
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const doneCount = items.filter((it) => it.ai).length

  async function onUpload(file) {
    setError('')
    try {
      const res = await api.uploadCsv(file, runKind)
      setSession({ id: res.session_id, filename: res.filename })
      setItems(res.items); setSummary(res.summary)
      setSelected(res.items[0]?.code ?? null)
      setEdits({}); setTab('summary'); setSavedCode(null)
      setAssetSaved(false); setNotice('')
      // 업로드 직후엔 자동 저장하지 않고, 자산목록 추가 여부를 사람이 선택
      setSaveAsk({ name: res.asset_name, ip: res.asset_ip, kind: res.run_kind, exists: res.asset_exists })
    } catch (e) { setError(String(e.message || e)) }
  }

  async function onSaveAsset() {
    if (!session) return
    try {
      await api.saveAsset(session.id)
      setAssetSaved(true); setSaveAsk(null)
      setNotice('자산목록에 추가되었습니다.')
      setTimeout(() => setNotice(''), 3000)
    } catch (e) { setSaveAsk(null); setError(String(e.message || e)) }
  }

  async function onJudge(mode) {
    if (!session) return
    setError(''); setJudging(true); setProgress({ done: 0, total: 0 })
    try {
      for await (const ev of api.judgeStream(session.id, mode)) {
        if (ev.event === 'start') setProgress({ done: 0, total: ev.total })
        else if (ev.event === 'item') {
          setProgress({ done: ev.done, total: ev.total })
          setItems((prev) => prev.map((it) => it.code === ev.code
            ? { ...it, ai: ev.result, reason: ev.reason, source: ev.source, confidence: ev.confidence,
                match: matchLabel(ev.result, it.script) }
            : it))
        }
      }
      const st = await api.getState(session.id)
      setItems(st.items); setSummary(st.summary)
    } catch (e) { setError(String(e.message || e)) }
    finally { setJudging(false) }
  }

  async function onReset() {
    if (session) await api.resetSession(session.id).catch(() => {})
    setSession(null); setItems([]); setSelected(null); setEdits({})
    setSummary({ script: { pass: 0, vuln: 0, na: 0 }, ai: { pass: 0, vuln: 0, na: 0 } })
    setProgress({ done: 0, total: 0 }); setTab('summary'); setError('')
    setSaveAsk(null); setAssetSaved(false); setNotice('')
  }

  const getEdit = (it) => edits[it.code] || { result: prefResult(it), reason: it.finalReason || it.reason || '' }

  async function onSave(it) {
    const ed = getEdit(it)
    try {
      await api.saveDecision(session.id, it.code, ed.result, ed.reason)
      setItems((prev) => prev.map((x) => x.code === it.code
        ? { ...x, decided: true, finalResult: ed.result, finalReason: ed.reason } : x))
      setSavedCode(it.code)
    } catch (e) { setError(String(e.message || e)) }
  }

  const shown = items.filter((it) => {
    const q = query.trim().toLowerCase()
    return !q || it.code.toLowerCase().includes(q) || (it.name || '').toLowerCase().includes(q)
  })
  const selItem = items.find((it) => it.code === selected) || null

  // KPI 계산
  const total = items.length
  const decided = items.filter((it) => it.decided).length
  const judged = items.filter((it) => it.ai)
  const matched = judged.filter((it) => it.ai === it.script).length
  const matchRate = judged.length ? Math.round((matched / judged.length) * 100) : null
  const donutCounts = donutMode === 'ai' ? summary.ai : summary.script

  // 보고서 정렬 (항목코드 / 중요도)
  const SEV_RANK = { 상: 3, 중: 2, 하: 1 }
  const reportRows = [...items].sort((a, b) => {
    let r
    if (sortKey === 'severity') r = (SEV_RANK[a.severity] || 0) - (SEV_RANK[b.severity] || 0)
    else r = String(a.code).localeCompare(String(b.code), undefined, { numeric: true })
    return sortDir === 'asc' ? r : -r
  })
  const sortArrow = (k) => (sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅')

  return (
    <div className="shell">
      <button className="side-toggle" style={{ left: sideOpen ? 228 : 12 }}
        onClick={() => setSideOpen((o) => !o)} title="사이드바 열기/닫기">{sideOpen ? '«' : '»'}</button>

      <Sidebar open={sideOpen} tab={tab} setTab={setTab} health={health} session={session}
        total={items.length} doneCount={doneCount}
        onUpload={onUpload} onJudge={onJudge} onReset={onReset} judging={judging}
        runKind={runKind} setRunKind={setRunKind}
        assetSaved={assetSaved} onSaveAsset={onSaveAsset} />

      <main className="main">
        <div className="topbar">
          <div className="crumb">대시보드 <span>/</span> {tab === 'summary' ? '요약 및 결과' : tab === 'report' ? '최종 보고서' : tab === 'assets' ? '자산관리' : '진단 결과 비교'}</div>
          <button className="theme-btn" onClick={() => setDark((v) => !v)}>{dark ? '☀ 라이트' : <><MoonIcon />다크</>}</button>
        </div>

        {notice && <div className="notice">{notice}</div>}
        {error && <div className="err">{error}</div>}

        {tab === 'assets' ? (
          <AssetManager />
        ) : tab === 'compare' ? (
          <CompareTab />
        ) : !session ? (
          <div className="placeholder">
            <div className="ph-ico">📄</div>
            <div className="ph-title">왼쪽에서 CSV 파일을 업로드하세요</div>
            <div className="ph-sub">was_diag 결과 CSV를 올리면 진단 결과 요약과 AI 교차 검증이 시작됩니다.</div>
          </div>
        ) : tab === 'summary' ? (
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
                    <span className="row"><span className="sw" style={{ background: '#ef4444' }} /> 스크립트</span>
                    <span className="row"><span className="sw" style={{ background: '#2563eb' }} /> AI</span>
                  </div>
                </div>
                <div style={{ padding: '18px 22px 12px' }}>
                  {judged.length === 0 && <div className="hint">※ "AI 교차 진단" 실행 시 AI(파랑) 막대가 채워집니다.</div>}
                  <Chart summary={summary} dark={dark} />
                  {(judging || progress.total > 0) && (
                    <>
                      <div className="progress"><div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
                      <div className="progress-txt">판정 진행 {progress.done}/{progress.total}</div>
                    </>
                  )}
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

            {/* 진단 결과 상세: 마스터-디테일 */}
            <section className="card">
              <div className="card-head">
                <div className="card-ico">📋</div>
                <div><h2 className="card-title">진단 결과 상세</h2>
                  <p className="card-sub">행을 클릭하면 자동화·AI 판단 근거를 비교합니다.</p></div>
              </div>
              <div className="master">
                <div>
                  <input className="search" placeholder="코드 또는 항목명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <div className="lhead">
                    <span className="lh-item">항목코드 · 항목명</span>
                    <span className="lh-cols">
                      <span className="lh-col">스크립트</span>
                      <span className="lh-col">AI</span>
                    </span>
                  </div>
                  <div className="list">
                    {shown.length === 0 && <div className="detail-empty">검색 결과가 없습니다</div>}
                    {shown.map((it) => (
                      <button key={it.code} className={`lrow${it.code === selected ? ' sel' : ''}`} onClick={() => setSelected(it.code)}>
                        <div style={{ minWidth: 0 }}>
                          <div className="lcode">{it.code}</div>
                          <div className="lname">{it.name}</div>
                        </div>
                        <div className="lpills"><Pill v={it.script} sm /><Pill v={it.ai} sm /></div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Detail item={selItem}
                    edit={selItem ? getEdit(selItem) : { result: 'N/A', reason: '' }}
                    setEdit={(ed) => selItem && setEdits((p) => ({ ...p, [selItem.code]: ed }))}
                    onSave={() => selItem && onSave(selItem)}
                    saved={savedCode === selItem?.code} />
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="card">
            <div className="card-head">
              <div className="card-ico" style={{ background: '#dcf5ec', color: '#047857' }}>📄</div>
              <div style={{ flex: 1 }}><h2 className="card-title">최종 보고서</h2>
                <p className="card-sub">확정 항목은 확정값, 미확정 항목은 자동화 스크립트 결과를 사용합니다.</p></div>
              <div className="sort-bar">
                <button className={`sort-btn${sortKey === 'code' ? ' on' : ''}`} onClick={() => toggleSort('code')}>항목코드 {sortArrow('code')}</button>
                <button className={`sort-btn${sortKey === 'severity' ? ' on' : ''}`} onClick={() => toggleSort('severity')}>중요도 {sortArrow('severity')}</button>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="report">
                <thead>
                  <tr>
                    <th>항목코드</th><th>분류</th><th>항목</th><th>판단 기준</th>
                    <th className="c">결과</th><th>판단 근거</th>
                    <th className="c">진단 대상</th><th className="c">진단 대상 IP</th><th className="c">중요도</th>
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
                        <td className="nm">{it.name}</td>
                        <td className="reason" style={{ minWidth: 240 }}>{it.criteria}</td>
                        <td className="c"><Pill v={r} /></td>
                        <td className="reason">{reason}</td>
                        <td className="c">{it.target}</td>
                        <td className="c">{it.ip}</td>
                        <td className="c"><span className={`sev ${it.severity}`}>{it.severity}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="report-actions">
              <a href={api.reportXlsxUrl(session.id)}>
                <button className="btn good" style={{ width: 'auto', padding: '13px 22px' }}>⬇ 엑셀 다운로드 (.xlsx)</button>
              </a>
            </div>
          </section>
        )}
      </main>

      {saveAsk && (
        <SaveAssetModal info={saveAsk} onSave={onSaveAsset} onClose={() => setSaveAsk(null)} />
      )}
    </div>
  )
}
