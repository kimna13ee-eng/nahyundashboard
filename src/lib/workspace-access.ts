import type { SupabaseClient, User } from "@supabase/supabase-js";

export type DataWorkspace = "PERSONAL" | "FRENGLE";

export class WorkspaceAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WorkspaceAccessError";
    this.status = status;
  }
}

export function requestWorkspace(params: URLSearchParams): DataWorkspace {
  const values = params.getAll("workspace");
  if (values.length !== 1)
    throw new WorkspaceAccessError("워크스페이스를 확인해 주세요.", 403);
  if (values[0] === "PERSONAL" || values[0] === "ALL") return "PERSONAL";
  if (values[0] === "FRENGLE") return "FRENGLE";
  throw new WorkspaceAccessError("워크스페이스를 확인해 주세요.", 403);
}

type WorkspaceProvider = {
  configured: () => boolean;
  client: () => Promise<SupabaseClient>;
};
export type WorkspaceProviders = Record<DataWorkspace, WorkspaceProvider>;
export type WorkspaceSession = {
  workspace: DataWorkspace;
  client: SupabaseClient;
  user: User;
};

/** Each request verifies the selected project's own session. Company failures
 * never fall back to the personal project, even when its session is valid. */
export async function authenticateWorkspace(
  params: URLSearchParams,
  providers: WorkspaceProviders,
): Promise<WorkspaceSession> {
  const workspace = requestWorkspace(params);
  const provider = providers[workspace];
  const label = workspace === "FRENGLE" ? "회사" : "개인";
  if (!provider.configured())
    throw new WorkspaceAccessError(
      `${label} 저장소 연결 설정이 필요합니다.`,
      503,
    );
  try {
    const client = await provider.client();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      throw new WorkspaceAccessError(`${label} 계정 로그인이 필요합니다.`, 401);
    if (workspace === "FRENGLE") {
      const member = await client
        .from("ops_company_members")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (member.error || !member.data)
        throw new WorkspaceAccessError(
          "FRENGLE 사용자 권한이 필요합니다.",
          403,
        );
    }
    return { workspace, client, user };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) throw error;
    throw new WorkspaceAccessError(
      `${label} 저장소 인증 연결을 확인하지 못했습니다. 다시 시도해 주세요.`,
      503,
    );
  }
}

/** Leave and personal content stay in PERSONAL. Company phase 2 only supplies
 * recurrence rules and their exceptions for its calendar and workflow. */
export function workspaceAllowsPhase2(
  workspace: DataWorkspace,
  resource: string,
) {
  return (
    ["recurrence", "exceptions"].includes(resource) ||
    (workspace === "PERSONAL" &&
      ["content", "inspiration", "leave"].includes(resource))
  );
}
