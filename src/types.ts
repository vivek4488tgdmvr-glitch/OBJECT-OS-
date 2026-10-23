export type ObjectStatus = 'ACTIVE' | 'ARCHIVED' | 'LOST';
export interface ObjectRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ObjectStatus;
  room: string;
  location: string;
  container: string;
  serialNumber: string;
  purchaseDate: string;
  warrantyUntil: string;
  imageData?: string;
  qrToken: string;
  updatedAt: string;
  createdAt: string;
  source: 'local' | 'server';
}
export interface ObjectDraft {
  status?: ObjectStatus;
  name: string;
  description: string;
  category: string;
  room: string;
  location: string;
  container: string;
  serialNumber: string;
  purchaseDate: string;
  warrantyUntil: string;
  imageData?: string;
}
