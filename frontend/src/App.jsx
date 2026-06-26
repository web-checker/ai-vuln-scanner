import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api.js'
import { MoonIcon, Pill, prefResult, REPORT_FIRST, REPORT_FINAL } from './ui.jsx'
import { SummaryCharts } from './dashboard.jsx'
import Sidebar from './Sidebar.jsx'
import Detail from './Detail.jsx'
import AssetManager from './AssetManager.jsx'
import CompareTab from './CompareTab.jsx'
import ReportTab from './ReportTab.jsx'

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
  const [cancelling, setCancelling] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [edits, setEdits] = useState({})
  const [savedCode, setSavedCode] = useState(null)
  const [assetSaved, setAssetSaved] = useState(false)  // 현재 세션이 자산목록에 추가됐는지
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [sideOpen, setSideOpen] = useState(true)
  const [donutMode, setDonutMode] = useState('ai')   // 'ai' | 'script'
  const [runKind, setRunKind] = useState('최초진단')  // 업로드 시 진단 종류(사이드바에서 선택)
  const [reportKind, setReportKind] = useState(REPORT_FIRST)  // 보고서 하위탭(최초/최종)
  const [assetTarget, setAssetTarget] = useState(null)  // 사이드바 트리 → 자산관리 네비게이션 지시
  const [assetsVersion, setAssetsVersion] = useState(0) // 자산/기록 변경 시 사이드바·가운데 동기 갱신 신호
  const bumpAssets = () => setAssetsVersion((v) => v + 1)

  // 사이드바 자산 트리에서 대상/진단기록 클릭 시 자산관리 탭에 해당 항목 표시
  // (asset=null이면 가운데를 비움 — 삭제 후 등. nonce로 동일 대상 재클릭도 반영)
  const navAsset = (asset = null, run = null) => {
    setTab('assets')
    setAssetTarget((t) => ({ asset, run, nonce: (t?.nonce || 0) + 1 }))
  }

  useEffect(() => { api.getHealth().then(setHealth).catch(() => setHealth({ ready: false, message: '백엔드 연결 실패', backend: '-' })) }, [])
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const doneCount = items.filter((it) => it.ai).length

  // 현재 세션을 ref로 추적 — 판정 스트림(onJudge) 도중 리셋/세션변경 시 stale 반영 차단용
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])

  async function onUpload(file) {
    setError('')
    try {
      const res = await api.uploadCsv(file, runKind)   // 진단 종류는 사이드바에서 선택
      setSession({ id: res.session_id, filename: res.filename })
      setItems(res.items); setSummary(res.summary)
      setSelected(res.items[0]?.code ?? null)
      setEdits({}); setTab('summary'); setSavedCode(null)
      setAssetSaved(false); setNotice('')
      // 업로드 직후 자동 저장하지 않음. 자산 추가는 최종 보고서 탭의 버튼으로 진행
    } catch (e) { setError(String(e.message || e)) }
  }

  async function onSaveAsset() {
    if (!session) return
    try {
      await api.saveAsset(session.id)
      setAssetSaved(true); bumpAssets()
      setNotice('자산 관리에 추가되었습니다.')
      setTimeout(() => setNotice(''), 3000)
    } catch (e) { setError(String(e.message || e)) }
  }

  async function onJudge(mode) {
    if (!session) return
    const sid = session.id   // 이 진단 세션 고정 — 도중 리셋되면 stale 반영을 막는다
    setError(''); setJudging(true); setProgress({ done: 0, total: 0 })
    try {
      for await (const ev of api.judgeStream(sid, mode)) {
        if (sessionRef.current?.id !== sid) break   // 리셋/세션변경 → 소비·반영 중단
        if (ev.event === 'start') setProgress({ done: 0, total: ev.total })
        else if (ev.event === 'item') {
          setProgress({ done: ev.done, total: ev.total })
          setItems((prev) => prev.map((it) => it.code === ev.code
            ? { ...it, ai: ev.result, reason: ev.reason, remediation: ev.remediation,
                source: ev.source, confidence: ev.confidence }
            : it))
        }
      }
      if (sessionRef.current?.id !== sid) return     // 종료 후 세션이 바뀌었으면 덮어쓰지 않음
      const st = await api.getState(sid)
      if (sessionRef.current?.id !== sid) return
      setItems(st.items); setSummary(st.summary)
    } catch (e) { if (sessionRef.current?.id === sid) setError(String(e.message || e)) }
    finally { setJudging(false); setCancelling(false) }   // UI 플래그는 항상 해제(멈춤 방지)
  }

  async function onCancelJudge() {
    if (!session || !judging) return
    setCancelling(true)
    try { await api.cancelJudge(session.id) }
    catch (e) { setCancelling(false); setError(String(e.message || e)) }
  }

  async function onReset() {
    if (session) await api.resetSession(session.id).catch(() => {})
    setSession(null); setItems([]); setSelected(null); setEdits({})
    setSummary({ script: { pass: 0, vuln: 0, na: 0 }, ai: { pass: 0, vuln: 0, na: 0 } })
    setProgress({ done: 0, total: 0 }); setTab('summary'); setError('')
    setAssetSaved(false); setNotice('')
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

  const shown = useMemo(() => items.filter((it) => {
    const q = query.trim().toLowerCase()
    return !q || it.code.toLowerCase().includes(q) || (it.name || '').toLowerCase().includes(q)
  }), [items, query])
  const selItem = items.find((it) => it.code === selected) || null

  // KPI 계산
  const total = items.length
  const decided = items.filter((it) => it.decided).length
  const judged = items.filter((it) => it.ai)
  const matched = judged.filter((it) => it.ai === it.script).length
  const matchRate = judged.length ? Math.round((matched / judged.length) * 100) : null

  return (
    <div className="shell">
      <button className="side-toggle" style={{ left: sideOpen ? 228 : 12 }}
        onClick={() => setSideOpen((o) => !o)} title="사이드바 열기/닫기">{sideOpen ? '«' : '»'}</button>

      <Sidebar open={sideOpen} tab={tab} setTab={setTab} health={health} session={session}
        total={items.length} doneCount={doneCount}
        onUpload={onUpload} onJudge={onJudge} onReset={onReset} judging={judging}
        runKind={runKind} setRunKind={setRunKind}
        reportKind={reportKind} setReportKind={setReportKind}
        onCancelJudge={onCancelJudge} cancelling={cancelling}
        assetSaved={assetSaved} onSaveAsset={onSaveAsset} />

      <main className="main">
        <div className="topbar">
          <div className="crumb">대시보드 <span>/</span> {tab === 'summary' ? '요약 및 결과' : tab === 'report' ? (reportKind === REPORT_FINAL ? '최종 보고서' : '최초 보고서') : tab === 'assets' ? '자산 관리' : '진단 결과 비교'}</div>
          <button className="theme-btn" onClick={() => setDark((v) => !v)}>{dark ? '☀ 라이트' : <><MoonIcon />다크</>}</button>
        </div>

        {notice && <div className="notice">{notice}</div>}
        {error && <div className="err">{error}</div>}

        {tab === 'assets' ? (
          <AssetManager dark={dark} target={assetTarget} onNavigateAsset={navAsset}
            assetsVersion={assetsVersion} onAssetsChanged={bumpAssets} />
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
            <SummaryCharts summary={summary} total={total} decided={decided} matchRate={matchRate}
              donutMode={donutMode} setDonutMode={setDonutMode} dark={dark}>
              {(judging || progress.total > 0) && (
                <>
                  <div className="progress"><div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
                  <div className="progress-txt">판정 진행 {progress.done}/{progress.total}</div>
                </>
              )}
            </SummaryCharts>

            {/* 진단 결과 상세: 마스터-디테일 */}
            <section className="card">
              <div className="card-head">
                <div className="card-ico">📋</div>
                <div><h2 className="card-title">진단 결과 상세</h2>
                  <p className="card-sub">행 클릭 시 자동화·AI 판단 근거 확인 가능 </p></div>
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
          <ReportTab reportKind={reportKind} session={session} sessionItems={items} />
        )}
      </main>
    </div>
  )
}
