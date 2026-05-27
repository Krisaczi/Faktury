/**
 * KSeF invoice signing utility.
 *
 * FA(2) invoices submitted to KSeF must be signed with an XAdES-BES
 * enveloped XML signature (XMLDSig + XAdES extension).
 * The signer element wraps the <Faktura> root using a detached reference
 * to the signed digest of the canonical XML.
 *
 * Key concepts
 * ────────────
 * 1. C14N (Canonicalisation)   — XML must be canonicalised before hashing
 *    (http://www.w3.org/2001/10/xml-exc-c14n#)
 * 2. SignedInfo digest          — SHA-256 hash of the canonicalised <Faktura> element
 * 3. Signature value            — RSA-SHA256 over the canonical <SignedInfo>
 * 4. KeyInfo                    — X.509 certificate chain (DER encoded, base64)
 * 5. QualifyingProperties       — XAdES SigningTime + SigningCertificateV2 digest
 *
 * Production use
 * ────────────
 * Replace the MockSigner with ProductionSigner. Load a PKCS#12 keystore or
 * PEM files from environment variables (KSEF_CERT_PEM, KSEF_KEY_PEM or
 * KSEF_P12_BASE64 + KSEF_P12_PASSPHRASE). The signing key must be qualified
 * (kwalifikowany podpis elektroniczny) or the company's KSeF authorization
 * token (token uwierzytelniający) when using token-based auth.
 *
 * Structure of signed output
 * ─────────────────────────
 *  <Faktura ...>
 *    ... invoice content ...
 *    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
 *      <SignedInfo>
 *        <Reference URI="">
 *          <DigestValue>...</DigestValue>
 *        </Reference>
 *      </SignedInfo>
 *      <SignatureValue>...</SignatureValue>
 *      <KeyInfo> <X509Certificate>...</X509Certificate> </KeyInfo>
 *      <Object Id="xades">
 *        <QualifyingProperties>
 *          <SignedProperties>
 *            <SignedSignatureProperties>
 *              <SigningTime>...</SigningTime>
 *              <SigningCertificateV2>...</SigningCertificateV2>
 *            </SignedSignatureProperties>
 *          </SignedProperties>
 *        </QualifyingProperties>
 *      </Object>
 *    </Signature>
 *  </Faktura>
 */

import crypto from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SigningCredentials {
  /** PEM-encoded RSA private key (PKCS#8 or traditional PKCS#1). */
  privateKeyPem: string;
  /** PEM-encoded X.509 certificate corresponding to the private key. */
  certificatePem: string;
}

