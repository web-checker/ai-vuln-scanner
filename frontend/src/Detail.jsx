// 마스터-디테일의 디테일 패널: 선택 항목의 스크립트·AI 판단 비교 + 최종 확정.
import React, { useEffect, useState } from 'react'
import { Pill, VALID } from './ui.jsx'

export default function Detail({ item, edit, setEdit, onSave, saved }) {
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
