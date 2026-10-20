"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, RefreshCw, Send } from "lucide-react";
import "@/app/yoga-reminder.css";

const pushEndpoint = "/api/personal-push?workspace=PERSONAL";
type PushConfig = {
  ready: boolean;
  scheduled: boolean;
  publicKey?: string;
  message?: string;
  subscriptions: { id: string; endpoint: string }[];
};
type BrowserState = {
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unavailable";
};

function browserState(): BrowserState {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return {
    ios,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    supported:
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    permission:
      "Notification" in window ? Notification.permission : "unavailable",
  };
}

async function pushRequest(
  path = pushEndpoint,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "로그인이 만료되었습니다. 다시 로그인해 주세요."
        : result.error || "운동 알림 요청을 처리하지 못했습니다.",
    );
  return result;
}

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++)
    bytes[index] = raw.charCodeAt(index);
  if (bytes.length !== 65 || bytes[0] !== 4)
    throw new Error(
      "알림 연결 키를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  return bytes;
}

function sameApplicationKey(
  subscription: PushSubscription,
  key: Uint8Array<ArrayBuffer>,
) {
  const previous = subscription.options.applicationServerKey;
  if (!previous) return false;
  const bytes = new Uint8Array(previous);
  return (
    bytes.length === key.length &&
    bytes.every((value, index) => value === key[index])
  );
}

async function readyRegistration() {
  await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  let timeout: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(
          () =>
            reject(
              new Error(
                "알림 기능 준비가 지연되고 있습니다. 새로고침해 주세요.",
              ),
            ),
          12000,
        );
      }),
    ]);
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Stop only this browser's endpoint before its authenticated session ends. */
export async function disconnectThisDevicePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await fetch(pushEndpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}

