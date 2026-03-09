"use client";

import { useCallback, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  DollarSign,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionBody, SectionHeader, SectionLayout } from "@/components/section-layout";
import { useSmartPoll } from "@/hooks/use-smart-poll";
import { getFriendlyModelName, getProviderDisplayName } from "@/lib/model-metadata";
import type {
  ProviderBillingFreshness,
  ProviderBillingProviderSnapshot,
  UsageApiResponse,
  UsageWindow,
} from "@/lib/usage-types";

/* ── Formatters ─────────────────────────────────── */

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function formatUsd(usd: number | null): string {
  if (usd === null) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatAge(ms: number | null): string {
  if (ms === null) return "unknown";
  const ageMs = Date.now() - ms;
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  return `${Math.floor(ageMs / 86_400_000)}d ago`;
}

/* ── Window config ──────────────────────────────── */

const WINDOWS: { id: UsageWindow; label: string }[] = [
  { id: "last1h", label: "Last Hour" },
  { id: "last24h", label: "Last 24h" },
  { id: "last7d", label: "Last 7 Days" },
  { id: "allTime", label: "All Time" },
];

/* ── Skeleton ───────────────────────────────────── */

function SkeletonBox({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-xl bg-[#15191d]", className)} />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBox key={i} className="h-28 border border-[#23282e]" />
        ))}
      </div>
      {/* Table skeletons */}
      <SkeletonBox className="h-64 border border-[#23282e]" />
      <SkeletonBox className="h-48 border border-[#23282e]" />
    </div>
  );
}

/* ── Freshness dot ──────────────────────────────── */

function FreshnessDot({ freshness }: { freshness: ProviderBillingFreshness }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {freshness === "fresh" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          freshness === "fresh"
            ? "bg-emerald-400"
            : freshness === "stale"
              ? "bg-amber-400"
              : "bg-[#3d4752]",
        )}
      />
    </span>
  );
}

/* ── Section sub-heading ────────────────────────── */

function SubHeading({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#7a8591]">{children}</h2>
      {count !== undefined && (
        <span className="rounded-full border border-[#23282e] bg-[#20252a] px-2 py-0.5 text-[11px] font-medium text-[#7a8591]">
          {count}
        </span>
      )}
    </div>
  );
}

/* ── Progress bar ───────────────────────────────── */

