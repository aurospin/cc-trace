import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextRecompute } from "../../src/shared/throttle.js";

const WINDOW = 250;

describe("nextRecompute", () => {
  it("(1) first call with empty history schedules immediate compute", () => {
    const decision = nextRecompute({
      current: { pairCount: 0, lastSettled: true },
      previous: { pairCount: 0, lastSettled: true },
      nowMs: 0,
      lastRecomputeMs: 0,
      windowMs: WINDOW,
    });
    expect(decision).toEqual({ computeNow: true, scheduleAt: null });
  });

  it("(2) in-flight change within window returns no compute, schedules for remaining window", () => {
    const decision = nextRecompute({
      current: { pairCount: 2, lastSettled: false },
      previous: { pairCount: 1, lastSettled: false },
      nowMs: 1100,
      lastRecomputeMs: 1000,
      windowMs: WINDOW,
    });
    expect(decision).toEqual({ computeNow: false, scheduleAt: 1250 });
  });

  it("(3) completed-pair signal flushes immediately (cancels any pending timer via scheduleAt=null)", () => {
    const decision = nextRecompute({
      current: { pairCount: 1, lastSettled: true },
      previous: { pairCount: 1, lastSettled: false },
      nowMs: 1100,
      lastRecomputeMs: 1000,
      windowMs: WINDOW,
    });
    expect(decision).toEqual({ computeNow: true, scheduleAt: null });
  });

  it("(4) consecutive in-flight updates within window coalesce — second call returns the same scheduleAt as the first", () => {
    const first = nextRecompute({
      current: { pairCount: 2, lastSettled: false },
      previous: { pairCount: 1, lastSettled: false },
      nowMs: 1050,
      lastRecomputeMs: 1000,
      windowMs: WINDOW,
    });
    const second = nextRecompute({
      current: { pairCount: 3, lastSettled: false },
      previous: { pairCount: 2, lastSettled: false },
      nowMs: 1100,
      lastRecomputeMs: 1000,
      windowMs: WINDOW,
    });
    expect(first.scheduleAt).toBe(1250);
    expect(second.scheduleAt).toBe(1250);
    expect(first.computeNow).toBe(false);
    expect(second.computeNow).toBe(false);
  });

  it("no-op when nothing changed and lastRecomputeMs > 0", () => {
    const decision = nextRecompute({
      current: { pairCount: 5, lastSettled: true },
      previous: { pairCount: 5, lastSettled: true },
      nowMs: 9999,
      lastRecomputeMs: 1000,
      windowMs: WINDOW,
    });
    expect(decision).toEqual({ computeNow: false, scheduleAt: null });
  });

  it("change after window elapsed → computes immediately", () => {
    const decision = nextRecompute({
      current: { pairCount: 6, lastSettled: false },
      previous: { pairCount: 5, lastSettled: true },
      nowMs: 2000,
      lastRecomputeMs: 1000,
      windowMs: WINDOW,
    });
    expect(decision).toEqual({ computeNow: true, scheduleAt: null });
  });
});

describe("nextRecompute SC-003 timing — pair-completion fires within 1000 ms (vi.useFakeTimers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(5) given a pair-completion at t0, the next compute fires within 1000 ms of t0", () => {
    let lastComputeAt = -1;
    let lastRecomputeMs = 0;
    let prev = { pairCount: 0, lastSettled: true };

    function tick(curr: { pairCount: number; lastSettled: boolean }, nowMs: number) {
      const decision = nextRecompute({
        current: curr,
        previous: prev,
        nowMs,
        lastRecomputeMs,
        windowMs: WINDOW,
      });
      prev = curr;
      if (decision.computeNow) {
        lastComputeAt = nowMs;
        lastRecomputeMs = nowMs;
      }
    }

    // Several in-flight updates within window — coalesced/throttled
    tick({ pairCount: 1, lastSettled: false }, 0);
    tick({ pairCount: 2, lastSettled: false }, 50);
    tick({ pairCount: 3, lastSettled: false }, 100);

    // t0 = 200: pair completes
    const t0 = 200;
    tick({ pairCount: 3, lastSettled: true }, t0);

    expect(lastComputeAt).toBeGreaterThanOrEqual(t0);
    expect(lastComputeAt - t0).toBeLessThan(1000);
  });
});
