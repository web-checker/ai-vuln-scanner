import React, { useEffect, useRef, useState } from 'react'
import * as api from './api.js'

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
function Sidebar({ open, tab, setTab, health, session, total, doneCount, onUpload, onJudge, onReset, judging, runKind, setRunKind, assetSaved, onSaveAsset }) {
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
        <button className={`nav-item${tab === 'assets' ? ' active' : ''}`} onClick={() => setTab('assets')}>
          <span className="ni-ico">🖥</span> 자산관리
        </button>
        <button className={`nav-item${tab === 'compare' ? ' active' : ''}`} onClick={() => setTab('compare')}>
          <span className="ni-ico">⇄</span> 진단 결과 비교
        </button>
      </nav>

      <div className="menu-label">CSV 업로드</div>
      <div className="runkind">
        {['최초진단', '이행점검'].map((k) => (
          <label key={k} className={`runkind-opt${runKind === k ? ' on' : ''}`}>
            <input type="radio" name="runkind" checked={runKind === k} onChange={() => setRunKind(k)} /> {k}
          </label>
        ))}
      </div>
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
        assetSaved
          ? <div className="asset-saved">✓ 자산목록에 추가됨</div>
          : <button className="btn ghost" onClick={onSaveAsset}>🖥 자산목록에 추가</button>
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

// ── 비교 상태 배지 ─────────────────────────────────────────────
const CMP_CLS = { 개선: 'pass', 미조치: 'vuln', 악화: 'warn', 양호유지: 'pass', 대상외: 'none' }
function StatusBadge({ v }) {
  return <span className={`pill ${CMP_CLS[v] || 'none'} sm`}>{v}</span>
}

// 공통 포맷 헬퍼
const fmtDateTime = (at) => (at || '').slice(0, 16).replace('T', ' ')
const fmtRunOpt = (r) => `${r.kind} · ${fmtDateTime(r.at)} · ${r.filename}`

// ── 자산관리: 목록 → 진단이력(삭제 가능). 비교는 별도 '비교' 탭 ──
function AssetManager() {
  const [view, setView] = useState('list')          // 'list' | 'runs'
  const [assets, setAssets] = useState([])
  const [asset, setAsset] = useState(null)
  const [runs, setRuns] = useState([])
  const [collapsed, setCollapsed] = useState({})    // 원본파일명별 접힘 상태
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const toggleGroup = (fn) => setCollapsed((c) => ({ ...c, [fn]: !c[fn] }))

  const loadAssets = () => {
    setLoading(true)
    api.getAssets().then((r) => setAssets(r.assets || []))
      .catch((e) => setErr(String(e.message || e))).finally(() => setLoading(false))
  }
  useEffect(() => { loadAssets() }, [])

  const reloadRuns = async (aid) => {
    try { const r = await api.getAssetRuns(aid); setRuns(r.runs || []) }
    catch (e) { setErr(String(e.message || e)) }
  }
  async function openAsset(a) { setErr(''); setAsset(a); setView('runs'); await reloadRuns(a.asset_id) }

  async function onDeleteAsset(a, e) {
    e.stopPropagation()
    if (!window.confirm(`자산 '${a.name || a.ip}'와(과) 진단 이력 ${a.runCount}건을 모두 삭제할까요?`)) return
    try { await api.deleteAsset(a.asset_id); loadAssets() } catch (e2) { setErr(String(e2.message || e2)) }
  }
  async function onDeleteRun(r) {
    if (!window.confirm(`진단 기록을 삭제할까요?\n${fmtRunOpt(r)}`)) return
    try {
      await api.deleteRun(r.run_id)
      const left = runs.filter((x) => x.run_id !== r.run_id)
      if (left.length === 0) { loadAssets(); setView('list') } else setRuns(left)
    } catch (e) { setErr(String(e.message || e)) }
  }

  // ── 목록 ──
  if (view === 'list') {
    return (
      <section className="card">
        <div className="card-head">
          <div className="card-ico" style={{ background: '#e7eefc', color: '#2563eb' }}>🖥</div>
          <div style={{ flex: 1 }}><h2 className="card-title">자산관리</h2>
            <p className="card-sub">진단대상(IP)별로 저장된 진단 이력입니다. 행을 클릭하면 진단 기록을 보고 삭제할 수 있습니다.</p></div>
          <button className="sort-btn" onClick={loadAssets}>⟳ 새로고침</button>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="tbl-wrap">
          <table className="report">
            <thead><tr>
              <th>진단대상</th><th>IP</th><th>분류</th><th className="c">진단 횟수</th><th>최근 진단</th><th className="c">삭제</th>
            </tr></thead>
            <tbody>
              {assets.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#7e8aa0' }}>
                {loading ? '불러오는 중…' : '저장된 자산이 없습니다. CSV를 업로드하면 자동 등록됩니다.'}</td></tr>}
              {assets.map((a) => (
                <tr key={a.asset_id} style={{ cursor: 'pointer' }} onClick={() => openAsset(a)}>
                  <td className="nm">{a.name || '(이름 없음)'}</td>
                  <td className="code">{a.ip}</td>
                  <td>{a.group}</td>
                  <td className="c"><span className="nav-badge" style={{ position: 'static' }}>{a.runCount}</span></td>
                  <td>{fmtDateTime(a.lastSeen)}</td>
                  <td className="c"><button className="del-btn" onClick={(e) => onDeleteAsset(a, e)} title="자산 전체 삭제">🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  // 원본파일명별 그룹(첫 등장 순서 유지). 같은 파일의 여러 진단을 접어서 깔끔하게.
  const groups = []
  const byFile = new Map()
  for (const r of runs) {
    if (!byFile.has(r.filename)) { const g = { filename: r.filename, runs: [] }; byFile.set(r.filename, g); groups.push(g) }
    byFile.get(r.filename).runs.push(r)
  }

  // ── 진단이력(Run): 파일명별 그룹 + 기록 삭제 ──
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-ico" style={{ background: '#e7eefc', color: '#2563eb' }}>🗂</div>
        <div style={{ flex: 1 }}><h2 className="card-title">{asset?.name} · {asset?.ip}</h2>
          <p className="card-sub">원본파일별로 묶었습니다. 헤더를 눌러 펼치고, 🗑로 개별 기록을 삭제합니다. 비교는 “진단 결과 비교” 메뉴에서 합니다.</p></div>
        <button className="sort-btn" onClick={() => setView('list')}>← 자산 목록</button>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="tbl-wrap">
        <table className="report">
          <thead><tr><th>종류</th><th>일시</th><th className="c">총항목</th>
            <th className="c">취약</th><th className="c">양호</th><th className="c">N/A</th><th className="c">삭제</th></tr></thead>
          <tbody>
            {groups.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#7e8aa0' }}>진단 기록이 없습니다.</td></tr>}
            {groups.map((g) => (
              <React.Fragment key={g.filename}>
                <tr className="grp-row" onClick={() => toggleGroup(g.filename)}>
                  <td colSpan={7}>
                    <span className="grp-caret">{collapsed[g.filename] ? '▸' : '▾'}</span>
                    📄 {g.filename} <span className="grp-count">{g.runs.length}건</span>
                  </td>
                </tr>
                {!collapsed[g.filename] && g.runs.map((r) => (
                  <tr key={r.run_id}>
                    <td><span className={`pill ${r.kind === '최초진단' ? 'na' : 'warn'} sm`}>{r.kind}</span></td>
                    <td className="code">{fmtDateTime(r.at)}</td>
                    <td className="c">{r.total}</td><td className="c">{r.vuln}</td>
                    <td className="c">{r.pass}</td><td className="c">{r.na}</td>
                    <td className="c"><button className="del-btn" onClick={() => onDeleteRun(r)} title="이 기록 삭제">🗑</button></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── 비교(별도 탭): 자산·기준(base)·대상(target) 선택 → 비교 ────
function CompareTab() {
  const [assets, setAssets] = useState([])
  const [assetId, setAssetId] = useState('')
  const [runs, setRuns] = useState([])
  const [base, setBase] = useState('')
  const [target, setTarget] = useState('')
  const [cmp, setCmp] = useState(null)
  const [filter, setFilter] = useState('전체')
  const [err, setErr] = useState('')

  const selectAsset = async (aid) => {
    setAssetId(aid); setCmp(null); setErr('')
    if (!aid) { setRuns([]); setBase(''); setTarget(''); return }
    try {
      const r = await api.getAssetRuns(aid)
      const rs = r.runs || []
      setRuns(rs)
      setBase(rs[0]?.run_id || '')
      setTarget(rs.length > 1 ? rs[rs.length - 1].run_id : (rs[0]?.run_id || ''))
    } catch (e) { setErr(String(e.message || e)) }
  }

  useEffect(() => {
    api.getAssets().then((r) => {
      const list = r.assets || []
      setAssets(list)
      if (list[0]) selectAsset(list[0].asset_id)
    }).catch((e) => setErr(String(e.message || e)))
  }, [])

  async function runCompare() {
    if (!base || !target) return
    if (base === target) { setErr('서로 다른 진단실행을 선택하세요.'); return }
    setErr('')
    try { const r = await api.getCompare(base, target); setCmp(r); setFilter('전체') }
    catch (e) { setErr(String(e.message || e)) }
  }

  const baseRun = runs.find((r) => r.run_id === base)
  const targetRun = runs.find((r) => r.run_id === target)
  const s = cmp?.summary || {}
  const rows = (cmp?.rows || []).filter((r) => filter === '전체' || r.상태 === filter)

  const TargetCard = ({ label, run }) => (
    <div className="cmp-target">
      <div className="ct-label">{label}</div>
      <span className={`pill ${run?.kind === '최초진단' ? 'na' : 'warn'} sm`}>{run?.kind || '—'}</span>
      <div className="ct-meta">{fmtDateTime(run?.at)}</div>
      <div className="ct-file">{run?.filename || '—'}</div>
      <div className="ct-vuln">취약 {run?.vuln ?? 0}건</div>
    </div>
  )

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div className="card-ico" style={{ background: '#dcf5ec', color: '#047857' }}>⇄</div>
          <div style={{ flex: 1 }}><h2 className="card-title">진단 결과 비교</h2>
            <p className="card-sub">자산과 비교할 두 진단실행(기준·대상)을 선택하세요.</p></div>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="cmp-pick" style={{ padding: '4px 22px 18px' }}>
          <div className="cmp-pick-field">
            <label>자산</label>
            <select value={assetId} onChange={(e) => selectAsset(e.target.value)}>
              {assets.length === 0 && <option value="">(저장된 자산 없음)</option>}
              {assets.map((a) => <option key={a.asset_id} value={a.asset_id}>{(a.name || a.ip)} · {a.ip} (이력 {a.runCount})</option>)}
            </select>
          </div>
          <div className="cmp-pick-field">
            <label>기준(base)</label>
            <select value={base} onChange={(e) => setBase(e.target.value)}>
              {runs.map((r) => <option key={r.run_id} value={r.run_id}>{fmtRunOpt(r)}</option>)}
            </select>
          </div>
          <div className="cmp-vs">→</div>
          <div className="cmp-pick-field">
            <label>대상(target)</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {runs.map((r) => <option key={r.run_id} value={r.run_id}>{fmtRunOpt(r)}</option>)}
            </select>
          </div>
          <button className="btn primary" style={{ width: 'auto', padding: '11px 22px' }}
            disabled={runs.length < 2} onClick={runCompare}>⇄ 비교</button>
        </div>
        {assetId && runs.length < 2 && <div className="hint" style={{ padding: '0 22px 16px' }}>※ 비교하려면 이 자산에 진단실행이 2개 이상 필요합니다.</div>}
      </section>

      {cmp && (
        <section className="card">
          <div className="cmp-targets">
            <TargetCard label="기준 (base)" run={baseRun} />
            <div className="cmp-arrow">→</div>
            <TargetCard label="대상 (target)" run={targetRun} />
          </div>
          <div className="cmp-kpis">
            <Kpi title="개선(조치완료)" value={s.improved ?? 0} sub="취약 → 양호" tone="good" />
            <Kpi title="미조치" value={s.unfixed ?? 0} sub="취약 → 취약" box="vuln" tone="bad" />
            <Kpi title="악화(신규취약)" value={s.worsened ?? 0} sub="양호 → 취약" tone="bad" />
            <Kpi title="조치율" value={s.fixRate == null ? '—' : `${s.fixRate}%`} sub={`기준 취약 ${s.baseVuln ?? 0}건 기준`} accent />
          </div>
          <div className="sort-bar" style={{ padding: '8px 22px' }}>
            {['전체', '개선', '미조치', '악화', '양호유지', '대상외'].map((f) => (
              <button key={f} className={`sort-btn${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="tbl-wrap">
            <table className="report">
              <thead><tr><th>항목코드</th><th>분류</th><th>항목</th><th className="c">중요도</th>
                <th className="c">기준결과</th><th className="c">대상결과</th><th className="c">상태</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.항목코드}>
                    <td className="code">{r.항목코드}</td><td>{r.분류}</td><td className="nm">{r.항목}</td>
                    <td className="c"><span className={`sev ${r.중요도}`}>{r.중요도}</span></td>
                    <td className="c"><Pill v={r.최초결과} sm /></td>
                    <td className="c"><Pill v={r.이행결과} sm /></td>
                    <td className="c"><StatusBadge v={r.상태} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-actions">
            <a href={api.compareCsvUrl(base, target)}>
              <button className="btn good" style={{ width: 'auto', padding: '13px 22px' }}>⬇ 비교 결과 CSV (.csv)</button>
            </a>
          </div>
        </section>
      )}
    </>
  )
}

// ── 자산목록 추가 확인 모달 (업로드 직후, 5초 카운트다운) ──────
function SaveAssetModal({ info, onSave, onClose }) {
  const [left, setLeft] = useState(5)
  useEffect(() => {
    if (left <= 0) { onClose(); return }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left, onClose])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-ico">🖥</div>
        <h3 className="modal-title">자산목록에 추가하시겠습니까?</h3>
        <p className="modal-sub">
          {info.exists ? '같은 IP의 기존 자산에 새 진단 이력으로 추가됩니다.' : '새 진단대상으로 자산목록에 등록됩니다.'}
        </p>
        <div className="modal-meta">
          <span><b>{info.name || '(이름 없음)'}</b></span>
          <span>{info.ip || 'IP 없음'}</span>
          <span className={`pill ${info.kind === '최초진단' ? 'na' : 'warn'} sm`}>{info.kind}</span>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>나중에</button>
          <button className="btn primary" onClick={onSave}>자산목록에 추가 ({left})</button>
        </div>
        <div className="modal-note">선택하지 않으면 {left}초 후 자동으로 닫힙니다(추가 안 함). 이후 왼쪽 “자산목록에 추가” 버튼으로 추가할 수 있습니다.</div>
      </div>
    </div>
  )
}

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
                match: !ev.result ? '미판정' : (ev.result === it.script ? '일치' : '불일치') }
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
