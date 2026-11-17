import type { BlogKeyword } from "./blog-keywords";

type ExportRow = Omit<BlogKeyword, "id" | "deleted_at">;

const dateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  dateStyle: "short",
  timeStyle: "medium",
});

function csvCell(value: string) {
  // Spreadsheet apps can interpret a quoted field as a formula on open.
  const safe = /^\s*[=+@\-＝＋＠－]|^[\t\r\n]/u.test(value)
    ? "'" + value
    : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function blogKeywordCsv(items: ExportRow[]) {
  const lines = [
    [
      "게시판",
      "메인 키워드",
      "서브 키워드",
      "글 내용 요약",
      "임시저장",
      "썼어요",
      "등록 일시 (한국시간)",
      "수정 일시 (한국시간)",
    ]
      .map(csvCell)
      .join(","),
  ];
  for (const item of items) {
    lines.push(
      [
        item.board ?? "",
        item.keyword,
        item.sub_keyword,
        item.summary,
        item.is_draft ? "예" : "아니오",
        item.used ? "예" : "아니오",
        dateTime.format(new Date(item.created_at)),
        dateTime.format(new Date(item.updated_at)),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
