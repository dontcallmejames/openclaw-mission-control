/**
 * Onboarding API
 *
 * GET  /api/onboard
 *   Returns setup status including hasModel, hasChannel, hasApiKey, etc.
 *
 * POST /api/onboard
 *   { action: "validate-key", provider, token }
 *   { action: "list-models",  provider, token }
 *   { action: "save-and-restart", openrouterKey, model, telegramToken }
 */

import { NextRequest, NextResponse } from "next/server";
import { access, readFile } from "fs/promises";
import { join } from "path";
import { runCli, runCliCaptureBoth } from "@/lib/openclaw";
import { getOpenClawBin, getOpenClawHome, getGatewayUrl } from "@/lib/paths";
import {
  PROVIDER_ENV_KEYS,
  validateProviderToken,
  fetchModelsFromProvider,
} from "@/lib/provider-auth";

export const dynamic = "force-dynamic";

/* ── Helpers ───────────────────────────────────────── */

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try {
    const raw = await readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function checkGatewayHealth(
  gatewayUrl: string,
): Promise<{ running: boolean; version?: string }> {
  try {
    const res = await fetch(gatewayUrl, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { running: false };
    const data = await res.json().catch(() => ({}));
    return {
      running: true,
      version: typeof data.version === "string" ? data.version : undefined,
    };
  } catch {
    return { running: false };
  }
}

function getDotPath(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let cur: unknown = obj;
  for (const key of parts) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/* ── GET /api/onboard ──────────────────────────────── */

export async function GET() {
  try {
    const home = getOpenClawHome();
    const configPath = join(home, "openclaw.json");
    const authPath = join(home, "agents", "main", "agent", "auth-profiles.json");

    const [binPath, configExists, authExists, gatewayUrl] = await Promise.all([
      getOpenClawBin().catch(() => null),
      fileExists(configPath),
      fileExists(authPath),
      getGatewayUrl(),
    ]);

    const installed = binPath !== null;

    let version: string | null = null;
    if (installed) {
      try {
        const out = await runCli(["--version"], 5000);
        version = out.trim().split("\n").pop()?.trim() || null;
      } catch {
        // binary found but --version failed
      }
    }

    const gateway = await checkGatewayHealth(gatewayUrl);

    let hasModel = false;
    let hasApiKey = false;
    let hasLocalProvider = false;
    let hasChannel = false;

    if (configExists) {
      try {
        const config = await readJsonSafe<Record<string, unknown>>(configPath);
        if (config) {
          // Check model
          const model = getDotPath(config, "agents.defaults.model");
          hasModel = Boolean(
            typeof model === "string" ? model : (model as Record<string, unknown>)?.primary,
          );

          // Check API keys in config.env
          const env = getDotPath(config, "env");
          if (env && typeof env === "object") {
            hasApiKey = Object.values(PROVIDER_ENV_KEYS).some((key) => {
              const value = (env as Record<string, unknown>)[key];
              return typeof value === "string" && value.trim().length > 0;
            });
          }

          // Check auth.profiles
          const authProfiles = getDotPath(config, "auth.profiles");
          if (!hasApiKey && authProfiles && typeof authProfiles === "object") {
            hasApiKey = Object.keys(authProfiles as Record<string, unknown>).length > 0;
          }

          // Check local/custom providers
          const providers = getDotPath(config, "models.providers");
          if (providers && typeof providers === "object") {
            hasLocalProvider = Object.keys(providers as Record<string, unknown>).some((k) => {
              const p = (providers as Record<string, unknown>)[k];
              if (!p || typeof p !== "object") return false;
              const baseUrl = (p as Record<string, unknown>).baseUrl;
              return typeof baseUrl === "string" && baseUrl.trim().length > 0;
            });
          }

          // Check channels — any key under channels with a non-empty object counts
          const channels = getDotPath(config, "channels");
          if (channels && typeof channels === "object") {
            hasChannel = Object.keys(channels as Record<string, unknown>).some((k) => {
              const ch = (channels as Record<string, unknown>)[k];
              return ch && typeof ch === "object" && Object.keys(ch as Record<string, unknown>).length > 0;
            });
          }
        }
      } catch {
        // config unreadable
      }
    }

    // Tier 3: per-agent auth-profiles.json
    if (!hasApiKey && authExists) {
      try {
        const auth = await readJsonSafe<{ profiles?: Record<string, unknown> }>(authPath);
        hasApiKey = Boolean(auth?.profiles && Object.keys(auth.profiles).length > 0);
      } catch {
        // auth unreadable
      }
    }

    // Tier 4: process.env
    if (!hasApiKey) {
      hasApiKey = Object.values(PROVIDER_ENV_KEYS).some(
        (key) => typeof process.env[key] === "string" && process.env[key]!.trim().length > 0,
      );
    }

    // Detect Ollama
    let hasOllama = false;
    try {
      const ollamaRes = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(2000),
      });
      hasOllama = ollamaRes.ok;
    } catch {
      // not running
    }

    const hasCredentials = hasApiKey || hasLocalProvider || hasOllama;

    return NextResponse.json({
      installed,
      configured: hasCredentials && hasModel,
      configExists,
      hasModel,
      hasApiKey,
      hasLocalProvider,
      hasOllama,
      hasChannel,
      gatewayRunning: gateway.running,
      version: version || gateway.version || null,
      gatewayUrl,
      home,
    });
  } catch (err) {
    console.error("Onboard GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* ── POST /api/onboard ─────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      /* ── validate-key ──────────────────────────────── */
      case "validate-key": {
        const provider = String(body.provider || "").trim();
        const token = String(body.token || "").trim();
        if (!provider || !token) {
          return NextResponse.json(
            { ok: false, error: "Provider and token are required" },
            { status: 400 },
          );
        }
        const result = await validateProviderToken(provider, token);
        return NextResponse.json(result);
      }

      /* ── list-models ───────────────────────────────── */
      case "list-models": {
        const provider = String(body.provider || "").trim();
        const token = String(body.token || "").trim();
        if (!provider || !token) {
          return NextResponse.json(
            { ok: false, error: "Provider and token are required" },
            { status: 400 },
          );
        }
        try {
          const models = await fetchModelsFromProvider(provider, token);
          return NextResponse.json({ ok: true, models });
        } catch (err) {
          return NextResponse.json({
            ok: false,
            error: `Failed to fetch models: ${err}`,
            models: [],
          });
        }
      }

      /* ── save-and-restart ──────────────────────────── */
      case "save-and-restart": {
        const provider = String(body.provider || "").trim();
        const apiKeyValue = String(body.apiKey || "").trim();
        const model = String(body.model || "").trim();
        const telegramToken = String(body.telegramToken || "").trim();
        const discordToken = String(body.discordToken || "").trim();

        if (!provider || !apiKeyValue || !model) {
          return NextResponse.json(
            { ok: false, error: "Provider, API key, and model are required" },
            { status: 400 },
          );
        }

        // Map provider id to openclaw onboard --auth-choice and --*-api-key flag
        const PROVIDER_ONBOARD_MAP: Record<string, { authChoice: string; keyFlag: string }> = {
          openrouter: { authChoice: "openrouter-api-key", keyFlag: "--openrouter-api-key" },
          openai: { authChoice: "openai-api-key", keyFlag: "--openai-api-key" },
          anthropic: { authChoice: "apiKey", keyFlag: "--anthropic-api-key" },
        };

        const providerConfig = PROVIDER_ONBOARD_MAP[provider];
        if (!providerConfig) {
          return NextResponse.json(
            { ok: false, error: `Unsupported provider: ${provider}` },
            { status: 400 },
          );
        }

        // Step 1: Run `openclaw onboard --non-interactive` to bootstrap
        // config, workspace, gateway auth, daemon install & start.
        const onboardArgs = [
          "onboard",
          "--non-interactive",
          "--accept-risk",
          "--mode", "local",
          "--auth-choice", providerConfig.authChoice,
          providerConfig.keyFlag, apiKeyValue,
          "--secret-input-mode", "plaintext",
          "--install-daemon",
          "--daemon-runtime", "node",
          "--skip-channels",
          "--skip-skills",
          "--skip-search",
          "--skip-ui",
        ];

        try {
          const onboardResult = await runCliCaptureBoth(onboardArgs, 60000);
          if (onboardResult.code !== 0) {
            const detail = String(onboardResult.stderr || onboardResult.stdout || "").trim();
            return NextResponse.json(
              { ok: false, error: `Onboard failed: ${detail || `exit code ${onboardResult.code}`}` },
              { status: 500 },
            );
          }
        } catch (err) {
          return NextResponse.json(
            { ok: false, error: `Onboard failed: ${err instanceof Error ? err.message : err}` },
            { status: 500 },
          );
        }

        // Step 2: Set the chosen model (onboard doesn't set this)
        try {
          const modelResult = await runCliCaptureBoth(
            ["config", "set", "agents.defaults.model.primary", model],
            10000,
          );
          if (modelResult.code !== 0) {
            const detail = String(modelResult.stderr || modelResult.stdout || "").trim();
            return NextResponse.json(
              { ok: false, error: `Model config failed: ${detail || `exit code ${modelResult.code}`}` },
              { status: 500 },
            );
          }
        } catch (err) {
          return NextResponse.json(
            { ok: false, error: `Model config failed: ${err instanceof Error ? err.message : err}` },
            { status: 500 },
          );
        }

        // Step 3: Configure channels + restart gateway
        const channelCmds: string[][] = [];

        if (telegramToken) {
          channelCmds.push(
            ["config", "set", "channels.telegram.enabled", "true"],
            ["config", "set", "channels.telegram.botToken", telegramToken],
            ["config", "set", "channels.telegram.dmPolicy", "pairing"],
            ["config", "set", "channels.telegram.groupPolicy", "disabled"],
          );
        }

        if (discordToken) {
          channelCmds.push(
            ["config", "set", "channels.discord.enabled", "true"],
            ["config", "set", "channels.discord.token", discordToken],
            ["config", "set", "channels.discord.dmPolicy", "pairing"],
            ["config", "set", "channels.discord.groupPolicy", "disabled"],
          );
        }

        if (channelCmds.length > 0) {
          for (const cmd of channelCmds) {
            try {
              const result = await runCliCaptureBoth(cmd, 10000);
              if (result.code !== 0) {
                const detail = String(result.stderr || result.stdout || "").trim();
                return NextResponse.json(
                  { ok: false, error: `Channel config failed (${cmd[2]}): ${detail || `exit code ${result.code}`}` },
                  { status: 500 },
                );
              }
            } catch (err) {
              return NextResponse.json(
                { ok: false, error: `Channel config failed: ${err instanceof Error ? err.message : err}` },
                { status: 500 },
              );
            }
          }

          // Restart gateway to pick up channel config
          try {
            await runCli(["gateway", "restart"], 25000);
          } catch {
            // restart may fail transiently — gateway may self-recover
          }
        }

        // Step 4: Wait for gateway to be healthy
        const gatewayUrl = await getGatewayUrl();
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const health = await checkGatewayHealth(gatewayUrl);
          if (health.running) break;
        }

        return NextResponse.json({ ok: true });
      }

      /* ── get-bot-info ─────────────────────────────── */
      case "get-bot-info": {
        const botToken = String(body.token || "").trim();
        const channel = String(body.channel || "").trim();
        if (!botToken || !channel) {
          return NextResponse.json({ ok: false });
        }
        try {
          if (channel === "telegram") {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const data = await res.json();
              const bot = data.result;
              return NextResponse.json({
                ok: true,
                username: bot?.username ? `@${bot.username}` : null,
                name: bot?.first_name || null,
              });
            }
          }
          if (channel === "discord") {
            const res = await fetch("https://discord.com/api/v10/users/@me", {
              headers: { Authorization: `Bot ${botToken}` },
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const bot = await res.json();
              return NextResponse.json({
                ok: true,
                username: bot?.username || null,
                name: bot?.global_name || bot?.username || null,
              });
            }
          }
        } catch { /* silent */ }
        return NextResponse.json({ ok: false });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("Onboard POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
