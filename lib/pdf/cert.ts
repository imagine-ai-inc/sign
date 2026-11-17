/** Self-signed PAdES seal certificate (PKCS#12). Used by scripts/generate-signing-cert.ts and the first-run auto seal. */
import { randomBytes } from "node:crypto";
import forge from "node-forge";

export function generateSelfSignedP12(opts: { commonName?: string; organization?: string; email?: string; years?: number } = {}) {
  const passphrase = randomBytes(24).toString("base64url");
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + randomBytes(12).toString("hex");
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + (opts.years ?? 10));
  const attrs: { name: string; value: string }[] = [
    { name: "commonName", value: opts.commonName || "Imagine Sign" },
    { name: "organizationName", value: opts.organization || opts.commonName || "Imagine Sign" },
  ];
  if (opts.email) attrs.push({ name: "emailAddress", value: opts.email });
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
    { name: "extKeyUsage", emailProtection: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "aes256", friendlyName: "sign-seal" });
  const der = forge.asn1.toDer(asn1).getBytes();
  return { p12: new Uint8Array(Buffer.from(der, "binary")), passphrase, certPem: forge.pki.certificateToPem(cert) };
}
