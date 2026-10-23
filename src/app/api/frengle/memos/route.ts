import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import {
  workspaceSession,
  WorkspaceAccessError,
} from "@/lib/workspaces/server";
import {
  overviewMemoColumns,
  overviewMemoFailure,
  overviewMemoLimits,
  overviewMemoQueryAllowed,
  OverviewMemoInputError,
  parseOverviewMemoCreate,
  parseOverviewMemoPatch,
} from "@/lib/overview-memos";

const table = "ops_overview_memos";

async function handle(req: NextRequest) {
  if (req.method !== "GET" && !sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!overviewMemoQueryAllowed(req.nextUrl.searchParams))
    return json({ error: "FRENGLE 메모의 워크스페이스를 확인해 주세요." }, 403);
  try {
    // The company session is fixed by this endpoint, never chosen by body or fallback.
    const { client, user } = await workspaceSession(
      new URLSearchParams({ workspace: "FRENGLE" }),
    );
    if (req.method === "GET") {
      const [active, archived] = await Promise.all([
        client
          .from(table)
          .select(overviewMemoColumns, { count: "exact" })
          .eq("owner_id", user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(overviewMemoLimits.active + 1),
        client
          .from(table)
          .select(overviewMemoColumns, { count: "exact" })
          .eq("owner_id", user.id)
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(overviewMemoLimits.archived + 1),
      ]);
      if (active.error || archived.error) {
        const failure = overviewMemoFailure(active.error || archived.error);
        return json(failure.body, failure.status);
      }
      const items = active.data || [];
      const trash = archived.data || [];
      return json({
        ready: true,
        items: items.slice(0, overviewMemoLimits.active),
        archived: trash.slice(0, overviewMemoLimits.archived),
        truncated:
          items.length > overviewMemoLimits.active ||
          (active.count || 0) > overviewMemoLimits.active,
        archivedTruncated:
          trash.length > overviewMemoLimits.archived ||
          (archived.count || 0) > overviewMemoLimits.archived,
      });
    }
    if (req.method === "POST") {
      const value = parseOverviewMemoCreate(await req.json());
      // owner_id, done and timestamps use database defaults, not mass assignment.
      const { data, error } = await client
        .from(table)
        .insert(value)
        .select(overviewMemoColumns)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error || !data) {
        const failure = overviewMemoFailure(error);
        return json(failure.body, failure.status);
      }
      return json({ item: data }, 201);
    }
    const value = parseOverviewMemoPatch(await req.json());
    const change = value.action
      ? {
          deleted_at:
            value.action === "archive" ? new Date().toISOString() : null,
        }
      : {
          ...(Object.hasOwn(value, "body") ? { body: value.body } : {}),
          ...(Object.hasOwn(value, "done") ? { done: value.done } : {}),
        };
    let query = client
      .from(table)
      .update(change)
      .eq("id", value.id)
      .eq("owner_id", user.id)
      .eq("updated_at", value.expected_updated_at);
    query =
      value.action === "restore"
        ? query.not("deleted_at", "is", null)
        : query.is("deleted_at", null);
    const { data, error } = await query
      .select(overviewMemoColumns)
      .maybeSingle();
    if (error) {
      const failure = overviewMemoFailure(error);
      return json(failure.body, failure.status);
    }
    if (data) return json({ item: data });
    const current = await client
      .from(table)
      .select("id")
      .eq("id", value.id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (current.error) {
      const failure = overviewMemoFailure(current.error);
      return json(failure.body, failure.status);
    }
    return current.data
      ? json(
          {
            error:
              "메모가 다른 곳에서 변경되었어요. 새로고침 후 다시 시도해 주세요.",
            conflict: true,
          },
          409,
        )
      : json({ error: "메모를 찾을 수 없습니다." }, 404);
  } catch (error) {
    if (error instanceof WorkspaceAccessError)
      return json({ error: error.message }, error.status);
    if (error instanceof OverviewMemoInputError)
      return json({ error: error.message }, 400);
    if (error instanceof SyntaxError)
      return json({ error: "메모 입력 형식을 확인해 주세요." }, 400);
    return json(
      {
        ready: false,
        error: "메모 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      503,
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
