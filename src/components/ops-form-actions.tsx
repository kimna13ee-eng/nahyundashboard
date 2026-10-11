import type { ReactNode } from "react";

/** Dialog actions only: cancellation uses the existing OpsDialog dirty guard. */
export function OpsFormActions({
  children,
  busy,
}: {
  children: ReactNode;
  busy: boolean;
}) {
  return (
    <div className="ops-form-actions">
      <button type="button" data-dialog-close disabled={busy}>
        취소
      </button>
      {children}
    </div>
  );
}
