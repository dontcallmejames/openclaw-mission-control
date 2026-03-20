/**
 * HTTP transport — talks to the Gateway's HTTP API endpoints.
 *
 * Used for hosted deployments where the platform communicates with
 * the Gateway over HTTP, and for self-hosted users who prefer HTTP over CLI subprocesses.
 *
 * Primary endpoint: POST /tools/invoke (always enabled on the Gateway)
 * Auth: Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
 */

import { getGatewayUrl } from "../paths";
import { GatewayRpcClient } from "../gateway-rpc";
import { parseJsonFromCliOutput, type RunCliResult } from "../openclaw-cli";
import type { OpenClawClient, TransportMode } from "../openclaw-client";

export class HttpTransport implements OpenClawClient {
  private token: string;
  private rpcToken: string;
  private gatewayUrlCache: string | null = null;
  private rpcClient: GatewayRpcClient | null = null;

  constructor(gatewayUrl?: string, token?: string) {
    this.token = token || process.env.OPENCLAW_GATEWAY_TOKEN || "";
    this.gatewayUrlCache = gatewayUrl || null;
    // Allow a separate token for WS RPC (needs operator scopes); falls back to main token.
    this.rpcToken = process.env.OPENCLAW_GATEWAY_RPC_TOKEN || this.token;
  }

  getTransport(): TransportMode {
    return "http";
  }

  async resolveTransport(): Promise<TransportMode> {
    return "http";
  }

  private async getGwUrl(): Promise<string> {
    if (this.gatewayUrlCache) return this.gatewayUrlCache;
    this.gatewayUrlCache = await getGatewayUrl();
    return this.gatewayUrlCache;
  }

