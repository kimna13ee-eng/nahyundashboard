"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const dirty = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const saving = useRef(busy);
  useEffect(() => {
    saving.current = busy;
  }, [busy]);
  function safeClose() {
    if (busy) return;
    if (dirty.current) {
      setConfirmDiscard(true);
      return;
    }
    close();
  }
  useEffect(() => {
    const d = ref.current;
    const previousFocus = document.activeElement;
    d?.showModal();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      d?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="ops-modal"
      aria-label={title}
      onInputCapture={() => {
        dirty.current = true;
      }}
      onChangeCapture={() => {
        dirty.current = true;
      }}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("button[data-dialog-close]")) {
          event.preventDefault();
          event.stopPropagation();
          safeClose();
          return;
        }
        if (
          (event.target as HTMLElement)
            .closest("button")
            ?.textContent?.includes("체크리스트 불러오기")
        )
          dirty.current = true;
      }}
      onCancel={(e) => {
        e.preventDefault();
        safeClose();
      }}
    >
      <div className="ops-section-head">
        <h2>{title}</h2>
        <button aria-label="닫기" disabled={busy} onClick={safeClose}>
          ×
        </button>
      </div>
      {confirmDiscard ? (
        <div
          className="ops-detail"
          role="alertdialog"
          aria-label="미저장 입력 확인"
        >
          <p>미저장 입력이 있습니다. 입력을 버리고 닫을까요?</p>
          <button
            type="button"
            autoFocus
            onClick={() => setConfirmDiscard(false)}
          >
            계속 작성
          </button>
          <button type="button" disabled={busy} onClick={close}>
            입력 버리고 닫기
          </button>
        </div>
      ) : null}
      <div className="ops-detail" inert={confirmDiscard}>
        {children}
      </div>
    </dialog>
  );
}
