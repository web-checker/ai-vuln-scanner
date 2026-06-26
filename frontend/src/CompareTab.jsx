// 비교(별도 탭): 자산·기준(base)·대상(target) 선택 → 전이 상태 비교.
import React, { useEffect, useRef, useState } from 'react'
import * as api from './api.js'
import { Kpi, Pill, StatusBadge, fmtDateTime, fmtRunOpt, RUN_FIRST, RUN_FOLLOWUP, Pager } from './ui.jsx'

const PAGE_SIZE = 10   // 한 페이지에 보이는 행 수(초과 시 번호식 페이지로 분할)

// 비교 대상 카드 — 모듈 레벨에 두어 매 렌더마다 새 컴포넌트로 인식되어 리마운트되는 것을 막는다.
function TargetCard({ label, run }) {
  return (
    <div className="cmp-target">
      <div className="ct-label">{label}</div>
      <span className={`pill ${run?.kind === RUN_FIRST ? 'info' : 'warn'} sm`}>{run?.kind || '—'}</span>
      <div className="ct-meta">{fmtDateTime(run?.at)}</div>
      <div className="ct-file">{run?.filename || '—'}</div>
      <div className="ct-vuln">취약 {run?.vuln ?? 0}건</div>
    </div>
  )
}

export default function CompareTab() {
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])  // 언마운트 후 async setState 차단
  const [assets, setAssets] = useState([])
  const [assetId, setAssetId] = useState('')
  const [runs, setRuns] = useState([])
  const [base, setBase] = useState('')
  const [target, setTarget] = useState('')
  const [cmp, setCmp] = useState(null)
  const [filter, setFilter] = useState('전체')
  const [page, setPage] = useState(0)        // 비교 결과표 페이지
  const [kindPage, setKindPage] = useState(0) // 진단 종류 지정(실행 목록) 페이지
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSaveReport() {
    if (saving || !base || !target) return
    setSaving(true); setErr('')
    try {
      const res = await api.saveCompareReport(base, target)
      setNotice(`비교 보고서가 저장되었습니다 → ${res.path}`)
      setTimeout(() => setNotice(''), 8000)
      window.open(api.savedReportUrl(res.report_id), '_blank', 'noopener')
    } catch (e) { setErr(String(e.message || e)) }
    finally { setSaving(false) }
  }

  const selectAsset = async (aid) => {
    setAssetId(aid); setCmp(null); setErr(''); setKindPage(0)
    if (!aid) { setRuns([]); setBase(''); setTarget(''); return }
    try {
      const r = await api.getAssetRuns(aid)
      if (!mounted.current) return
      const rs = r.runs || []
      setRuns(rs)
      setBase(rs[0]?.run_id || '')
      setTarget(rs.length > 1 ? rs[rs.length - 1].run_id : (rs[0]?.run_id || ''))
    } catch (e) { if (mounted.current) setErr(String(e.message || e)) }
  }

  useEffect(() => {
    api.getAssets().then((r) => {
      if (!mounted.current) return
      const list = r.assets || []
      setAssets(list)
      if (list[0]) selectAsset(list[0].asset_id)
    }).catch((e) => { if (mounted.current) setErr(String(e.message || e)) })
  }, [])

  async function runCompare() {
    if (!base || !target) return
    if (base === target) { setErr('서로 다른 진단실행을 선택하세요.'); return }
    setErr('')
    try { const r = await api.getCompare(base, target); setCmp(r); setFilter('전체'); setPage(0) }
    catch (e) { setErr(String(e.message || e)) }
  }

  const baseRun = runs.find((r) => r.run_id === base)
  const targetRun = runs.find((r) => r.run_id === target)

  // 기준/비교 파일 옵션: 최초진단 그룹(위) → 이행점검 그룹(아래), 각 그룹은 시간순
  const byAtAsc = (a, b) => String(a.at || '').localeCompare(String(b.at || ''))
  const runOptions = () => {
    const first = runs.filter((r) => r.kind === RUN_FIRST).sort(byAtAsc)
    const follow = runs.filter((r) => r.kind === RUN_FOLLOWUP).sort(byAtAsc)
    const grp = (label, list) => list.length > 0 && (
      <optgroup label={label}>
        {list.map((r) => <option key={r.run_id} value={r.run_id}>{fmtRunOpt(r)}</option>)}
      </optgroup>
    )
    return <>{grp(RUN_FIRST, first)}{grp(RUN_FOLLOWUP, follow)}</>
  }
  const s = cmp?.summary || {}
  const rows = (cmp?.rows || []).filter((r) => filter === '전체' || r.상태 === filter)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const curPage = Math.min(page, pageCount - 1)
  const pagedRows = rows.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE)
  const runOpts = runOptions()   // 기준/비교 두 select 가 공유 — 렌더당 한 번만 계산

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div className="card-ico" style={{ background: '#dcf5ec', color: '#047857' }}>⇄</div>
          <div style={{ flex: 1 }}><h2 className="card-title">진단 결과 비교</h2>
            <p className="card-sub">2개의 비교 파일 선택</p></div>
        </div>
        {err && <div className="err">{err}</div>}
        {notice && <div className="notice">{notice}</div>}
        <div className="cmp-pick" style={{ padding: '4px 22px 18px' }}>
          <div className="cmp-pick-field">
            <label>진단 대상</label>
            <select value={assetId} onChange={(e) => selectAsset(e.target.value)}>
              {assets.length === 0 && <option value="">(저장된 진단대상 없음)</option>}
              {assets.map((a) => <option key={a.asset_id} value={a.asset_id}>{(a.name || a.ip)} · {a.ip} (이력 {a.runCount})</option>)}
            </select>
          </div>
          <div className="cmp-pick-field">
            <label>기준 파일</label>
            <select value={base} onChange={(e) => setBase(e.target.value)}>
              {runOpts}
            </select>
          </div>
          <div className="cmp-vs">→</div>
          <div className="cmp-pick-field">
            <label>비교 파일</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {runOpts}
            </select>
          </div>
          <button className="btn primary" style={{ width: 'auto', padding: '11px 22px' }}
            disabled={runs.length < 2} onClick={runCompare}>⇄ 비교</button>
        </div>
        {assetId && runs.length < 2 && <div className="hint" style={{ padding: '0 22px 16px' }}>※ 비교하려면 이 진단 대상에 진단 실행이 2개 이상 필요합니다.</div>}
      </section>

      {cmp && (
        <section className="card">
          <div className="cmp-targets">
            <TargetCard label="기준 파일" run={baseRun} />
            <div className="cmp-arrow">→</div>
            <TargetCard label="비교 파일" run={targetRun} />
          </div>
          <div className="cmp-kpis">
            <Kpi title="조치 완료" value={s.improved ?? 0} sub="취약 → 양호" tone="good" />
            <Kpi title="미조치" value={s.unfixed ?? 0} sub="취약 → 취약" box="vuln" tone="bad" />
            <Kpi title="신규 취약" value={s.worsened ?? 0} sub="양호 → 취약" tone="bad" />
            <Kpi title="조치율" value={s.fixRate == null ? '—' : `${s.fixRate}%`} sub={`기준 취약 ${s.baseVuln ?? 0}건 기준`} accent />
          </div>
          <div className="sort-bar" style={{ padding: '8px 22px' }}>
            {['전체', '조치 완료', '미조치', '신규 취약', '양호 유지', 'N/A'].map((f) => (
              <button key={f} className={`sort-btn${filter === f ? ' on' : ''}`} onClick={() => { setFilter(f); setPage(0) }}>{f}</button>
            ))}
          </div>
          <div className="tbl-wrap">
            <table className="report">
              <thead><tr><th>항목코드</th><th>분류</th><th>항목</th><th className="c">중요도</th>
                <th className="c">기준 결과</th><th className="c">대상 결과</th><th className="c">상태</th></tr></thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr key={r.항목코드}>
                    <td className="code c">{r.항목코드}</td><td className="c">{r.분류}</td><td className="nm">{r.항목}</td>
                    <td className="c"><span className={`sev ${r.중요도}`}>{r.중요도}</span></td>
                    <td className="c"><Pill v={r.최초결과} sm /></td>
                    <td className="c"><Pill v={r.이행결과} sm /></td>
                    <td className="c"><StatusBadge v={r.상태} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={curPage} pageCount={pageCount} onChange={setPage} />
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
