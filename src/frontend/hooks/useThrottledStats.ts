import { useEffect, useMemo, useRef, useState } from "react";
import { computeStats } from "../../shared/stats.js";
import { type SchedulerSnapshot, nextRecompute } from "../../shared/throttle.js";
import type { HttpPair, SessionStats } from "../../shared/types.js";

function snapshot(pairs: HttpPair[]): SchedulerSnapshot {
  return {
    pairCount: pairs.length,
    lastSettled: pairs.length === 0 ? true : pairs[pairs.length - 1]?.response !== null,
  };
}

const EMPTY_SNAPSHOT: SchedulerSnapshot = { pairCount: 0, lastSettled: true };

/**
 * Throttled SessionStats derivation.
 *
 * - In static mode (`live === false`), recomputes synchronously per render via useMemo.
 * - In live mode, coalesces in-flight pair updates to a single recompute per `windowMs`,
 *   flushing immediately when the last pair transitions to settled.
 *
 * @param pairs - current pairs array
 * @param live - true for live dashboard (throttled), false for static report (synchronous)
 * @param windowMs - throttle window in ms (default 250)
 * @returns SessionStats
 */
export function useThrottledStats(pairs: HttpPair[], live: boolean, windowMs = 250): SessionStats {
  const staticStats = useMemo(() => computeStats(pairs), [pairs]);
  const [liveStats, setLiveStats] = useState<SessionStats>(() => computeStats(pairs));
  const lastRecomputeMs = useRef<number>(0);
  const prevSnap = useRef<SchedulerSnapshot>(EMPTY_SNAPSHOT);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pairsRef = useRef<HttpPair[]>(pairs);
  pairsRef.current = pairs;

  useEffect(() => {
    if (!live) return;
    const current = snapshot(pairs);
    const decision = nextRecompute({
      current,
      previous: prevSnap.current,
      nowMs: Date.now(),
      lastRecomputeMs: lastRecomputeMs.current,
      windowMs,
    });
    prevSnap.current = current;

    if (decision.computeNow) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      lastRecomputeMs.current = Date.now();
      setLiveStats(computeStats(pairsRef.current));
    } else if (decision.scheduleAt !== null && timer.current === null) {
      const delay = Math.max(0, decision.scheduleAt - Date.now());
      timer.current = setTimeout(() => {
        timer.current = null;
        lastRecomputeMs.current = Date.now();
        prevSnap.current = snapshot(pairsRef.current);
        setLiveStats(computeStats(pairsRef.current));
      }, delay);
    }

    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [pairs, live, windowMs]);

  return live ? liveStats : staticStats;
}
