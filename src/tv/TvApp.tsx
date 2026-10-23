import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ObjectRecord } from '../types';
import { getAllLocal, saveManyLocal } from '../lib/localStore';
import { demoHousehold } from './demoData';
import { focusFirst, useSpatialNav } from './useSpatialNav';
import './tv.css';

type Screen =
  | { name: 'home' }
  | { name: 'room'; room: string }
  | { name: 'box'; room: string; container: string }
  | { name: 'search' }
  | { name: 'item'; id: string };

const KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
const DAY = 86400_000;
const UNSORTED = 'Unsorted';

function warrantyState(r: ObjectRecord): { label: string; tone: 'ok' | 'soon' | 'expired' } | null {
  if (!r.warrantyUntil) return null;
  const left = Math.ceil((Date.parse(r.warrantyUntil) - Date.now()) / DAY);
  if (Number.isNaN(left)) return null;
  if (left < 0) return { label: 'Warranty expired', tone: 'expired' };
  if (left <= 30) return { label: `Warranty ends in ${left} day${left === 1 ? '' : 's'}`, tone: 'soon' };
  return { label: `Under warranty until ${r.warrantyUntil}`, tone: 'ok' };
}

function pathOf(r: ObjectRecord) {
  return [r.room || UNSORTED, r.location, r.container].filter(Boolean);
}

function ItemTile({ r, onOpen }: { r: ObjectRecord; onOpen: (id: string) => void }) {
  const w = warrantyState(r);
  return (
    <button className="tv-tile tv-item" data-focusable onClick={() => onOpen(r.id)}>
      <span className="tv-item-thumb">{r.imageData ? <img src={r.imageData} alt="" /> : r.name.slice(0, 1).toUpperCase()}</span>
      <span className="tv-item-name">{r.name}</span>
      <span className="tv-item-where">{pathOf(r).slice(0, 2).join(' · ')}</span>
      {r.status === 'LOST' && <span className="tv-chip lost">Lost</span>}
      {r.status !== 'LOST' && w && w.tone !== 'ok' && <span className={`tv-chip ${w.tone}`}>{w.label}</span>}
    </button>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="tv-row">
      <h2>{title}{hint && <small>{hint}</small>}</h2>
      <div className="tv-row-scroll">{children}</div>
    </section>
  );
}

