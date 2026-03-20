import { gatewayCall } from "@/lib/openclaw";

// ── Auto-enable OpenResponses endpoint for streaming chat ──
// Uses a cooldown to avoid restart loops: once attempted (success or fail),
// waits RETRY_COOLDOWN_MS before trying again. Never resets on failure.
let _responsesEndpointEnsured = false;
let _responsesLastAttempt = 0;
const RESPONSES_RETRY_COOLDOWN_MS = 5 * 60_000; // 5 minutes

/** Resolves when the setup attempt completes (success or fail). */
let _responsesSetupPromise: Promise<void> | null = null;

function ensureResponsesEndpoint(): void {
  if (_responsesEndpointEnsured) return;
  if (Date.now() - _responsesLastAttempt < RESPONSES_RETRY_COOLDOWN_MS) return;
  _responsesLastAttempt = Date.now();

  // Fire-and-forget — don't block the health check response
  _responsesSetupPromise = (async () => {
    try {
      const cfg = await gatewayCall<{
        hash?: string;
        parsed?: Record<string, unknown>;
        config?: Record<string, unknown>;
      }>(
        "config.get",
        undefined,
        8000,
      );
      // Check both parsed (standard) and config (legacy) shapes
      const root = cfg?.parsed ?? cfg?.config ?? {};
      const gw = (root as Record<string, unknown>)?.gateway as Record<string, unknown> | undefined;
      const http = gw?.http as Record<string, unknown> | undefined;
      const endpoints = http?.endpoints as Record<string, unknown> | undefined;
      const responses = endpoints?.responses as Record<string, unknown> | undefined;
      if (responses?.enabled === true) {
        _responsesEndpointEnsured = true; // Already enabled, no patch needed
        return;
      }

      await gatewayCall(
        "config.patch",
        {
          raw: JSON.stringify({
            gateway: { http: { endpoints: { responses: { enabled: true } } } },
          }),
          baseHash: String(cfg?.hash || ""),
          restartDelayMs: 3000,
        },
        10000,
      );
      _responsesEndpointEnsured = true;
    } catch {
      // Non-fatal — streaming falls back to non-streaming.
      // Do NOT reset _responsesEndpointEnsured; cooldown timer handles retry.
    } finally {
      _responsesSetupPromise = null;
    }
  })();
}

/**
 * Wait for the in-flight responses endpoint setup to finish.
 * Called by the chat route to avoid racing with the fire-and-forget setup.
 */
export async function waitForResponsesEndpoint(): Promise<void> {
  if (_responsesSetupPromise) {
    await _responsesSetupPromise;
  }
}

/**
 * Trigger the responses endpoint setup if it hasn't been attempted yet.
 * Called by the chat route when a user sends a message before the gateway
 * health poll has fired (which normally triggers ensureResponsesEndpoint).
 */
export function triggerResponsesEndpointSetup(): void {
  ensureResponsesEndpoint();
}
