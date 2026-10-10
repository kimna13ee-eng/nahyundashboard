"use client";
import { useState } from "react";
import { journalReport } from "@/lib/journal-report";
import type { OpsData } from "@/lib/ops";

export function JournalExport({ data, day, now, enabled, excludeTests, onExcludeTests }: { data: OpsData; day: string; now: number; enabled: boolean; excludeTests: boolean; onExcludeTests: (value: boolean) => void }) {
  const [preview, setPreview] = useState<{ day: string; text: string } | null>(null);
  const [notice, setNotice] = useState("");
  return <div className="ops-content-analytics">
    <h3>PERSONAL 일지 요약·내보내기</h3>
    <p>선택 날짜의 실제 작업 구간으로 미리보기를 생성합니다. 외부 전송 없이 Markdown 파일로 저장합니다.</p>
    <label><input type="checkbox" checked={excludeTests} onChange={e => { onExcludeTests(e.target.checked); setPreview(null); setNotice(""); }} /> 명시적인 검증용 제목의 일지 제외</label>
    <div className="ops-toolbar"><button disabled={!enabled} onClick={() => { setPreview({ day, text: journalReport(data, day, now, excludeTests).text }); setNotice(""); }}>개인 일지 미리보기 생성</button>
      <button disabled={!enabled || !preview || preview.day !== day} onClick={() => {
        if (!preview) return;
        const url = URL.createObjectURL(new Blob([preview.text], { type: "text/markdown;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = `MY-OPS-PERSONAL-${preview.day}.md`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice("미리보기 내용의 파일 다운로드를 요청했습니다.");
      }}>개인 일지 Markdown 저장</button></div>
    {!enabled ? <p>PERSONAL 로그인과 DB 조회 완료가 필요합니다. 회사 보고서는 미연결입니다.</p> : null}
    {preview && preview.day === day ? <label>내보낼 내용 (생성 시점의 기록)<textarea aria-label="개인 일지 내보내기 미리보기" readOnly value={preview.text} rows={12} style={{ width: "100%" }} /></label> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </div>;
}
