import React, { useEffect, useRef, useState } from 'react'
import * as api from './api.js'
<<<<<<< Updated upstream

const VALID = ['양호', '취약', 'N/A']
const prefResult = (it) =>
  it.finalResult || (VALID.includes(it.script) ? it.script : '') ||
  (VALID.includes(it.ai) ? it.ai : '') || 'N/A'

// 보기 좋은 눈금 간격(1·2·5·10·…)
function niceStep(maxVal) {
  const raw = maxVal / 6
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / pow
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return Math.max(1, Math.round(m * pow))
}

function Pill({ v, sm }) {
  const cls = v === '양호' ? 'pass' : v === '취약' ? 'vuln' : v === 'N/A' ? 'na' : 'none'
  return <span className={`pill ${cls}${sm ? ' sm' : ''}`}>{v || '보류'}</span>
}
function Match({ v }) {
  const cls = v === '일치' ? 'match' : v === '불일치' ? 'mis' : 'none'
  return <span className={`pill ${cls} sm`}>{v}</span>
}
// 단색(채워진) 초승달 아이콘 — 버튼 글자색을 그대로 따라감
function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
      style={{ verticalAlign: '-2px', marginRight: 5 }}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

// ── 막대그래프 (스크립트 vs AI) ────────────────────────────────
function Chart({ summary, dark }) {
  const cInk = dark ? '#e6ebf5' : '#0b1220'
  const cSlate = dark ? '#b6c0d4' : '#3f4a5c'
  const cMute = dark ? '#8a95ab' : '#7e8aa0'
  const cGrid = dark ? '#26334d' : '#eef2f8'
  const cBase = dark ? '#33425f' : '#e6ebf2'
  const data = [
    { label: '양호', s: summary.script.pass, a: summary.ai.pass },
    { label: '취약', s: summary.script.vuln, a: summary.ai.vuln },
    { label: 'N/A', s: summary.script.na, a: summary.ai.na },
  ]
  const W = 1180, H = 330, padL = 44, padR = 20, padT = 30, padB = 50
  const plotH = H - padT - padB, plotW = W - padL - padR
  const rawMax = Math.max(1, ...data.flatMap((d) => [d.s, d.a]))
  const step = niceStep(rawMax)
  const axisMax = Math.ceil(rawMax / step) * step
  const gw = plotW / data.length, bw = 50, gap = 32
  const yFor = (v) => padT + plotH - (v / axisMax) * plotH
  const ticks = []
  for (let t = 0; t <= axisMax; t += step) ticks.push(t)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f87171" /><stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
        <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)}
            stroke={t === 0 ? cBase : cGrid} strokeWidth={t === 0 ? 1.4 : 1} />
          <text x={padL - 12} y={yFor(t) + 5} textAnchor="end" fontSize="15" fill={cMute} fontWeight="700">{t}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + gw * i + gw / 2
        const x1 = cx - bw - gap / 2, x2 = cx + gap / 2
        return (
          <g key={d.label}>
            <rect x={x1} y={yFor(d.s)} width={bw} height={plotH - (yFor(d.s) - padT)} rx="7" fill="url(#gs)" />
            <text x={x1 + bw / 2} y={yFor(d.s) - 8} textAnchor="middle" fontSize="19" fontWeight="900" fill={cInk}>{d.s}</text>
            <rect x={x2} y={yFor(d.a)} width={bw} height={plotH - (yFor(d.a) - padT)} rx="7" fill="url(#ga)" />
            <text x={x2 + bw / 2} y={yFor(d.a) - 8} textAnchor="middle" fontSize="19" fontWeight="900" fill={cInk}>{d.a}</text>
            <text x={cx} y={H - 16} textAnchor="middle" fontSize="18" fontWeight="800" fill={cSlate}>{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 도넛(원) 차트 ──────────────────────────────────────────────
function Donut({ counts, dark }) {
  const segs = [
    { v: counts.pass, c: '#10b981', label: '양호' },
    { v: counts.vuln, c: '#ef4444', label: '취약' },
    { v: counts.na, c: '#94a3b8', label: 'N/A' },
  ]
  const total = segs.reduce((s, x) => s + x.v, 0)
  const R = 58, sw = 22, cx = 80, cy = 80, CIRC = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" className="donut-svg">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={dark ? '#26334d' : '#eef2f7'} strokeWidth={sw} />
        {total > 0 && segs.map((s, i) => {
          if (!s.v) return null
          const dash = (s.v / total) * CIRC
          const el = (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.c} strokeWidth={sw}
              strokeDasharray={`${dash} ${CIRC - dash}`} strokeDashoffset={-acc}
              transform={`rotate(-90 ${cx} ${cy})`} />
          )
          acc += dash
          return el
        })}
        <text x={cx} y={cy - 1} textAnchor="middle" fontSize="28" fontWeight="900"
          fill={dark ? '#e6ebf5' : '#0b1220'}>{total}</text>
        <text x={cx} y={cy + 19} textAnchor="middle" fontSize="11" fontWeight="700"
          fill={dark ? '#8a95ab' : '#7e8aa0'}>총 항목</text>
      </svg>
      <div className="donut-legend">
        {segs.map((s, i) => (
          <div key={i} className="dl-row">
            <span className="dl-sw" style={{ background: s.c }} />
            <span className="dl-name">{s.label}</span>
            <b>{s.v}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 사이드바 (네이비) ──────────────────────────────────────────
function Sidebar({ open, tab, setTab, health, session, total, doneCount, onUpload, onJudge, onReset, judging }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)
  const pending = total - doneCount
  const pick = (f) => f && onUpload(f)
  return (
    <aside className={`sidebar${open ? '' : ' collapsed'}`}>
      <div className="brand"><img className="brand-img" src="/logo.png" alt="CHECKER" /></div>

      <div className="menu-label">MENU</div>
      <nav className="nav">
        <button className={`nav-item${tab === 'summary' ? ' active' : ''}`} onClick={() => setTab('summary')}>
          <span className="ni-ico">▤</span> 요약 및 결과
        </button>
        <button className={`nav-item${tab === 'report' ? ' active' : ''}`} onClick={() => setTab('report')}>
          <span className="ni-ico">▦</span> 최종 보고서
          {session && <span className="nav-badge">{total}</span>}
        </button>
      </nav>

      <div className="menu-label">CSV 업로드</div>
      <div className={`dropzone${drag ? ' drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}>
        <div className="up-ico">⬆</div>
        <div className="dz-title">파일을 끌어다 놓기 / 클릭</div>
        <div className="dz-sub">.csv · 최대 200MB</div>
        <input ref={inputRef} type="file" accept=".csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      {session && (
        <div className="filechip">
          <div className="fi">📄</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fn">{session.filename}</div>
            <div className="fm">완료 {doneCount} / {total}건</div>
          </div>
        </div>
      )}

      {session && (
        <>
          <button className="btn primary" disabled={!health?.ready || judging || pending === 0}
            onClick={() => onJudge('pending')}>
            {judging ? <><span className="spinner" /> 판정 중…</> : <>🛡 AI 교차 진단 ({pending}건)</>}
          </button>
          <div className="btn-row">
            <button className="btn ghost" disabled={!health?.ready || judging} onClick={() => onJudge('all')}>⟳ 재진단</button>
            <button className="btn ghost" disabled={judging} onClick={onReset}>↺ 초기화</button>
          </div>
        </>
      )}
    </aside>
  )
}

// ── 디테일 ─────────────────────────────────────────────────────
function Detail({ item, edit, setEdit, onSave, saved }) {
  const [showFull, setShowFull] = useState(false)
  useEffect(() => { setShowFull(false) }, [item?.code])
  if (!item) return <div className="detail-empty">← 왼쪽에서 항목을 선택하세요</div>

  const critLines = String(item.criteria || '판단기준 정보 없음').split('|').map((s) => s.trim()).filter(Boolean)
  const check = String(item.check || '점검 내용 없음')
  const long = check.length > 160

  return (
    <div>
      <div className="detail-head">
        <span className="dh-code">{item.code}</span> <span className="dh-name">· {item.name}</span>
      </div>
      <div className="cmp-grid">
        <div className="cmp">
          <div className="cmp-head"><span className="cmp-title">자동화 스크립트</span><Pill v={item.script} /></div>
          <div className="cmp-label">판단 근거</div>
          <div className="cmp-text">{critLines.join('\n\n')}</div>
          <div className="cmp-label">확인 내용</div>
          <div className={`cmp-code${long && !showFull ? ' clamp' : ''}`}>{check}</div>
          {long && <button className="more-link" onClick={() => setShowFull((v) => !v)}>{showFull ? '접기 ▴' : '자세히 확인 ▾'}</button>}
        </div>
        <div className="cmp">
          <div className="cmp-head"><span className="cmp-title">AI 분석</span><Pill v={item.ai || '보류'} /></div>
          <div className="cmp-label">판단 근거</div>
          <div className="cmp-text">{item.reason || '아직 판정되지 않았습니다.'}</div>
        </div>
      </div>
      <div className="edit">
        <div>
          <div className="edit-label">최종 결과</div>
          <div className="radio-row">
            {VALID.map((v) => (
              <label key={v} className="radio">
                <input type="radio" name={`res-${item.code}`} checked={edit.result === v}
                  onChange={() => setEdit({ ...edit, result: v })} /> {v}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="edit-label">최종 판단 근거</div>
          <textarea className="ta" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />
        </div>
      </div>
      <div className="save-row">
        <button className="btn primary save-btn" onClick={onSave}>이 항목 확정</button>
        {saved && <span className="saved-tag">✓ 확정됨</span>}
      </div>
    </div>
  )
}

// ── KPI 카드 ───────────────────────────────────────────────────
function Kpi({ title, value, sub, accent, tone, box }) {
  return (
    <div className={`kpi${accent ? ' accent' : ''}${box === 'vuln' ? ' vuln-box' : ''}`}>
      <div className="kpi-title">{title}</div>
      <div className={`kpi-val${tone ? ' ' + tone : ''}`}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

// ── 취약 항목 비교(막대): AI vs 자동화 스크립트 ────────────────
function VulnCompare({ summary, total }) {
  const max = Math.max(total, 1)
  const rows = [
    { label: 'AI 진단', v: summary.ai.vuln, cls: 'ai' },
    { label: '자동화 스크립트 진단', v: summary.script.vuln, cls: 'script' },
  ]
  return (
    <div className="vcmp">
      <div className="vcmp-head">
        <h3 className="vcmp-title">AI 및 자동화 스크립트 취약 항목 비교</h3>
        <span className="vcmp-sub">취약 항목 기준</span>
      </div>
      <div className="vcmp-rows">
        {rows.map((r) => (
          <div className="vcmp-row" key={r.label}>
            <div className="vcmp-name">{r.label}</div>
            <div className={`vcmp-cnt ${r.cls}`}>{r.v}건</div>
            <div className="vcmp-track">
              <div className={`vcmp-fill ${r.cls}${r.v ? '' : ' empty'}`} style={{ width: `${(r.v / max) * 100}%` }} />
            </div>
            <div className="vcmp-end">{r.v}</div>
          </div>
        ))}
      </div>
      <div className="vcmp-foot">{max}건 기준</div>
    </div>
  )
}
=======
import { Kpi, MoonIcon, Pill, matchLabel, formatCriteria, prefResult, isVuln, labelReason } from './ui.jsx'
import { Chart, Donut, VulnCompare } from './charts.jsx'
import Sidebar from './Sidebar.jsx'
import Detail from './Detail.jsx'
import AssetManager from './AssetManager.jsx'
import CompareTab from './CompareTab.jsx'
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
=======
  const [assetSaved, setAssetSaved] = useState(false)  // 현재 세션이 자산목록에 추가됐는지
  const [notice, setNotice] = useState('')
>>>>>>> Stashed changes
  const [error, setError] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [sideOpen, setSideOpen] = useState(true)
  const [donutMode, setDonutMode] = useState('ai')   // 'ai' | 'script'
  const [sortKey, setSortKey] = useState('code')     // 'code' | 'severity'
  const [sortDir, setSortDir] = useState('asc')      // 'asc' | 'desc'
  const [assetTarget, setAssetTarget] = useState(null)  // 사이드바 트리 → 자산관리 네비게이션 지시
  const [assetsVersion, setAssetsVersion] = useState(0) // 자산/기록 변경 시 사이드바·가운데 동기 갱신 신호
  const bumpAssets = () => setAssetsVersion((v) => v + 1)

  // 사이드바 자산 트리에서 대상/진단기록 클릭 시 자산관리 탭에 해당 항목 표시
  // (asset=null이면 가운데를 비움 — 삭제 후 등. nonce로 동일 대상 재클릭도 반영)
  const navAsset = (asset = null, run = null) => {
    setTab('assets')
    setAssetTarget((t) => ({ asset, run, nonce: (t?.nonce || 0) + 1 }))
  }

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
<<<<<<< Updated upstream
      const res = await api.uploadCsv(file)
=======
      const res = await api.uploadCsv(file)   // 종류는 비교 탭에서 지정(기본 최초진단)
>>>>>>> Stashed changes
      setSession({ id: res.session_id, filename: res.filename })
      setItems(res.items); setSummary(res.summary)
      setSelected(res.items[0]?.code ?? null)
      setEdits({}); setTab('summary'); setSavedCode(null)
<<<<<<< Updated upstream
    } catch (e) { setError(String(e.message || e)) }
  }

=======
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

>>>>>>> Stashed changes
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
                match: !ev.result ? '미판정' : (ev.result === it.script ? '일치' : '불일치') }
            : it))
        }
      }
      const st = await api.getState(session.id)
      setItems(st.items); setSummary(st.summary)
    } catch (e) { setError(String(e.message || e)) }
    finally { setJudging(false); setCancelling(false) }
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
<<<<<<< Updated upstream
=======
    setAssetSaved(false); setNotice('')
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        onUpload={onUpload} onJudge={onJudge} onReset={onReset} judging={judging} />
=======
        onUpload={onUpload} onJudge={onJudge} onReset={onReset} judging={judging}
        onCancelJudge={onCancelJudge} cancelling={cancelling}
        assetSaved={assetSaved} onSaveAsset={onSaveAsset}
        onNavigateAsset={navAsset} assetTarget={assetTarget}
        assetsVersion={assetsVersion} onAssetsChanged={bumpAssets} />
>>>>>>> Stashed changes

      <main className="main">
        <div className="topbar">
          <div className="crumb">대시보드 <span>/</span> {tab === 'summary' ? '요약 및 결과' : '최종 보고서'}</div>
          <button className="theme-btn" onClick={() => setDark((v) => !v)}>{dark ? '☀ 라이트' : <><MoonIcon />다크</>}</button>
        </div>

        {error && <div className="err">{error}</div>}

<<<<<<< Updated upstream
        {!session ? (
=======
        {tab === 'assets' ? (
          <AssetManager dark={dark} target={assetTarget} onNavigateAsset={navAsset}
            assetsVersion={assetsVersion} onAssetsChanged={bumpAssets} />
        ) : tab === 'compare' ? (
          <CompareTab />
        ) : !session ? (
>>>>>>> Stashed changes
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
              <button className="btn primary" style={{ width: 'auto', padding: '13px 22px' }}
                onClick={onSaveAsset} disabled={assetSaved}>
                {assetSaved ? '✓ 자산 관리에 추가됨' : '🖥 자산 관리에 추가'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
