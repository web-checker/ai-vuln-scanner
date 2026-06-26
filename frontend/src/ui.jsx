// 공용 프리미티브: 배지 / KPI 카드 / 포맷 헬퍼 등 여러 화면이 공유하는 작은 조각.
import React from 'react'

export const VALID = ['양호', '취약', 'N/A']

// 진단 종류(최초진단/이행점검) — 비교·자산 화면이 공유하는 라벨/필터 키
export const RUN_FIRST = '최초진단'
export const RUN_FOLLOWUP = '이행점검'
export const RUN_KINDS = [RUN_FIRST, RUN_FOLLOWUP]

// 최종 결과 선택: 확정값 우선 → 스크립트 → AI → N/A (보고서/상세 공통)
export const prefResult = (it) =>
  it.finalResult || (VALID.includes(it.script) ? it.script : '') ||
  (VALID.includes(it.ai) ? it.ai : '') || 'N/A'

// 스크립트/AI 중 하나라도 취약이면 조치방법 표기(양호·N/A 단독이면 공란)
export const isVuln = (it) => it.script === '취약' || it.ai === '취약'

// 판단근거 본문만 반환(결과 라벨은 '결과' 열에 이미 표기되므로 머리말 생략)
export const labelReason = (result, reason) => String(reason || '').trim()

// 판단기준의 ' | ' 구분(양호 내용 | 취약 내용)을 줄바꿈으로 변환
export const formatCriteria = (text) =>
  String(text || '').split('|').map((s) => s.trim()).filter(Boolean).join('\n')

// 공통 포맷 헬퍼
export const fmtDateTime = (at) => (at || '').slice(0, 16).replace('T', ' ')
export const fmtRunOpt = (r) => `${r.kind} · ${fmtDateTime(r.at)} · ${r.filename}`

export function Pill({ v, sm }) {
  const cls = v === '양호' ? 'pass' : v === '취약' ? 'vuln' : v === 'N/A' ? 'na' : 'none'
  return <span className={`pill ${cls}${sm ? ' sm' : ''}`}>{v || '보류'}</span>
}

// 단색(채워진) 초승달 아이콘 — 버튼 글자색을 그대로 따라감
export function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
      style={{ verticalAlign: '-2px', marginRight: 5 }}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

// 휴지통(삭제) 아이콘 — 버튼 글자색을 그대로 따라감
export function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'block' }}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

// KPI 카드
export function Kpi({ title, value, sub, accent, tone, box }) {
  return (
    <div className={`kpi${accent ? ' accent' : ''}${box === 'vuln' ? ' vuln-box' : ''}`}>
      <div className="kpi-title">{title}</div>
      <div className={`kpi-val${tone ? ' ' + tone : ''}`}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

// 비교 상태 배지
const CMP_CLS = { 개선: 'pass', 미조치: 'vuln', 악화: 'warn', 양호유지: 'pass', 'N/A': 'na' }
export function StatusBadge({ v }) {
  return <span className={`pill ${CMP_CLS[v] || 'none'} sm`}>{v}</span>
}
