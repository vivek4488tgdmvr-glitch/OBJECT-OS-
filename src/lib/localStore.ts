import type { ObjectDraft, ObjectRecord } from '../types';

const DB_NAME = 'objectos-local';
const DB_VERSION = 2;
const STORE = 'objects';
const QUEUE = 'outbox';

export interface QueuedChange {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  createdAt: string;
  attempts?: number;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Local database is unavailable in this browser context.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open local database.'));
    request.onblocked = () => reject(new Error('Database upgrade is blocked by another open ObjectOS tab. Close other tabs and retry.'));
  });
}

async function transact<T>(stores: string | string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let result!: T;
    let settled = false;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
      const req = action(tx);
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => { if (!settled) { settled = true; reject(req.error ?? new Error('Database request failed.')); } };
      tx.oncomplete = () => { db.close(); if (!settled) { settled = true; resolve(result!); } };
      tx.onerror = () => { db.close(); if (!settled) { settled = true; reject(tx.error ?? new Error('Database transaction failed.')); } };
      tx.onabort = () => { db.close(); if (!settled) { settled = true; reject(tx.error ?? new Error('Database transaction was aborted.')); } };
    } catch (error) { db.close(); reject(error); }
  });
}

export async function getAllLocal(): Promise<ObjectRecord[]> {
  const records = await transact<ObjectRecord[]>(STORE, 'readonly', tx => tx.objectStore(STORE).getAll());
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveLocal(record: ObjectRecord): Promise<void> {
  validateRecord(record);
  await transact<IDBValidKey>(STORE, 'readwrite', tx => tx.objectStore(STORE).put(record));
}
export async function saveManyLocal(records: ObjectRecord[]): Promise<void> {
  records.forEach(validateRecord);
  if (!records.length) return;
  await transact<IDBValidKey>(STORE, 'readwrite', tx => {
    const store = tx.objectStore(STORE);
    let last: IDBRequest<IDBValidKey> | undefined;
    records.forEach(record => { last = store.put(record); });
    return last!;
  });
}

export async function saveAndQueue(record: ObjectRecord, change: QueuedChange): Promise<void> {
  validateRecord(record);
  await transact<IDBValidKey>([STORE, QUEUE], 'readwrite', tx => {
    tx.objectStore(STORE).put(record);
    return tx.objectStore(QUEUE).put(change);
  });
}
export async function deleteAndQueue(id: string, change: QueuedChange): Promise<void> {
  await transact<IDBValidKey>([STORE, QUEUE], 'readwrite', tx => {
    tx.objectStore(STORE).delete(id);
    return tx.objectStore(QUEUE).put(change);
  });
}
export async function saveManyAndQueue(records: ObjectRecord[], changes: QueuedChange[]): Promise<void> {
  records.forEach(validateRecord);
  if (records.length !== changes.length) throw new Error('Each imported record must have exactly one queued sync change.');
  if (!records.length) return;
  await transact<IDBValidKey>([STORE, QUEUE], 'readwrite', tx => {
    const objects = tx.objectStore(STORE); const queue = tx.objectStore(QUEUE);
    records.forEach(record => objects.put(record));
    let last: IDBRequest<IDBValidKey> | undefined;
    changes.forEach(change => { last = queue.put(change); });
    return last!;
  });
}

export async function deleteLocal(id: string): Promise<void> {
  await transact<undefined>(STORE, 'readwrite', tx => tx.objectStore(STORE).delete(id));
}
export async function queueChange(change: QueuedChange): Promise<void> {
  await transact<IDBValidKey>(QUEUE, 'readwrite', tx => tx.objectStore(QUEUE).put(change));
}
export async function getQueuedChanges(): Promise<QueuedChange[]> {
  return transact<QueuedChange[]>(QUEUE, 'readonly', tx => tx.objectStore(QUEUE).getAll());
}
export async function clearQueuedChange(id: string): Promise<void> {
  await transact<undefined>(QUEUE, 'readwrite', tx => tx.objectStore(QUEUE).delete(id));
}
export async function updateQueuedChange(change: QueuedChange): Promise<void> {
  await transact<IDBValidKey>(QUEUE, 'readwrite', tx => tx.objectStore(QUEUE).put(change));
}
export async function clearLocal(): Promise<void> {
  await transact<undefined>([STORE, QUEUE], 'readwrite', tx => {
    tx.objectStore(QUEUE).clear();
    return tx.objectStore(STORE).clear();
  });
}
export function validateRecord(value: unknown): asserts value is ObjectRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid object record.');
  const r = value as Partial<ObjectRecord>;
  if (typeof r.id !== 'string' || !r.id.trim()) throw new Error('Object record is missing an ID.');
  if (typeof r.name !== 'string' || !r.name.trim()) throw new Error('Every object must have a name.');
  if (typeof r.description !== 'string' || typeof r.category !== 'string' || typeof r.room !== 'string' || typeof r.location !== 'string' || typeof r.container !== 'string' || typeof r.serialNumber !== 'string' || typeof r.purchaseDate !== 'string' || typeof r.warrantyUntil !== 'string') throw new Error(`Object “${r.name}” has invalid details or location data.`);
  if (r.status !== 'ACTIVE' && r.status !== 'ARCHIVED' && r.status !== 'LOST') throw new Error(`Object “${r.name}” has an invalid status.`);
  if (typeof r.qrToken !== 'string' || typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') throw new Error(`Object “${r.name}” is missing required metadata.`);
  if (r.imageData !== undefined && (typeof r.imageData !== 'string' || r.imageData.length > 2_800_000)) throw new Error(`Object “${r.name}” has invalid or oversized image data.`);
  if (r.name.length > 120 || r.description.length > 1000 || r.category.length > 80 || r.room.length > 120 || r.location.length > 200 || r.container.length > 120 || r.serialNumber.length > 200) throw new Error(`Object “${r.name}” contains a field that exceeds the supported length.`);
  if (!Number.isFinite(Date.parse(r.createdAt)) || !Number.isFinite(Date.parse(r.updatedAt))) throw new Error(`Object “${r.name}” has invalid timestamps.`);
  if (r.purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(r.purchaseDate)) throw new Error(`Object “${r.name}” has an invalid purchase date.`);
  if (r.warrantyUntil && !/^\d{4}-\d{2}-\d{2}$/.test(r.warrantyUntil)) throw new Error(`Object “${r.name}” has an invalid warranty date.`);
}
export function toRecord(draft: ObjectDraft, existing?: Partial<ObjectRecord>): ObjectRecord {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? crypto.randomUUID(), name: draft.name.trim(), description: draft.description.trim(),
    category: draft.category.trim() || 'Other', status: draft.status ?? (existing?.status as ObjectRecord['status']) ?? 'ACTIVE',
    room: draft.room.trim(), location: draft.location.trim(), container: draft.container.trim(),
    serialNumber: draft.serialNumber.trim(), purchaseDate: draft.purchaseDate, warrantyUntil: draft.warrantyUntil,
    imageData: draft.imageData ?? existing?.imageData, qrToken: existing?.qrToken ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now, updatedAt: now, source: 'local'
  };
}
