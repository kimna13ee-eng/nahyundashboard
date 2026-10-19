"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { OpsRow } from "@/lib/ops";
import Link from "next/link";
import { AutomationReceiptList } from "@/components/automation-results-panel";
import { automationReceiptRows } from "@/lib/automation-receipts";
export default function Frengle() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [results, setResults] = useState<OpsRow[]>([]);
  const [resultsReady, setResultsReady] = useState(false);
  const [status, setStatus] = useState("로그인 상태 확인 중");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await fetch("/api/frengle/session", {
        cache: "no-store",
      });
      const session = await response.json();
      if (!response.ok) throw new Error(session.error);
      setUser(session.user?.email || null);
      if (!session.configured) {
        setResults([]);
        setResultsReady(false);
        setStatus("FRENGLE 서버 연결 설정이 필요합니다.");
        return;
      }
      if (!session.user) {
        setResults([]);
        setResultsReady(false);
        setStatus("회사 저장소 전용 계정으로 로그인하세요.");
        return;
      }
      const received = await fetch("/api/frengle/results", {
        cache: "no-store",
      });
      const data = await received.json();
      if (!received.ok) throw new Error(data.error);
      setResults(data.results || []);
      setResultsReady(data.ready === true);
      setStatus("FRENGLE 결과 저장소 연결됨");
    } catch (e) {
      setResults([]);
      setResultsReady(false);
      setStatus(e instanceof Error ? e.message : "연결 확인 실패");
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/frengle/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPassword("");
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/frengle/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!r.ok) throw new Error("로그아웃 실패");
      await load();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className="editorial"
      style={{ maxWidth: 960, margin: "32px auto", padding: 24 }}
    >
      <Link href="/">MY OPS 대시보드</Link>
      <h1>FRENGLE 자동화</h1>
      <p>출근 업무 체크 · 키워드 검색 · 사이트 읽고 키워드 추천</p>
      <p>
        회사 결과는 FRENGLE 저장소에만 저장합니다. PERSONAL 로그인과 별도로
        연결합니다.
      </p>
      <p role="status">{status}</p>
      {user ? (
        <p>
          {user}{" "}
          <button disabled={busy} onClick={() => void logout()}>
            회사 계정 로그아웃
          </button>
        </p>
      ) : (
        <form
          onSubmit={login}
          style={{ display: "grid", gap: 12, maxWidth: 420 }}
        >
          <label>
            회사 저장소 이메일
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button disabled={busy}>FRENGLE 로그인</button>
        </form>
      )}
      {user ? (
        <section className="ops-card ops-automation-results">
          <div className="ops-section-head">
            <h2>ChatGPT 자동화 결과</h2>
            <button onClick={() => void load()}>결과 새로고침</button>
          </div>
          {!resultsReady ? (
            <p className="ops-automation-state">
              회사 자동화 결과를 확인하지 못했습니다. 결과 새로고침으로 다시
              확인해 주세요.
            </p>
          ) : !automationReceiptRows(results, "FRENGLE").length ? (
            <p className="ops-automation-state">
              아직 수신한 회사 자동화 결과가 없습니다.
            </p>
          ) : (
            <AutomationReceiptList results={results} workspace="FRENGLE" />
          )}
          <p className="ops-automation-help">
            저장된 회사 결과만 표시합니다. 결과 제목이나 ChatGPT 대화 열기를
            누르면 원본 대화로 이동합니다.
          </p>
        </section>
      ) : null}
    </main>
  );
}
