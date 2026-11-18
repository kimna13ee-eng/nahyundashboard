import type { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { uuid } from "@/lib/ops";
import {
  allowedQuery,
  makeupSession,
  MakeupInputError,
  readMutation,
} from "@/lib/makeup-looks-server";
import { WorkspaceAccessError } from "@/lib/workspaces/server";

function shootingError(error: unknown) {
  if (
    error instanceof MakeupInputError ||
    error instanceof WorkspaceAccessError
  )
    return json({ error: error.message }, error.status);
  return json(
    { error: "촬영 메모를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." },
    503,
  );
}

const table = "ops_shooting_skills";
const columns = "id,title,content,created_at,updated_at";
const conflict = () =>
  json(
    {
      error:
        "다른 화면에서 변경됐어요. 메모를 복사해 둔 뒤 목록을 새로 불러와 주세요.",
    },
    409,
  );

export async function GET(req: NextRequest) {
  try {
    allowedQuery(req.nextUrl.searchParams, ["offset"]);
    const raw = req.nextUrl.searchParams.get("offset") || "0";
    if (!/^(0|[1-9]\d*)$/.test(raw) || Number(raw) > 1000000)
      throw new MakeupInputError("목록을 다시 불러와 주세요.");
    const { client, user } = await makeupSession();
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(Number(raw), Number(raw) + 30);
    if (error) return shootingError(error);
    return json({
      items: (data || []).slice(0, 30),
      nextOffset: (data || []).length > 30 ? Number(raw) + 30 : null,
    });
  } catch (error) {
    return shootingError(error);
  }
}

async function mutate(req: NextRequest) {
  if (!sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    allowedQuery(req.nextUrl.searchParams, []);
    const value = await readMutation(
      req,
      ["id", "title", "content", "expectedUpdatedAt"],
      70000,
    );
    if (!uuid(value.id))
      throw new MakeupInputError("메모를 다시 선택해 주세요.");
    const { client, user } = await makeupSession();
    if (
      req.method !== "POST" &&
      (typeof value.expectedUpdatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.expectedUpdatedAt)))
    )
      throw new MakeupInputError("메모를 다시 불러와 주세요.");
    if (req.method === "DELETE") {
      const result = await client
        .from(table)
        .delete()
        .eq("owner_id", user.id)
        .eq("id", value.id)
        .eq("updated_at", value.expectedUpdatedAt)
        .select("id")
        .maybeSingle();
      if (result.error) return shootingError(result.error);
      return result.data ? json({ id: value.id }) : conflict();
    }
    if (
      typeof value.title !== "string" ||
      !value.title.trim() ||
      Array.from(value.title.trim()).length > 100 ||
      value.title.includes("\0") ||
      typeof value.content !== "string" ||
      !value.content.trim() ||
      Array.from(value.content).length > 10000 ||
      value.content.includes("\0")
    )
      throw new MakeupInputError(
        "제목은 100자, 메모는 10,000자 이내로 입력해 주세요.",
      );
    const fields = { title: value.title.trim(), content: value.content };
    if (req.method === "POST") {
      const result = await client
        .from(table)
        .insert({ id: value.id, ...fields })
        .select(columns)
        .single();
      if (result.error?.code === "23505") {
        const prior = await client
          .from(table)
          .select(columns)
          .eq("owner_id", user.id)
          .eq("id", value.id)
          .maybeSingle();
        if (
          prior.data?.title === fields.title &&
          prior.data?.content === fields.content
        )
          return json({ item: prior.data });
        return conflict();
      }
      if (result.error) return shootingError(result.error);
      return json({ item: result.data });
    }
    const result = await client
      .from(table)
      .update(fields)
      .eq("owner_id", user.id)
      .eq("id", value.id)
      .eq("updated_at", value.expectedUpdatedAt)
      .select(columns)
      .maybeSingle();
    if (result.error) return shootingError(result.error);
    return result.data ? json({ item: result.data }) : conflict();
  } catch (error) {
    return shootingError(error);
  }
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
