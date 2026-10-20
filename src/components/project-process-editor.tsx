"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Archive, Plus, RotateCcw } from "lucide-react";
import type { ProcessStep } from "@/lib/task-process";
import "./project-process-editor.css";

export type ProjectProcessEditorProps = {
  initialSteps: ProcessStep[];
  archivedSteps?: ProcessStep[];
  disabled?: boolean;
};

function copyStep(step: ProcessStep): ProcessStep {
  return { id: step.id, title: step.title, done: step.done };
}

export function ProjectProcessEditor({
  initialSteps,
  archivedSteps = [],
  disabled = false,
}: ProjectProcessEditorProps) {
  const [steps, setSteps] = useState(() => initialSteps.map(copyStep));
  const [archived, setArchived] = useState(() => {
    const activeIds = new Set(initialSteps.map((step) => step.id));
    return [
      ...new Map(
        archivedSteps
          .filter((step) => !activeIds.has(step.id))
          .map((step) => [step.id, copyStep(step)]),
      ).values(),
    ];
  });
  const [notice, setNotice] = useState("");
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const hiddenInput = useRef<HTMLInputElement>(null);
  const serialized = JSON.stringify(
    steps.map((step) => ({ ...copyStep(step), title: step.title.trim() })),
  );
  const previousValue = useRef(serialized);
  useEffect(() => {
    if (serialized === previousValue.current) return;
    previousValue.current = serialized;
    // Button-only changes also participate in OpsDialog's unsaved-input guard.
    hiddenInput.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [serialized]);

  const completed = steps.filter((step) => step.done).length;
  const current = steps.find((step) => !step.done);
  const full = steps.length >= 30;

  function focusStep(id?: string) {
    requestAnimationFrame(() => {
      if (id) inputs.current.get(id)?.focus();
      else addButton.current?.focus();
    });
  }
  function addStep() {
    if (disabled || full) return;
    const step: ProcessStep = {
      id: crypto.randomUUID(),
      title: "",
      done: false,
    };
    setSteps((previous) => [...previous, step]);
    setNotice("새 단계를 추가했어요. 이름을 입력해 주세요.");
    focusStep(step.id);
  }
  function moveStep(index: number, offset: number) {
    const destination = index + offset;
    if (disabled || destination < 0 || destination >= steps.length) return;
    const reordered = [...steps];
    [reordered[index], reordered[destination]] = [
      reordered[destination],
      reordered[index],
    ];
    setSteps(reordered);
    setNotice(
      `${steps[index].title.trim() || "선택한 단계"}를 ${destination + 1}번째로 옮겼어요.`,
    );
    focusStep(steps[index].id);
  }
  function removeStep(index: number) {
    if (disabled) return;
    const step = steps[index];
    // A blank unsaved draft has no history to archive. Existing valid steps
    // keep their exact ID, completion status and latest edited title locally.
    if (step.title.trim())
      setArchived((previous) => [
        ...previous.filter((item) => item.id !== step.id),
        { ...step, title: step.title.trim() },
      ]);
    setSteps((previous) => previous.filter((item) => item.id !== step.id));
    setNotice(
      "단계를 목록에서 제거했어요. 저장하면 기존 작업 기록은 보관됩니다.",
    );
    focusStep(steps[index + 1]?.id || steps[index - 1]?.id);
  }
  function restoreStep(step: ProcessStep) {
    if (disabled || full || steps.some((item) => item.id === step.id)) return;
    setSteps((previous) => [...previous, { ...step }]);
    setArchived((previous) => previous.filter((item) => item.id !== step.id));
    setNotice(`${step.title} 단계를 같은 기록으로 복원했어요.`);
    focusStep(step.id);
  }

  return (
    <fieldset className="ops-project-process-editor" disabled={disabled}>
      <legend>프로세스 체크리스트</legend>
      <input
        ref={hiddenInput}
        type="hidden"
        name="process_steps"
        value={serialized}
      />
      <p className="ops-project-process-help">
        단계를 입력하고 완료한 항목을 체크하세요. 제거한 단계는 오늘 할 일에서
        빠지고 기존 작업 기록은 보관됩니다.
      </p>
      {steps.length ? (
        <ol className="ops-project-process-list">
          {steps.map((step, index) => {
            const label = step.title.trim() || `${index + 1}번째 단계`;
            return (
              <li
                key={step.id}
                className={step.done ? "is-complete" : undefined}
              >
                <label className="ops-project-step-check">
                  <input
                    type="checkbox"
                    checked={step.done}
                    aria-label={`${index + 1}번째 단계 완료`}
                    onChange={(event) => {
                      const done = event.currentTarget.checked;
                      setSteps((previous) =>
                        previous.map((item) =>
                          item.id === step.id ? { ...item, done } : item,
                        ),
                      );
                    }}
                  />
                  <span>{index + 1}</span>
                </label>
                <input
                  ref={(input) => {
                    if (input) inputs.current.set(step.id, input);
                    else inputs.current.delete(step.id);
                  }}
                  type="text"
                  required
                  maxLength={120}
                  value={step.title}
                  aria-label={`${index + 1}번째 프로세스 이름`}
                  placeholder="예: 자료 수집, 초안 작성, 검수"
                  onChange={(event) => {
                    const title = event.currentTarget.value;
                    event.currentTarget.setCustomValidity(
                      title.trim() ? "" : "프로세스 이름을 입력해 주세요.",
                    );
                    setSteps((previous) =>
                      previous.map((item) =>
                        item.id === step.id ? { ...item, title } : item,
                      ),
                    );
                  }}
                />
                <div className="ops-project-step-actions">
                  <button
                    type="button"
                    className="ops-icon"
                    disabled={disabled || index === 0}
                    onClick={() => moveStep(index, -1)}
                    title="위로"
                    aria-label={`${label} 위로`}
                  >
                    <ArrowUp size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="ops-icon"
                    disabled={disabled || index === steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                    title="아래로"
                    aria-label={`${label} 아래로`}
                  >
                    <ArrowDown size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    aria-label={`${label} 단계 제거`}
                  >
                    <Archive size={14} aria-hidden="true" /> 제거
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="ops-project-process-empty">
          아직 단계가 없어요. 프로젝트를 진행할 순서대로 추가해 주세요.
        </p>
      )}
      <div className="ops-project-process-footer">
        <button
          ref={addButton}
          type="button"
          disabled={disabled || full}
          onClick={addStep}
        >
          <Plus size={15} aria-hidden="true" /> 단계 추가
        </button>
        <span>
          {steps.length
            ? `${completed}/${steps.length} 완료 · ${current ? current.title.trim() || "단계 이름 입력 필요" : "전체 단계 완료"}`
            : "최대 30단계"}
        </span>
      </div>
      {full ? (
        <p className="ops-project-process-help">
          프로세스는 최대 30단계까지 등록할 수 있어요.
        </p>
      ) : null}
      {archived.length ? (
        <details className="ops-project-process-archive">
          <summary>보관된 프로세스 ({archived.length})</summary>
          <ul>
            {archived.map((step) => (
              <li key={step.id}>
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.done ? "완료" : "미완료"} · 기존 기록 유지</span>
                </div>
                <button
                  type="button"
                  disabled={disabled || full}
                  onClick={() => restoreStep(step)}
                  aria-label={`${step.title} 프로세스 복원`}
                >
                  <RotateCcw size={14} aria-hidden="true" /> 복원
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <span className="ops-project-process-status" role="status">
        {notice}
      </span>
    </fieldset>
  );
}
