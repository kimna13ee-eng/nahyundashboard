"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { OpsDialog } from "./ops-dialog";
export function AppRecoveryControls({
  refresh,
  loading,
}: {
  refresh: () => Promise<unknown>;
  loading: boolean;
}) {
  const [online, setOnline] = useState(true);
  const [mode, setMode] = useState("브라우저");
  const [message, setMessage] = useState("");
  const [restart, setRestart] = useState(false);
  const inflight = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (message !== "최신 서버 데이터를 조회했습니다.") return;
    const timeout = window.setTimeout(() => setMessage(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [message]);
  useEffect(() => {
    let mounted = true;
    const sync = () => setOnline(navigator.onLine);
    queueMicrotask(() => {
      if (!mounted) return;
      sync();
      setMode(
        window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone
          ? "홈 화면 앱"
          : "브라우저",
      );
    });
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      mounted = false;
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <div className="ops-app-recovery">
      <div className="ops-recovery-actions">
        <button
          type="button"
          aria-label={
            refreshing || loading
              ? "데이터 새로고침 · 조회 중"
              : "데이터 새로고침"
          }
          title="데이터 새로고침"
          className="ops-refresh"
          aria-busy={refreshing || loading}
          disabled={loading || refreshing || !online}
          onClick={async () => {
            if (document.querySelector("dialog[open]")) {
              setMessage(
                "열린 입력창을 먼저 저장하거나 닫아 주세요. 입력은 유지됩니다.",
              );
              return;
            }
            if (inflight.current) return;
            inflight.current = true;
            setRefreshing(true);
            setMessage("서버에서 다시 조회하는 중…");
            try {
              await refresh();
              setMessage("최신 서버 데이터를 조회했습니다.");
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : "조회 실패. 연결 후 새로고침을 다시 눌러 주세요.",
              );
            } finally {
              inflight.current = false;
              setRefreshing(false);
            }
          }}
        >
          <RefreshCw
            size={19}
            className={refreshing || loading ? "ops-spinning" : ""}
            aria-hidden="true"
          />
          <span>데이터 새로고침</span>
        </button>
        <details>
          <summary>앱 사용 · 복구</summary>
          <div>
            <p>{mode} · 웹 후보 v2.0.0 · 온라인 연결 필요</p>
            <p>
              데이터 새로고침은 현재 화면을 유지합니다. 앱 다시 열기는 페이지
              전체를 재시작합니다.
            </p>
            <p>
              iPhone: Safari 공유 → 홈 화면에 추가. Android/PC: 브라우저 메뉴의
              설치 또는 홈 화면에 추가. 기기별 설치 여부는 별도 확인이
              필요합니다.
            </p>
            <button
              type="button"
              onClick={() => {
                if (document.querySelector("dialog[open]")) {
                  setMessage(
                    "입력창이 열려 있어 재시작을 막았습니다. 먼저 저장하거나 닫아 주세요.",
                  );
                  return;
                }
                setRestart(true);
              }}
            >
              앱 다시 열기
            </button>
          </div>
        </details>
      </div>
      {restart ? (
        <OpsDialog
          title="앱을 다시 열까요?"
          busy={loading}
          close={() => setRestart(false)}
        >
          <p>
            전체 앱을 다시 엽니다. 서버의 진행 중인 타이머는 종료되지 않습니다.
          </p>
          <div className="ops-form-actions">
            <button type="button" data-dialog-close>
              취소
            </button>
            <button
              type="button"
              className="ops-primary"
              onClick={() => {
                if (
                  document.querySelectorAll("dialog[open]").length === 1 &&
                  !loading
                )
                  window.location.reload();
              }}
            >
              재시작 확인
            </button>
          </div>
        </OpsDialog>
      ) : null}
      <div
        className="ops-recovery-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {!online ? (
          <p>
            네트워크 연결이 끊겼습니다. 입력을 유지하고 연결 후 다시 조회해
            주세요. 자동 저장·재전송은 하지 않습니다.
          </p>
        ) : null}
        {message ? <p>{message}</p> : null}
      </div>
    </div>
  );
}
