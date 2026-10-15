"use client";
import { useEffect, useState } from "react";
export default function Consent() {
  const [details, setDetails] = useState<{
    client: string;
    scope: string;
    redirect_uri: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function request(approve?: boolean) {
    setBusy(true);
    setError("");
    try {
      const id =
        new URLSearchParams(location.search).get("authorization_id") || "";
      const res = await fetch(
        `/api/frengle/mcp-consent?authorization_id=${encodeURIComponent(id)}`,
        approve === undefined
          ? { cache: "no-store" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ approve }),
            },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.redirect_url) location.assign(data.redirect_url);
      else setDetails(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "인증 요청 확인 실패");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void request();
    });
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <main
      className="editorial"
      style={{ maxWidth: 640, margin: "40px auto", padding: 24 }}
    >
      <h1>ChatGPT 결과 저장 연결</h1>
      <p>
        이 MCP 도구는 FRENGLE 키워드·사이트 추천 결과 저장·조회만 제공합니다.
        개인 Metricool 자료는 받지 않습니다.
      </p>
      <p>
        인증은 FRENGLE Supabase 사용자 권한을 사용합니다. 토큰에는 기존 사용자
        권한이 적용되며, 이후 Supabase에서 연결 승인을 철회할 수 있습니다.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {details ? (
        <>
          <p>요청 앱: {details.client}</p>
          <p>요청 범위: {details.scope}</p>
          <p>반환 주소: {details.redirect_uri}</p>
          <button disabled={busy} onClick={() => void request(true)}>
            연결 승인
          </button>{" "}
          <button disabled={busy} onClick={() => void request(false)}>
            거부
          </button>
        </>
      ) : null}
      <p>
        <a href="/frengle" target="_blank" rel="noopener noreferrer">
          FRENGLE에서 로그인
        </a>
      </p>
      <button disabled={busy} onClick={() => void request()}>
        로그인 후 다시 확인
      </button>
    </main>
  );
}