function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-[#23282e]", className)}>
      <div
        className="h-full rounded-full bg-[#34d399] transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── Hero stat card ─────────────────────────────── */

type StatCardProps = {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
};

function StatCard({ label, value, sub, icon, accent = "text-[#34d399]" }: StatCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#23282e] bg-[#15191d] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#7a8591]">{label}</span>
        <span className={cn("shrink-0", accent)}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-[#f5f7fa]">{value}</p>
        {sub && <p className="mt-1 text-[11px] text-[#7a8591]">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Window pill switcher ───────────────────────── */

function WindowSelector({
  active,
  onChange,
}: {
  active: UsageWindow;
  onChange: (w: UsageWindow) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[#23282e] bg-[#15191d] p-1">
      {WINDOWS.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => onChange(w.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            active === w.id
              ? "bg-[#20252a] text-[#f5f7fa] shadow-sm"
              : "text-[#7a8591] hover:text-[#a8b0ba]",
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

/* ── Empty state ────────────────────────────────── */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <BarChart3 className="h-8 w-8 text-[#3d4752]" />
      <p className="text-sm text-[#7a8591]">{message}</p>
    </div>
  );
}

/* ── Token Usage by Model table ─────────────────── */

type ModelRow = UsageApiResponse["liveTelemetry"]["byModel"][number];

function ModelUsageTable({ rows }: { rows: ModelRow[] }) {
  const sorted = [...rows].sort((a, b) => b.totalTokens - a.totalTokens);
  const maxTokens = sorted[0]?.totalTokens ?? 1;

  if (sorted.length === 0) return <EmptyState message="No model usage recorded yet." />;

  return (
    <div className="overflow-hidden rounded-xl border border-[#23282e]">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 border-b border-[#23282e] bg-[#15191d] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#7a8591]">
        <span>Model</span>
        <span className="hidden text-right sm:block">Sessions</span>
        <span className="text-right">Input</span>
        <span className="text-right">Output</span>
        <span className="text-right">Est. Cost</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#23282e]">
        {sorted.map((row) => {
          const friendly = getFriendlyModelName(row.fullModel);
          const provider = getProviderDisplayName(row.provider);
          return (
            <div
              key={row.fullModel}
              className="group grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-[#15191d]"
            >
              {/* Model name + progress bar */}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#f5f7fa]">{friendly}</p>
                <p className="mt-0.5 truncate text-[11px] text-[#7a8591]">{provider}</p>
                <ProgressBar
                  value={row.totalTokens}
                  max={maxTokens}
                  className="mt-1.5 max-w-[200px]"
                />
              </div>
              <span className="hidden text-right text-sm text-[#a8b0ba] sm:block">
                {formatNumber(row.sessions)}
              </span>
              <span className="text-right font-mono text-xs text-[#a8b0ba]">
                {formatCompact(row.inputTokens)}
              </span>
              <span className="text-right font-mono text-xs text-[#a8b0ba]">
                {formatCompact(row.outputTokens)}
              </span>
              <span className="text-right font-mono text-xs text-[#34d399]">
                {formatUsd(row.estimatedCostUsd)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Token Usage by Agent table ─────────────────── */

type AgentRow = UsageApiResponse["liveTelemetry"]["byAgent"][number];

function AgentUsageTable({ rows }: { rows: AgentRow[] }) {
  const sorted = [...rows].sort((a, b) => b.totalTokens - a.totalTokens);
  const maxTokens = sorted[0]?.totalTokens ?? 1;

  if (sorted.length === 0) return <EmptyState message="No agent usage recorded yet." />;

  return (
    <div className="overflow-hidden rounded-xl border border-[#23282e]">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-[#23282e] bg-[#15191d] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#7a8591]">
        <span>Agent</span>
        <span className="text-right">Sessions</span>
        <span className="text-right">Total Tokens</span>
        <span className="text-right">Est. Cost</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#23282e]">
        {sorted.map((row) => (
          <div
            key={row.agentId}
            className="group grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-[#15191d]"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-[#f5f7fa]">{row.agentId}</p>
              <ProgressBar
                value={row.totalTokens}
                max={maxTokens}
                className="mt-1.5 max-w-[200px]"
              />
            </div>
            <span className="text-right text-sm text-[#a8b0ba]">{formatNumber(row.sessions)}</span>
            <span className="text-right font-mono text-xs text-[#a8b0ba]">
              {formatCompact(row.totalTokens)}
            </span>
            <span className="text-right font-mono text-xs text-[#34d399]">
              {formatUsd(row.estimatedCostUsd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Provider Billing card ───────────────────────── */

function ProviderBillingCard({ p }: { p: ProviderBillingProviderSnapshot }) {
  const displayName = getProviderDisplayName(p.provider);
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#23282e] bg-[#15191d] p-4">
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#2c343d] bg-[#20252a] text-sm font-bold text-[#a8b0ba]">
        {displayName.charAt(0).toUpperCase()}
      </div>

      {/* Name + freshness */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <FreshnessDot freshness={p.freshness} />
          <span className="text-sm font-semibold text-[#f5f7fa]">{displayName}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-[#7a8591]">
          Updated{" "}
          {p.latestBucketStartMs !== null ? formatAge(p.latestBucketStartMs) : "never"}
        </p>
      </div>

      {/* Spend columns */}
      <div className="hidden gap-6 sm:flex">
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#7a8591]">
            Current Month
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-[#f5f7fa]">
            {formatUsd(p.currentMonthUsd)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#7a8591]">
            Last 30 Days
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-[#f5f7fa]">
            {formatUsd(p.totalUsd30d)}
          </p>
        </div>
      </div>

      {/* Mobile spend */}
      <div className="flex flex-col items-end gap-0.5 sm:hidden">
        <p className="font-mono text-sm font-semibold text-[#f5f7fa]">
          {formatUsd(p.currentMonthUsd)}
        </p>
        <p className="text-[10px] text-[#7a8591]">this month</p>
      </div>
    </div>
  );
}

/* ── Estimated Spend by Model table ─────────────── */

type SpendRow = UsageApiResponse["estimatedSpend"]["byModel"][number];

function EstimatedSpendTable({ rows }: { rows: SpendRow[] }) {
  const sorted = [...rows]
    .filter((r) => r.usd !== null)
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));

  if (sorted.length === 0) return <EmptyState message="No spend data available." />;

  const maxUsd = sorted[0]?.usd ?? 1;

  return (
    <div className="overflow-hidden rounded-xl border border-[#23282e]">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-[#23282e] bg-[#15191d] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#7a8591]">
        <span>Model</span>
        <span className="text-right">Coverage</span>
        <span className="text-right">Est. Spend</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#23282e]">
        {sorted.map((row) => {
          const friendly = getFriendlyModelName(row.fullModel);
          return (
            <div
              key={row.fullModel}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-[#15191d]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[#f5f7fa]">{friendly}</p>
                <ProgressBar
                  value={row.usd ?? 0}
                  max={maxUsd}
                  className="mt-1.5 max-w-[200px]"
                />
              </div>
              <span className="text-right text-xs text-[#7a8591]">
                {row.coveragePct > 0 ? `${Math.round(row.coveragePct)}%` : "—"}
              </span>
              <span className="text-right font-mono text-sm font-semibold text-[#34d399]">
                {formatUsd(row.usd)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Diagnostics panel ──────────────────────────── */

function DiagnosticsPanel({
  warnings,
  sourceErrors,
}: {
  warnings: string[];
  sourceErrors: Array<{ source: string; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const total = warnings.length + sourceErrors.length;
  if (total === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="flex-1 text-sm font-medium text-amber-300">
          {total} diagnostic{total !== 1 ? "s" : ""} detected
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-amber-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-400" />
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-amber-500/10 px-4 pb-4 pt-3">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-500">
                warn
              </span>
              <p className="text-xs text-[#a8b0ba]">{w}</p>
            </div>
          ))}
          {sourceErrors.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-red-500">
                error
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#d6dce3]">{e.source}</p>
                <p className="text-xs text-[#a8b0ba]">{e.error}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Refresh button ─────────────────────────────── */

function RefreshButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-[#23282e] bg-[#15191d] px-3 py-2 text-xs font-medium text-[#a8b0ba] transition-colors hover:border-[#3d4752] hover:text-[#f5f7fa] disabled:opacity-50"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      Refresh
    </button>
  );
}

/* ── Main view ──────────────────────────────────── */

export function UsageView() {
  const [data, setData] = useState<UsageApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeWindow, setActiveWindow] = useState<UsageWindow>("last24h");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/usage", { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return;
      const json: UsageApiResponse = await res.json();
      setData(json);
    } catch {
      // Silently ignore — next poll will retry
    } finally {
      setLoading(false);
    }
  }, []);

  useSmartPoll(fetchData, { intervalMs: 30_000 });

  /* Derived data */
  const totals = data?.liveTelemetry.totals;
  const windowBucket = data?.liveTelemetry.windows[activeWindow];
  const windowSpend = data?.estimatedSpend.windows[activeWindow];
  const byModel = data?.liveTelemetry.byModel ?? [];
  const byAgent = data?.liveTelemetry.byAgent ?? [];
  const availableProviders = (data?.providerBilling.providers ?? []).filter((p) => p.available);
  const spendByModel = data?.estimatedSpend.byModel ?? [];
  const diagnostics = data?.diagnostics;

  const asOf = data?.asOfMs ?? null;

  return (
    <SectionLayout>
      <SectionHeader
        title="Usage"
        description="Token consumption, estimated spend, and provider billing."
        meta={asOf ? `As of ${formatAge(asOf)}` : undefined}
        bordered
        actions={<RefreshButton loading={loading} onClick={() => void fetchData()} />}
      />

      <SectionBody width="wide" padding="regular">
        {data === null ? (
          <LoadingSkeleton />
        ) : (
          <div className="space-y-8">

            {/* ── Hero stat cards ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Total Tokens"
                value={totals ? formatCompact(totals.totalTokens) : "—"}
                sub={
                  totals
                    ? `${formatCompact(totals.inputTokens)} in / ${formatCompact(totals.outputTokens)} out`
                    : undefined
                }
                icon={<Zap className="h-4 w-4" />}
                accent="text-[#34d399]"
              />
              <StatCard
                label="Estimated Cost"
                value={formatUsd(data.estimatedSpend.totalUsd)}
                sub={
                  data.coverage.estimatedPricingCoveragePct > 0
                    ? `${Math.round(data.coverage.estimatedPricingCoveragePct)}% coverage`
                    : "No pricing data — subscription auth doesn't expose costs"
                }
                icon={<DollarSign className="h-4 w-4" />}
                accent="text-emerald-400"
              />
              <StatCard
                label="Sessions"
                value={totals ? formatNumber(totals.sessions) : "—"}
                sub={totals ? `${formatNumber(totals.agents)} agent${totals.agents !== 1 ? "s" : ""}` : undefined}
                icon={<Activity className="h-4 w-4" />}
                accent="text-sky-400"
              />
              <StatCard
                label="Active Models"
                value={totals ? formatNumber(totals.models) : "—"}
                sub={byModel.length > 0 ? `Across ${new Set(byModel.map((m) => m.provider)).size} provider${new Set(byModel.map((m) => m.provider)).size !== 1 ? "s" : ""}` : undefined}
                icon={<Cpu className="h-4 w-4" />}
                accent="text-violet-400"
              />
            </div>

            {/* ── Time window + window stats ── */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SubHeading>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Usage Window
                  </span>
                </SubHeading>
                <WindowSelector active={activeWindow} onChange={setActiveWindow} />
              </div>

              {windowBucket && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-[#23282e] bg-[#15191d] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#7a8591]">
                      Sessions
                    </p>
                    <p className="mt-1 text-lg font-bold text-[#f5f7fa]">
                      {formatNumber(windowBucket.sessions)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#23282e] bg-[#15191d] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#7a8591]">
                      Total Tokens
                    </p>
                    <p className="mt-1 text-lg font-bold text-[#f5f7fa]">
                      {formatCompact(windowBucket.totalTokens)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#23282e] bg-[#15191d] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#7a8591]">
                      Input Tokens
                    </p>
                    <p className="mt-1 text-lg font-bold text-[#f5f7fa]">
                      {formatCompact(windowBucket.inputTokens)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#23282e] bg-[#15191d] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#7a8591]">
                      Output Tokens
                    </p>
                    <p className="mt-1 text-lg font-bold text-[#f5f7fa]">
                      {formatCompact(windowBucket.outputTokens)}
                    </p>
                  </div>
                  {windowSpend?.usd !== null && windowSpend !== undefined && (
                    <div className="col-span-2 rounded-xl border border-[#23282e] bg-[#15191d] p-3 sm:col-span-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[#7a8591]">
                          Estimated Spend
                        </p>
                        {windowSpend.coveragePct > 0 && (
                          <span className="rounded-full border border-[#23282e] bg-[#20252a] px-2 py-0.5 text-[10px] text-[#7a8591]">
                            {Math.round(windowSpend.coveragePct)}% coverage
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-lg font-bold text-[#34d399]">
                        {formatUsd(windowSpend.usd)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Token Usage by Model ── */}
            <div>
              <SubHeading count={byModel.length}>
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Token Usage by Model
                </span>
              </SubHeading>
              <ModelUsageTable rows={byModel} />
            </div>

            {/* ── Token Usage by Agent ── */}
            <div>
              <SubHeading count={byAgent.length}>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Token Usage by Agent
                </span>
              </SubHeading>
              <AgentUsageTable rows={byAgent} />
            </div>

            {/* ── Provider Billing ── */}
            {availableProviders.length > 0 && (
              <div>
                <SubHeading count={availableProviders.length}>
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    Provider Billing
                  </span>
                </SubHeading>
                <div className="space-y-2">
                  {availableProviders.map((p) => (
                    <ProviderBillingCard key={p.provider} p={p} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Estimated Spend by Model ── */}
            {spendByModel.length > 0 && (
              <div>
                <SubHeading>
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Estimated Spend by Model
                  </span>
                </SubHeading>
                <EstimatedSpendTable rows={spendByModel} />
              </div>
            )}

            {/* ── Diagnostics ── */}
            {diagnostics && (
              <DiagnosticsPanel
                warnings={diagnostics.warnings}
                sourceErrors={diagnostics.sourceErrors}
              />
            )}

          </div>
        )}
      </SectionBody>
    </SectionLayout>
  );
}
