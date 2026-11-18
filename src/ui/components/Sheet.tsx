import type { ReactNode } from 'react';

/** 画面下からせり上がる小窓（スマホ）／中央のダイアログ（PC） */
export function Sheet({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button className="sheet-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
