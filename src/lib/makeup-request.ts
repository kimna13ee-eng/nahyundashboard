export class BoardError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const timeout = AbortSignal.timeout(45000);
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    signal: options?.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new BoardError(
      detail.error || "메이크업 보드에 연결하지 못했어요.",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export function failure(error: unknown) {
  return error instanceof BoardError
    ? error.message
    : "응답을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
}
