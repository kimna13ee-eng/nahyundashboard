"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
function formSignature(dialog: HTMLDialogElement | null) {
  return JSON.stringify(
    Array.from(dialog?.querySelectorAll("input,textarea,select") || []).map(
      (node) => {
        const control = node as HTMLInputElement;
        return [
          control.name,
          control.value,
          control.type === "checkbox" || control.type === "radio"
            ? control.checked
            : null,
        ];
      },
    ),
  );
}
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
  const initial = useRef("");
  const lastInput = useRef<HTMLElement | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const saving = useRef(busy);
  useEffect(() => {
    saving.current = busy;
  }, [busy]);
  function safeClose() {
    if (busy || saving.current) return;
    dirty.current = formSignature(ref.current) !== initial.current;
    if (dirty.current) {
      setConfirmDiscard(true);
      return;
    }
    close();
  }
  useEffect(() => {
    const d = ref.current;
    const previousFocus = document.activeElement;
    initial.current = formSignature(d);
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
      onFocusCapture={(e) => {
        if ((e.target as HTMLElement).matches("input,textarea,select"))
          lastInput.current = e.target as HTMLElement;
      }}
      onInputCapture={() => {
        dirty.current = formSignature(ref.current) !== initial.current;
      }}
      onChangeCapture={() => {
        dirty.current = true;
      }}
      onClickCapture={(event) => {
        if (
          (event.target as HTMLElement).closest("button[data-dialog-close]")
        ) {
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
      onClick={(e) => {
        if (e.target === e.currentTarget) safeClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        safeClose();
      }}
    >
      <div className="ops-section-head">
        <h2>{title}</h2>
        <button
          className="ops-icon"
          aria-label="닫기"
          disabled={busy}
          onClick={safeClose}
        >
          ×
        </button>
      </div>
      {busy ? (
        <p role="status" className="ops-saving">
          처리 중입니다. 완료될 때까지 입력창을 유지합니다.
        </p>
      ) : null}
      {confirmDiscard ? (
        <div
          className="ops-detail"
          role="alertdialog"
          aria-label="미저장 입력 확인"
        >
          <p>작성 중인 내용이 있습니다. 저장하지 않고 닫을까요?</p>
          <div className="ops-form-actions">
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmDiscard(false);
                requestAnimationFrame(() => lastInput.current?.focus());
              }}
            >
              계속 작성
            </button>
            <button
              type="button"
              disabled={busy}
              className="ops-danger"
              onClick={close}
            >
              저장하지 않고 닫기
            </button>
          </div>
        </div>
      ) : null}
      <div className="ops-detail" inert={confirmDiscard}>
        {children}
      </div>
    </dialog>
  );
}
