import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface HealthState {
  connected: boolean;
  latencyMs: number;
  serverCount: number;
}

/**
 * Polls the local API server list to compute a connection badge. Polling is
 * kept cheap (5s) and tolerant of errors — a failed request only flips the
 * "connected" indicator, never throws.
 */
export const useServerHealth = (): HealthState => {
  const [state, setState] = useState<HealthState>({
    connected: false,
    latencyMs: 0,
    serverCount: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const start = performance.now();
      try {
        const servers = await api.listServers();
        if (cancelled) return;
        setState({
          connected: true,
          latencyMs: Math.round(performance.now() - start),
          serverCount: servers.length,
        });
      } catch {
        if (cancelled) return;
        setState((s) => ({ ...s, connected: false }));
      }
    };

    void tick();
    const handle = setInterval(tick, 5_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  return state;
};