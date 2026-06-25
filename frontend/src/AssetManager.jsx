// 자산관리: 목록 → 진단이력(삭제 가능). 비교는 별도 '비교' 탭.
import React, { useEffect, useState } from 'react'
import * as api from './api.js'
import { fmtDateTime, fmtRunOpt } from './ui.jsx'

export default function AssetManager() {
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
