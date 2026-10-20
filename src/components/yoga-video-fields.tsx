"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { workspaceApiPath } from "@/lib/workspace-api";
import { parseScheduleVideoUrl } from "@/lib/schedule-category";
import "./yoga-video-fields.css";

export function YogaVideoFields({
  initialTitle,
  initialUrl,
  initialMinutes,
  durationReady,
  disabled,
}: {
  initialTitle: string;
  initialUrl: string;
  initialMinutes: unknown;
  durationReady: boolean;
  disabled: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [minutes, setMinutes] = useState(
    typeof initialMinutes === "number" &&
      Number.isInteger(initialMinutes) &&
      initialMinutes >= 1 &&
      initialMinutes <= 1440
      ? String(initialMinutes)
      : "",
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const titleRevision = useRef(0);

  useEffect(() => {
    const revision = generation;
    return () => {
      ++revision.current;
      active.current?.abort();
    };
  }, []);

  async function loadTitle() {
    if (disabled || loading) return;
    let videoUrl: string;
    try {
      videoUrl = parseScheduleVideoUrl(url);
      if (!videoUrl) throw new Error("먼저 영상 URL을 입력해 주세요.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "영상 URL을 확인해 주세요.",
      );
      return;
    }
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const request = ++generation.current;
    const editing = titleRevision.current;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        workspaceApiPath("/api/personal-yoga-video", "PERSONAL"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ url: videoUrl }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        },
      );
      const result: unknown = await response.json();
      if (request !== generation.current) return;
      const body =
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : {};
      if (!response.ok)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "제목을 불러오지 못했어요. 직접 입력해 주세요.",
        );
      if (
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.length > 120
      )
        throw new Error("제목을 확인하지 못했어요. 직접 입력해 주세요.");
      if (editing !== titleRevision.current) {
        setMessage("직접 수정 중인 제목을 유지했어요.");
        return;
      }
      setTitle(body.title);
      setMessage(
        body.titleTruncated
          ? "긴 영상 제목은 120자까지 가져왔어요. 원하는 대로 수정할 수 있어요."
          : "영상 제목을 가져왔어요. 원하는 대로 수정할 수 있어요.",
      );
    } catch (cause) {
      if (request !== generation.current || controller.signal.aborted) return;
      setError(
        cause instanceof Error &&
          !["AbortError", "TimeoutError"].includes(cause.name)
          ? cause.message
          : "응답이 늦어지고 있어요. 다시 시도하거나 제목을 직접 입력해 주세요.",
      );
    } finally {
      if (request === generation.current) {
        active.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div className="ops-yoga-video-fields">
      <label>
        요가 영상 URL
        <input
          required
          name="video_url"
          type="url"
          inputMode="url"
          pattern="https://.+"
          maxLength={2000}
          disabled={disabled}
          value={url}
          onChange={(event) => {
            ++generation.current;
            active.current?.abort();
            active.current = null;
            setLoading(false);
            setMessage("");
            setError("");
            setUrl(event.target.value);
          }}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </label>
      <div className="ops-yoga-video-fetch">
        <button
          type="button"
          onClick={() => void loadTitle()}
          disabled={disabled || loading || !url.trim()}
        >
          {loading ? (
            <RefreshCw size={14} aria-hidden="true" />
          ) : (
            <Link2 size={14} aria-hidden="true" />
          )}
          {loading ? "제목 불러오는 중…" : "영상 제목 불러오기"}
        </button>
        <span>YouTube 제목을 가져오거나 직접 입력할 수 있어요.</span>
      </div>
      {error ? (
        <p className="ops-yoga-video-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="ops-yoga-video-message" role="status">
          {message}
        </p>
      ) : null}
      <label>
        영상 제목 · 운동 내용
        <input
          required
          name="title"
          type="text"
          maxLength={120}
          disabled={disabled}
          value={title}
          onChange={(event) => {
            ++titleRevision.current;
            setTitle(event.target.value);
          }}
          placeholder="예: 전신을 풀어주는 저녁 요가"
        />
      </label>
      <label>
        운동 시간 (분)
        <input
          name="duration_minutes"
          type="number"
          min={1}
          max={1440}
          step={1}
          inputMode="numeric"
          disabled={disabled || !durationReady}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          placeholder="예: 20"
        />
      </label>
      <p className="ops-schedule-form-hint">
        {durationReady
          ? "영상에서 확인한 운동 시간을 입력해 주세요. 비워 두면 ‘시간 미입력’으로 표시해요."
          : "운동 시간 저장 설정을 준비 중이에요. 영상 제목과 링크는 먼저 저장할 수 있어요."}
      </p>
    </div>
  );
}
