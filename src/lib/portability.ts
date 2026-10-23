export interface VerifiedPortabilityBundle {
  recordCount: number;
  exportedAt: string;
}

/** Verify an ObjectOS portability JSON bundle without modifying local records. */
export async function verifyPortabilityBundle(text: string): Promise<VerifiedPortabilityBundle> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('This file is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid ObjectOS portability bundle.');
  const value = parsed as Record<string, unknown>;
  const integrity = value.integrity;
  if (value.format !== 'objectos-portability-bundle' || value.formatVersion !== 1) throw new Error('Unsupported portability bundle format or version.');
  if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity)) throw new Error('This bundle has no integrity checksum. Export a newer bundle and try again.');
  const check = integrity as Record<string, unknown>;
  if (check.algorithm !== 'SHA-256' || typeof check.digest !== 'string' || !/^[a-f0-9]{64}$/.test(check.digest)) throw new Error('The bundle checksum metadata is invalid.');
  if (!Array.isArray(value.records)) throw new Error('The bundle records field is invalid.');
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('The bundle export date is invalid.');
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification requires a modern browser with Web Crypto, usually over HTTPS.');
  const { integrity: _integrity, ...payload } = value;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (!constantTimeEqual(actual, check.digest)) throw new Error('Checksum mismatch: the bundle may be corrupted or modified. No records were changed.');
  return { recordCount: value.records.length, exportedAt: value.exportedAt };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
