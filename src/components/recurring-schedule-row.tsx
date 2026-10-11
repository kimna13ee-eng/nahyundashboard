import type { OpsRow } from "@/lib/ops";

/** Presentation only. Rule/run mutations remain in the existing Phase2Panel. */
export function RecurringScheduleRow({
  row,
  start,
  end,
  status,
  states,
  disabled,
  statusDisabled,
  onStatus,
  onEdit,
  onRemove,
}: {
  row: OpsRow;
  start: string;
  end: string;
  status: string;
  states: Record<string, string>;
  disabled: boolean;
  statusDisabled: boolean;
  onStatus: (value: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const frequency = {
    daily: "매일",
    weekly: "매주",
    monthly: "매월",
    yearly: "매년",
  };
  return (
    <article className="ops-note ops-recurrence-row">
      <div className="ops-recurrence-info">
        <strong>{String(row.title)}</strong>
        <div className="ops-recurrence-meta">
          <span>
            {frequency[row.frequency as keyof typeof frequency] ||
              "주기 기록 없음"}
          </span>
          {row.interval ? <span>간격 {String(row.interval)}</span> : null}
          <span className="ops-state-badge" data-state={status}>
            {states[status] || status}
          </span>
          {row.archived_at ? (
            <span className="ops-state-badge">보관</span>
          ) : null}
        </div>
        <p className="ops-recurrence-time">
          <span>예정 회차</span>{" "}
          <time dateTime={String(row.starts_at)}>{start}</time> –{" "}
          <time dateTime={String(row.ends_at)}>{end}</time>
        </p>
        {row.notes ? <p>{String(row.notes)}</p> : null}
        {row.url || row.result_url ? (
          <a
            className="ops-link-action"
            href={String(row.url || row.result_url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            원본 링크 열기
          </a>
        ) : null}
      </div>
      <div className="ops-recurrence-controls">
        <label>
          수행 상태
          <select
            aria-label={`${row.title} ${row.original_at} 수행 상태`}
            value={status}
            disabled={statusDisabled}
            onChange={(e) => onStatus(e.target.value)}
          >
            {Object.entries(states).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="ops-row-actions">
          <button
            type="button"
            disabled={disabled}
            aria-label={`${row.title} 수정`}
            onClick={onEdit}
          >
            수정
          </button>
          <button
            type="button"
            className="ops-danger"
            disabled={disabled}
            aria-label={`${row.title} 삭제`}
            onClick={onRemove}
          >
            삭제
          </button>
        </div>
      </div>
    </article>
  );
}
