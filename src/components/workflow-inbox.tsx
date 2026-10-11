"use client";
import { useState } from "react";
import { OpsDialog } from "./ops-dialog";
import type { OpsRow } from "@/lib/ops";
export function ParkFields() {
  return (
    <fieldset>
      <legend>중단할 현재 업무 맥락 (선택)</legend>
      {[
        ["last_stage", "마지막 작업 단계"],
        ["next_action", "미완료 다음 액션"],
        ["last_file", "마지막 수정 파일 또는 결과 URL"],
        ["reason", "중단 사유"],
      ].map(([key, label]) => (
        <label key={key}>
          {label}
          <input name={`park:${key}`} maxLength={2000} />
        </label>
      ))}
      <p>
        작성한 메모·미완료 이슈·도구·중단 시각은 저장된 내용으로 보존합니다.
      </p>
    </fieldset>
  );
}
export function parkForm(form: FormData) {
  return Object.fromEntries(
    ["last_stage", "next_action", "last_file", "reason"].map((key) => [
      key,
      String(form.get(`park:${key}`) || ""),
    ]),
  );
}
export function WorkflowInbox({
  items,
  projects,
  ready,
  enabled,
  busy,
  error,
  open,
  setOpen,
  activeTitle,
  act,
  checking = false,
  onOpenTask,
  canStart = true,
}: {
  items: OpsRow[];
  projects: OpsRow[];
  ready: boolean;
  enabled: boolean;
  busy: boolean;
  error: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  activeTitle: string;
  act: (body: unknown) => Promise<boolean>;
  checking?: boolean;
  onOpenTask?: (id: string) => void;
  canStart?: boolean;
}) {
  const [editor, setEditor] = useState<OpsRow | null>(null),
    [filter, setFilter] = useState("inbox"),
    [requestId, setRequestId] = useState<string | undefined>(undefined);
  const canWrite = enabled && ready && !busy && !checking;
  const close = () => {
    setOpen(false);
    setEditor(null);
    setRequestId(undefined);
  };
  const row: Record<string, unknown> = editor || {};
  return (
    <>
      <section className="ops-card">
        <h2>Quick Inbox</h2>
        <p>
          PERSONAL · 미분류 아이디어와 돌발 업무. 등록만 하면 현재 타이머를
          유지합니다.
        </p>
        {checking ? (
          <p role="status">저장소 연결을 확인하고 있습니다.</p>
        ) : !enabled ? (
          <p role="status">연결된 PERSONAL 계정에서 사용할 수 있습니다.</p>
        ) : !ready ? (
          <p role="status">
            SQL007 적용 또는 연결 확인이 필요합니다. 기존 업무 등록은
            Projects에서 사용할 수 있습니다.
          </p>
        ) : null}
        <div className="ops-toolbar">
          <button
            disabled={!canWrite}
            onClick={() => {
              setRequestId(crypto.randomUUID());
              setOpen(true);
            }}
          >
            빠르게 수집
          </button>
          <label>
            Inbox 보기
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="inbox">미분류</option>
              <option value="converted">업무로 변환됨</option>
              <option value="archived">보관</option>
            </select>
          </label>
        </div>
        {items
          .filter((i) => i.status === filter)
          .map((i) => (
            <div className="ops-note" key={i.id}>
              <strong>{String(i.title)}</strong>
              <p>{String(i.notes || "")}</p>
              <small>
                {String(i.source || "출처 없음")} ·{" "}
                {String(
                  projects.find((p) => p.id === i.project_id)?.title ||
                    "프로젝트 미분류",
                )}
              </small>
              {i.status !== "archived" ? (
                <div className="ops-actions">
                  {i.status === "inbox" ? (
                    <button
                      disabled={!canWrite}
                      onClick={() => {
                        setEditor(i);
                        setOpen(true);
                      }}
                    >
                      정리·업무 변환
                    </button>
                  ) : null}
                  <button
                    disabled={!canWrite}
                    onClick={() =>
                      act({
                        action: "capture",
                        id: i.id,
                        mode: "archive",
                        value: { ...i, workspace: "PERSONAL" },
                      })
                    }
                  >
                    보관 처리
                  </button>
                </div>
              ) : (
                <button
                  disabled={!canWrite}
                  onClick={() => act({ action: "inbox_restore", id: i.id })}
                >
                  복원
                </button>
              )}
              {i.converted_task_id && onOpenTask ? (
                <button onClick={() => onOpenTask(String(i.converted_task_id))}>
                  연결된 업무 열기
                </button>
              ) : null}
            </div>
          ))}
        {ready && !items.some((i) => i.status === filter) ? (
          <p>이 분류에 등록된 항목이 없습니다.</p>
        ) : null}
      </section>
      {open ? (
        <OpsDialog title="Quick Capture / Inbox" busy={busy} close={close}>
          <form
            className="ops-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                submitter = (e.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement | null,
                mode = submitter?.value || "inbox";
              const value = {
                ...Object.fromEntries(f),
                schedule_at: f.get("schedule_at")
                  ? `${f.get("schedule_at")}:00+09:00`
                  : null,
              };
              const id = editor?.id || requestId || crypto.randomUUID();
              if (!editor && !requestId) setRequestId(id);
              if (editor && !(await act({ action: "inbox_update", id, value })))
                return;
              if (
                await act({
                  action: "capture",
                  id,
                  mode,
                  value,
                  context: parkForm(f),
                })
              )
                close();
            }}
          >
            <fieldset disabled={busy || !ready || !enabled}>
              <legend>빠른 수집</legend>
              <label>
                제목 한 줄
                <input
                  name="title"
                  required
                  maxLength={120}
                  defaultValue={String(row.title || "")}
                  autoFocus
                />
              </label>
              <label>
                워크스페이스
                <select name="workspace" defaultValue="PERSONAL">
                  <option value="PERSONAL">PERSONAL</option>
                  <option value="FRENGLE" disabled>
                    FRENGLE · 회사 저장소 미연결
                  </option>
                </select>
              </label>
              <label>
                메모 (선택)
                <textarea
                  name="notes"
                  maxLength={2000}
                  defaultValue={String(row.notes || "")}
                />
              </label>
              <label>
                출처 (선택)
                <input
                  name="source"
                  maxLength={80}
                  list="capture-sources"
                  defaultValue={String(row.source || "")}
                />
                <datalist id="capture-sources">
                  {[
                    "개인 ChatGPT",
                    "회사 ChatGPT · 비민감 메타데이터만",
                    "회사 Claude · 비민감 메타데이터만",
                    "Claude Code",
                    "Codex",
                    "외부 자동화",
                    "직접 입력",
                  ].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label>
                프로젝트 (나중에 연결 가능)
                <select
                  name="project_id"
                  defaultValue={String(row.project_id || "")}
                >
                  <option value="">미분류</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                예정 시각 (일정 잡기 시 필수)
                <input
                  name="schedule_at"
                  type="datetime-local"
                  defaultValue={
                    row.schedule_at
                      ? new Date(
                          Date.parse(String(row.schedule_at)) + 9 * 3600000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                />
              </label>
              {activeTitle ? (
                <>
                  <p>
                    현재 활성 업무: {activeTitle}. ‘지금 처리’를 누를 때만
                    중단합니다.
                  </p>
                  <ParkFields />
                </>
              ) : null}
              <div className="ops-actions">
                <button value="inbox">Inbox에 보관</button>
                <button value="now" disabled={!canStart}>
                  지금 처리
                </button>
                <button value="schedule">일정 잡기</button>
                {editor ? <button value="task">업무로 변환</button> : null}
              </div>
            </fieldset>
            {!ready ? (
              <p>연결 확인이 완료될 때까지 저장할 수 없습니다.</p>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
          </form>
        </OpsDialog>
      ) : null}
    </>
  );
}
