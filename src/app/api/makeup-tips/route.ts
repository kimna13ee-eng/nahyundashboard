import type { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { uuid } from "@/lib/ops";
import {
  allowedQuery,
  makeupError,
  MakeupInputError,
  makeupSession,
  readMutation,
  readPhotoFields,
  readPhotoForm,
} from "@/lib/makeup-looks-server";

const table = "ops_makeup_tips";
const columns = "id,content,has_photo,created_at,updated_at";
const pageSize = 20;
const conflict = () =>
  json(
    {
      conflict: true,
      error: "다른 화면에서 팁이 바뀌었어요. 목록을 새로 불러와 주세요.",
    },
    409,
  );

function tipId(value: unknown) {
  if (!uuid(value)) throw new MakeupInputError("팁을 다시 선택해 주세요.");
  return value;
}

function version(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new MakeupInputError("팁을 다시 불러와 주세요.");
  return value;
}

function tipError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "40001") return conflict();
    if (
      ["23514", "23502", "22007", "22008", "22P02"].includes(String(error.code))
    )
      return json({ error: "사진이나 메모를 하나 이상 입력해 주세요." }, 400);
  }
  return makeupError(error);
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams;
    allowedQuery(query, ["offset"]);
    const raw = query.get("offset") ?? "0";
    const offset = Number(raw);
    if (!/^(0|[1-9]\d*)$/.test(raw) || offset > 2147483647 - pageSize)
      throw new MakeupInputError("조회할 목록을 다시 확인해 주세요.");
    const { client, user } = await makeupSession();
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq("owner_id", user.id)
      .eq("deleted", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize);
    if (error) return tipError(error);
    const items = data ?? [];
    return json({
      items: items.slice(0, pageSize),
      nextOffset: items.length > pageSize ? offset + pageSize : null,
    });
  } catch (error) {
    return tipError(error);
  }
}

async function mutate(req: NextRequest) {
  if (!sameOrigin(req))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    allowedQuery(req.nextUrl.searchParams, []);
    const { client, user } = await makeupSession();
    if (req.method === "DELETE") {
      const value = await readMutation(req, ["id", "expectedUpdatedAt"]);
      const id = tipId(value.id);
      const expected = version(value.expectedUpdatedAt);
      const result = await client
        .from(table)
        .update({ content: "", image: null, thumbnail: null, deleted: true })
        .eq("owner_id", user.id)
        .eq("id", id)
        .eq("updated_at", expected)
        .eq("deleted", false)
        .select("id")
        .maybeSingle();
      if (result.error) return tipError(result.error);
      if (result.data) return json({ id });
      const prior = await client
        .from(table)
        .select("deleted")
        .eq("owner_id", user.id)
        .eq("id", id)
        .maybeSingle();
      if (prior.error) return tipError(prior.error);
      return prior.data?.deleted ? json({ id }) : conflict();
    }
    const creating = req.method === "POST";
    const fields = ["id", "content", "image", "thumbnail"];
    if (!creating) fields.push("expectedUpdatedAt", "removeImage");
    const form = await readPhotoForm(req, fields);
    const id = tipId(form.get("id"));
    const expected = creating
      ? undefined
      : version(form.get("expectedUpdatedAt"));
    const rawContent = form.get("content") ?? (creating ? "" : null);
    if (
      typeof rawContent !== "string" ||
      rawContent.includes("\0") ||
      Array.from(rawContent.trim()).length > 1500
    )
      throw new MakeupInputError("메모는 1,500자까지 입력할 수 있어요.");
    const content = rawContent.trim();
    const hasFile = form.has("image");
    const remove = form.has("removeImage");
    if (
      (remove && (form.get("removeImage") !== "true" || hasFile)) ||
      (form.has("thumbnail") && !hasFile)
    )
      throw new MakeupInputError("첨부할 사진을 다시 선택해 주세요.");
    if (!content && !hasFile && (creating || remove))
      throw new MakeupInputError("사진이나 메모를 하나 이상 입력해 주세요.");
    const photo = hasFile
      ? await readPhotoFields(form)
      : { p_image: null, p_thumbnail: null };
    if (creating) {
      const { data, error } = await client
        .rpc("ops_create_makeup_tip", {
          p_id: id,
          p_content: content,
          ...photo,
        })
        .single();
      return error || !data ? tipError(error) : json({ item: data }, 201);
    }
    const changes =
      hasFile || remove
        ? { content, image: photo.p_image, thumbnail: photo.p_thumbnail }
        : { content };
    const { data, error } = await client
      .from(table)
      .update(changes)
      .eq("owner_id", user.id)
      .eq("id", id)
      .eq("updated_at", expected!)
      .eq("deleted", false)
      .select(columns)
      .maybeSingle();
    if (error) return tipError(error);
    return data ? json({ item: data }) : conflict();
  } catch (error) {
    return tipError(error);
  }
}

export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
