"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function OpsDialog({
  title,
  children,
  busy,
  close,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="ops-modal"
      aria-label={title}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="ops-section-head">
        <h2>{title}</h2>
        <button aria-label="닫기" disabled={busy} onClick={close}>
          ×
        </button>
      </div>
      <div className="ops-detail">{children}</div>
    </dialog>
  );
}
