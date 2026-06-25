// 자산관리: 대상 목록 → 진단기록 → (기록 클릭) 상세. 사이드바 트리로도 바로 진입 가능.
import React, { useEffect, useState } from 'react'
import * as api from './api.js'
import { fmtDateTime, fmtRunOpt, TrashIcon } from './ui.jsx'
import RunDetail from './RunDetail.jsx'

export default function AssetManager({ dark, target, onNavigateAsset, assetsVersion, onAssetsChanged }) {
  const [view, setView] = useState('list')          // 'list' | 'runs' | 'detail'
  const [assets, setAssets] = useState([])
  const [asset, setAsset] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeRun, setActiveRun] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const toggleGroup = (fn) => setCollapsed((c) => ({ ...c, [fn]: !c[fn] }))

  const loadAssets = () => {
    setLoading(true)
    return api.getAssets().then((r) => setAssets(r.assets || []))
      .catch((e) => setErr(String(e.message || e))).finally(() => setLoading(false))
  }
  const reloadRuns = async (aid) => {
    try { const r = await api.getAssetRuns(aid); setRuns(r.runs || []); return r.runs || [] }
    catch (e) { setErr(String(e.message || e)); return [] }
  }
  useEffect(() => { loadAssets() }, [])

  // 가운데에서 파고들 때도 공유 target을 갱신 → 왼쪽 사이드바 트리가 함께 펼쳐짐
  function openAsset(a) { onNavigateAsset?.(a, null) }
  function openRun(r) { onNavigateAsset?.(asset, r) }

  // 사이드바 트리/가운데 클릭(nonce 변경) → 해당 화면으로 이동
  useEffect(() => {
    if (!target?.asset) return
    setErr(''); setAsset(target.asset); reloadRuns(target.asset.asset_id)
    if (target.run) { setActiveRun(target.run); setView('detail') }
    else { setView('runs') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce])

  // 자산/기록 변경(추가·삭제) 시 목록 동기 갱신
  useEffect(() => {
    loadAssets()
    if (asset && view !== 'list') reloadRuns(asset.asset_id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsVersion])

  async function onDeleteAsset(a, e) {
    e.stopPropagation()
    if (!window.confirm(`자산 '${a.name || a.ip}'와(과) 진단 이력 ${a.runCount}건을 모두 삭제할까요?`)) return
    try { await api.deleteAsset(a.asset_id); onAssetsChanged?.(); await loadAssets() } catch (e2) { setErr(String(e2.message || e2)) }
  }
  async function onDeleteRun(r, e) {
    e.stopPropagation()
    if (!window.confirm(`진단 기록을 삭제할까요?\n${fmtRunOpt(r)}`)) return
    try {
      await api.deleteRun(r.run_id)
      const left = runs.filter((x) => x.run_id !== r.run_id)
      onAssetsChanged?.()
      await loadAssets()
      if (left.length === 0) setView('list'); else setRuns(left)
    } catch (e2) { setErr(String(e2.message || e2)) }
  }

  // ── 진단기록 상세 ──
  if (view === 'detail' && activeRun) {
    return <RunDetail run={activeRun} asset={asset} dark={dark} onBack={() => setView('runs')} />
  }

  // ── 대상 목록 ──
  if (view === 'list') {
    return (
      <section className="card">
        <div className="card-head">
          <div className="card-ico" style={{ background: '#e7eefc', color: '#2563eb' }}>🖥</div>
          <div style={{ flex: 1 }}><h2 className="card-title">자산 관리</h2>
            <p className="card-sub">진단대상(IP)별로 진단 이력을 관리합니다 · 대상을 클릭하면 진단 기록과 보고서를 확인할 수 있습니다</p></div>
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
                {loading ? '불러오는 중…' : '저장된 자산이 없습니다. 업로드 후 "자산 관리에 추가"를 누르면 등록됩니다.'}</td></tr>}
              {assets.map((a) => (
                <tr key={a.asset_id} style={{ cursor: 'pointer' }} onClick={() => openAsset(a)}>
                  <td className="nm">{a.name || '(이름 없음)'}</td>
                  <td className="code">{a.ip}</td>
                  <td>{a.group}</td>
                  <td className="c"><span className="count-badge">{a.runCount}</span></td>
                  <td>{fmtDateTime(a.lastSeen)}</td>
                  <td className="c"><button className="del-btn" onClick={(e) => onDeleteAsset(a, e)} title="자산 전체 삭제"><TrashIcon /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  // 최신순(일시 내림차순) 정렬 후 원본파일명별 그룹 → 최신 기록이 맨 위
  const sortedRuns = [...runs].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
  const groups = []
  const byFile = new Map()
  for (const r of sortedRuns) {
    if (!byFile.has(r.filename)) { const g = { filename: r.filename, runs: [] }; byFile.set(r.filename, g); groups.push(g) }
    byFile.get(r.filename).runs.push(r)
  }

  // ── 진단이력(Run) 목록 ──
  return (
    <>
      <section className="card">
        <div className="card-head">
          <div className="card-ico" style={{ background: '#e7eefc', color: '#2563eb' }}>📁</div>
          <div style={{ flex: 1 }}><h2 className="card-title">{asset?.name} · {asset?.ip}</h2>
            <p className="card-sub">최신 진단이 위에 표시됩니다 · 행 클릭 시 요약·보고서 상세로 이동</p></div>
          <button className="sort-btn" onClick={() => setView('list')}>← 자산 목록</button>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="tbl-wrap">
          <table className="report">
            <thead><tr><th>종류</th><th>일시</th><th className="c">합계</th>
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
                    <tr key={r.run_id} style={{ cursor: 'pointer' }} onClick={() => openRun(r)} title="클릭하여 상세 보기">
                      <td><span className={`pill ${r.kind === '최초진단' ? 'info' : 'warn'} sm`}>{r.kind}</span></td>
                      <td className="code">{fmtDateTime(r.at)}</td>
                      <td className="c">{r.total}</td><td className="c">{r.vuln}</td>
                      <td className="c">{r.pass}</td><td className="c">{r.na}</td>
                      <td className="c"><button className="del-btn" onClick={(e) => onDeleteRun(r, e)} title="이 기록 삭제"><TrashIcon /></button></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
