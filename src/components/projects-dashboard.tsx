"use client";

import { cn } from "@/lib/utils";
import { SectionBody, SectionHeader, SectionLayout } from "@/components/section-layout";
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  Rocket,
  Server,
  Globe,
  Smartphone,
  Briefcase,
} from "lucide-react";

/* ── Types ── */

type TodoStatus = "green" | "yellow" | "red" | "blue";

type TodoItem = {
  label: string;
  status: TodoStatus;
};

type ProjectStatus = "live" | "beta" | "blocked" | "indev" | "online" | "inprogress";

type Project = {
  name: string;
  category: string;
  status: ProjectStatus;
  statusLabel: string;
  progress: number;
  description: string;
  icon: React.ReactNode;
  todos: TodoItem[];
};

/* ── Data ── */

const PROJECTS: Project[] = [
  {
    name: "FieldSketch",
    category: "SketchKit Apps",
    status: "beta",
    statusLabel: "Beta Live",
    progress: 85,
    description: "Field inspection PWA, Android + iPad Safari",
    icon: <Smartphone className="h-4 w-4" />,
    todos: [
      { label: "iPad Air 5th gen + Apple Pencil ordered", status: "green" },
      { label: "iPad real-device testing", status: "yellow" },
      { label: "Capacitor native app packaging", status: "yellow" },
    ],
  },
  {
    name: "MoodSketch",
    category: "SketchKit Apps",
    status: "blocked",
    statusLabel: "Blocked",
    progress: 70,
    description: "Mood journal app, Android + iOS",
    icon: <Smartphone className="h-4 w-4" />,
    todos: [
      { label: "Google Play upload key reset (pending)", status: "red" },
      { label: "Build AAB on Windows + upload", status: "yellow" },
      { label: "iOS build on Mac Mini (Xcode 14.2)", status: "yellow" },
    ],
  },
  {
    name: "SketchKit Website",
    category: "SketchKit Apps",
    status: "live",
    statusLabel: "Live",
    progress: 92,
    description: "sketchkit.app, Astro + Tailwind, Vercel",
    icon: <Globe className="h-4 w-4" />,
    todos: [
      { label: "Full redesign shipped", status: "green" },
      { label: "Form SketchKit LLC (NJ)", status: "yellow" },
      { label: "@SketchKitApp content strategy", status: "yellow" },
    ],
  },
  {
    name: "AEL CaseVault",
    category: "Work Projects",
    status: "indev",
    statusLabel: "In Dev",
    progress: 95,
    description: "AI-powered case document extraction, React+Vite+Express+SQLite+Electron",
    icon: <Briefcase className="h-4 w-4" />,
    todos: [
      { label: "sql.js fix + .exe installer", status: "green" },
      { label: "Gemini + OpenAI providers working", status: "green" },
      { label: "Search by expert, attorney, city", status: "green" },
      { label: "Test with sample reports + share", status: "yellow" },
      { label: "Ask IT about Azure OpenAI", status: "yellow" },
    ],
  },
  {
    name: "Deckard (Pi)",
    category: "Infrastructure",
    status: "online",
    statusLabel: "Online",
    progress: 97,
    description: "OpenClaw AI assistant, heartbeats + cron",
    icon: <Server className="h-4 w-4" />,
    todos: [
      { label: "Heartbeats running", status: "green" },
      { label: "Cron jobs healthy", status: "green" },
      { label: "Gateway online", status: "green" },
      { label: "Security grade improved (C→B)", status: "green" },
    ],
  },
  {
    name: "Mission Control",
    category: "Infrastructure",
    status: "live",
    statusLabel: "Live",
    progress: 96,
    description: "mc.deckard.chat, Next.js — all tabs working on Pi",
    icon: <Rocket className="h-4 w-4" />,
    todos: [
      { label: "Dashboard, Skills, Config, Cron", status: "green" },
      { label: "Sessions, Devices, Security tabs", status: "green" },
      { label: "CPU spike fix (channels stub)", status: "green" },
      { label: "Obsidian notes integration", status: "yellow" },
    ],
  },
];

