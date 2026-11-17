import { uuid } from "./ops.ts";
import { validYogaDay } from "./yoga-week.ts";
import { json } from "@/lib/http";
import {
  WorkspaceAccessError,
  workspaceSession,
} from "@/lib/workspaces/server";

export const photoTable = "ops_makeup_looks";
export const picksTable = "ops_makeup_week_picks";
const fullLimit = 1024 * 1024;
const thumbnailLimit = 64 * 1024;
export class MakeupInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const makeupSession = () =>
  workspaceSession(new URLSearchParams({ workspace: "PERSONAL" }));

export function allowedQuery(params: URLSearchParams, allowed: string[]) {
  if (params.has("workspace") && params.get("workspace") !== "PERSONAL")
    throw new MakeupInputError("개인 보드에서만 사용할 수 있어요.", 403);
  for (const key of params.keys()) {
    if (
      (key !== "workspace" && !allowed.includes(key)) ||
      params.getAll(key).length !== 1
    )
      throw new MakeupInputError("조회 조건을 확인해 주세요.");
  }
}

export function lookId(value: unknown) {
  if (!uuid(value)) throw new MakeupInputError("사진을 다시 선택해 주세요.");
  return value.toLowerCase();
}

export function lookCategory(value: unknown) {
  if (value === null || value === "female" || value === "male") return value;
  throw new MakeupInputError("메이크업 분류를 확인해 주세요.");
}

export function monday(value: unknown) {
  if (
    typeof value !== "string" ||
    !validYogaDay(value) ||
    new Date(value + "T00:00:00Z").getUTCDay() !== 1
  )
    throw new MakeupInputError("선택한 주를 확인해 주세요.");
  return value;
}

// Detect actual raster bytes instead of trusting a user-supplied filename or MIME type.
export function photoType(data: Buffer) {
  if (
    data.length >= 12 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return "image/jpeg";
  if (
    data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
    data.toString("ascii", 12, 16) === "IHDR"
  )
    return "image/png";
  if (
    data.length >= 20 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(data.toString("ascii", 12, 16))
  )
    return "image/webp";
  return null;
}

async function readBounded(req: Request, limit: number) {
  const tooLarge = () =>
    new MakeupInputError("사진이나 입력 내용의 크기를 줄여 주세요.", 413);
  if (Number(req.headers.get("content-length")) > limit) throw tooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw new MakeupInputError("입력 내용을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function readMutation(req: Request, allowed: string[]) {
  let value: unknown;
  try {
    value = JSON.parse((await readBounded(req, 4096)).toString("utf8"));
  } catch (error) {
    if (error instanceof MakeupInputError) throw error;
    throw new MakeupInputError("입력 내용을 확인해 주세요.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new MakeupInputError("입력 내용을 확인해 주세요.");
  return value as Record<string, unknown>;
}

async function photoValue(file: FormDataEntryValue | null, limit: number) {
  if (!file || typeof file === "string" || !file.size)
    throw new MakeupInputError("사진 파일을 선택해 주세요.");
  if (file.size > limit)
    throw new MakeupInputError("사진 크기를 줄여 주세요.", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!photoType(bytes))
    throw new MakeupInputError("JPG, PNG, WebP 사진을 선택해 주세요.", 415);
  return "\\x" + bytes.toString("hex");
}

export async function readUpload(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType))
    throw new MakeupInputError("사진 파일 형식을 확인해 주세요.", 415);
  const bytes = await readBounded(req, fullLimit + thumbnailLimit + 16384);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new MakeupInputError("사진 파일을 다시 선택해 주세요.");
  }
  for (const key of form.keys()) {
    if (
      !["id", "title", "image", "thumbnail", "week", "category"].includes(
        key,
      ) ||
      form.getAll(key).length !== 1
    )
      throw new MakeupInputError("사진 입력 내용을 확인해 주세요.");
  }
  const title = form.get("title") ?? "";
  if (
    typeof title !== "string" ||
    title.includes("\0") ||
    Array.from(title.trim()).length > 100
  )
    throw new MakeupInputError("사진 이름은 100자까지 입력할 수 있어요.");
  return {
    p_id: lookId(form.get("id")),
    p_title: title.trim(),
    p_category: lookCategory(form.get("category")),
    p_week: form.has("week") ? monday(form.get("week")) : null,
    p_image: await photoValue(form.get("image"), fullLimit),
    p_thumbnail: form.has("thumbnail")
      ? await photoValue(form.get("thumbnail"), thumbnailLimit)
      : null,
  };
}

export function makeupError(error: unknown) {
  if (
    error instanceof WorkspaceAccessError ||
    error instanceof MakeupInputError
  )
    return json({ error: error.message }, error.status);
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  if (code === "23505")
    return json(
      { error: "같은 번호로 다른 사진이 저장되어 있어요. 다시 추가해 주세요." },
      409,
    );
  if (code === "23503") return json({ error: "사진을 찾을 수 없어요." }, 404);
  if (code === "42501") return json({ error: "사진에 접근할 수 없어요." }, 403);
  return json(
    { error: "메이크업 보드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." },
    503,
  );
}
