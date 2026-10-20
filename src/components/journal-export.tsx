"use client";
import { useState } from "react";
import { journalReport } from "@/lib/journal-report";
import type { OpsData } from "@/lib/ops";
import { usePathname } from "next/navigation";
import { workspaceFromPathname } from "@/lib/workspace-api";

export function JournalExport({
  data,
  day,
  now,
  enabled,
  excludeTests,
  onExcludeTests,
}: {
  data: OpsData;
  day: string;
  now: number;
  enabled: boolean;
  excludeTests: boolean;
  onExcludeTests: (value: boolean) => void;
}) {
  const workspace = workspaceFromPathname(usePathname());
  const scopeLabel = workspace === "FRENGLE" ? "회사" : "개인";
  const [preview, setPreview] = useState<{
    day: string;
    text: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  return (
    <section
      className="ops-journal-export"
      aria-labelledby="journal-export-heading"
    >
      <div className="ops-journal-export-heading">
        <h3 id="journal-export-heading">{workspace} 일지 요약·내보내기</h3>
        <p>
          선택 날짜의 실제 작업 구간으로 미리보기를 생성합니다. 외부 전송 없이
          Markdown 파일로 저장합니다.
        </p>
      </div>
      <label className="ops-journal-option">
        <input
          type="checkbox"
          checked={excludeTests}
          onChange={(e) => {
            onExcludeTests(e.target.checked);
            setPreview(null);
            setNotice("");
          }}
        />
        <span>명시적인 검증용 제목의 일지 제외</span>
      </label>
      <div className="ops-journal-export-actions">
        <button
          type="button"
          disabled={!enabled}
          onClick={() => {
            setPreview({
              day,
              text: journalReport(data, day, now, excludeTests, workspace).text,
            });
            setNotice("");
          }}
        >
          {scopeLabel} 일지 미리보기 생성
        </button>
        <button
          type="button"
          disabled={!enabled || !preview || preview.day !== day}
          onClick={() => {
            if (!preview) return;
            const url = URL.createObjectURL(
              new Blob([preview.text], { type: "text/markdown;charset=utf-8" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `MY-OPS-${workspace}-${preview.day}.md`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setNotice("미리보기 내용의 파일 다운로드를 요청했습니다.");
          }}
        >
          {scopeLabel} 일지 Markdown 저장
        </button>
      </div>
      {!enabled ? <p>{workspace} 로그인과 DB 조회 완료가 필요합니다.</p> : null}
      {preview && preview.day === day ? (
        <label className="ops-journal-preview">
          <span>내보낼 내용 (생성 시점의 기록)</span>
          <textarea
            aria-label={`${scopeLabel} 일지 내보내기 미리보기`}
            readOnly
            value={preview.text}
            rows={12}
          />
        </label>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
