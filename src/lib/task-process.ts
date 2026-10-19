export const taskCategories = ["content", "sales", "design", "other"] as const;
export type TaskCategory = (typeof taskCategories)[number];
export const taskCategoryLabels: Record<TaskCategory, string> = {
  content: "콘텐츠",
  sales: "영업",
  design: "디자인",
  other: "기타",
};

export type ProcessStep = { id: string; title: string; done: boolean };

export function parseTaskCategory(value: unknown): TaskCategory {
  if (value === undefined) return "other";
  if (!taskCategories.includes(value as TaskCategory))
    throw new Error("업무 분류를 확인해 주세요.");
  return value as TaskCategory;
}

export function parseProcessSteps(value: unknown): ProcessStep[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30)
    throw new Error("프로세스는 최대 30단계까지 입력해 주세요.");
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("프로세스 단계를 확인해 주세요.");
    const { id, title, done } = entry as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      !id.trim() ||
      id.length > 80 ||
      ids.has(id) ||
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 120 ||
      typeof done !== "boolean"
    )
      throw new Error("프로세스 단계 이름·완료 여부를 확인해 주세요.");
    ids.add(id);
    return { id, title: title.trim(), done };
  });
}

export function processSummary(value: unknown) {
  const steps = parseProcessSteps(value);
  const completed = steps.filter((step) => step.done).length;
  return {
    current: steps.find((step) => !step.done) ?? null,
    completed,
    total: steps.length,
    allDone: steps.length > 0 && completed === steps.length,
  };
}

export function reconcileProcessSteps(
  multiline: string,
  previous: unknown = [],
  createId: () => string = () => crypto.randomUUID(),
): ProcessStep[] {
  if (typeof multiline !== "string")
    throw new Error("프로세스 내용을 확인해 주세요.");
  const existing = parseProcessSteps(previous);
  const available = new Map<string, ProcessStep[]>();
  const occupiedIds = new Set(existing.map((step) => step.id));
  for (const step of existing) {
    const matches = available.get(step.title) ?? [];
    matches.push(step);
    available.set(step.title, matches);
  }
  const titles = multiline
    .split(/\r?\n/)
    .map((title) => title.trim())
    .filter(Boolean);
  if (titles.length > 30 || titles.some((title) => title.length > 120))
    throw new Error("프로세스는 단계당 120자, 최대 30단계까지 입력해 주세요.");
  const result = titles.map((title) => {
    const match = available.get(title)?.shift();
    if (match) return { ...match };
    const id = createId();
    if (occupiedIds.has(id))
      throw new Error("프로세스 단계 ID가 중복되었습니다. 다시 시도해 주세요.");
    occupiedIds.add(id);
    return { id, title, done: false };
  });
  return parseProcessSteps(result);
}
