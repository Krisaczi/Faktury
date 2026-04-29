import crypto from 'crypto';
import type { KSeFPublicKeyResponse } from './types';
import { KSeFEncryptionError, KSeFNetworkError } from './errors';

async function fetchPublicKey(baseUrl: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/common/PublicKey`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new KSeFNetworkError(err instanceof Error ? err.message : String(err));
  }

  if (!res.ok) {
    throw new KSeFEncryptionError(
      `Failed to retrieve KSeF public key (HTTP ${res.status})`
    );
  }

  const data = (await res.json()) as KSeFPublicKeyResponse;
  if (!data?.publicKey) {
    throw new KSeFEncryptionError('KSeF public key response was empty or malformed');
  }
  return data.publicKey;
}

function pemFromBase64(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  const lines = clean.match(/.{1,64}/g)?.join('\n') ?? clean;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

export async function encryptTokenForKSeF(
  token: string,
  baseUrl: string
): Promise<string> {
  try {
    const publicKeyB64 = await fetchPublicKey(baseUrl);
    const pem = pemFromBase64(publicKeyB64);

    const aesKey = crypto.randomBytes(32);

    const encryptedAesKey = crypto.publicEncrypt(
      {
        key: pem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey
    );

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    const encryptedToken = Buffer.concat([
      iv,
      cipher.update(Buffer.from(token, 'utf8')),
      cipher.final(),
    ]);

    const combined = Buffer.concat([encryptedAesKey, encryptedToken]);
    return combined.toString('base64');
  } catch (err) {
    if (err instanceof KSeFEncryptionError || err instanceof KSeFNetworkError) {
      throw err;
    }
    throw new KSeFEncryptionError(
      err instanceof Error ? err.message : 'Unknown encryption error'
    );
  }
}
