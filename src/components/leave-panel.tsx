"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { calculateLeave, LeaveEntry, LeaveProfile } from "@/lib/leave";
import { OpsDialog } from "./ops-dialog";
import { OpsFormActions } from "./ops-form-actions";
import "./leave-record.css";

type LeaveData = {
  profile: LeaveProfile | null;
  entries: LeaveEntry[];
  asOf: string;
  calculation: ReturnType<typeof calculateLeave> | null;
};
type Editor = "profile" | { entry?: LeaveEntry } | null;

function seoulDay() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function days(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(
    value,
  );
}
function lastUsableDay(expiresOn: string) {
  return new Date(Date.parse(`${expiresOn}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
}
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${path}?workspace=PERSONAL`, {
    method,
    cache: "no-store",
    signal: method === "GET" ? AbortSignal.timeout(20000) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "로그인이 만료되었습니다. 설정에서 다시 로그인해 주세요."
        : response.status === 503
          ? "연차 자동 계산 설정을 준비 중입니다. 잠시 후 새로고침해 주세요."
          : result.error || "연차 기록을 불러오지 못했습니다.",
    );
  }
  return result;
}

export function LeavePanel({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<LeaveData | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [removal, setRemoval] = useState<LeaveEntry | null>(null);
  const [uncertainSave, setUncertainSave] = useState(false);
  const saving = useRef(false);
  const currentDay = useRef("");
  const load = useCallback(async () => {
    if (!enabled) return false;
    setLoading(true);
    try {
      const result = (await request("/api/leave")) as LeaveData;
      setData(result);
      currentDay.current = result.asOf;
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "연차 기록 조회 실패");
      return false;
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      if (enabled) void load();
      else {
        setData(null);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [enabled, load]);
  useEffect(() => {
    function refresh(event?: Event) {
      if (!enabled || saving.current || document.querySelector("dialog[open]"))
        return;
      const promise = load();
      (
        event as CustomEvent<{ waits?: Promise<boolean>[] }> | undefined
      )?.detail?.waits?.push(promise);
      void promise;
    }
    function checkDay() {
      if (currentDay.current && currentDay.current !== seoulDay()) refresh();
    }
    const interval = setInterval(checkDay, 30000);
    window.addEventListener("myops:refresh", refresh);
    document.addEventListener("visibilitychange", checkDay);
    return () => {
      clearInterval(interval);
      window.removeEventListener("myops:refresh", refresh);
      document.removeEventListener("visibilitychange", checkDay);
    };
  }, [enabled, load]);

  async function save(path: string, method: string, body: unknown) {
    if (saving.current || uncertainSave) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(path, method, body);
      setEditor(null);
      setRemoval(null);
      const loaded = await load();
      setNotice(
        loaded
          ? "저장했습니다. 잔여 연차를 다시 계산했어요."
          : "저장했습니다. 최신 잔여 연차는 새로고침해 확인해 주세요.",
      );
    } catch (e) {
      const uncertain = e instanceof TypeError || e instanceof SyntaxError;
      if (uncertain) setUncertainSave(true);
      setError(
        uncertain
          ? "저장 응답을 확인하지 못했습니다. 입력은 유지됩니다. 창을 닫고 새로고침해 저장 여부를 확인해 주세요."
          : e instanceof Error
            ? e.message
            : "연차 저장 실패",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function open(value: Editor) {
    setError("");
    setNotice("");
    setUncertainSave(false);
    setEditor(value);
  }

  const canWrite = enabled && !!data && !loading && !busy;
  const calculation = data?.calculation;
  const profile = data?.profile;
  const automatic =
    calculation?.lots.filter((lot) => lot.kind !== "manual") || [];
  const automaticTotal = automatic.reduce((sum, lot) => sum + lot.amount, 0);
  const history = [
    ...automatic.map((lot) => ({
      id: `auto:${lot.id}`,
      date: lot.date,
      title: lot.kind === "monthly" ? "월 연차 발생" : "연 연차 발생",
      amount: lot.amount,
      detail: lot.expiresOn ? `사용 기한 ${lastUsableDay(lot.expiresOn)}` : "",
      entry: null as LeaveEntry | null,
    })),
    ...(profile?.prior_used
      ? [
          {
            id: "prior",
            date: profile.prior_used_date,
            title: "기존 사용 연차",
            amount: -profile.prior_used,
            detail: profile.prior_used_date
              ? "설정에 반영된 사용 기록"
              : "사용 날짜 미기록 · 연차 설정에서 날짜를 입력할 수 있어요.",
            entry: null as LeaveEntry | null,
          },
        ]
      : []),
    ...(data?.entries || []).map((entry, index) => ({
      id: entry.id || `entry:${index}`,
      date: entry.date,
      title:
        entry.title ||
        (entry.kind === "use"
          ? "연차 사용"
          : entry.kind === "grant"
            ? "추가 연차 발생"
            : "연차 조정"),
      amount: Number(entry.amount),
      detail:
        entry.date > (data?.asOf || "")
          ? "예정 · 현재 잔여 일수에는 아직 반영하지 않아요."
          : entry.kind === "use"
            ? "사용 기록"
            : "직접 등록한 기록",
      entry,
    })),
  ].sort(
    (a, b) =>
      (b.date || "").localeCompare(a.date || "") || a.id.localeCompare(b.id),
  );
  const usageEditor = editor && editor !== "profile" ? editor : null;

  return (
    <section className="ops-card ops-leave-records ops-leave-dashboard">
      <div className="ops-section-head">
        <div>
          <h2>개인 연차 기록</h2>
          <p>입사일 기준으로 발생일을 자동 계산하고, 사용한 날짜를 기록해요.</p>
        </div>
        <div className="ops-row-actions">
          <button disabled={!canWrite} onClick={() => open("profile")}>
            {profile ? "연차 설정" : "입사일 설정"}
          </button>
          <button
            className="ops-primary"
            disabled={!canWrite || !profile}
            onClick={() => open({})}
          >
            사용 기록
          </button>
        </div>
      </div>
      {!enabled ? <p>개인 로그인 후 PERSONAL에서 사용할 수 있어요.</p> : null}
      {enabled && loading ? (
        <p role="status">연차 기록을 불러오는 중…</p>
      ) : null}
      {error && !editor && !removal ? (
        <p className="ops-alert bad" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {enabled && !loading && data && !profile ? (
        <div className="ops-leave-setup">
          <strong>입사일을 등록하면 자동 계산을 시작해요.</strong>
          <p>기존 사용 일수와 사용한 날짜도 함께 반영할 수 있어요.</p>
          <button disabled={!canWrite} onClick={() => open("profile")}>
            입사일과 기존 사용 기록 등록
          </button>
        </div>
      ) : null}
      {profile && calculation ? (
        <>
          <div className="ops-leave-summary" aria-label="연차 현황">
            <div className="ops-leave-stat is-balance">
              <span>사용 가능</span>
              <strong>
                {days(calculation.balance)}
                <small>일</small>
              </strong>
            </div>
            <div className="ops-leave-stat">
              <span>자동 발생</span>
              <strong>
                {days(automaticTotal)}
                <small>일</small>
              </strong>
            </div>
            <div className="ops-leave-stat">
              <span>사용</span>
              <strong>
                {days(calculation.used)}
                <small>일</small>
              </strong>
            </div>
          </div>
          <div className="ops-leave-context">
            <span>
              입사일 {profile.hire_date} · {data?.asOf} 기준 (한국시간)
            </span>
            <span>
              {calculation.nextGrant
                ? `다음 발생 ${calculation.nextGrant.date} · ${days(calculation.nextGrant.amount)}일`
                : "다음 발생 예정 없음"}
            </span>
            {calculation.expired > 0 ? (
              <span>기한 지난 미사용 연차 {days(calculation.expired)}일</span>
            ) : null}
            {calculation.adjustment !== 0 ||
            calculation.granted !== automaticTotal ? (
              <span>
                직접 등록한 발생·조정{" "}
                {days(
                  calculation.granted - automaticTotal + calculation.adjustment,
                )}
                일 포함
              </span>
            ) : null}
          </div>
        </>
      ) : null}
      {enabled ? (
        <div className="ops-leave-history-head">
          <h3>발생·사용 내역</h3>
          <button disabled={loading || busy} onClick={() => void load()}>
            새로고침
          </button>
        </div>
      ) : null}
      {enabled && history.length ? (
        <ol className="ops-leave-history">
          {history.map((item) => (
            <li key={item.id}>
              <div className="ops-leave-history-date">
                {item.date || "날짜 미기록"}
              </div>
              <div className="ops-leave-history-body">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <span
                className={`ops-leave-amount ${item.amount < 0 ? "is-used" : "is-grant"}`}
              >
                {item.amount > 0 ? "+" : "−"}
                {days(Math.abs(item.amount))}일
              </span>
              <div className="ops-leave-history-actions">
                {item.entry?.kind === "use" && item.entry.id ? (
                  <>
                    <button
                      disabled={!canWrite}
                      onClick={() => open({ entry: item.entry! })}
                      aria-label={`${item.title} ${item.date} 수정`}
                    >
                      수정
                    </button>
                    <button
                      className="ops-danger"
                      disabled={!canWrite}
                      onClick={() => {
                        setError("");
                        setUncertainSave(false);
                        setRemoval(item.entry);
                      }}
                      aria-label={`${item.title} ${item.date} 삭제`}
                    >
                      삭제
                    </button>
                  </>
                ) : item.id === "prior" ? (
                  <button disabled={!canWrite} onClick={() => open("profile")}>
                    수정
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : enabled && !loading && data ? (
        <p className="ops-empty-state">아직 발생·사용 내역이 없어요.</p>
      ) : null}
      {enabled ? (
        <details className="ops-leave-basis">
          <summary>계산 기준</summary>
          <p>
            입사일 기준 개인 관리용 기록입니다. 1년 미만은 매월 개근을 가정해
            1일씩 최대 11일, 1년 이후는 출근율 80% 이상을 가정해 15일부터
            계산합니다. 최초 1년의 월 연차는 첫 입사 기념일 전날, 이후 발생
            연차는 발생일로부터 1년이 지나면 미사용분이 차감됩니다. 회사의 확정
            내역과 다르면 연차 설정과 사용 기록을 확인해 주세요.
          </p>
          <p>직접 등록한 발생·조정은 자동 발생 일수에 추가로 반영합니다.</p>
          <p>PERSONAL 전용이며 업무 캘린더·공유 보고서에 포함하지 않습니다.</p>
        </details>
      ) : null}

      {editor === "profile" ? (
        <OpsDialog title="연차 설정" busy={busy} close={() => setEditor(null)}>
          <form
            className="ops-form ops-leave-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const priorUsed = Number(form.get("prior_used"));
              void save("/api/leave", "POST", {
                action: "profile",
                value: {
                  hire_date: form.get("hire_date"),
                  prior_used: priorUsed,
                  prior_used_date:
                    priorUsed > 0 ? form.get("prior_used_date") || null : null,
                },
              });
            }}
          >
            <label>
              입사일
              <input
                name="hire_date"
                type="date"
                required
                max={data?.asOf}
                defaultValue={profile?.hire_date || ""}
                disabled={busy}
              />
            </label>
            <label>
              기존 사용 일수
              <input
                name="prior_used"
                type="number"
                required
                min="0"
                max="365"
                step="0.5"
                defaultValue={profile?.prior_used ?? 0}
                disabled={busy}
              />
            </label>
            <label>
              기존 사용 날짜 (선택)
              <input
                name="prior_used_date"
                type="date"
                max={data?.asOf}
                defaultValue={profile?.prior_used_date || ""}
                disabled={busy}
              />
            </label>
            <p className="ops-section-help">
              기존 사용 일수는 이 화면에서 처음 반영하는 사용 기록입니다. 아래
              사용 내역에 이미 등록한 일수는 중복 입력하지 마세요. 날짜를 모르면
              비워 두어도 됩니다.
            </p>
            {error ? (
              <p className="ops-alert bad" role="alert">
                {error}
              </p>
            ) : null}
            <OpsFormActions busy={busy}>
              <button className="ops-primary" disabled={busy || uncertainSave}>
                저장
              </button>
            </OpsFormActions>
          </form>
        </OpsDialog>
      ) : null}
      {usageEditor ? (
        <OpsDialog
          title={usageEditor.entry ? "연차 사용 수정" : "연차 사용 기록"}
          busy={busy}
          close={() => setEditor(null)}
        >
          <form
            className="ops-form ops-leave-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const date = String(form.get("date"));
              const amount = Number(form.get("amount"));
              const title = String(
                form.get("title") ||
                  (amount === 0.5 ? "반차 사용" : "연차 사용"),
              );
              void (usageEditor.entry?.id
                ? save("/api/phase2", "PATCH", {
                    resource: "leave",
                    id: usageEditor.entry.id,
                    value: { date, amount: -amount, title, kind: "use" },
                  })
                : save("/api/leave", "POST", {
                    action: "usage",
                    value: { date, amount, title },
                  }));
            }}
          >
            <label>
              사용 날짜
              <input
                name="date"
                type="date"
                required
                min={profile?.hire_date}
                defaultValue={usageEditor.entry?.date || data?.asOf || ""}
                disabled={busy}
              />
            </label>
            <label>
              사용 일수
              <select
                name="amount"
                defaultValue={
                  usageEditor.entry
                    ? String(Math.abs(Number(usageEditor.entry.amount)))
                    : "0.5"
                }
                disabled={busy}
              >
                <option value="0.5">0.5일 · 반차</option>
                <option value="1">1일 · 연차</option>
                {usageEditor.entry &&
                ![0.5, 1].includes(
                  Math.abs(Number(usageEditor.entry.amount)),
                ) ? (
                  <option value={Math.abs(Number(usageEditor.entry.amount))}>
                    {days(Math.abs(Number(usageEditor.entry.amount)))}일 · 기존
                    기록
                  </option>
                ) : null}
              </select>
            </label>
            <label>
              메모 (선택)
              <input
                name="title"
                maxLength={120}
                placeholder="예: 병원 방문"
                defaultValue={usageEditor.entry?.title || ""}
                disabled={busy}
              />
            </label>
            <p className="ops-section-help">
              저장하면 사용 날짜 기준으로 잔여 일수를 자동 계산해요. 미래 날짜는
              예정으로 표시됩니다.
            </p>
            {error ? (
              <p className="ops-alert bad" role="alert">
                {error}
              </p>
            ) : null}
            <OpsFormActions busy={busy}>
              <button className="ops-primary" disabled={busy || uncertainSave}>
                저장
              </button>
            </OpsFormActions>
          </form>
        </OpsDialog>
      ) : null}
      {removal ? (
        <OpsDialog
          title="연차 사용 기록 삭제"
          busy={busy}
          close={() => setRemoval(null)}
        >
          <p>
            {removal.date} · {removal.title || "연차 사용"} ·{" "}
            {days(Math.abs(Number(removal.amount)))}일
          </p>
          <p>삭제하면 이 사용 일수를 잔여 연차에 다시 반영합니다.</p>
          {error ? (
            <p className="ops-alert bad" role="alert">
              {error}
            </p>
          ) : null}
          <OpsFormActions busy={busy}>
            <button
              className="ops-danger"
              disabled={busy || uncertainSave}
              onClick={() =>
                void save("/api/phase2", "DELETE", {
                  resource: "leave",
                  id: removal.id,
                })
              }
            >
              삭제
            </button>
          </OpsFormActions>
        </OpsDialog>
      ) : null}
    </section>
  );
}