  private authHeaders(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  /**
   * Invoke a Gateway tool via POST /tools/invoke.
   * Returns the parsed JSON response body.
   */
  private async invoke<T>(
    tool: string,
    args: Record<string, unknown> = {},
    timeout = 15000,
    action?: "json",
  ): Promise<T> {
    const gwUrl = await this.getGwUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`${gwUrl}/tools/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          tool,
          args,
          ...(action ? { action } : {}),
        }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; result?: T; error?: { message?: string } }
        | T
        | null;
      if (!res.ok) {
        const text =
          (body && typeof body === "object" && "error" in body && body.error?.message) ||
          JSON.stringify(body) ||
          "";
        throw new Error(
          `Gateway /tools/invoke ${tool} returned ${res.status}: ${text}`,
        );
      }
      if (body && typeof body === "object" && "ok" in body) {
        if (body.ok === false) {
          throw new Error(body.error?.message || `Tool ${tool} failed`);
        }
        return (body.result as T) ?? ({} as T);
      }
      return (body || {}) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Execute a shell command inside the Gateway via the exec tool.
   * Returns the raw stdout.
   */
  private resultToText(
    result:
      | { output?: string; stdout?: string; result?: string; content?: unknown; details?: unknown; text?: string }
      | string,
  ): string {
    if (typeof result === "string") return result;
    if (typeof result.output === "string") return result.output;
    if (typeof result.stdout === "string") return result.stdout;
    if (typeof result.result === "string") return result.result;
    if (typeof result.text === "string") return result.text;
    if (Array.isArray(result.content)) {
      const text = result.content
        .map((item) =>
          item && typeof item === "object" && "text" in item ? String(item.text || "") : "",
        )
        .filter(Boolean)
        .join("\n");
      if (text) return text;
    }
    if (typeof result.details === "string") return result.details;
    return JSON.stringify(result.details || result);
  }

  private async execCommand(
    command: string,
    timeout = 15000,
  ): Promise<string> {
    const result = await this.invoke<
      { output?: string; stdout?: string; result?: string; content?: unknown; details?: unknown } | string
    >("exec", { command }, timeout, "json");
    return this.resultToText(result);
  }

  // ── OpenClawClient interface ──────────────────────

  /**
   * Try to run a command locally via child_process (works when MC and the
   * gateway run on the same machine). Falls back to the gateway exec tool
   * when the local binary is not found.
   */
  private async execLocal(
    command: string,
    timeout = 15000,
    stdin?: string,
  ): Promise<string> {
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);

      const parts = command.split(/\s+/);
      const bin = parts[0];
      const cmdArgs = parts.slice(1);

      const result = await execFileAsync(bin, cmdArgs, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        env: process.env,
        ...(stdin ? { input: stdin } : {}),
      });
      // Strip diagnostic lines that some openclaw plugins print to stdout
      // (e.g. "[plugins] openclaw-mem0: registered ...") — these break JSON parsing.
      const stdout = result.stdout
        .split("\n")
        .filter((line) => !line.startsWith("[plugins]") && !line.startsWith("[warn]") && !line.startsWith("[info]"))
        .join("\n");
      return stdout;
    } catch (localErr: unknown) {
      // If local exec fails because the binary doesn't exist, try gateway exec
      const code = (localErr as { code?: string }).code;
      if (code === "ENOENT" || code === "EACCES") {
        return this.execCommand(command, timeout);
      }
      // For other errors (non-zero exit), surface the stderr
      const err = localErr as { stdout?: string; stderr?: string; message?: string };
      throw new Error(err.stderr || err.message || String(localErr));
    }
  }

  async runJson<T>(args: string[], timeout = 15000): Promise<T> {
    const command = `openclaw ${args.join(" ")} --json`;
    const raw = await this.execLocal(command, timeout);
    return parseJsonFromCliOutput<T>(raw, command);
  }

  async run(
    args: string[],
    timeout = 15000,
    stdin?: string,
  ): Promise<string> {
    const command = `openclaw ${args.join(" ")}`;
    return this.execLocal(command, timeout, stdin);
  }

  async runCapture(args: string[], timeout = 15000): Promise<RunCliResult> {
    const command = `openclaw ${args.join(" ")}`;
    try {
      const stdout = await this.execLocal(command, timeout);
      return { stdout, stderr: "", code: 0 };
    } catch (err) {
      return {
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        code: 1,
      };
    }
  }

  async gatewayRpc<T>(
    method: string,
    params?: Record<string, unknown>,
    timeout = 15000,
  ): Promise<T> {
    // config.get / config.schema require operator.read/admin scope on WS,
    // but gateway.auth.token doesn't grant those. Serve locally instead.
    if (method === "config.get") {
      return this.configGetViaCli<T>(timeout);
    }
    if (method === "config.schema") {
      // Return empty schema — config page degrades gracefully without it.
      return { schema: {}, uiHints: {} } as unknown as T;
    }

    if (!this.rpcClient) {
      this.rpcClient = new GatewayRpcClient(this.gatewayUrlCache || undefined, this.rpcToken);
    }
    return this.rpcClient.request<T>(method, params || {}, timeout);
  }

  private async configGetViaCli<T>(timeout = 15000): Promise<T> {
    // Replicate the config.get RPC response shape: { parsed, resolved, hash }
    // by reading openclaw.json directly from disk (same machine).
    const { readFile } = await import("fs/promises");
    const { createHash } = await import("crypto");
    const { join } = await import("path");
    const home = process.env.OPENCLAW_STATE_DIR || join(process.env.HOME || "/root", ".openclaw");
    const configPath = join(home, "openclaw.json");

    let parsed: Record<string, unknown> = {};
    let raw = "";
    try {
      raw = await readFile(configPath, "utf-8");
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // empty config — return empty shape
    }

    // Compute a hash so config.patch baseHash checks work
    const hash = raw ? createHash("sha256").update(raw).digest("hex").slice(0, 16) : "";

    // resolved = parsed (no env substitution here, same as the degraded fallback)
    return { parsed, resolved: parsed, hash } as unknown as T;
  }

  async readFile(path: string): Promise<string> {
    const result = await this.invoke<
      { content?: string; output?: string; details?: unknown; text?: string } | string
    >("read", { path });
    if (typeof result === "string") return result;
    if (typeof result.content === "string") return result.content;
    return this.resultToText(result);
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.invoke("write", { path, content });
  }

  async readdir(path: string): Promise<string[]> {
    const raw = await this.execCommand(`ls -1 "${path}"`);
    return raw.split("\n").filter(Boolean);
  }

  async gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
    const gwUrl = await this.getGwUrl();
    return fetch(`${gwUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...this.authHeaders(),
      },
    });
  }
}
