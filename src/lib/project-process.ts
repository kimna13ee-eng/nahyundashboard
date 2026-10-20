import { parseProcessSteps, type ProcessStep } from "./task-process.ts";

export const projectCategories = [
  "content",
  "development",
  "operations",
  "other",
] as const;
export type ProjectCategory = (typeof projectCategories)[number];
export const projectCategoryLabels: Record<ProjectCategory, string> = {
  content: "콘텐츠",
  development: "개발",
  operations: "운영",
  other: "기타",
};

export function parseProjectCategory(value: unknown): ProjectCategory {
  if (value === undefined) return "other";
  if (!projectCategories.includes(value as ProjectCategory))
    throw new Error("프로젝트 분류를 확인해 주세요.");
  return value as ProjectCategory;
}

export type ProjectProcessInput = {
  title: string;
  description: string;
  status: "planning" | "active" | "completed";
  project_category: ProjectCategory;
  process_steps: ProcessStep[];
  expected_updated_at: string | null;
};

export function parseProjectProcessInput(raw: unknown): ProjectProcessInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("프로젝트 입력 정보를 확인해 주세요.");
  const value = raw as Record<string, unknown>;
  if (
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 120 ||
    (value.description !== undefined &&
      (typeof value.description !== "string" ||
        value.description.length > 2000)) ||
    typeof value.status !== "string" ||
    !["planning", "active", "completed"].includes(value.status) ||
    !Object.hasOwn(value, "process_steps") ||
    value.process_steps === undefined
  )
    throw new Error("프로젝트 이름·상태·프로세스 입력을 확인해 주세요.");
  if (
    value.expected_updated_at !== undefined &&
    value.expected_updated_at !== null &&
    (typeof value.expected_updated_at !== "string" ||
      value.expected_updated_at.length > 50 ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(value.expected_updated_at) ||
      !Number.isFinite(Date.parse(value.expected_updated_at)))
  )
    throw new Error("프로젝트 저장 시각을 확인해 주세요.");
  return {
    title: value.title.trim(),
    description: (value.description ?? "") as string,
    status: value.status as ProjectProcessInput["status"],
    project_category: parseProjectCategory(value.project_category),
    process_steps: parseProcessSteps(value.process_steps),
    expected_updated_at: (value.expected_updated_at ?? null) as string | null,
  };
}

/** Only known database errors become actionable UI messages. */
export function projectProcessFailure(error: { message?: string } | null) {
  const message = error?.message || "";
  if (message.includes("Project step has an active timer"))
    return {
      status: 409,
      error: "진행 중인 타이머를 먼저 마쳐주세요.",
    };
  if (message.includes("Project step cannot be deleted"))
    return {
      status: 409,
      error:
        "프로젝트 편집에서 단계를 제거해 주세요. 기존 작업 기록은 보관됩니다.",
    };
  if (message.includes("Project step binding cannot be changed"))
    return {
      status: 409,
      error:
        "프로젝트 프로세스의 연결은 변경할 수 없습니다. 프로젝트에서 편집해 주세요.",
    };
  if (message.includes("Archived or completed project step cannot start"))
    return {
      status: 409,
      error: "프로젝트에서 미완료 단계로 복원한 뒤 타이머를 시작해 주세요.",
    };
  if (message.includes("Project not found"))
    return { status: 404, error: "프로젝트를 찾을 수 없습니다." };
  if (message.includes("Project changed since editing"))
    return {
      status: 409,
      error: "프로젝트가 다른 화면에서 변경됐습니다. 다시 열어 확인해 주세요.",
    };
  return null;
}
