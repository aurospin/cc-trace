import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import forge from "node-forge";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// We override the home dir for tests
const TEST_DIR = path.join(os.tmpdir(), `cc-trace-test-${Date.now()}`);

// Must set before importing cert-manager
process.env.CC_TRACE_DIR = TEST_DIR;

import { clearCertCache, ensureCA, getDomainCert } from "../../src/proxy/cert-manager.js";

describe("cert-manager", () => {
  beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => {
    clearCertCache();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("ensureCA", () => {
    it("generates CA cert and key files on first call", () => {
      const ca = ensureCA();
      expect(fs.existsSync(ca.certPath)).toBe(true);
      expect(fs.existsSync(ca.keyPath)).toBe(true);
    });

    it("returns valid PEM-encoded CA cert", () => {
      const ca = ensureCA();
      const parsed = forge.pki.certificateFromPem(ca.cert);
      expect(parsed.subject.getField("CN")?.value).toBe("cc-trace CA");
    });

    it("returns existing cert on second call without regenerating", () => {
      const ca1 = ensureCA();
      const ca2 = ensureCA();
      expect(ca1.cert).toBe(ca2.cert);
    });

    it("CA cert has basicConstraints cA=true", () => {
      const ca = ensureCA();
      const parsed = forge.pki.certificateFromPem(ca.cert);
      const bc = parsed.getExtension("basicConstraints") as { cA: boolean } | null;
      expect(bc?.cA).toBe(true);
    });

    it("CA key file has permissions 0o600", () => {
      const ca = ensureCA();
      const mode = fs.statSync(ca.keyPath).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe("getDomainCert", () => {
    it("returns cert with correct hostname in SAN", () => {
      const ca = ensureCA();
      const { cert } = getDomainCert("api.anthropic.com", ca);
      const parsed = forge.pki.certificateFromPem(cert);
      const san = parsed.getExtension("subjectAltName") as {
        altNames: Array<{ type: number; value: string }>;
      } | null;
      const hasDomain = san?.altNames.some((n) => n.value === "api.anthropic.com");
      expect(hasDomain).toBe(true);
    });

    it("domain cert is signed by CA", () => {
      const ca = ensureCA();
      const { cert } = getDomainCert("api.anthropic.com", ca);
      const caCert = forge.pki.certificateFromPem(ca.cert);
      const domainCert = forge.pki.certificateFromPem(cert);
      expect(() => caCert.verify(domainCert)).not.toThrow();
    });

    it("caches domain certs — same object returned on second call", () => {
      const ca = ensureCA();
      const cert1 = getDomainCert("example.com", ca);
      const cert2 = getDomainCert("example.com", ca);
      expect(cert1.cert).toBe(cert2.cert);
    });

    it("different hostnames get different certs", () => {
      const ca = ensureCA();
      const cert1 = getDomainCert("foo.com", ca);
      const cert2 = getDomainCert("bar.com", ca);
      expect(cert1.cert).not.toBe(cert2.cert);
    });

    it("clearCertCache resets the cache so different cert is generated", () => {
      const ca = ensureCA();
      const cert1 = getDomainCert("cached.com", ca);
      clearCertCache();
      const cert2 = getDomainCert("cached.com", ca);
      // After clearing, a new cert is generated (different object, same hostname)
      expect(cert1.cert).not.toBe(cert2.cert);
    });
  });
});
