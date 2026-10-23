import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifyPortabilityBundle } from './portability.ts';

async function fixture() {
  const payload = { format: 'objectos-portability-bundle', formatVersion: 1, exportedAt: '2026-10-20T00:00:00.000Z', records: [{ id: 'one', name: 'Camera' }], pendingChanges: [] };
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return JSON.stringify({ ...payload, integrity: { algorithm: 'SHA-256', digest: checksum } });
}

test('verifies a valid portability bundle and reports record count', async () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  try { assert.deepEqual(await verifyPortabilityBundle(await fixture()), { recordCount: 1, exportedAt: '2026-10-20T00:00:00.000Z' }); }
  finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original }); }
});

test('rejects a modified payload', async () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  try {
    const bundle = JSON.parse(await fixture()); bundle.records[0].name = 'Changed';
    await assert.rejects(() => verifyPortabilityBundle(JSON.stringify(bundle)), /checksum mismatch/i);
  } finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original }); }
});

test('rejects malformed JSON and unsupported bundles', async () => {
  await assert.rejects(() => verifyPortabilityBundle('{broken'), /valid JSON/i);
  await assert.rejects(() => verifyPortabilityBundle(JSON.stringify({ format: 'other', formatVersion: 1 })), /unsupported/i);
});
