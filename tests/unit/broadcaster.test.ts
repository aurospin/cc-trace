import { describe, expect, it, vi } from "vitest";
import { createBroadcaster } from "../../src/live-server/broadcaster.js";
import type { HttpPair, PendingPair } from "../../src/shared/types.js";

const makePair = (pairIndex = 1): HttpPair => ({
  request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
  response: { timestamp: 2, status_code: 200, headers: {}, body: null, body_raw: null },
  logged_at: new Date().toISOString(),
  pairIndex,
});

const makePending = (pairIndex = 1): PendingPair => ({
  pairIndex,
  request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
  startedAt: new Date().toISOString(),
});

const makeClient = (readyState = 1) => ({
  readyState,
  send: vi.fn(),
});

describe("broadcaster", () => {
  it("sends pair to all OPEN clients", () => {
    const b = createBroadcaster();
    const c1 = makeClient(1);
    const c2 = makeClient(1);
    b.addClient(c1 as never);
    b.addClient(c2 as never);

    b.send(makePair());

    expect(c1.send).toHaveBeenCalledOnce();
    expect(c2.send).toHaveBeenCalledOnce();
  });

  it("skips clients that are not OPEN", () => {
    const b = createBroadcaster();
    const c = makeClient(3); // CLOSED
    b.addClient(c as never);
    b.send(makePair());
    expect(c.send).not.toHaveBeenCalled();
  });

  it("removeClient prevents future sends", () => {
    const b = createBroadcaster();
    const c = makeClient(1);
    b.addClient(c as never);
    b.removeClient(c as never);
    b.send(makePair());
    expect(c.send).not.toHaveBeenCalled();
  });

  it("send payload is valid JSON with type=pair", () => {
    const b = createBroadcaster();
    const c = makeClient(1);
    b.addClient(c as never);
    const pair = makePair();
    b.send(pair);

    const payload = JSON.parse((c.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string);
    expect(payload.type).toBe("pair");
    expect(payload.data).toMatchObject({ request: { url: "https://a.com" } });
  });

  it("getPairs returns all sent pairs in order", () => {
    const b = createBroadcaster();
    const p1 = makePair(1);
    const p2 = makePair(2);
    b.send(p1);
    b.send(p2);
    expect(b.getPairs()).toEqual([p1, p2]);
  });

  it("sendPending broadcasts pair-pending message before pair completes", () => {
    const b = createBroadcaster();
    const c = makeClient(1);
    b.addClient(c as never);
    const pending = makePending(5);

    b.sendPending(pending);

    const payload = JSON.parse((c.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string);
    expect(payload.type).toBe("pair-pending");
    expect(payload.data.pairIndex).toBe(5);
  });

  it("pair WS message carries the same pairIndex as the preceding pair-pending", () => {
    const b = createBroadcaster();
    const c = makeClient(1);
    b.addClient(c as never);
    const pending = makePending(7);
    const pair = makePair(7);

    b.sendPending(pending);
    b.send(pair);

    const calls = (c.send as ReturnType<typeof vi.fn>).mock.calls;
    const pendingMsg = JSON.parse(calls[0]?.[0] as string);
    const pairMsg = JSON.parse(calls[1]?.[0] as string);

    expect(pendingMsg.type).toBe("pair-pending");
    expect(pendingMsg.data.pairIndex).toBe(7);
    expect(pairMsg.type).toBe("pair");
    expect(pairMsg.data.pairIndex).toBe(7);
  });

  it("pair-aborted proxy event produces pair WS message with response:null and status:aborted", () => {
    const b = createBroadcaster();
    const c = makeClient(1);
    b.addClient(c as never);
    const pending = makePending(3);

    b.sendPending(pending);
    b.sendAborted({
      pairIndex: 3,
      request: pending.request,
      status: "aborted",
      logged_at: new Date().toISOString(),
    });

    const calls = (c.send as ReturnType<typeof vi.fn>).mock.calls;
    const abortedMsg = JSON.parse(calls[1]?.[0] as string);
    expect(abortedMsg.type).toBe("pair");
    expect(abortedMsg.data.response).toBeNull();
    expect(abortedMsg.data.status).toBe("aborted");
    expect(abortedMsg.data.pairIndex).toBe(3);
  });

  it("getPairs returns only completed pairs (not pending)", () => {
    const b = createBroadcaster();
    b.sendPending(makePending(1));
    b.send(makePair(2));
    const pairs = b.getPairs();
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.pairIndex).toBe(2);
  });

  it("send removes from pending by pairIndex; legacy pair without pairIndex uses fallback -1", () => {
    const b = createBroadcaster();
    b.sendPending(makePending(1));
    const legacyPair: HttpPair = {
      request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
      response: { timestamp: 2, status_code: 200, headers: {}, body: null, body_raw: null },
      logged_at: new Date().toISOString(),
    };
    b.send(legacyPair);
    expect(b.getPendingPairs()).toHaveLength(1);
  });

  it("on reconnect, history message excludes in-flight pairs", () => {
    const b = createBroadcaster();
    b.sendPending(makePending(1));
    b.send(makePair(2));
    b.sendPending(makePending(3));
    const history = b.getPairs();
    expect(history).toHaveLength(1);
    expect(history[0]?.pairIndex).toBe(2);
    const pending = b.getPendingPairs();
    expect(pending.map((p) => p.pairIndex)).toEqual([1, 3]);
  });
});
