import { useEffect, useState } from "react";
import type { CcTraceMeta } from "../../shared/types.js";
import { useWsReconnects } from "./useWsReconnects.js";

interface StatusPayload {
  version?: string;
  startedAtIso?: string;
}

function readMeta(): CcTraceMeta | null {
  if (typeof window === "undefined") return null;
  return window.ccTraceMeta ?? null;
}

export function VersionLabel() {
  const [meta, setMeta] = useState<CcTraceMeta | null>(readMeta);
  const reconnects = useWsReconnects();

  useEffect(() => {
    // `reconnects` participates in the dependency array so a WS reconnect
    // re-triggers the fetch after a transient /api/status failure (spec Q3).
    void reconnects;
    if (meta !== null) return;
    if (typeof window === "undefined") return;
    let cancelled = false;
    fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<StatusPayload>) : Promise.reject(r.status)))
      .then((data) => {
        if (cancelled) return;
        if (typeof data.version !== "string" || typeof data.startedAtIso !== "string") return;
        const next: CcTraceMeta = { version: data.version, generatedAt: data.startedAtIso };
        window.ccTraceMeta = next;
        setMeta(next);
      })
      .catch(() => {
        // Silent — placeholder remains rendered; next WS reconnect re-triggers this effect.
      });
    return () => {
      cancelled = true;
    };
  }, [meta, reconnects]);

  if (meta === null) return <span className="version-label" aria-hidden="true" />;
  return (
    <span className="version-label">
      {meta.version} · {meta.generatedAt}
    </span>
  );
}