export function YogaReminderPanel({ enabled }: { enabled: boolean }) {
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  const [registered, setRegistered] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const lifecycle = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const generation = ++lifecycle.current;
    const controller = new AbortController();
    let requestSequence = 0;
    if (!enabled) return () => controller.abort();
    async function load(): Promise<boolean> {
      const request = ++requestSequence;
      try {
        const capability = browserState();
        const result = (await pushRequest(
          pushEndpoint,
          "GET",
          undefined,
          controller.signal,
        )) as PushConfig;
        let worker: ServiceWorkerRegistration | null = null;
        let subscription: PushSubscription | null = null;
        if (
          result.ready &&
          capability.supported &&
          (!capability.ios || capability.standalone)
        ) {
          worker = await readyRegistration();
          subscription = await worker.pushManager.getSubscription();
        }
        if (
          controller.signal.aborted ||
          generation !== lifecycle.current ||
          request !== requestSequence
        )
          return false;
        registration.current = worker;
        setWorkerReady(Boolean(worker));
        setConfig(result);
        setBrowser(capability);
        setLocalEndpoint(subscription?.endpoint || null);
        setRegistered(
          Boolean(
            subscription &&
              result.publicKey &&
              sameApplicationKey(
                subscription,
                applicationKey(result.publicKey),
              ) &&
              result.subscriptions?.some(
                (item) => item.endpoint === subscription!.endpoint,
              ),
          ),
        );
        setError("");
        return true;
      } catch (cause) {
        if (
          controller.signal.aborted ||
          generation !== lifecycle.current ||
          request !== requestSequence
        )
          return false;
        setConfig(null);
        setBrowser(browserState());
        setRegistered(false);
        setWorkerReady(false);
        setError(
          cause instanceof Error
            ? cause.message
            : "운동 알림 설정을 불러오지 못했습니다.",
        );
        return false;
      } finally {
        if (
          !controller.signal.aborted &&
          generation === lifecycle.current &&
          request === requestSequence
        )
          setLoading(false);
      }
    }
    const refresh = (event: Event) => {
      if (busy.current || document.querySelector("dialog[open]")) return;
      setLoading(true);
      const promise = load();
      (
        event as CustomEvent<{ waits?: Promise<boolean>[] }>
      ).detail?.waits?.push(promise);
      void promise;
    };
    window.addEventListener("myops:refresh", refresh);
    void load();
    return () => {
      controller.abort();
      lifecycle.current = generation + 1;
      window.removeEventListener("myops:refresh", refresh);
    };
  }, [enabled, revision]);

  const available =
    enabled &&
    config?.ready &&
    browser?.supported &&
    (!browser.ios || browser.standalone);
  const connected = registered && browser?.permission === "granted";
  async function connect() {
    if (
      busy.current ||
      !available ||
      !config?.publicKey ||
      !registration.current
    )
      return;
    busy.current = true;
    const generation = lifecycle.current;
    setAction("connect");
    setError("");
    setMessage("");
    try {
      // This runs before the first await, inside the user's button gesture.
      const permissionRequest =
        Notification.permission === "granted"
          ? Promise.resolve<NotificationPermission>("granted")
          : Notification.requestPermission();
      const permission = await permissionRequest;
      if (generation !== lifecycle.current) return;
      setBrowser(browserState());
      if (permission !== "granted")
        throw new Error(
          "알림 권한을 허용해야 이 기기에서 운동 알림을 받을 수 있습니다.",
        );
      const key = applicationKey(config.publicKey);
      let subscription =
        await registration.current.pushManager.getSubscription();
      const owned =
        subscription &&
        config.subscriptions.some(
          (item) => item.endpoint === subscription!.endpoint,
        );
      if (subscription && (!owned || !sameApplicationKey(subscription, key))) {
        if (owned)
          await pushRequest(pushEndpoint, "DELETE", {
            endpoint: subscription.endpoint,
          });
        if (!(await subscription.unsubscribe()))
          throw new Error(
            "기존 기기 연결을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
        subscription = null;
        if (generation !== lifecycle.current) return;
        setRegistered(false);
        setLocalEndpoint(null);
      }
      if (!subscription)
        subscription = await registration.current.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      if (generation !== lifecycle.current) {
        await subscription.unsubscribe().catch(() => false);
        return;
      }
      await pushRequest(pushEndpoint, "POST", {
        subscription: subscription.toJSON(),
      });
      if (generation !== lifecycle.current) return;
      setRegistered(true);
      setLocalEndpoint(subscription.endpoint);
      setConfig((previous) =>
        previous
          ? {
              ...previous,
              subscriptions: [
                ...previous.subscriptions.filter(
                  (item) => item.endpoint !== subscription!.endpoint,
                ),
                { id: "this-device", endpoint: subscription!.endpoint },
              ],
            }
          : previous,
      );
      setMessage(
        config.scheduled
          ? "이 기기의 요가 알림을 켰습니다. 요가 플래너에 날짜별 영상 URL을 등록해 주세요."
          : "이 기기의 알림 연결을 저장했습니다. 예약 발송은 서버 설정 완료 후 시작됩니다.",
      );
    } catch (cause) {
      if (generation === lifecycle.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "운동 알림을 연결하지 못했습니다.",
        );
    } finally {
      if (generation === lifecycle.current) setAction("");
      busy.current = false;
    }
  }

  async function deviceAction(kind: "disconnect" | "test") {
    if (busy.current || !localEndpoint) return;
    busy.current = true;
    const generation = lifecycle.current;
    setAction(kind);
    setError("");
    setMessage("");
    try {
      if (kind === "test") {
        await pushRequest(
          "/api/personal-push/test?workspace=PERSONAL",
          "POST",
          { endpoint: localEndpoint },
        );
        if (generation === lifecycle.current)
          setMessage(
            "테스트 알림 전송을 요청했습니다. 이 기기의 알림을 확인해 주세요.",
          );
      } else {
        await pushRequest(pushEndpoint, "DELETE", { endpoint: localEndpoint });
        const subscription =
          await registration.current?.pushManager.getSubscription();
        if (subscription?.endpoint === localEndpoint)
          await subscription.unsubscribe();
        if (generation !== lifecycle.current) return;
        setRegistered(false);
        setLocalEndpoint(null);
        setConfig((previous) =>
          previous
            ? {
                ...previous,
                subscriptions: previous.subscriptions.filter(
                  (item) => item.endpoint !== localEndpoint,
                ),
              }
            : previous,
        );
        setMessage("이 기기의 운동 알림을 껐습니다.");
      }
    } catch (cause) {
      if (generation === lifecycle.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "운동 알림 요청을 처리하지 못했습니다.",
        );
    } finally {
      if (generation === lifecycle.current) setAction("");
      busy.current = false;
    }
  }

  return (
    <section
      className="ops-card ops-yoga-reminder"
      aria-label="운동 알림"
      aria-busy={loading || Boolean(action)}
    >
      <div className="ops-section-head">
        <div>
          <h2>
            <Bell size={17} aria-hidden="true" />
            운동 알림
          </h2>
          <p>
            {config?.scheduled
              ? "영상이 등록된 운동 일정이 있는 날 · 밤 9시 · 한국시간"
              : "날짜별 운동 영상 · 기기 알림 설정"}
          </p>
        </div>
        <span className={`ops-push-status${connected ? " connected" : ""}`}>
          {connected ? "이 기기 연결됨" : "연결 전"}
        </span>
      </div>
      <div className="ops-yoga-reminder-body">
        <p>
          {config?.scheduled
            ? "위 요가 플래너에 날짜별 영상을 저장하면, 해당 날짜 밤 9시에 이 보드에서 링크를 확인할 수 있는 알림을 받습니다."
            : "요가 플래너에 날짜별 영상 URL을 저장하고, 이 기기를 알림 수신 기기로 등록할 수 있습니다."}
        </p>
        {!enabled ? (
          <p>PERSONAL에 로그인한 뒤 이 기기의 알림을 설정해 주세요.</p>
        ) : (
          <>
            {loading ? (
              <p role="status">이 기기의 알림 설정을 확인하는 중입니다.</p>
            ) : null}
            {!loading && config && !config.ready ? (
              <p className="ops-push-info">
                {config.message ||
                  "운동 알림 운영 설정이 준비 중입니다. 준비 후 이 기기를 연결할 수 있습니다."}
              </p>
            ) : null}
            {!loading && config?.ready && !config.scheduled ? (
              <p className="ops-push-info">
                예약 발송 서버 설정 대기 — 기기 연결과 테스트는 가능합니다.
              </p>
            ) : null}
            {browser?.ios && !browser.standalone ? (
              <div className="ops-push-info">
                <strong>iPhone에서는 홈 화면 앱으로 열어 주세요.</strong>
                <ol>
                  <li>Safari에서 이 대시보드를 엽니다.</li>
                  <li>공유 → 홈 화면에 추가를 선택합니다.</li>
                  <li>
                    추가한 앱에서 PERSONAL → Yoga Planner → 운동 알림을 켭니다.
                  </li>
                </ol>
              </div>
            ) : !loading && browser && !browser.supported ? (
              <p className="ops-push-info">
                이 브라우저에서는 웹 푸시를 지원하지 않습니다. iPhone은
                Safari에서 홈 화면에 추가한 앱으로 열어 주세요.
              </p>
            ) : null}
            {browser?.permission === "denied" ? (
              <p className="ops-push-info">
                이 기기의 알림 권한이 차단되어 있습니다. 기기 설정에서 이 앱의
                알림을 허용한 뒤 새로고침해 주세요.
              </p>
            ) : null}
            {error ? (
              <p className="ops-alert bad" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="ops-alert" role="status">
                {message}
              </p>
            ) : null}
            <div className="ops-push-actions">
              {!connected ? (
                <button
                  type="button"
                  className="ops-primary"
                  disabled={
                    loading ||
                    Boolean(action) ||
                    !available ||
                    browser?.permission === "denied" ||
                    !config?.publicKey ||
                    !workerReady
                  }
                  onClick={() => void connect()}
                >
                  <Bell size={15} />
                  {action === "connect" ? "연결 중…" : "이 기기에서 알림 켜기"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading || Boolean(action)}
                  onClick={() => void deviceAction("disconnect")}
                >
                  <BellOff size={15} />
                  {action === "disconnect" ? "해제 중…" : "이 기기 알림 끄기"}
                </button>
              )}
              {connected ? (
                <button
                  type="button"
                  disabled={loading || Boolean(action)}
                  onClick={() => void deviceAction("test")}
                >
                  <Send size={14} />
                  {action === "test" ? "요청 중…" : "테스트 알림"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={loading || Boolean(action)}
                onClick={() => {
                  setLoading(true);
                  setMessage("");
                  setRevision((value) => value + 1);
                }}
              >
                <RefreshCw size={14} />
                설정 새로고침
              </button>
            </div>
            <p className="ops-push-footnote">
              이 화면은 현재 기기의 연결만 관리합니다. 로그인 계정을 바꾸려면 이
              기기에서 알림을 다시 켜 주세요.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
