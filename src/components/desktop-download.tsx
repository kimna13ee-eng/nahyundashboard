"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { desktopArtifact } from "@/lib/desktop-artifact";

export function DesktopDownload({
  signedIn,
  compact = false,
}: {
  signedIn: boolean;
  compact?: boolean;
}) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Windows 다운로드 준비 중입니다.");
  const [attempt, setAttempt] = useState(0);
  const inflight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/desktop-download", {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!controller.signal.aborted) {
          setReady(response.ok && data.ready === true);
          setMessage(
            data.ready
              ? "설치 파일 확인 완료"
              : data.error || "Windows 다운로드 준비 중입니다.",
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setReady(false);
          setMessage("다운로드 상태를 확인하지 못했습니다.");
        }
      });
    return () => controller.abort();
  }, [signedIn, attempt]);
  async function download() {
    if (inflight.current || !ready) return;
    inflight.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/desktop-download", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "다운로드 실패");
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = desktopArtifact.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(
        "다운로드를 요청했습니다. 브라우저의 다운로드 목록을 확인해 주세요.",
      );
    } catch (error) {
      setReady(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "다시 다운로드를 요청해 주세요.",
      );
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  const button = (
    <button
      type="button"
      className={compact ? "ops-icon" : "ops-primary"}
      aria-label="Windows 앱 다운로드"
      title={message}
      disabled={!signedIn || !ready || busy}
      aria-busy={busy}
      onClick={download}
    >
      <Download size={16} />
      {compact ? null : busy ? "다운로드 중…" : "Windows 앱 다운로드"}
    </button>
  );
  if (compact)
    return <span className="ops-desktop-download-shortcut">{button}</span>;
  return (
    <section className="ops-card ops-download-section">
      <div className="ops-section-head">
        <div>
          <h2>Windows 데스크톱 앱</h2>
          <p>독립 창과 Windows 시스템 트레이에서 MY OPS를 사용하세요.</p>
        </div>
      </div>
      <div className="ops-detail">
        <p>Windows 10/11 x64 · v2.1.0 · 2.03 MiB</p>
        <p>
          웹에서는 설치 여부를 감지하지 않습니다. 모바일에서는 Windows PC로
          접속해 주세요.
        </p>
        {button}
        <button
          type="button"
          disabled={busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          다운로드 준비 다시 확인
        </button>
        <p role="status">{message}</p>
        <details>
          <summary>설치 방법과 무결성 확인</summary>
          <p>
            파일을 다운로드하고 SHA256을 확인한 뒤, 조직 정책상 허용된 PC에서
            직접 설치하세요. 설치 파일은 서명되지 않았습니다. 보안 경고와 조직
            정책을 우회하지 마세요.
          </p>
          <code className="ops-artifact-hash">{desktopArtifact.sha256}</code>
          <p>
            설치 후 PERSONAL 계정으로 로그인하면 같은 서버 데이터를 조회합니다.
            설치 앱에서 다운로드가 차단되면 트레이의 ‘브라우저에서 열기’를
            사용하세요.
          </p>
        </details>
      </div>
    </section>
  );
}
