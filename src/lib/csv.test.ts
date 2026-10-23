import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCsv, parseCsv } from './csv.ts';

test('CSV parser preserves commas, escaped quotes, and embedded newlines', () => {
  const source = 'name,description\r\n"Camera, mirrorless","A ""great"" camera\nwith a line break"\r\n';
  assert.deepEqual(parseCsv(source), [['name','description'], ['Camera, mirrorless','A "great" camera\nwith a line break']]);
});

test('CSV encoder round-trips arbitrary text fields', () => {
  const input = [{ name: 'Box, 01', description: 'Tape "red"\nand labels', category: 'Tools' }];
  assert.deepEqual(parseCsv(encodeCsv(['name','description','category'], input)), [['name','description','category'], ['Box, 01','Tape "red"\nand labels','Tools']]);
});

test('CSV parser rejects an unclosed quoted field', () => {
  assert.throws(() => parseCsv('name,description\n"Camera,not closed'), /unclosed quoted field/i);
});
