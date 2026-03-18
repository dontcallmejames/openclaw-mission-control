import { NextResponse } from "next/server";
import { getGatewayUrl } from "@/lib/paths";
import { resolveTransport } from "@/lib/openclaw";

export const dynamic = "force-dynamic";

/**
 * GET /api/status — lightweight system status check.
 *
 * Returns gateway reachability and transport mode without slow RPC calls.
 * Designed for health-check consumers, uptime monitors, and the frontend
 * status indicator.
 */
export async function GET() {
  const start = Date.now();
  const url = await getGatewayUrl();
  const port = parseInt(new URL(url).port, 10) || 18789;
  const configuredRaw = (process.env.OPENCLAW_TRANSPORT || "auto").toLowerCase();
  const transportConfigured =
    configuredRaw === "cli" || configuredRaw === "http" ? configuredRaw : "auto";
  let transport = transportConfigured;
  let transportReason: "forced_cli" | "forced_http" | "auto_http" | "auto_fallback_cli" =
    transportConfigured === "cli"
      ? "forced_cli"
      : transportConfigured === "http"
        ? "forced_http"
        : "auto_http";

  let gateway: "online" | "offline" | "degraded" = "offline";

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    gateway = res.ok ? "online" : "degraded";
  } catch {
    // unreachable
  }

  try {
    transport = await resolveTransport();
  } catch {
    // leave configured transport as fallback
  }

  if (transportConfigured === "auto") {
    transportReason = transport === "cli" ? "auto_fallback_cli" : "auto_http";
  }

  return NextResponse.json({
    ok: gateway === "online",
    gateway,
    transport,
    transportConfigured,
    transportReason,
    port,
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - start,
  });
}