export default function TvApp() {
  const [objects, setObjects] = useState<ObjectRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stack, setStack] = useState<Screen[]>([{ name: 'home' }]);
  const [query, setQuery] = useState('');
  const screen = stack[stack.length - 1]!;

  const load = useCallback(async () => {
    try { setObjects(await getAllLocal()); } catch { setObjects([]); }
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const push = useCallback((s: Screen) => setStack(st => [...st, s]), []);
  const goBack = useCallback(() => {
    if (stack.length <= 1) return false; // let the system handle Back on Home (exits the app)
    setStack(st => st.slice(0, -1));
    return true;
  }, [stack.length]);
  useSpatialNav(goBack);

  // Move focus to the first element every time the screen changes.
  useEffect(() => { const id = window.setTimeout(() => focusFirst('.tv-screen'), 60); return () => window.clearTimeout(id); }, [screen.name, 'room' in screen ? screen.room : '', 'container' in screen ? screen.container : '', 'id' in screen ? screen.id : '']);

  const visible = useMemo(() => objects.filter(o => o.status !== 'ARCHIVED'), [objects]);
  const rooms = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of visible) m.set(o.room.trim() || UNSORTED, (m.get(o.room.trim() || UNSORTED) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);
  const expiring = useMemo(() => visible.filter(o => { const w = warrantyState(o); return w && w.tone === 'soon'; }), [visible]);
  const lost = useMemo(() => visible.filter(o => o.status === 'LOST'), [visible]);
  const recent = useMemo(() => [...visible].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12), [visible]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return visible.filter(o => [o.name, o.description, o.category, o.room, o.location, o.container, o.serialNumber].some(v => v?.toLowerCase().includes(q)));
  }, [visible, query]);

  async function loadDemo() { await saveManyLocal(demoHousehold); await load(); }

  const openItem = (id: string) => push({ name: 'item', id });

  let body: React.ReactNode;
  if (screen.name === 'home') {
    body = (
      <>
        <header className="tv-hero">
          <div>
            <p className="tv-kicker">OBJECTOS · FIRE TV</p>
            <h1>Where did I put it?</h1>
            <p className="tv-sub">{visible.length} things remembered across {rooms.length} room{rooms.length === 1 ? '' : 's'}</p>
          </div>
          <button className="tv-tile tv-search-cta" data-focusable data-autofocus onClick={() => push({ name: 'search' })}>
            <span className="tv-search-icon" aria-hidden>⌕</span> Search your home
          </button>
        </header>
        {!visible.length && loaded && (
          <section className="tv-empty">
            <h2>Your household is empty</h2>
            <p>Add items on ObjectOS for web or mobile, or try a sample home to explore this screen.</p>
            <button className="tv-tile tv-cta" data-focusable onClick={() => void loadDemo()}>Load sample household</button>
          </section>
        )}
        {rooms.length > 0 && (
          <Row title="Rooms">
            {rooms.map(([room, n]) => (
              <button key={room} className="tv-tile tv-room" data-focusable onClick={() => push({ name: 'room', room })}>
                <span className="tv-room-name">{room}</span><span className="tv-room-count">{n} item{n === 1 ? '' : 's'}</span>
              </button>
            ))}
          </Row>
        )}
        {expiring.length > 0 && <Row title="Warranties ending soon" hint="next 30 days">{expiring.map(r => <ItemTile key={r.id} r={r} onOpen={openItem} />)}</Row>}
        {lost.length > 0 && <Row title="Marked as lost">{lost.map(r => <ItemTile key={r.id} r={r} onOpen={openItem} />)}</Row>}
        {recent.length > 0 && <Row title="Recently updated">{recent.map(r => <ItemTile key={r.id} r={r} onOpen={openItem} />)}</Row>}
      </>
    );
  } else if (screen.name === 'room') {
    const inRoom = visible.filter(o => (o.room.trim() || UNSORTED) === screen.room);
    const boxes = [...new Set(inRoom.map(o => o.container.trim()).filter(Boolean))].sort();
    const loose = inRoom.filter(o => !o.container.trim());
    body = (
      <>
        <header className="tv-head"><p className="tv-kicker">ROOM</p><h1>{screen.room}</h1></header>
        {boxes.length > 0 && (
          <Row title="Boxes & containers">
            {boxes.map(c => (
              <button key={c} className="tv-tile tv-room" data-focusable onClick={() => push({ name: 'box', room: screen.room, container: c })}>
                <span className="tv-room-name">{c}</span><span className="tv-room-count">{inRoom.filter(o => o.container === c).length} inside</span>
              </button>
            ))}
          </Row>
        )}
        {loose.length > 0 && <Row title={boxes.length ? 'Not in a box' : 'Items'}>{loose.map(r => <ItemTile key={r.id} r={r} onOpen={openItem} />)}</Row>}
      </>
    );
  } else if (screen.name === 'box') {
    const inBox = visible.filter(o => (o.room.trim() || UNSORTED) === screen.room && o.container === screen.container);
    body = (
      <>
        <header className="tv-head"><p className="tv-kicker">{screen.room.toUpperCase()}</p><h1>{screen.container}</h1><p className="tv-sub">Inside this box</p></header>
        <Row title={`${inBox.length} item${inBox.length === 1 ? '' : 's'}`}>{inBox.map(r => <ItemTile key={r.id} r={r} onOpen={openItem} />)}</Row>
      </>
    );
  } else if (screen.name === 'search') {
    body = (
      <>
        <header className="tv-head"><p className="tv-kicker">SEARCH</p>
          <div className="tv-query" role="status" aria-live="polite">{query || <span className="tv-placeholder">Pick letters with the remote…</span>}<span className="tv-caret" /></div>
        </header>
        <div className="tv-keyboard" role="group" aria-label="On-screen keyboard">
          {KEYS.map(k => <button key={k} className="tv-key" data-focusable {...(k === 'A' ? { 'data-autofocus': true } : {})} onClick={() => setQuery(q => q + k.toLowerCase())}>{k}</button>)}
          <button className="tv-key wide" data-focusable onClick={() => setQuery(q => q + ' ')}>Space</button>
          <button className="tv-key wide" data-focusable onClick={() => setQuery(q => q.slice(0, -1))}>Delete</button>
          <button className="tv-key wide" data-focusable onClick={() => setQuery('')}>Clear</button>
        </div>
        {query.trim() && (
          <Row title={`${results.length} result${results.length === 1 ? '' : 's'}`}>
            {results.length ? results.map(r => <ItemTile key={r.id} r={r} onOpen={openItem} />) : <p className="tv-none">Nothing matches “{query}”.</p>}
          </Row>
        )}
      </>
    );
  } else {
    const r = objects.find(o => o.id === screen.id);
    if (!r) body = <header className="tv-head"><h1>Item not found</h1></header>;
    else {
      const w = warrantyState(r);
      const path = pathOf(r);
      body = (
        <>
          <header className="tv-head"><p className="tv-kicker">{r.category.toUpperCase()}{r.status !== 'ACTIVE' ? ` · ${r.status}` : ''}</p><h1>{r.name}</h1></header>
          <section className="tv-where" aria-label="Where it is">
            <p className="tv-where-label">IT'S IN</p>
            <ol className="tv-path">{path.map((p, i) => <li key={i}>{p}</li>)}</ol>
          </section>
          {r.description && <p className="tv-desc">{r.description}</p>}
          <dl className="tv-facts">
            {w && <div className={`tv-fact ${w.tone}`}><dt>Warranty</dt><dd>{w.label}</dd></div>}
            {r.serialNumber && <div className="tv-fact"><dt>Serial number</dt><dd>{r.serialNumber}</dd></div>}
            {r.purchaseDate && <div className="tv-fact"><dt>Purchased</dt><dd>{r.purchaseDate}</dd></div>}
          </dl>
          <div className="tv-actions">
            {r.container && <button className="tv-tile tv-cta" data-focusable data-autofocus onClick={() => push({ name: 'box', room: r.room.trim() || UNSORTED, container: r.container })}>See everything in {r.container}</button>}
            <button className="tv-tile tv-cta secondary" data-focusable {...(!r.container ? { 'data-autofocus': true } : {})} onClick={() => push({ name: 'room', room: r.room.trim() || UNSORTED })}>More in {r.room.trim() || UNSORTED}</button>
          </div>
        </>
      );
    }
  }

  return (
    <div className="tv-root">
      <div className="tv-safe">
        <nav className="tv-top" aria-label="Breadcrumb">
          <span className="tv-logo">ObjectOS</span>
          {stack.length > 1 && <span className="tv-backhint">Press Back to return</span>}
        </nav>
        <main className="tv-screen" key={JSON.stringify(screen)}>{body}</main>
      </div>
    </div>
  );
}
