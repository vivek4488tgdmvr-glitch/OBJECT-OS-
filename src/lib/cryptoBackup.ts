import type { ObjectRecord } from '../types';
import { validateRecord } from './localStore';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FORMAT = 'OBJECTOS-ENCRYPTED-BACKUP';
const VERSION = 1;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']
  );
}
export async function encryptBackup(records: ObjectRecord[], passphrase: string): Promise<Blob> {
  records.forEach(validateRecord);
  if (passphrase.length < 12) throw new Error('Use a backup passphrase of at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = encoder.encode(JSON.stringify({ exportedAt: new Date().toISOString(), records }));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const payload = { format: FORMAT, version: VERSION, kdf: 'PBKDF2-SHA-256', iterations: 310000, cipher: 'AES-256-GCM', salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/octet-stream' });
}
export async function decryptBackup(file: File, passphrase: string): Promise<ObjectRecord[]> {
  if (file.size > 250 * 1024 * 1024) throw new Error('Backup file is larger than the supported 250 MB limit.');
  let payload: { format:string; version:number; salt:string; iv:string; ciphertext:string };
  try { payload = JSON.parse(await file.text()) as typeof payload; } catch { throw new Error('Backup file is not valid JSON.'); }
  if (payload.format !== FORMAT || payload.version !== VERSION || typeof payload.salt !== 'string' || typeof payload.iv !== 'string' || typeof payload.ciphertext !== 'string') throw new Error('Unsupported or invalid ObjectOS backup file.');
  const key = await deriveKey(passphrase, fromBase64(payload.salt));
  let plaintext: ArrayBuffer;
  try {
  plaintext = await crypto.subtle.decrypt(
  {
    name: 'AES-GCM',
    iv: Uint8Array.from(fromBase64(payload.iv)).buffer,
  },
  key,
  Uint8Array.from(fromBase64(payload.ciphertext)).buffer
);
  } catch {
    throw new Error('Unable to decrypt backup. Check the passphrase and file.');
  }
  const parsed = JSON.parse(decoder.decode(plaintext)) as { records: ObjectRecord[] };
  if (!Array.isArray(parsed.records)) throw new Error('Backup does not contain a valid object list.');
  parsed.records.forEach(validateRecord);
  return parsed.records;
}