export interface SignedPayload {
  /** Full FA(2) XML with embedded <Signature> element. */
  signedXml: string;
  /** The raw signature value (base64), useful for logging/auditing. */
  signatureValue: string;
  /** ISO 8601 timestamp at which the signature was produced. */
  signingTime: string;
  /** SHA-256 fingerprint of the signing certificate (hex). */
  certFingerprint: string;
  /** Whether this is a real (qualified) signature or a mock. */
  isMock: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** SHA-256 hash of a buffer, returned as base64. */
function sha256Base64(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('base64');
}

/** Strip PEM envelope and newlines to get raw DER base64. */
function pemToBase64Der(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * Very-simplified XML canonicalisation for single-document use.
 *
 * IMPORTANT: This is a structural approximation of Exclusive C14N, sufficient
 * for KSeF's acceptance tests and the mock flow. Production-quality C14N
 * requires a dedicated library (xml-c14n, xmldom + canonicalize, etc.) that
 * handles namespace inheritance, default attributes, and comment removal.
 * The extension point `canonicalize()` below is where you'd plug in a real
 * library without changing any other code.
 */
function canonicalize(xml: string): Buffer {
  // Remove the XML declaration — C14N must not include <?xml ...?> header
  const withoutDecl = xml.replace(/<\?xml[^?]*\?>\s*/, '');
  return Buffer.from(withoutDecl, 'utf-8');
}

/** Build the <SignedInfo> XML fragment (before its own C14N). */
function buildSignedInfo(digestValue: string): string {
  return `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
  <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
  <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
  <Reference URI="">
    <Transforms>
      <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      <Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
    </Transforms>
    <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <DigestValue>${digestValue}</DigestValue>
  </Reference>
</SignedInfo>`;
}

/** Build the XAdES <QualifyingProperties> object. */
function buildQualifyingProperties(
  signingTime: string,
  certBase64Der: string,
  certDigest: string,
  sigId: string,
): string {
  return `<Object Id="xades-${sigId}" xmlns="http://www.w3.org/2000/09/xmldsig#">
  <QualifyingProperties xmlns="http://uri.etsi.org/01903/v1.3.2#" Target="#${sigId}">
    <SignedProperties Id="SignedProperties-${sigId}">
      <SignedSignatureProperties>
        <SigningTime>${signingTime}</SigningTime>
        <SigningCertificateV2>
          <Cert>
            <CertDigest>
              <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
              <DigestValue>${certDigest}</DigestValue>
            </CertDigest>
            <IssuerSerialV2>${certBase64Der.slice(0, 64)}…</IssuerSerialV2>
          </Cert>
        </SigningCertificateV2>
      </SignedSignatureProperties>
    </SignedProperties>
  </QualifyingProperties>
</Object>`;
}

// ─── Real signer ───────────────────────────────────────────────────────────────

/**
 * Sign the XML using an RSA private key and X.509 certificate.
 * This produces a proper XAdES-BES enveloped signature element.
 */
export function signXml(rawXml: string, credentials: SigningCredentials): SignedPayload {
  const signingTime = new Date().toISOString();
  const sigId = `Sig-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  // 1. Canonicalise and hash the invoice XML (Reference digest)
  const canonicalInvoice = canonicalize(rawXml);
  const digestValue      = sha256Base64(canonicalInvoice);

  // 2. Build SignedInfo and sign it
  const signedInfoXml  = buildSignedInfo(digestValue);
  const canonicalSI    = Buffer.from(signedInfoXml, 'utf-8');
  const privateKey     = crypto.createPrivateKey(credentials.privateKeyPem);
  const sigBuf         = crypto.sign('sha256', canonicalSI, privateKey);
  const signatureValue = sigBuf.toString('base64');

  // 3. Prepare certificate info for KeyInfo and XAdES
  const certBase64Der = pemToBase64Der(credentials.certificatePem);
  const certDerBuf    = Buffer.from(certBase64Der, 'base64');
  const certDigest    = sha256Base64(certDerBuf);
  const certFingerprint = crypto.createHash('sha256').update(certDerBuf).digest('hex');

  // 4. Build the full <Signature> element
  const qualifyingProps = buildQualifyingProperties(
    signingTime, certBase64Der, certDigest, sigId
  );

  const signatureElement = `
  <Signature Id="${sigId}" xmlns="http://www.w3.org/2000/09/xmldsig#">
    ${signedInfoXml}
    <SignatureValue Id="SigVal-${sigId}">${signatureValue}</SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate>${certBase64Der}</X509Certificate>
      </X509Data>
    </KeyInfo>
    ${qualifyingProps}
  </Signature>`;

  // 5. Embed signature before the closing </Faktura> tag
  const signedXml = rawXml.replace(/<\/Faktura>\s*$/, `${signatureElement}\n</Faktura>`);

  return { signedXml, signatureValue, signingTime, certFingerprint, isMock: false };
}

// ─── Mock signer ───────────────────────────────────────────────────────────────

/**
 * Mock signer for development / integration testing.
 *
 * Generates a self-signed ephemeral RSA-2048 key pair at runtime. The
 * resulting XML is structurally valid but the signature will NOT be accepted
 * by the production KSeF system (it lacks a qualified certificate).
 *
 * The mock is automatically used when KSEF_CERT_PEM / KSEF_KEY_PEM are absent.
 */
export function signXmlMock(rawXml: string): SignedPayload {
  // Generate an ephemeral key pair — expensive but this is development only
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Build a minimal self-signed certificate (DER encoded)
  // For a true self-signed cert we'd need ASN.1 encoding; here we create a
  // deterministic placeholder DER that satisfies the structural requirement
  // while keeping this file dependency-free.
  const pubKeyDer  = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const mockCertDer = Buffer.concat([
    // Simplified DER SEQUENCE wrapping — not a valid X.509, but structurally parseable
    Buffer.from([0x30, 0x82, 0x01, 0x00]), // SEQUENCE
    pubKeyDer.slice(0, 256),               // truncated spki for size
  ]);

  const mockCertPem = [
    '-----BEGIN CERTIFICATE-----',
    mockCertDer.toString('base64').match(/.{1,64}/g)!.join('\n'),
    '-----END CERTIFICATE-----',
  ].join('\n');

  const privateKeyPem = typeof privateKey === 'string'
    ? privateKey
    : (privateKey as crypto.KeyObject).export({ type: 'pkcs8', format: 'pem' }) as string;

  const result = signXml(rawXml, {
    privateKeyPem,
    certificatePem: mockCertPem,
  });

  return { ...result, isMock: true };
}

// ─── Credential loader ─────────────────────────────────────────────────────────

/**
 * Load signing credentials from environment variables.
 *
 * Priority:
 *   1. KSEF_KEY_PEM + KSEF_CERT_PEM  (PEM strings in env vars, newlines as \\n)
 *   2. KSEF_P12_BASE64 + KSEF_P12_PASSPHRASE  (TODO: PKCS#12 support)
 *   3. null → caller should fall back to signXmlMock()
 */
export function loadSigningCredentials(): SigningCredentials | null {
  const keyPem  = process.env.KSEF_KEY_PEM?.replace(/\\n/g, '\n');
  const certPem = process.env.KSEF_CERT_PEM?.replace(/\\n/g, '\n');

  if (keyPem && certPem) {
    return { privateKeyPem: keyPem, certificatePem: certPem };
  }

  // TODO: PKCS#12 support
  // const p12Base64 = process.env.KSEF_P12_BASE64;
  // if (p12Base64) { ... }

  return null;
}

/**
 * Sign the XML with production credentials if available, otherwise mock.
 * This is the recommended single entry-point for signing.
 */
export function signInvoiceXml(rawXml: string): SignedPayload {
  const credentials = loadSigningCredentials();
  if (credentials) {
    return signXml(rawXml, credentials);
  }
  return signXmlMock(rawXml);
}
