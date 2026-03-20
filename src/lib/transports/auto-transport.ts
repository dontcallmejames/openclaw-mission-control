/**
 * Auto transport — tries HTTP first, falls back to CLI.
 *
 * Probes /tools/invoke (not just "/") so non-200 root responses don't
 * incorrectly demote transport to CLI on VPS/reverse-proxy setups.
 */

import type { OpenClawClient, TransportMode } from "../openclaw-client";
import type { RunCliResult } from "../openclaw-cli";
import { CliTransport } from "./cli-transport";
import { HttpTransport } from "./http-transport";

function errorToMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export class AutoTransport implements OpenClawClient {
  private cli = new CliTransport();
  private http = new HttpTransport();
  private preferHttp = false;
  private lastProbe = 0;
  private probing: Promise<void> | null = null;
  // Re-probe quickly after a fallback (3s) so HTTP is rediscovered fast.
  // Use a longer interval (60s) when the transport is stable.
  private readonly probeIntervalStableMs = 60_000;
  private readonly probeIntervalRecoveryMs = 3_000;
  private readonly probeTimeoutMs = 2_000;
  private inRecovery = false;

  getTransport(): TransportMode {
    return "auto";
  }

  async resolveTransport(): Promise<TransportMode> {
    await this.probe();
    return this.preferHttp ? "http" : "cli";
  }

  private shouldUseHttpForStatus(status: number): boolean {
    // 404 means "/tools/invoke" is missing; 401/403 means auth rejects requests.
    // In both cases, command invocation over HTTP won't work.
    if (status === 404 || status === 401 || status === 403) return false;
    // Any non-5xx implies the Gateway is reachable and potentially usable.
    return status < 500;
  }

  private markHttpFailed(reason: string): void {
    const wasHttp = this.preferHttp;
    this.preferHttp = false;
    this.inRecovery = true;
    // Force a quick re-probe on the next request.
    this.lastProbe = Date.now() - this.probeIntervalRecoveryMs;
    if (wasHttp) {
      console.warn(`[AutoTransport] HTTP failed, falling back to CLI: ${reason}`);
    }
  }

  /** Probe Gateway availability and cache the result. */
  private async probe(): Promise<void> {
    const interval = this.inRecovery
      ? this.probeIntervalRecoveryMs
      : this.probeIntervalStableMs;
    if (Date.now() - this.lastProbe < interval) return;
    // Deduplicate concurrent probes.
    if (this.probing) return this.probing;
    this.probing = (async () => {
      const hadHttp = this.preferHttp;
      try {
        // Probe the actual invoke endpoint instead of GET /.
        const res = await this.http.gatewayFetch("/tools/invoke", {
          method: "HEAD",
          signal: AbortSignal.timeout(this.probeTimeoutMs),
        });
        const allowHttp = this.shouldUseHttpForStatus(res.status);
        this.preferHttp = allowHttp;
        this.inRecovery = !allowHttp;

        if (allowHttp && !hadHttp) {
          console.info("[AutoTransport] HTTP transport restored.");
        }
        if (!allowHttp && hadHttp) {
          console.warn(
            `[AutoTransport] Probe switched to CLI fallback (HTTP ${res.status}).`
          );
        }
      } catch (err) {
        this.markHttpFailed(errorToMessage(err));
      } finally {
        this.lastProbe = Date.now();
        this.probing = null;
      }
    })();
    return this.probing;
  }

  private async pick(): Promise<OpenClawClient> {
    await this.probe();
    return this.preferHttp ? this.http : this.cli;
  }

  /** Execute with automatic fallback on HTTP failure. */
  private async withFallback<T>(
    fn: (client: OpenClawClient) => Promise<T>,
  ): Promise<T> {
    const primary = await this.pick();
    try {
      return await fn(primary);
    } catch (err) {
      if (primary === this.http) {
        this.markHttpFailed(errorToMessage(err));
        return fn(this.cli);
      }
      throw err;
    }
  }

  // ── OpenClawClient interface ──────────────────────

  runJson<T>(args: string[], timeout?: number): Promise<T> {
    return this.withFallback((c) => c.runJson<T>(args, timeout));
  }

  run(args: string[], timeout?: number, stdin?: string): Promise<string> {
    return this.withFallback((c) => c.run(args, timeout, stdin));
  }

  async runCapture(args: string[], timeout?: number): Promise<RunCliResult> {
    await this.probe();
    if (this.preferHttp) {
      const result = await this.http.runCapture(args, timeout);
      if (result.code !== 0 && result.stderr?.includes("/tools/invoke")) {
        this.markHttpFailed(result.stderr || `openclaw ${args.join(" ")} failed over HTTP`);
        return this.cli.runCapture(args, timeout);
      }
      return result;
    }
    return this.cli.runCapture(args, timeout);
  }

  gatewayRpc<T>(
    method: string,
    params?: Record<string, unknown>,
    timeout?: number,
  ): Promise<T> {
    return this.withFallback((c) => c.gatewayRpc<T>(method, params, timeout));
  }

  readFile(path: string): Promise<string> {
    return this.withFallback((c) => c.readFile(path));
  }

  writeFile(path: string, content: string): Promise<void> {
    return this.withFallback((c) => c.writeFile(path, content));
  }

  readdir(path: string): Promise<string[]> {
    return this.withFallback((c) => c.readdir(path));
  }

  async gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
    return this.withFallback((c) => c.gatewayFetch(path, init));
  }
}
