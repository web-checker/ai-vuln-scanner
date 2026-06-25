// 차트류: 막대(스크립트 vs AI) / 도넛(결과 분포) / 취약 항목 비교 막대.
import React from 'react'

// 보기 좋은 눈금 간격(1·2·5·10·…)
function niceStep(maxVal) {
  const raw = maxVal / 6
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / pow
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return Math.max(1, Math.round(m * pow))
}

// ── 막대그래프 (스크립트 vs AI) ────────────────────────────────
export function Chart({ summary, dark }) {
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
export function Donut({ counts, dark }) {
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

// ── 취약 항목 비교(막대): AI vs 자동화 스크립트 ────────────────
export function VulnCompare({ summary, total }) {
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
