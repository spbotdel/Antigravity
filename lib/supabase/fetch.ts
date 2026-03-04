const DEFAULT_SUPABASE_TIMEOUT_MS = 8000;

function parseTimeout(rawValue: string | undefined) {
  if (!rawValue) {
    return DEFAULT_SUPABASE_TIMEOUT_MS;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SUPABASE_TIMEOUT_MS;
  }

  return parsed;
}

export function getSupabaseRequestTimeoutMs() {
  return parseTimeout(process.env.SUPABASE_REQUEST_TIMEOUT_MS || process.env.NEXT_PUBLIC_SUPABASE_REQUEST_TIMEOUT_MS);
}

function createUnavailableResponse(status: number) {
  return new Response(
    JSON.stringify({
      error: "fetch failed",
      message: "fetch failed",
      code: "SUPABASE_UNAVAILABLE"
    }),
    {
      status,
      headers: {
        "content-type": "application/json"
      }
    }
  );
}

export function createSupabaseFetch(timeoutMs = getSupabaseRequestTimeoutMs()): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const externalSignal = init?.signal;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    const abortFromExternal = () => {
      controller.abort(externalSignal?.reason);
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener("abort", abortFromExternal, { once: true });
      }
    }

    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (timedOut) {
        return createUnavailableResponse(504);
      }

      if (externalSignal?.aborted) {
        throw error;
      }

      return createUnavailableResponse(503);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (externalSignal) {
        externalSignal.removeEventListener("abort", abortFromExternal);
      }
    }
  };
}
