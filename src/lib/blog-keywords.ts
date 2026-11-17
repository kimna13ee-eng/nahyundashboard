export const blogKeywordLimit = 500;
export const blogKeywordColumns =
  "id,keyword,board,sub_keyword,summary,is_draft,used,deleted_at,created_at,updated_at";

export const blogBoards = ["블러셔 진열대", "썼어유", "보통의날"] as const;
export type BlogBoard = (typeof blogBoards)[number];
type BlogPostDetails = {
  keyword: string;
  board: BlogBoard | null;
  sub_keyword: string;
  summary: string;
  is_draft: boolean;
};
export type BlogKeyword = BlogPostDetails & {
  id: string;
  used: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type BlogKeywordIdentity = { id: string; expectedUpdatedAt: string };
export type BlogKeywordMutation =
  | { action: "create"; id: string; details: BlogPostDetails }
  | ({
      action: "update";
      changes: Partial<BlogPostDetails & { used: boolean }>;
    } & BlogKeywordIdentity)
  | { action: "delete" | "restore"; items: BlogKeywordIdentity[] };

export class BlogKeywordInputError extends Error {}
function fail(message: string): never {
  throw new BlogKeywordInputError(message);
}
function object(raw: unknown): Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  )
    fail("키워드 입력을 확인해 주세요.");
  return raw as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.includes(key),
    )
  )
    fail("허용된 키워드 입력 항목만 보내 주세요.");
}
function id(raw: unknown) {
  if (
    typeof raw !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
  )
    fail("키워드 항목을 확인해 주세요.");
  return raw.toLowerCase();
}
function token(raw: unknown) {
  if (
    typeof raw !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(
      raw,
    ) ||
    raw.startsWith("0000") ||
    !Number.isFinite(Date.parse(raw)) ||
    new Date(`${raw.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
      raw.slice(0, 10)
  )
    fail("키워드 저장 시각을 확인한 뒤 다시 시도해 주세요.");
  return raw;
}
function identity(raw: unknown): BlogKeywordIdentity {
  const value = object(raw);
  keys(value, ["id", "expectedUpdatedAt"]);
  return {
    id: id(value.id),
    expectedUpdatedAt: token(value.expectedUpdatedAt),
  };
}
function postText(raw: unknown, label: string, max: number, required = false) {
  if (typeof raw !== "string") fail(`${label} 입력을 확인해 주세요.`);
  const text = raw.trim();
  if (
    (required && !text) ||
    text.includes("\0") ||
    Array.from(text).length > max
  )
    fail(
      `${label} 항목을 ${required ? "1~" : "최대 "}${max}자로 입력해 주세요.`,
    );
  return text;
}
function boardValue(raw: unknown) {
  if (raw === null) return null;
  const board = blogBoards.find((name) => name === raw);
  if (!board) fail("블로그 게시판을 확인해 주세요.");
  return board;
}
function checkValue(raw: unknown) {
  if (typeof raw !== "boolean") fail("체크 상태를 확인해 주세요.");
  return raw;
}
const detailKeys = ["keyword", "board", "sub_keyword", "summary", "is_draft"];

export function parseBlogKeywordMutation(
  raw: unknown,
  method: string,
): BlogKeywordMutation {
  const value = object(raw);
  if (
    method === "DELETE" ||
    (method === "POST" && value.action === "restore")
  ) {
    keys(value, method === "DELETE" ? ["items"] : ["action", "items"]);
    if (
      !Array.isArray(value.items) ||
      value.items.length < 1 ||
      value.items.length > blogKeywordLimit
    )
      fail(`키워드는 한 번에 1~${blogKeywordLimit}개까지 선택해 주세요.`);
    const items = value.items.map(identity);
    if (new Set(items.map((item) => item.id)).size !== items.length)
      fail("같은 키워드를 중복해서 선택할 수 없어요.");
    return { action: method === "DELETE" ? "delete" : "restore", items };
  }
  if (method === "POST") {
    keys(value, ["id", ...detailKeys]);
    return {
      action: "create",
      id: id(value.id),
      details: {
        keyword: postText(value.keyword, "메인 키워드", 200, true),
        board: boardValue("board" in value ? value.board : null),
        sub_keyword: postText(
          "sub_keyword" in value ? value.sub_keyword : "",
          "서브 키워드",
          200,
        ),
        summary: postText(
          "summary" in value ? value.summary : "",
          "글 내용",
          1000,
        ),
        is_draft: checkValue("is_draft" in value ? value.is_draft : false),
      },
    };
  }
  if (method === "PATCH") {
    keys(value, ["id", "used", "expectedUpdatedAt", ...detailKeys]);
    const changes: Partial<BlogPostDetails & { used: boolean }> = {};
    if ("keyword" in value)
      changes.keyword = postText(value.keyword, "메인 키워드", 200, true);
    if ("board" in value) changes.board = boardValue(value.board);
    if ("sub_keyword" in value)
      changes.sub_keyword = postText(value.sub_keyword, "서브 키워드", 200);
    if ("summary" in value)
      changes.summary = postText(value.summary, "글 내용", 1000);
    if ("is_draft" in value) changes.is_draft = checkValue(value.is_draft);
    if ("used" in value) changes.used = checkValue(value.used);
    if (Object.keys(changes).length === 0) fail("수정할 항목을 선택해 주세요.");
    return {
      action: "update",
      id: id(value.id),
      changes,
      expectedUpdatedAt: token(value.expectedUpdatedAt),
    };
  }
  fail("지원하지 않는 키워드 요청입니다.");
}
export function blogKeywordQueryAllowed(params: URLSearchParams) {
  return (
    [...params].every(
      ([key, value]) => key === "workspace" && value === "PERSONAL",
    ) && params.getAll("workspace").length <= 1
  );
}
export function publicBlogKeyword(row: BlogKeyword): BlogKeyword {
  return {
    id: row.id,
    keyword: row.keyword,
    board: row.board,
    sub_keyword: row.sub_keyword,
    summary: row.summary,
    is_draft: row.is_draft,
    used: row.used,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
