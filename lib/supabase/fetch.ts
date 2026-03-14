const DEFAULT_SUPABASE_TIMEOUT_MS = 8000;
const BROWSER_SUPABASE_MAX_ATTEMPTS = 2;

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
    const externalSignal = init?.signal;

    for (let attempt = 1; attempt <= BROWSER_SUPABASE_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
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
        if (externalSignal?.aborted) {
          throw error;
        }

        const unavailableStatus = timedOut ? 504 : 503;
        if (attempt === BROWSER_SUPABASE_MAX_ATTEMPTS) {
          return createUnavailableResponse(unavailableStatus);
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (externalSignal) {
          externalSignal.removeEventListener("abort", abortFromExternal);
        }
      }
    }

    return createUnavailableResponse(503);
  };
}
