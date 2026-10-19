"use client";
import { useRef, useState } from "react";
import {
  parseProcessSteps,
  processSummary,
  reconcileProcessSteps,
} from "@/lib/task-process";

export function TaskProcessEditor({
  value,
  disabled = false,
}: {
  value: unknown;
  disabled?: boolean;
}) {
  const [steps, setSteps] = useState(() => parseProcessSteps(value));
  const matchingPool = useRef(steps);
  const [lines, setLines] = useState(() =>
    steps.map((s) => s.title).join("\n"),
  );
  const [error, setError] = useState("");
  const summary = processSummary(steps);
  return (
    <fieldset disabled={disabled} className="ops-process-editor">
      <legend>진행 단계</legend>
      <label>
        프로세스 입력
        <textarea
          aria-label="프로세스 입력"
          rows={4}
          value={lines}
          maxLength={3630}
          placeholder={"자료 수집\n초안 작성\n검수\n완료"}
          onChange={(e) => {
            const next = e.target.value;
            setLines(next);
            try {
              const changed = reconcileProcessSteps(next, matchingPool.current);
              matchingPool.current = [
                ...changed,
                ...matchingPool.current.filter(
                  (old) => !changed.some((step) => step.id === old.id),
                ),
              ].slice(0, 30);
              setSteps(changed);
              setError("");
              e.currentTarget.setCustomValidity("");
            } catch (problem) {
              const message =
                problem instanceof Error
                  ? problem.message
                  : "단계를 확인해 주세요.";
              setError(message);
              e.currentTarget.setCustomValidity(message);
            }
          }}
        />
      </label>
      <small>한 줄에 한 단계씩 입력하고, 끝낸 단계를 체크하세요.</small>
      {error ? <p role="alert">{error}</p> : null}
      <input type="hidden" name="process_steps" value={JSON.stringify(steps)} />
      <div className="ops-process-checklist">
        {steps.map((s, i) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={s.done}
              onChange={(e) => {
                const done = e.target.checked;
                matchingPool.current = matchingPool.current.map((item) =>
                  item.id === s.id ? { ...item, done } : item,
                );
                setSteps(
                  steps.map((item) =>
                    item.id === s.id ? { ...item, done } : item,
                  ),
                );
              }}
            />
            <span>
              {i + 1}. {s.title}
            </span>
          </label>
        ))}
      </div>
      <p className="ops-process-current">
        {summary.total
          ? `현재 단계: ${summary.current?.title || "전체 단계 완료"} · ${summary.completed}/${summary.total} 완료`
          : "단계를 입력해 주세요."}
      </p>
    </fieldset>
  );
}
