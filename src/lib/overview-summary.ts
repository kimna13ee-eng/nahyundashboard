import { scheduleOverlaps, seoulDate, type OpsRow } from "./ops.ts";

export function taskCompletionTime(task: OpsRow) {
  // A missing column means the completion-timestamp migration is not installed.
  // Once installed, a null timestamp must never be replaced by an unrelated edit.
  const value =
    task.completed_at === undefined ? task.updated_at : task.completed_at;
  return Number.isFinite(Date.parse(String(value))) ? String(value) : null;
}

export function dailyTaskGroups(tasks: OpsRow[], day: string) {
  const pending = tasks.filter((task) => {
    const created = Date.parse(String(task.created_at));
    return (
      task.status !== "completed" &&
      (task.due_date === day ||
        (Number.isFinite(created) && seoulDate(new Date(created)) === day))
    );
  });
  const completed = tasks
    .filter((task) => {
      const at = taskCompletionTime(task);
      return (
        task.status === "completed" && at && seoulDate(new Date(at)) === day
      );
    })
    .sort(
      (a, b) =>
        Date.parse(taskCompletionTime(b)!) - Date.parse(taskCompletionTime(a)!),
    );
  return { pending, completed };
}

export function seoulWeek(day: string) {
  const anchor = Date.parse(`${day}T00:00:00Z`);
  const weekday = new Date(anchor).getUTCDay();
  const monday = anchor - ((weekday + 6) % 7) * 86400000;
  const days = Array.from({ length: 7 }, (_, index) =>
    new Date(monday + index * 86400000).toISOString().slice(0, 10),
  );
  return {
    days,
    from: days[0],
    to: new Date(monday + 7 * 86400000).toISOString().slice(0, 10),
  };
}

export function weeklyScheduleRows(items: OpsRow[], today: string) {
  const week = seoulWeek(today);
  return week.days.map((day, index) => ({
    day,
    weekday: ["월", "화", "수", "목", "금", "토", "일"][index],
    items: items
      .filter((item) => scheduleOverlaps(item, day))
      .sort(
        (a, b) =>
          Date.parse(String(a.starts_at)) - Date.parse(String(b.starts_at)),
      ),
  }));
}

export function weeklyScheduleTime(item: OpsRow, day: string) {
  if (item.source === "업무 마감") return "종일 · 마감";
  const start = Date.parse(String(item.starts_at));
  const end = Date.parse(String(item.ends_at));
  const lower = Date.parse(`${day}T00:00:00+09:00`);
  const upper = lower + 86400000;
  if (![start, end, lower].every(Number.isFinite)) return "시간 미정";
  const format = (at: number) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(at));
  if (String(item.source).startsWith("콘텐츠")) return format(start);
  if (start <= lower && end >= upper) return "종일";
  return `${start <= lower ? "00:00" : format(start)}–${end >= upper ? "24:00" : format(end)}`;
}

export function dailyTaskSummary(tasks: OpsRow[], day: string) {
  const daily = tasks.filter((task) => {
    const created = Date.parse(String(task.created_at));
    return (
      task.due_date === day ||
      (Number.isFinite(created) && seoulDate(new Date(created)) === day)
    );
  });
  return {
    total: daily.length,
    completed: daily.filter((t) => t.status === "completed").length,
  };
}
