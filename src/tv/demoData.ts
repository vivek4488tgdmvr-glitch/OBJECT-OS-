import type { ObjectRecord } from '../types';

const day = 86400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10);

function rec(n: number, p: Partial<ObjectRecord> & Pick<ObjectRecord, 'name' | 'room'>): ObjectRecord {
  return {
    id: `demo-${n}`, description: '', category: 'Other', status: 'ACTIVE', location: '', container: '',
    serialNumber: '', purchaseDate: '', warrantyUntil: '', qrToken: `OBJOS-DEMO-${n}`,
    createdAt: iso(-n), updatedAt: iso(-n), source: 'local', ...p,
  };
}

/** Sample household so the TV experience can be demonstrated on first launch. */
export const demoHousehold: ObjectRecord[] = [
  rec(1, { name: 'Dyson V11 Vacuum', room: 'Hallway', location: 'Closet shelf 2', container: 'Cleaning bin', category: 'Electronics', serialNumber: 'DY-V11-8841', warrantyUntil: date(21), description: 'Charger and spare filter are in the same bin.' }),
  rec(2, { name: 'Passport & travel documents', room: 'Bedroom', location: 'Wardrobe top drawer', container: 'Grey document box', category: 'Documents', description: 'Includes family passports and travel insurance.' }),
  rec(3, { name: 'Cordless Drill', room: 'Garage', location: 'Workbench', container: 'Blue toolbox', category: 'Tools', serialNumber: 'BD-5521', warrantyUntil: date(-40) }),
  rec(4, { name: 'Drill bit set', room: 'Garage', location: 'Workbench', container: 'Blue toolbox', category: 'Tools' }),
  rec(5, { name: 'Air Fryer', room: 'Kitchen', location: 'Pantry bottom shelf', category: 'Kitchen', warrantyUntil: date(210), serialNumber: 'AF-2210' }),
  rec(6, { name: 'Wi-Fi Router manual', room: 'Living Room', location: 'TV unit drawer', container: 'Grey document box', category: 'Documents', description: 'Purchase receipt stapled to the cover.' }),
  rec(7, { name: 'Winter Jackets', room: 'Bedroom', location: 'Under bed', container: 'Storage box 4', category: 'Clothing' }),
  rec(8, { name: 'Camera Tripod', room: 'Garage', location: 'Shelf above door', container: 'Black duffel', category: 'Electronics', status: 'LOST', description: 'Last seen after the birthday trip.' }),
  rec(9, { name: 'Espresso Machine', room: 'Kitchen', location: 'Counter', category: 'Kitchen', warrantyUntil: date(12), serialNumber: 'ES-9003' }),
  rec(10, { name: 'Board Games', room: 'Living Room', location: 'Cabinet', container: 'Storage box 2', category: 'Collectibles' }),
];
