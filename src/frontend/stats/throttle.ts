/** Snapshot of the pairs array used by the throttle scheduler */
export interface SchedulerSnapshot {
  /** Number of pairs in the array */
  pairCount: number;
  /** Whether the last pair's response is non-null (settled) */
  lastSettled: boolean;
}

/** Inputs to the pure scheduler */
export interface SchedulerInput {
  current: SchedulerSnapshot;
  previous: SchedulerSnapshot;
  /** Wall-clock millisecond timestamp at which this decision is being made */
  nowMs: number;
  /** Wall-clock millisecond timestamp of the last actual recompute (0 = never) */
  lastRecomputeMs: number;
  /** Throttle window in milliseconds (typically 250) */
  windowMs: number;
}

/** Decision from the scheduler */
export interface SchedulerDecision {
  /** Recompute right now; caller MUST cancel any pending timer */
  computeNow: boolean;
  /** Absolute ms timestamp at which to schedule the next compute; null = no schedule */
  scheduleAt: number | null;
}

/**
 * Pure throttle scheduler for live SessionStats recomputation.
 *
 * Behavior:
 * - First call (lastRecomputeMs === 0) → compute immediately.
 * - Pair just settled (current.lastSettled && !previous.lastSettled) → flush immediately.
 * - No change in snapshot → no-op.
 * - Change within window → schedule for end of window.
 * - Change after window elapsed → compute immediately.
 *
 * @param input - current+previous snapshot, current time, last compute time, window size
 * @returns decision: computeNow + optional scheduleAt
 */
export function nextRecompute(input: SchedulerInput): SchedulerDecision {
  const { current, previous, nowMs, lastRecomputeMs, windowMs } = input;

  if (lastRecomputeMs === 0) {
    return { computeNow: true, scheduleAt: null };
  }

  const noChange =
    current.pairCount === previous.pairCount && current.lastSettled === previous.lastSettled;
  if (noChange) {
    return { computeNow: false, scheduleAt: null };
  }

  const justSettled = current.lastSettled && !previous.lastSettled;
  if (justSettled) {
    return { computeNow: true, scheduleAt: null };
  }

  const elapsed = nowMs - lastRecomputeMs;
  if (elapsed >= windowMs) {
    return { computeNow: true, scheduleAt: null };
  }

  return { computeNow: false, scheduleAt: lastRecomputeMs + windowMs };
}