/* ── Status config ── */

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; dot: string; badge: string; bar: string }
> = {
  live:       { label: "Live",        dot: "bg-emerald-500",      badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",   bar: "bg-emerald-500" },
  beta:       { label: "Beta Live",   dot: "bg-emerald-500",      badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",   bar: "bg-emerald-500" },
  online:     { label: "Online",      dot: "bg-emerald-500",      badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",   bar: "bg-emerald-500" },
  inprogress: { label: "In Progress", dot: "bg-yellow-400",       badge: "bg-yellow-400/10 text-yellow-300 border-yellow-400/20",     bar: "bg-yellow-400" },
  blocked:    { label: "Blocked",     dot: "bg-yellow-400",       badge: "bg-yellow-400/10 text-yellow-300 border-yellow-400/20",     bar: "bg-yellow-400" },
  indev:      { label: "In Dev",      dot: "bg-orange-400",       badge: "bg-orange-400/10 text-orange-300 border-orange-400/20",     bar: "bg-orange-400" },
};

const TODO_DOT: Record<TodoStatus, string> = {
  green:  "bg-emerald-500",
  yellow: "bg-yellow-400",
  red:    "bg-red-500",
  blue:   "bg-blue-400",
};

/* ── Stat card ── */

function StatCard({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#23282e] bg-[#151a1f] px-5 py-4 flex items-center gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e2530] text-[#a8b0ba]">
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-[#f5f7fa]">{value}</div>
        <div className="text-xs text-[#7a8591]">{label}</div>
      </div>
    </div>
  );
}

/* ── Project card ── */

function ProjectCard({ project }: { project: Project }) {
  const cfg = STATUS_CONFIG[project.status];

  return (
    <div className="rounded-xl border border-[#23282e] bg-[#151a1f] p-5 flex flex-col gap-4 hover:border-[#2e3540] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1e2530] text-[#a8b0ba]">
            {project.icon}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[#f5f7fa] leading-tight">{project.name}</div>
            <div className="text-xs text-[#7a8591] truncate mt-0.5">{project.description}</div>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            cfg.badge
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
          {cfg.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#7a8591]">Progress</span>
          <span className="text-xs font-medium text-[#a8b0ba]">{project.progress}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#1e2530] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", cfg.bar)}
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>

      {/* Todos */}
      {project.todos.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-[#7a8591] uppercase tracking-wider">Next</div>
          <ul className="space-y-1.5">
            {project.todos.map((todo, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-[#a8b0ba]">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", TODO_DOT[todo.status])} />
                {todo.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Group section ── */

function ProjectGroup({ category, projects }: { category: string; projects: Project[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#7a8591]">{category}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
      </div>
    </div>
  );
}

/* ── Main component ── */

export function ProjectsDashboard() {
  const categories = Array.from(new Set(PROJECTS.map((p) => p.category)));

  const liveCount = PROJECTS.filter((p) => ["live", "beta", "online"].includes(p.status)).length;
  const activeCount = PROJECTS.filter((p) => ["indev", "inprogress", "blocked"].includes(p.status)).length;
  const blockedCount = PROJECTS.filter((p) => p.status === "blocked").length;

  return (
    <SectionLayout>
      <SectionHeader
        title="Projects"
        description="Status overview of all active work"
        bordered
      />
      <SectionBody width="wide" padding="regular">
        <div className="space-y-8">
          {/* Stats row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              value={`${liveCount} Online`}
              label="Live / Online"
              icon={<CheckCircle className="h-5 w-5" />}
            />
            <StatCard
              value={`${activeCount} Active`}
              label="In Development"
              icon={<Clock className="h-5 w-5" />}
            />
            <StatCard
              value={`${blockedCount} Blocked`}
              label="Need Attention"
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>

          {/* Project groups */}
          {categories.map((cat) => (
            <ProjectGroup
              key={cat}
              category={cat}
              projects={PROJECTS.filter((p) => p.category === cat)}
            />
          ))}
        </div>
      </SectionBody>
    </SectionLayout>
  );
}
