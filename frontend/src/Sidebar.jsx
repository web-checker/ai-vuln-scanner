// 좌측 사이드바(네이비): 메뉴 + 자산 트리(네비게이션·삭제) + CSV 업로드 + 진단 실행.
import React, { useEffect, useRef, useState } from 'react'
import * as api from './api.js'
import { fmtDateTime, TrashIcon } from './ui.jsx'

export default function Sidebar({ open, tab, setTab, health, session, total, doneCount, onUpload, onJudge, onReset, judging, onCancelJudge, cancelling, assetSaved, onSaveAsset, onNavigateAsset, assetTarget, assetsVersion, onAssetsChanged }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)
  const pending = total - doneCount
  const pick = (f) => f && onUpload(f)

  // ── 자산 트리(자산관리 하위: 대상 → 진단기록) ──
  const [treeOpen, setTreeOpen] = useState(false)
  const [assets, setAssets] = useState([])
  const [expanded, setExpanded] = useState({})       // asset_id → bool
  const [runsBy, setRunsBy] = useState({})           // asset_id → [run]

  const loadAssets = () => api.getAssets().then((r) => setAssets(r.assets || [])).catch(() => {})
  const loadRuns = (aid) => api.getAssetRuns(aid)
    .then((r) => setRunsBy((m) => ({ ...m, [aid]: r.runs || [] }))).catch(() => {})
  function toggleTree() {
    const next = !treeOpen
    setTreeOpen(next)
    if (next) loadAssets()
  }
  // 자산/기록 변경(추가·삭제) 시 트리 동기 갱신 — 펼쳐둔 대상의 기록도 다시 로드
  useEffect(() => {
    if (!treeOpen) return
    loadAssets()
    Object.keys(expanded).forEach((aid) => { if (expanded[aid]) loadRuns(aid) })
  }, [assetsVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // 가운데에서 파고들면(assetTarget 변경) 트리도 자동으로 펼쳐 따라간다
  useEffect(() => {
    const a = assetTarget?.asset
    if (!a) return
    setTreeOpen(true)
    setExpanded((e) => ({ ...e, [a.asset_id]: true }))
    loadRuns(a.asset_id)
    loadAssets()   // 새 대상이 목록에 없을 수 있으니 갱신
  }, [assetTarget?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // 대상 행 클릭: 펼치고 가운데에 대상 개요 표시(접기는 좌측 ▸ 토글로)
  async function onAsset(a) {
    setExpanded((e) => ({ ...e, [a.asset_id]: true }))
    if (!runsBy[a.asset_id]) await loadRuns(a.asset_id)
    onNavigateAsset?.(a, null)
  }
  // 펼침/접기 토글(네비게이션 없이 하위 진단기록만 접었다 폈다)
  async function toggleExpand(a, e) {
    e.stopPropagation()
    const open2 = !expanded[a.asset_id]
    setExpanded((s) => ({ ...s, [a.asset_id]: open2 }))
    if (open2 && !runsBy[a.asset_id]) await loadRuns(a.asset_id)
  }
  async function delAsset(a, e) {
    e.stopPropagation()
    if (!window.confirm(`자산 '${a.name || a.ip}'와(과) 진단 이력 ${a.runCount}건을 모두 삭제할까요?`)) return
    try { await api.deleteAsset(a.asset_id); onNavigateAsset?.(null); onAssetsChanged?.(); await loadAssets() } catch { /* noop */ }
  }
  async function delRun(a, r, e) {
    e.stopPropagation()
    if (!window.confirm('진단 기록을 삭제할까요?')) return
    try { await api.deleteRun(r.run_id); onNavigateAsset?.(a, null); onAssetsChanged?.(); await loadRuns(a.asset_id); await loadAssets() }
    catch { /* noop */ }
  }
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
          <span className="ni-ico">🖥</span> 자산 관리
          <span className="tree-caret" onClick={(e) => { e.stopPropagation(); toggleTree() }}
            title="대상 / 진단기록 펼치기">{treeOpen ? '▾' : '▸'}</span>
        </button>
        {treeOpen && (
          <div className="nav-tree">
            {assets.length === 0 && <div className="tree-empty">등록된 자산이 없습니다</div>}
            {assets.map((a) => {
              const aSel = tab === 'assets' && assetTarget?.asset?.asset_id === a.asset_id
              return (
              <div key={a.asset_id}>
                <button className={`tree-row${aSel && !assetTarget?.run ? ' sel' : ''}`} onClick={() => onAsset(a)}>
                  <span className="tree-twist" onClick={(e) => toggleExpand(a, e)}
                    title={expanded[a.asset_id] ? '접기' : '펼치기'}>{expanded[a.asset_id] ? '▾' : '▸'}</span>
                  📁 <span className="tree-label">{a.name || a.ip}</span>
                  <span className="tree-badge">{a.runCount}</span>
                  <span className="tree-del" onClick={(e) => delAsset(a, e)} title="자산 삭제"><TrashIcon /></span>
                </button>
                {expanded[a.asset_id] && [...(runsBy[a.asset_id] || [])]
                  .sort((x, y) => String(y.at || '').localeCompare(String(x.at || ''))).map((r) => (
                  <button key={r.run_id} title="진단기록 상세 보기"
                    className={`tree-leaf${aSel && assetTarget?.run?.run_id === r.run_id ? ' sel' : ''}`}
                    onClick={() => onNavigateAsset?.(a, r)}>
                    📄 <span className="tree-label">{r.kind} · {fmtDateTime(r.at)}</span>
                    <span className="tree-del" onClick={(e) => delRun(a, r, e)} title="기록 삭제"><TrashIcon /></span>
                  </button>
                ))}
                {expanded[a.asset_id] && (runsBy[a.asset_id] || []).length === 0 && (
                  <div className="tree-leaf tree-empty">기록 없음</div>
                )}
              </div>
            )})}
          </div>
        )}
        <button className={`nav-item${tab === 'compare' ? ' active' : ''}`} onClick={() => setTab('compare')}>
          <span className="ni-ico">⇄</span> 진단 결과 비교
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
        assetSaved
          ? <div className="asset-saved">✓ 자산 관리에 추가됨</div>
          : <button className="btn ghost" onClick={onSaveAsset}>🖥 자산 관리 추가</button>
      )}

      {session && (
        <>
          <button className="btn primary" disabled={!health?.ready || judging || pending === 0}
            onClick={() => onJudge('pending')}>
            {judging ? <><span className="spinner" /> 판정 중…</> : <>🛡 AI 교차 진단 ({pending}건)</>}
          </button>
          {judging && (
            <button className="btn stop" disabled={cancelling} onClick={onCancelJudge}>
              {cancelling ? '중지하는 중…' : '■ 중지'}
            </button>
          )}
          <div className="btn-row">
            <button className="btn ghost" disabled={!health?.ready || judging} onClick={() => onJudge('all')}>⟳ 재진단</button>
            <button className="btn ghost" disabled={judging} onClick={onReset}>↺ 초기화</button>
          </div>
        </>
      )}
    </aside>
  )
}
