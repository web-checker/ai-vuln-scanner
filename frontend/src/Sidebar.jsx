// 좌측 사이드바(네이비): 메뉴 + CSV 업로드 + 진단 실행.
// 자산 트리/하위목록은 제거 — 자산 목록은 가운데 "자산 관리" 탭에서만 본다.
import React, { useRef, useState } from 'react'
import { RUN_KINDS } from './ui.jsx'

export default function Sidebar({ open, tab, setTab, health, session, total, doneCount, onUpload, onJudge, onReset, judging, runKind, setRunKind, reportKind, setReportKind, onCancelJudge, cancelling, assetSaved, onSaveAsset }) {
  const [drag, setDrag] = useState(false)
  const [reportOpen, setReportOpen] = useState(true)   // 보고서 하위(최초/최종) 펼침
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
        <button className={`nav-item${tab === 'report' ? ' active' : ''}`}
          onClick={() => { setTab('report'); setReportOpen(true) }}>
          <span className="ni-ico">▦</span> 보고서
          {session && <span className="nav-badge">{total}</span>}
          <span className="tree-caret" onClick={(e) => { e.stopPropagation(); setReportOpen((o) => !o) }}
            title="최초/최종 보고서">{reportOpen ? '▾' : '▸'}</span>
        </button>
        {reportOpen && (
          <div className="nav-tree">
            <button className={`tree-row${tab === 'report' && reportKind === 'first' ? ' sel' : ''}`}
              onClick={() => { setTab('report'); setReportKind?.('first') }}>
              📄 <span className="tree-label">최초 보고서</span>
            </button>
            <button className={`tree-row${tab === 'report' && reportKind === 'final' ? ' sel' : ''}`}
              onClick={() => { setTab('report'); setReportKind?.('final') }}>
              📄 <span className="tree-label">최종 보고서</span>
            </button>
          </div>
        )}
        <button className={`nav-item${tab === 'assets' ? ' active' : ''}`} onClick={() => setTab('assets')}>
          <span className="ni-ico">🖥</span> 자산 관리
        </button>
        <button className={`nav-item${tab === 'compare' ? ' active' : ''}`} onClick={() => setTab('compare')}>
          <span className="ni-ico">⇄</span> 진단 결과 비교
        </button>
      </nav>

      <div className="menu-label">CSV 업로드</div>
      <div className="runkind">
        {RUN_KINDS.map((k) => (
          <button key={k} type="button"
            className={`runkind-btn${runKind === k ? ' on' : ''}`}
            onClick={() => setRunKind?.(k)}>{k}</button>
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
          ? <div className="asset-saved" style={{ marginTop: 16 }}>✓ 자산 관리에 추가됨</div>
          : <button className="btn ghost" style={{ marginTop: 16 }} onClick={onSaveAsset}>🖥 자산 관리 추가</button>
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
