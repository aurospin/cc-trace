import forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** CA key + certificate (PEM strings + file paths) */
export interface CA {
  cert: string;
  key: string;
  certPath: string;
  keyPath: string;
}

/** Domain-specific leaf certificate (PEM strings) */
export interface DomainCert {
  cert: string;
  key: string;
}

const CC_TRACE_DIR = process.env['CC_TRACE_DIR'] ?? path.join(os.homedir(), '.cc-trace');

/**
 * Ensures a CA certificate exists in ~/.cc-trace/ (or CC_TRACE_DIR in tests).
 * Generates one if not present. Returns the CA on every call.
 * @returns CA cert + key as PEM strings plus file paths
 */
export function ensureCA(): CA {
  const certPath = path.join(CC_TRACE_DIR, 'ca.crt');
  const keyPath = path.join(CC_TRACE_DIR, 'ca.key');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, 'utf-8'),
      key: fs.readFileSync(keyPath, 'utf-8'),
      certPath,
      keyPath,
    };
  }

  fs.mkdirSync(CC_TRACE_DIR, { recursive: true });

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: 'commonName', value: 'cc-trace CA' },
    { name: 'organizationName', value: 'cc-trace' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  fs.writeFileSync(certPath, certPem, 'utf-8');
  fs.writeFileSync(keyPath, keyPem, { encoding: 'utf-8', mode: 0o600 });

  return { cert: certPem, key: keyPem, certPath, keyPath };
}

const certCache = new Map<string, DomainCert>();

/**
 * Returns a TLS certificate for the given hostname, signed by the CA.
 * Caches results in memory for the process lifetime.
 * @param hostname — the target hostname (e.g. "api.anthropic.com")
 * @param ca — the CA returned by ensureCA()
 * @returns DomainCert with PEM cert and key
 */
export function getDomainCert(hostname: string, ca: CA): DomainCert {
  const cached = certCache.get(hostname);
  if (cached) return cached;

  const caKey = forge.pki.privateKeyFromPem(ca.key);
  const caCert = forge.pki.certificateFromPem(ca.cert);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  cert.setSubject([{ name: 'commonName', value: hostname }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ]);
  cert.sign(caKey, forge.md.sha256.create());

  const domainCert: DomainCert = {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  };

  certCache.set(hostname, domainCert);
  return domainCert;
}
