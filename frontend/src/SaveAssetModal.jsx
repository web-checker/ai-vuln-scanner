// 자산목록 추가 확인 모달 (업로드 직후, 5초 카운트다운 후 자동 닫힘).
import React, { useEffect, useState } from 'react'

export default function SaveAssetModal({ info, onSave, onClose }) {
  const [left, setLeft] = useState(5)
  useEffect(() => {
    if (left <= 0) { onClose(); return }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left, onClose])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-ico">🖥</div>
        <h3 className="modal-title">자산 관리에 추가하시겠습니까?</h3>
        <p className="modal-sub">
          {info.exists ? '같은 IP의 기존 자산에 새 진단 이력으로 추가됩니다.' : '새 진단대상으로 자산 관리에 등록됩니다.'}
        </p>
        <div className="modal-meta">
          <span><b>{info.name || '(이름 없음)'}</b></span>
          <span>{info.ip || 'IP 없음'}</span>
          <span className={`pill ${info.kind === '최초진단' ? 'na' : 'warn'} sm`}>{info.kind}</span>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>나중에</button>
          <button className="btn primary" onClick={onSave}>자산 관리에 추가 ({left})</button>
        </div>
        <div className="modal-note">선택하지 않으면 {left}초 후 자동으로 닫힙니다(추가 안 함). 이후 왼쪽 “자산 관리 추가” 버튼으로 추가할 수 있습니다.</div>
      </div>
    </div>
  )
}
