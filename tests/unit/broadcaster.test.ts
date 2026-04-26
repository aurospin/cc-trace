import { describe, expect, it, vi } from "vitest";
import { createBroadcaster } from "../../src/live-server/broadcaster.js";
import type { HttpPair } from "../../src/shared/types.js";

const makePair = (): HttpPair => ({
  request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
  response: { timestamp: 2, status_code: 200, headers: {}, body: null, body_raw: null },
  logged_at: new Date().toISOString(),
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
    const p1 = makePair();
    const p2 = makePair();
    b.send(p1);
    b.send(p2);
    expect(b.getPairs()).toEqual([p1, p2]);
  });
});
