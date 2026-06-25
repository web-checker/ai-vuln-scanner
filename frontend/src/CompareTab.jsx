// 비교(별도 탭): 자산·기준(base)·대상(target) 선택 → 전이 상태 비교.
import React, { useEffect, useState } from 'react'
import * as api from './api.js'
import { Kpi, Pill, StatusBadge, fmtDateTime, fmtRunOpt } from './ui.jsx'

export default function CompareTab() {
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
