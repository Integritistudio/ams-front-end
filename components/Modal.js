'use client';

export default function Modal({ open, title, icon, onClose, children, footer, maxWidth }) {
  if (!open) return null;
  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-card" style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()}>
        {title ? (
          <div className="modal-header">
            <h3>
              {icon ? <i className={`fa-solid ${icon}`} /> : null}
              <span>{title}</span>
            </h3>
            <button className="modal-close-btn" onClick={onClose} title="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        ) : null}
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
