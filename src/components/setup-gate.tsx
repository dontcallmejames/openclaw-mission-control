"use client";

import { useState, useEffect, useCallback } from "react";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export function SetupGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<{ hasModel: boolean; hasChannel: boolean; hasApiKey: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/onboard", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStatus({ hasModel: data.hasModel, hasChannel: data.hasChannel, hasApiKey: data.hasApiKey });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleComplete = useCallback(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading && !status) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <h2 className="text-sm font-semibold text-foreground">Could not connect to OpenClaw</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Make sure the OpenClaw gateway is running and try again.
          </p>
          <button
            type="button"
            onClick={fetchStatus}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (status && (!status.hasModel || !status.hasChannel || !status.hasApiKey)) {
    return <OnboardingWizard onComplete={handleComplete} />;
  }

  return <>{children}</>;
}
