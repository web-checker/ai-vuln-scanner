// 좌측 사이드바(네이비): 메뉴 + CSV 업로드 + 진단 실행.
// 자산 트리/하위목록은 제거 — 자산 목록은 가운데 "자산 관리" 탭에서만 본다.
import React, { useRef, useState } from 'react'

export default function Sidebar({ open, tab, setTab, health, session, total, doneCount, onUpload, onJudge, onReset, judging, onCancelJudge, cancelling, assetSaved, onSaveAsset }) {
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
          <span className="ni-ico">🖥</span> 자산 관리
        </button>
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
