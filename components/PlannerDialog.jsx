import React, { useEffect, useRef, useId } from 'react';

export default function PlannerDialog({ title, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    (dialog.querySelector('input') ?? dialog.querySelector('select'))?.focus();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="planner-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="degree-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="secondary-btn" aria-label="Dialog schließen" onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
