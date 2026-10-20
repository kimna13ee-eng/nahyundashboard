export type ApiWorkspace = "PERSONAL" | "FRENGLE";

/** Workspace belongs to this page's URL, never a shared cookie or stored tab choice. */
export function workspaceFromPathname(
  pathname: string | null | undefined,
): ApiWorkspace {
  return /^\/frengle(?:\/|$)/.test((pathname || "").split(/[?#]/, 1)[0])
    ? "FRENGLE"
    : "PERSONAL";
}

export function currentApiWorkspace(): ApiWorkspace {
  return workspaceFromPathname(
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
}

/** Resolve only application API paths. With an explicit workspace this is a
 * pure mapping; the default reads the calling tab's pathname at request time. */
export function workspaceApiPath(
  path: string,
  workspace: ApiWorkspace = currentApiWorkspace(),
): string {
  if (workspace !== "PERSONAL" && workspace !== "FRENGLE")
    throw new Error("워크스페이스를 확인해 주세요.");
  if (!path.startsWith("/api/") || path.startsWith("//"))
    throw new Error("내부 API 주소를 확인해 주세요.");
  const url = new URL(path, "https://workspace-api.invalid");
  if (
    url.origin !== "https://workspace-api.invalid" ||
    !url.pathname.startsWith("/api/")
  )
    throw new Error("내부 API 주소를 확인해 주세요.");
  const personalOnly =
    url.pathname === "/api/leave" ||
    url.pathname.startsWith("/api/leave/") ||
    url.pathname.startsWith("/api/personal-");
  if (personalOnly && workspace === "FRENGLE")
    throw new Error("이 기능은 PERSONAL에서만 사용할 수 있습니다.");
  const shared = ["/api/ops", "/api/workflow", "/api/phase2"].includes(
    url.pathname,
  );
  const identity = {
    "/api/auth": ["/api/auth", "/api/frengle/auth"],
    "/api/frengle/auth": ["/api/auth", "/api/frengle/auth"],
    "/api/session": ["/api/session", "/api/frengle/session"],
    "/api/frengle/session": ["/api/session", "/api/frengle/session"],
    "/api/automation-results": [
      "/api/automation-results",
      "/api/frengle/results",
    ],
    "/api/frengle/results": ["/api/automation-results", "/api/frengle/results"],
  } as const;
  if (Object.hasOwn(identity, url.pathname)) {
    url.pathname =
      identity[url.pathname as keyof typeof identity][
        workspace === "FRENGLE" ? 1 : 0
      ];
  }
  if (shared || personalOnly || url.searchParams.has("workspace"))
    url.searchParams.set("workspace", workspace);
  return url.pathname + url.search + url.hash;
}
