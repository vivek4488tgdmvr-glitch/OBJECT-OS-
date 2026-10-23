import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowDownToLine, ArrowUpFromLine, Box as BoxIcon, Camera, Check, ChevronDown,
  AlertTriangle, CalendarClock, CircleHelp, Clock3, CopyCheck, Database, FileText, FileJson, HardDrive, Home, LayoutGrid, LockKeyhole,
  MapPin, Menu, Package, Plus, QrCode, Search, Settings2, ShieldCheck, Sparkles,
  Upload, Wifi, X, Wrench, FileCheck
} from 'lucide-react';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import type { ObjectDraft, ObjectRecord } from './types';
import { clearLocal, clearQueuedChange, deleteAndQueue, getAllLocal, getQueuedChanges, queueChange, saveAndQueue, saveLocal, saveManyAndQueue, toRecord, updateQueuedChange, validateRecord } from './lib/localStore';
import { encodeCsv, parseCsv } from './lib/csv';
import { decryptBackup, encryptBackup } from './lib/cryptoBackup';
import { verifyPortabilityBundle } from './lib/portability';
import { apiRequest, authenticate, checkApi, getSessionToken, logout, syncOutbox } from './lib/api';

type View = 'overview' | 'objects' | 'locations' | 'insights' | 'backups' | 'settings';
const emptyDraft: ObjectDraft = { status:'ACTIVE', name:'', description:'', category:'Electronics', room:'', location:'', container:'', serialNumber:'', purchaseDate:'', warrantyUntil:'' };
const categories = ['Electronics','Tools','Documents','Kitchen','Clothing','Furniture','Collectibles','Other'];
function relativeDate(date: string) {
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff/60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff/3600_000)}h ago`;
  return `${Math.floor(diff/86400_000)}d ago`;
}
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase(); }
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function IconTile({ icon: Icon, tone='green' }: { icon: typeof Package; tone?: 'green'|'blue'|'purple'|'orange' }) {
  return <span className={`icon-tile ${tone}`}><Icon size={19}/></span>;
}
function App() {
  const [objects,setObjects] = useState<ObjectRecord[]>([]);
  const [view,setView] = useState<View>('overview');
  const [query,setQuery] = useState('');
  const [selected,setSelected] = useState<string|null>(null);
  const [modal,setModal] = useState<'object'|'scan'|'qr'|'import'|null>(null);
  const [draft,setDraft] = useState<ObjectDraft>(emptyDraft);
  const [editing,setEditing] = useState<string|null>(null);
  const [notice,setNotice] = useState('');
  const [online,setOnline] = useState(navigator.onLine);
  const [apiOnline,setApiOnline] = useState(false);
  const [pending,setPending] = useState(0);
  const [busy,setBusy] = useState(false);
  const [authToken,setAuthToken] = useState<string|null>(()=>getSessionToken());
  const [authMode,setAuthMode] = useState<'login'|'register'>('login');
  const [authEmail,setAuthEmail] = useState('');
  const [authPassword,setAuthPassword] = useState('');
  const [householdName,setHouseholdName] = useState('My household');
  const [accountEmail,setAccountEmail] = useState('');
  const [backupPass,setBackupPass] = useState('');
  const [restoreFile,setRestoreFile] = useState<File|null>(null);
  const [verifyFile,setVerifyFile] = useState<File|null>(null);
  const [qrData,setQrData] = useState('');
  const [qrRecord,setQrRecord] = useState<ObjectRecord|null>(null);
  const [mobileMenu,setMobileMenu] = useState(false);
  const cameraRegion = useRef<HTMLDivElement>(null);
  const syncInFlight = useRef(false);
  const selectedRecord = objects.find(o=>o.id===selected) ?? null;

  const refresh = useCallback(async () => {
    try {
      const local = await getAllLocal();
      setObjects(local);
      setPending((await getQueuedChanges()).length);
    } catch {
      setObjects([]);
    }
    setApiOnline(await checkApi());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (online && getSessionToken()) void syncPendingChanges(); }, [online]);
  useEffect(() => {
    const onOnline=()=>setOnline(true), onOffline=()=>setOnline(false);
    window.addEventListener('online',onOnline); window.addEventListener('offline',onOffline);
    return ()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);};
  }, []);
  useEffect(() => {
    // Ask browsers to reduce the chance of automatic eviction; the user can still export backups.
    if ('storage' in navigator && 'persist' in navigator.storage) void navigator.storage.persist().catch(()=>false);
  }, []);
  useEffect(() => {
    const onKeyDown=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;
      const editingText=target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k') {
        event.preventDefault(); navTo('objects'); window.setTimeout(()=>document.querySelector<HTMLInputElement>('.search-box input')?.focus(),0);
      } else if (!editingText && event.key.toLowerCase()==='n') { event.preventDefault(); beginCreate(); }
      else if (event.key==='Escape') { setModal(null); setMobileMenu(false); }
    };
    window.addEventListener('keydown',onKeyDown);
    return ()=>window.removeEventListener('keydown',onKeyDown);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id=window.setTimeout(()=>setNotice(''),4000);
    return ()=>window.clearTimeout(id);
  },[notice]);
  useEffect(() => {
    if (modal!=='scan' || !cameraRegion.current) return;
    let cancelled=false;
    const instance=new Html5Qrcode('objectos-reader');
    instance.start({facingMode:'environment'},{fps:10,qrbox:{width:220,height:220}}, async decoded => {
      if (cancelled) return;
      const match=objects.find(o=>decoded.includes(o.qrToken) || decoded.includes(o.id));
      if (match) { setSelected(match.id); setModal(null); setNotice(`Found ${match.name}`); }
      else { setQuery(decoded); setModal(null); setView('objects'); setNotice('QR scanned. Search results updated.'); }
      try { await instance.stop(); } catch {}
    },()=>{}).catch(err=>setNotice(`Camera unavailable: ${String(err).slice(0,120)}`));
    return ()=>{cancelled=true; if(instance.isScanning) void instance.stop().catch(()=>{});};
  },[modal,objects]);

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return objects;
    return objects.filter(o=>[o.name,o.description,o.category,o.room,o.location,o.container,o.serialNumber,o.qrToken].some(v=>v?.toLowerCase().includes(q)));
  },[objects,query]);
  const locations=useMemo(()=>Array.from(new Set(objects.map(o=>o.room).filter(Boolean))).sort(),[objects]);
  const containers=useMemo(()=>Array.from(new Set(objects.map(o=>o.container).filter(Boolean))).sort(),[objects]);
  const activeCount=objects.filter(o=>o.status==='ACTIVE').length;
  const warrantyCount=objects.filter(o=>o.warrantyUntil && new Date(o.warrantyUntil)>=new Date()).length;
  const roomCounts=locations.map(room=>({room,count:objects.filter(o=>o.room===room).length}));
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 86400_000);
  const expiringWarranties = objects.filter(o => o.warrantyUntil && new Date(o.warrantyUntil) >= now && new Date(o.warrantyUntil) <= horizon);
  const expiredWarranties = objects.filter(o => o.warrantyUntil && new Date(o.warrantyUntil) < now);
  const missingLocations = objects.filter(o => !o.room.trim() && !o.location.trim() && !o.container.trim());
  const staleRecords = objects.filter(o => now.getTime() - new Date(o.updatedAt).getTime() > 180 * 86400_000);
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, ObjectRecord[]>();
    for (const record of objects) {
      const key = record.serialNumber.trim().toLowerCase() ? `serial:${record.serialNumber.trim().toLowerCase()}` : `name:${record.name.trim().toLowerCase()}`;
      if (!record.name.trim()) continue;
      const group = groups.get(key) ?? [];
      group.push(record); groups.set(key, group);
    }
    return [...groups.values()].filter(group => group.length > 1);
  }, [objects]);

  async function syncPendingChanges() {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    try {
    let queued = (await getQueuedChanges()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    if (!getSessionToken() || !navigator.onLine) { setPending(queued.length); return; }
    try {
      // Reconcile the server snapshot before replaying the durable outbox. Local pending edits always win until acknowledged.
      const remote = await apiRequest<Array<Record<string, unknown>>>('/objects');
      const local = await getAllLocal();
      const localById = new Map(local.map(record=>[record.id,record]));
      const pendingIds = new Set(queued.map(change=>String((change.body as {id?:string}|undefined)?.id ?? '')));
      const remoteIds = new Set<string>();
      for (const raw of remote) {
        if (typeof raw.id !== 'string') continue;
        remoteIds.add(raw.id);
        if (pendingIds.has(raw.id)) continue;
        const remoteRecord: ObjectRecord = {
          id: String(raw.id), name: String(raw.name ?? ''), description: String(raw.description ?? ''), category: String(raw.category ?? 'Other'),
          status: raw.status === 'ARCHIVED' || raw.status === 'LOST' ? raw.status : 'ACTIVE', room: String(raw.room ?? ''), location: String(raw.location ?? ''),
          container: String(raw.container ?? ''), serialNumber: String(raw.serialNumber ?? ''), purchaseDate: String(raw.purchaseDate ?? ''), warrantyUntil: String(raw.warrantyUntil ?? ''),
          ...(typeof raw.imageData === 'string' ? { imageData: raw.imageData } : {}), qrToken: String(raw.qrToken ?? ''),
          createdAt: String(raw.createdAt ?? ''), updatedAt: String(raw.updatedAt ?? ''), source: 'server'
        };
        validateRecord(remoteRecord);
        const localRecord = localById.get(remoteRecord.id);
        if (!localRecord) await saveLocal(remoteRecord);
        else if (Date.parse(localRecord.updatedAt) > Date.parse(remoteRecord.updatedAt)) {
          await queueChange({ id: crypto.randomUUID(), method: 'PUT', body: localRecord, createdAt: new Date().toISOString(), attempts: 0 });
        } else await saveLocal(remoteRecord);
      }
      const refreshedLocal = await getAllLocal();
      const refreshedQueue = await getQueuedChanges();
      const refreshedPendingIds = new Set(refreshedQueue.map(change=>String((change.body as {id?:string}|undefined)?.id ?? '')));
      for (const record of refreshedLocal) {
        if (!remoteIds.has(record.id) && !refreshedPendingIds.has(record.id)) {
          await queueChange({ id: crypto.randomUUID(), method: 'POST', body: record, createdAt: new Date().toISOString(), attempts: 0 });
        }
      }
      queued = (await getQueuedChanges()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      setPending((await getQueuedChanges()).length);
      setNotice(`Cloud sync paused: ${error instanceof Error ? error.message : 'Could not read household records.'}`);
      return;
    }
    if (!queued.length) { setPending(0); setObjects(await getAllLocal()); return; }
    const result = await syncOutbox(queued, clearQueuedChange, updateQueuedChange);
    setPending((await getQueuedChanges()).length);
    setObjects(await getAllLocal());
    if (result.error) setNotice(`Sync paused: ${result.error}`);
    else if (result.synced) setNotice(`Synced ${result.synced} change${result.synced===1?'':'s'} with your household.`);
    } finally { syncInFlight.current = false; }
  }
  async function persist(record:ObjectRecord, method:'POST'|'PUT'='PUT') {
    // Persist locally and enqueue first; a network failure never loses the user's edit.
    await saveAndQueue(record, {id:crypto.randomUUID(),method,body:record,createdAt:new Date().toISOString(),attempts:0});
    setObjects(await getAllLocal());
    setPending((await getQueuedChanges()).length);
    if (getSessionToken() && navigator.onLine) await syncPendingChanges();
    else setNotice('Saved on this device. Sign in and connect to the internet to sync it.');
  }
  async function submitAuth(event:React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await authenticate(authMode, authEmail, authPassword, householdName);
      setAuthToken(result.token); setAccountEmail(result.user.email); setAuthPassword('');
      setNotice(`Signed in as ${result.user.email}. Syncing pending changes…`);
      await syncPendingChanges();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not authenticate.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    try { await logout(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Signed out locally; server session may expire naturally.'); }
    finally { setAuthToken(null); setAccountEmail(''); setBusy(false); setNotice('Signed out. Your local records remain on this device.'); }
  }
  async function saveObject(event:React.FormEvent) {
    event.preventDefault();
    if(!draft.name.trim()) return;
    setBusy(true);
    try {
      const old=objects.find(o=>o.id===editing);
      const record=toRecord(draft,old);
      await persist(record,old?'PUT':'POST');
      setModal(null); setEditing(null); setDraft(emptyDraft); setSelected(record.id);
    } catch(err) { setNotice(err instanceof Error?err.message:'Could not save object.'); }
    finally {setBusy(false);}
  }
  function beginCreate() {setEditing(null);setDraft(emptyDraft);setModal('object');}
  function beginEdit(record:ObjectRecord) {
    setEditing(record.id);
    setDraft({status:record.status,name:record.name,description:record.description,category:record.category,room:record.room,location:record.location,container:record.container,serialNumber:record.serialNumber,purchaseDate:record.purchaseDate,warrantyUntil:record.warrantyUntil,imageData:record.imageData});
    setModal('object');
  }
  async function removeObject(record:ObjectRecord) {
    if(!window.confirm(`Delete "${record.name}" from this device?`)) return;
    await deleteAndQueue(record.id, {id:crypto.randomUUID(),method:'DELETE',body:{id:record.id},createdAt:new Date().toISOString(),attempts:0});
    setObjects(await getAllLocal());setSelected(null);setPending((await getQueuedChanges()).length);
    if (getSessionToken() && navigator.onLine) await syncPendingChanges();
    else setNotice('Object removed locally. Sign in and connect to sync the deletion.');
  }
  async function createQr(record:ObjectRecord) {
    setQrRecord(record);
    const payload=JSON.stringify({app:'objectos',id:record.id,token:record.qrToken});
    setQrData(await QRCode.toDataURL(payload,{width:720,margin:2,color:{dark:'#0b1424',light:'#ffffff'}}));
    setModal('qr');
  }
  async function exportBackup() {
    setBusy(true);
    try {
      const local=await getAllLocal();
      const blob=await encryptBackup(local,backupPass);
      downloadBlob(blob,`objectos-backup-${new Date().toISOString().slice(0,10)}.oob`);
      setNotice(`Encrypted backup created for ${local.length} objects.`);
    } catch(err) {setNotice(err instanceof Error?err.message:'Backup failed.');}
    finally {setBusy(false);}
  }
  async function importBackup() {
    if(!restoreFile) return;
    setBusy(true);
    try {
      const records=await decryptBackup(restoreFile,backupPass);
      const safeRecords=records.map(item=>({...item,source:'local' as const}));
      safeRecords.forEach(validateRecord);
      const current = await getAllLocal();
      const existingIds = new Set(current.map(record => record.id));
      const overlap = safeRecords.filter(record => existingIds.has(record.id)).length;
      const duplicates = safeRecords.length - new Set(safeRecords.map(record => record.id)).size;
      if (duplicates) throw new Error(`Restore contains ${duplicates} duplicate record ID(s). No records were changed.`);
      const summary = `Restore ${safeRecords.length} record(s)?\n\n${overlap} existing record(s) will be replaced and ${safeRecords.length-overlap} new record(s) added.\n\nA pre-restore snapshot will be downloaded first.`;
      if (!window.confirm(summary)) return;
      const snapshot = await encryptBackup(current, backupPass);
      downloadBlob(snapshot, `objectos-pre-restore-${new Date().toISOString().slice(0,10)}.oob`);
      await saveManyAndQueue(safeRecords, safeRecords.map(record => ({ id: crypto.randomUUID(), method: existingIds.has(record.id) ? 'PUT' as const : 'POST' as const, body: record, createdAt: new Date().toISOString(), attempts: 0 }))); 
      setObjects(await getAllLocal());setPending((await getQueuedChanges()).length);setModal(null);setRestoreFile(null);setNotice(`Restored ${records.length} objects to this device. Sync will run when signed in and online.`);
    } catch(err) {setNotice(err instanceof Error?err.message:'Restore failed.');}
    finally {setBusy(false);}
  }
  async function verifyBundleFile() {
    if (!verifyFile) return;
    setBusy(true);
    try {
      if (verifyFile.size > 100 * 1024 * 1024) throw new Error('Portability bundles must be smaller than 100 MB.');
      const result = await verifyPortabilityBundle(await verifyFile.text());
      setNotice(`Integrity verified: ${result.recordCount} records, exported ${result.exportedAt}. Checksum confirms the file matches its checksum; it does not prove who created it.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not verify this portability bundle.');
    } finally { setBusy(false); }
  }

  async function exportPortabilityBundle() {
    setBusy(true);
    try {
      const local = await getAllLocal();
      const queued = await getQueuedChanges();
      const invalid: Array<{ id: string; name: string; reason: string }> = [];
      for (const record of local) {
        try { validateRecord(record); }
        catch (error) { invalid.push({ id: String(record.id ?? ''), name: String(record.name ?? ''), reason: error instanceof Error ? error.message : 'Validation failed' }); }
      }
      const bundle = {
        format: 'objectos-portability-bundle',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        app: { name: 'ObjectOS', version: '0.2.0' },
        portabilityNotice: 'Keep this file private: it may contain sensitive household inventory information. This JSON bundle is not encrypted.',
        summary: { recordCount: local.length, pendingChanges: queued.length, invalidRecords: invalid.length },
        audit: {
          missingNames: local.filter(record => !record.name?.trim()).map(record => record.id),
          missingLocation: local.filter(record => !record.room?.trim() && !record.location?.trim() && !record.container?.trim()).map(record => record.id),
          duplicateSerialNumbers: [...new Set(local.map(record => record.serialNumber?.trim().toLowerCase()).filter(Boolean))].filter(serial => local.filter(record => record.serialNumber?.trim().toLowerCase() === serial).length > 1),
          invalidRecords: invalid,
        },
        records: local,
        pendingChanges: queued,
      };
      // A checksum helps detect accidental corruption during long-term storage or transfer.
      // It is not a digital signature and does not prove who created the file.
      const canonicalPayload = JSON.stringify(bundle);
      if (!globalThis.crypto?.subtle) throw new Error('This browser does not support SHA-256 integrity checks. Use a modern browser over HTTPS.');
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPayload));
      const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const portableBundle = { ...bundle, integrity: { algorithm: 'SHA-256', digest: checksum, scope: 'JSON bundle payload before the integrity field; corruption detection only, not a signature.' } };
      downloadBlob(new Blob([JSON.stringify(portableBundle, null, 2)], { type: 'application/json;charset=utf-8' }), `objectos-portability-${new Date().toISOString().slice(0,10)}.json`);
      setNotice(`Portability bundle exported with SHA-256 checksum: ${local.length} records, ${invalid.length} validation issues.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create portability bundle.'); }
    finally { setBusy(false); }
  }

  function exportCsv() {
    const headers=['id','name','description','category','status','room','location','container','serialNumber','purchaseDate','warrantyUntil','qrToken','createdAt','updatedAt'];
    const csv=encodeCsv(headers,objects as unknown as Array<Record<string,unknown>>);
    downloadBlob(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}),'objectos-inventory.csv');
    setNotice('Inventory CSV exported.');
  }
  async function importCsv(file:File) {
    if (file.size > 25 * 1024 * 1024) throw new Error('CSV files must be smaller than 25 MB.');
    const rows=parseCsv(await file.text());
    if(rows.length<2) throw new Error('CSV has no object rows.');
    const headers=rows[0].map(v=>v.trim().replace(/^\uFEFF/,''));
    if(!headers.includes('name')) throw new Error('CSV must contain a “name” column.');
    const imported:ObjectRecord[]=[];
    for(const values of rows.slice(1)) {
      const row=Object.fromEntries(headers.map((h,i)=>[h,values[i]??'']));
      if(!String(row.name??'').trim()) continue;
      const record=toRecord({ ...emptyDraft,name:String(row.name),description:String(row.description??''),category:String(row.category??'Other'),room:String(row.room??''),location:String(row.location??''),container:String(row.container??''),serialNumber:String(row.serialNumber??''),purchaseDate:String(row.purchaseDate??''),warrantyUntil:String(row.warrantyUntil??'')});
      // Preserve identifiers and history only when valid; otherwise generate safe local IDs.
      if(typeof row.id==='string' && row.id.trim()) record.id=row.id.trim();
      if(typeof row.qrToken==='string' && row.qrToken.trim()) record.qrToken=row.qrToken.trim();
      if(typeof row.createdAt==='string' && !Number.isNaN(Date.parse(row.createdAt))) record.createdAt=row.createdAt;
      if(typeof row.updatedAt==='string' && !Number.isNaN(Date.parse(row.updatedAt))) record.updatedAt=row.updatedAt;
      if(row.status==='ACTIVE'||row.status==='ARCHIVED'||row.status==='LOST') record.status=row.status;
      validateRecord(record); imported.push(record);
    }
    const importedIds = imported.map(record => record.id);
    if (new Set(importedIds).size !== importedIds.length) throw new Error('CSV contains duplicate object IDs. Fix the file before importing.');
    const existing = await getAllLocal();
    const existingIds = new Set(existing.map(record => record.id));
    const overlaps = imported.filter(record => existingIds.has(record.id)).length;
    if (overlaps && !window.confirm(`${overlaps} imported record(s) have IDs already on this device and will replace those records. Continue?`)) return;
    await saveManyAndQueue(imported, imported.map(record => ({ id: crypto.randomUUID(), method: existingIds.has(record.id) ? 'PUT' as const : 'POST' as const, body: record, createdAt: new Date().toISOString(), attempts: 0 }))); 
    setObjects(await getAllLocal());setPending((await getQueuedChanges()).length);setModal(null);setNotice(`Imported ${imported.length} objects. Sync will run when signed in and online.`);
  }
  function navTo(next:View) {setView(next);setMobileMenu(false);setSelected(null);}
  const title:Record<View,string>={overview:'Find it. Remember it. Keep it.',objects:'Search objects',locations:'Rooms & boxes',insights:'A smarter household memory',backups:'Backup & restore',settings:'Settings'};
  const subtitle:Record<View,string>={overview:'Your household, organized for life.',objects:'Find any object, room, box, or document.',locations:'Know exactly where everything belongs.',insights:'Practical checks from the information you have recorded.',backups:'Keep your household memory safe and portable.',settings:'Manage your ObjectOS workspace.'};

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu?'sidebar-open':''}`}>
      <div className="brand"><span className="brand-mark"><img src="/objectos-crimson-eclipse-icon.png" alt="ObjectOS Crimson Eclipse cube logo" /></span><span>object<span className="brand-accent">os</span><small>PHYSICAL WORLD MEMORY</small></span><button className="icon-button mobile-close" onClick={()=>setMobileMenu(false)} aria-label="Close menu"><X/></button></div>
      <div className="workspace-switch"><span className="workspace-avatar">O</span><span><b>My household</b><small>Personal workspace</small></span><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        <button className={`nav-item ${view==='overview'?'active':''}`} onClick={()=>navTo('overview')}><LayoutGrid size={18}/> Home</button>
        <button className={`nav-item ${view==='objects'?'active':''}`} onClick={()=>navTo('objects')}><Search size={18}/> Search <span className="nav-count">{objects.length}</span></button>
        <button className={`nav-item ${view==='locations'?'active':''}`} onClick={()=>navTo('locations')}><Home size={18}/> Rooms & boxes</button>
        <button className={`nav-item ${view==='insights'?'active':''}`} onClick={()=>navTo('insights')}><Sparkles size={18}/> Smart insights <span className="nav-count">{expiringWarranties.length+missingLocations.length+duplicateGroups.length}</span></button>
      </nav>
      <div className="nav-label nav-label-spaced">YOUR HOUSEHOLD</div>
      <nav>
        <button className={`nav-item ${view==='backups'?'active':''}`} onClick={()=>navTo('backups')}><ShieldCheck size={18}/> Backup & restore</button>
        <button className={`nav-item ${view==='settings'?'active':''}`} onClick={()=>navTo('settings')}><Settings2 size={18}/> Settings</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><span className="privacy-icon"><LockKeyhole size={16}/></span><div><b>Your things. Your data.</b><p>Local-first storage with encrypted export.</p></div></div>
        <div className="profile-row"><div className="profile-avatar">O</div><div><b>ObjectOS User</b><small>Personal account</small></div><button className="icon-button" onClick={()=>navTo('settings')} aria-label="Account settings"><Settings2 size={17}/></button></div>
      </div>
    </aside>
    {mobileMenu&&<button className="mobile-scrim" onClick={()=>setMobileMenu(false)} aria-label="Close navigation"/>}
    <main className="main-content">
      <header className="topbar">
        <button className="icon-button menu-button" onClick={()=>setMobileMenu(true)} aria-label="Open navigation"><Menu/></button>
        <div className="breadcrumb"><span>ObjectOS</span><span className="crumb-slash">/</span><b>{view==='overview'?'Overview':view==='objects'?'Inventory':view==='locations'?'Locations':view==='insights'?'Smart insights':view==='backups'?'Data & security':'Settings'}</b></div>
        <div className="topbar-right"><span className={`connection-pill ${online?'online':'offline'}`}><span className="connection-dot"/>{online?'Device online':'Offline mode'}</span><button className="avatar-small" onClick={()=>navTo('settings')} aria-label="Open settings">O</button></div>
      </header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> FIND IT. REMEMBER IT. KEEP IT.</div><h1>{title[view]}</h1><p>{subtitle[view]}</p></div><div className="heading-actions"><button className="button button-secondary" onClick={()=>{setModal('scan')}}><QrCode size={17}/> Scan QR</button><button className="button button-primary" onClick={beginCreate}><Plus size={18}/> Add object</button></div></div>
        <div className="status-strip"><span><span className={`status-dot ${apiOnline?'green':'amber'}`}/>{apiOnline?'API connected':'Local workspace'}</span><span className="status-divider"/><span><Database size={14}/>{objects.length} saved records</span><span className="status-divider"/><span><Clock3 size={14}/>{pending} pending sync</span><span className="status-spacer"/><button onClick={()=>void refresh()} className="text-button">Refresh <ArrowDownToLine size={14}/></button></div>

        {view==='overview'&&<>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-top"><span>Total objects</span><IconTile icon={Package}/></div><div className="stat-value">{objects.length.toString().padStart(2,'0')}</div><div className="stat-foot"><span className="stat-note">Across your spaces</span></div></div>
            <div className="stat-card"><div className="stat-top"><span>Active records</span><IconTile icon={Check} tone="blue"/></div><div className="stat-value">{activeCount.toString().padStart(2,'0')}</div><div className="stat-foot"><span className="stat-note">Currently tracked</span></div></div>
            <div className="stat-card"><div className="stat-top"><span>Places tracked</span><IconTile icon={Home} tone="purple"/></div><div className="stat-value">{locations.length.toString().padStart(2,'0')}</div><div className="stat-foot"><span className="stat-note">Rooms and areas</span></div></div>
            <div className="stat-card"><div className="stat-top"><span>Warranty records</span><IconTile icon={ShieldCheck} tone="orange"/></div><div className="stat-value">{warrantyCount.toString().padStart(2,'0')}</div><div className="stat-foot"><span className="stat-note">With valid end dates</span></div></div>
          </div>
          <section className="hero-card"><div className="hero-copy"><span className="hero-kicker"><span className="hero-kicker-dot"/> YOUR HOUSEHOLD, ORGANIZED FOR LIFE</span><h2>Find it. Remember it.<br/><em>Keep it.</em></h2><p>Your household, organized for life. Every object has a place, a history, and a way back to you.</p><div className="hero-actions"><button className="button button-light" onClick={beginCreate}>Add your first thing <Plus size={17}/></button><button className="hero-link" onClick={()=>navTo('objects')}>Explore inventory <span>↗</span></button></div></div><div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-box"><Package size={72} strokeWidth={1.15}/><span className="art-box-label">MEMORY / 001</span></div><div className="art-chip chip-one"><QrCode size={15}/><span>QR linked</span></div><div className="art-chip chip-two"><MapPin size={15}/><span>Place known</span></div><div className="art-chip chip-three"><ShieldCheck size={15}/><span>Kept safe</span></div></div></section>
          <div className="section-row"><div><h2>Recently updated</h2><p>Your most recently updated belongings, all in one place.</p></div><button className="text-button" onClick={()=>navTo('objects')}>View all objects <span>→</span></button></div>
          <ObjectTable records={objects.slice(0,5)} onSelect={r=>setSelected(r.id)} onEdit={beginEdit} onQr={r=>void createQr(r)} onDelete={removeObject}/>
          <div className="bottom-grid"><section className="panel"><div className="panel-heading"><div><h3>Your spaces</h3><p>Where things are recorded</p></div><button className="icon-button" onClick={()=>navTo('locations')} aria-label="View locations"><ArrowDownToLine size={16}/></button></div>{roomCounts.length?roomCounts.slice(0,4).map(({room,count})=><button className="space-row" key={room} onClick={()=>{setQuery(room);navTo('objects')}}><span className="space-icon"><Home size={17}/></span><span className="space-name">{room}</span><span className="space-count">{count} {count===1?'object':'objects'}</span><span className="space-arrow">↗</span></button>):<EmptySmall text="Add a room while creating an object."/>}</section><section className="panel"><div className="panel-heading"><div><h3>Quick actions</h3><p>Keep your memory up to date</p></div><span className="quick-icon"><Wrench size={17}/></span></div><button className="quick-action" onClick={beginCreate}><span className="quick-action-icon"><Plus size={18}/></span><span><b>Record an object</b><small>Add details and a location</small></span><span className="space-arrow">↗</span></button><button className="quick-action" onClick={()=>setModal('scan')}><span className="quick-action-icon"><QrCode size={18}/></span><span><b>Scan a label</b><small>Open a linked object or box</small></span><span className="space-arrow">↗</span></button><button className="quick-action" onClick={()=>navTo('backups')}><span className="quick-action-icon"><ShieldCheck size={18}/></span><span><b>Protect your data</b><small>Export an encrypted backup</small></span><span className="space-arrow">↗</span></button></section></div>
        </>}

        {view==='objects'&&<><div className="inventory-toolbar"><div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Where is my camera? Search objects, rooms, boxes…" autoFocus/><kbd>⌘ K</kbd></div><button className="button button-secondary" onClick={exportCsv}><ArrowDownToLine size={16}/> Export CSV</button><button className="button button-secondary" onClick={()=>setModal('import')}><Upload size={16}/> Import CSV</button></div><div className="filter-row"><span>{filtered.length} {filtered.length===1?'result':'results'}</span><span className="filter-tag"><span className="status-dot green"/> Active inventory</span>{query&&<button className="text-button" onClick={()=>setQuery('')}>Clear search <X size={13}/></button>}</div><ObjectTable records={filtered} onSelect={r=>setSelected(r.id)} onEdit={beginEdit} onQr={r=>void createQr(r)} onDelete={removeObject}/></>}

        {view==='locations'&&<div className="location-grid">{locations.map(room=><section className="location-card" key={room}><div className="location-card-top"><IconTile icon={Home} tone="purple"/><span>{objects.filter(o=>o.room===room).length} objects</span></div><h3>{room}</h3><p>{objects.filter(o=>o.room===room).map(o=>o.name).slice(0,3).join(' · ')}</p><button className="text-button" onClick={()=>{setQuery(room);navTo('objects')}}>View objects <span>→</span></button></section>)}{containers.map(container=><section className="location-card" key={`container-${container}`}><div className="location-card-top"><IconTile icon={BoxIcon} tone="orange"/><span>{objects.filter(o=>o.container===container).length} objects</span></div><h3>{container}</h3><p>{objects.filter(o=>o.container===container).map(o=>o.name).slice(0,3).join(' · ')}</p><button className="text-button" onClick={()=>{setQuery(container);navTo('objects')}}>View contents <span>→</span></button></section>)}{!locations.length&&!containers.length&&<div className="empty-state"><MapPin size={28}/><h3>No places yet</h3><p>Add an object with a room or container to start mapping your spaces.</p><button className="button button-primary" onClick={beginCreate}><Plus size={16}/> Add object</button></div>}</div>}

        {view==='insights'&&<div className="insights-page">
          <section className="insights-banner"><div className="insights-banner-icon"><Sparkles size={24}/></div><div><span className="eyebrow">HOUSEHOLD INTELLIGENCE</span><h2>Small details, fewer surprises.</h2><p>These checks run locally against your inventory. They do not send your household data to an AI service.</p></div><button className="button button-secondary" onClick={()=>navTo('objects')}>Review inventory <span>→</span></button></section>
          <div className="insight-grid">
            <button className="insight-card" onClick={()=>{setQuery('');navTo('objects')}}><span className="insight-icon red"><CalendarClock size={20}/></span><span className="insight-number">{expiringWarranties.length}</span><b>Warranties ending soon</b><small>Within the next 30 days</small><span className="insight-link">Review records →</span></button>
            <button className="insight-card" onClick={()=>{setQuery('');navTo('objects')}}><span className="insight-icon blue"><MapPin size={20}/></span><span className="insight-number">{missingLocations.length}</span><b>Items without a place</b><small>No room, location, or box recorded</small><span className="insight-link">Find missing places →</span></button>
            <button className="insight-card" onClick={()=>{setQuery('');navTo('objects')}}><span className="insight-icon amber"><CopyCheck size={20}/></span><span className="insight-number">{duplicateGroups.length}</span><b>Possible duplicates</b><small>Matching names or serial numbers</small><span className="insight-link">Check records →</span></button>
            <button className="insight-card" onClick={()=>{setQuery('');navTo('objects')}}><span className="insight-icon purple"><Clock3 size={20}/></span><span className="insight-number">{staleRecords.length}</span><b>Not reviewed recently</b><small>Records unchanged for over 180 days</small><span className="insight-link">Review old records →</span></button>
          </div>
          <div className="insight-columns"><section className="panel"><div className="panel-heading"><div><h3>Warranty timeline</h3><p>Based on the dates saved in your records</p></div><CalendarClock size={19}/></div>{expiringWarranties.length===0&&expiredWarranties.length===0?<div className="insight-empty"><Check size={18}/><span>No warranty dates need attention.</span></div>:<>{expiringWarranties.slice(0,5).map(record=><button className="insight-record" key={record.id} onClick={()=>setSelected(record.id)}><span className="insight-record-mark"><CalendarClock size={16}/></span><span><b>{record.name}</b><small>Warranty ends {record.warrantyUntil}</small></span><span className="insight-record-state soon">Soon</span></button>)}{expiredWarranties.slice(0,5).map(record=><button className="insight-record" key={record.id} onClick={()=>setSelected(record.id)}><span className="insight-record-mark expired"><AlertTriangle size={16}/></span><span><b>{record.name}</b><small>Warranty ended {record.warrantyUntil}</small></span><span className="insight-record-state expired">Ended</span></button>)}</>}</section>
          <section className="panel"><div className="panel-heading"><div><h3>Possible duplicate groups</h3><p>Suggestions only—nothing is merged or deleted automatically.</p></div><CopyCheck size={19}/></div>{duplicateGroups.length===0?<div className="insight-empty"><Check size={18}/><span>No matching names or serial numbers found.</span></div>:duplicateGroups.slice(0,6).map((group,i)=><div className="duplicate-group" key={`${group[0].id}-${i}`}><div><b>{group.length} records match</b><small>{group[0].serialNumber.trim()?`Serial: ${group[0].serialNumber}`:`Name: ${group[0].name}`}</small></div><div className="duplicate-pills">{group.map(record=><button key={record.id} onClick={()=>setSelected(record.id)}>{record.name}</button>)}</div></div>)}</section></div>
          <section className="panel" style={{marginTop:18}}><div className="panel-heading"><div><h3>Long-term portability audit</h3><p>Export a readable data bundle with a basic integrity report and pending local changes.</p></div><FileJson size={20}/></div><div className="insight-columns"><div><div className="insight-number">{objects.length}</div><b>Records included</b><small>Includes full local records and image data, if saved.</small></div><div><div className="insight-number">{pending}</div><b>Pending changes</b><small>Local changes awaiting the configured API.</small></div></div><div className="security-note" style={{marginTop:14}}><AlertTriangle size={16}/><span>JSON portability bundles are not encrypted and may contain private household details. Store them securely. For password-protected copies, use Encrypted Backup.</span></div><button className="button button-primary" style={{marginTop:14}} disabled={busy} onClick={()=>void exportPortabilityBundle()}><FileJson size={16}/>{busy?'Preparing bundle…':'Export portability bundle + audit'}</button><div style={{marginTop:20,paddingTop:18,borderTop:'1px solid var(--line, #273246)'}}><h3 style={{margin:'0 0 6px'}}>Verify an archived bundle</h3><p style={{margin:'0 0 12px',fontSize:12,color:'var(--muted)'}}>Check the SHA-256 checksum before trusting a stored or transferred JSON bundle. Verification does not restore or modify records.</p><input className="form-input file-input" type="file" accept=".json,application/json" aria-label="Portability bundle to verify" onChange={e=>setVerifyFile(e.target.files?.[0]??null)}/><button className="button button-secondary" style={{marginTop:10}} disabled={busy||!verifyFile} onClick={()=>void verifyBundleFile()}><FileCheck size={16}/>{busy?'Verifying…':'Verify checksum'}</button></div></section>
          <p className="insights-disclaimer"><ShieldCheck size={14}/> Insights are heuristic reminders, not proof of duplicate ownership or warranty coverage. Confirm details with your original documents.</p>
        </div>}

        {view==='backups'&&<div className="backup-layout"><section className="panel backup-panel"><div className="backup-heading-icon"><LockKeyhole size={22}/></div><h2>Encrypted backup</h2><p>Make a portable, password-protected copy of your inventory. Encryption happens in this browser before the file is downloaded.</p><label className="field-label" htmlFor="backup-pass">Backup passphrase</label><input id="backup-pass" className="form-input" type="password" autoComplete="new-password" value={backupPass} onChange={e=>setBackupPass(e.target.value)} placeholder="At least 12 characters"/><div className="security-note"><ShieldCheck size={16}/><span>Use a strong passphrase and keep it safe. ObjectOS cannot recover a lost passphrase.</span></div><button className="button button-primary full-button" disabled={busy||backupPass.length<12||!objects.length} onClick={()=>void exportBackup()}><ArrowDownToLine size={17}/>{busy?'Working…':'Create encrypted backup'}</button><div className="backup-meta"><span><Database size={14}/>{objects.length} object records</span><span><LockKeyhole size={14}/> AES-256-GCM</span></div></section><section className="panel backup-panel"><div className="backup-heading-icon backup-icon-blue"><ArrowUpFromLine size={22}/></div><h2>Restore a backup</h2><p>Restore a previously exported .oob file. Existing object IDs are preserved so records can be updated instead of duplicated.</p><label className="field-label" htmlFor="restore-file">Backup file</label><input id="restore-file" className="form-input file-input" type="file" accept=".oob,application/octet-stream,application/json" onChange={e=>setRestoreFile(e.target.files?.[0]??null)}/><label className="field-label" htmlFor="restore-pass">Backup passphrase</label><input id="restore-pass" className="form-input" type="password" autoComplete="current-password" value={backupPass} onChange={e=>setBackupPass(e.target.value)} placeholder="Enter the original passphrase"/><button className="button button-secondary full-button" disabled={busy||!restoreFile||backupPass.length<1} onClick={()=>void importBackup()}><ArrowUpFromLine size={17}/>{busy?'Restoring…':'Decrypt and restore'}</button><div className="security-note"><CircleHelp size={16}/><span>Restore merges by object ID and overwrites matching local records. Export a backup before restoring if needed.</span></div></section></div>}

        {view==='settings'&&<>
          <section className="panel settings-panel account-panel" style={{marginBottom:16}}>
            <div className="panel-heading"><div><h3>Cloud account & sync</h3><p>Cloud sync requires a configured ObjectOS API and a signed-in household account.</p></div><span className="quick-icon"><Wifi size={17}/></span></div>
            {authToken ? <><div className="setting-row"><span className="setting-icon"><ShieldCheck size={18}/></span><span><b>{accountEmail || 'Authenticated session'}</b><small>{pending ? `${pending} local change(s) waiting to sync` : 'No pending local changes'}</small></span><span className={`setting-state ${apiOnline?'':'muted'}`}>{apiOnline?'API online':'API offline'}</span></div><div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}><button className="button button-secondary" disabled={busy||!online} onClick={()=>void syncPendingChanges()}><Wifi size={16}/> Sync now</button><button className="button button-secondary" disabled={busy} onClick={()=>void signOut()}>Sign out</button></div></> : <form onSubmit={e=>void submitAuth(e)} className="auth-form"><div className="segmented-auth"><button type="button" className={authMode==='login'?'chosen':''} onClick={()=>setAuthMode('login')}>Sign in</button><button type="button" className={authMode==='register'?'chosen':''} onClick={()=>setAuthMode('register')}>Create account</button></div><div className="form-grid"><div className="form-field full"><label htmlFor="auth-email">Email address</label><input id="auth-email" className="form-input" type="email" required maxLength={254} autoComplete="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com"/></div>{authMode==='register'&&<div className="form-field full"><label htmlFor="household-name">Household name</label><input id="household-name" className="form-input" required maxLength={80} value={householdName} onChange={e=>setHouseholdName(e.target.value)} placeholder="My household"/></div>}<div className="form-field full"><label htmlFor="auth-password">Password {authMode==='register'?'(at least 12 characters)':''}</label><input id="auth-password" className="form-input" type="password" required minLength={authMode==='register'?12:1} maxLength={200} autoComplete={authMode==='login'?'current-password':'new-password'} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder={authMode==='register'?'Create a strong password':'Your password'}/></div></div><button className="button button-primary" type="submit" disabled={busy||!online}>{busy?'Connecting…':authMode==='login'?'Sign in and sync':'Create account and sync'}</button><p className="muted-note">Your inventory stays local-first. Signing in enables queued changes to sync; it does not automatically merge another device's inventory into this browser.</p></form>}
          </section>
          <div className="settings-layout"><section className="panel settings-panel"><div className="panel-heading"><div><h3>Workspace</h3><p>Local-first personal inventory</p></div><span className="quick-icon"><Home size={17}/></span></div><div className="setting-row"><span className="setting-icon"><Database size={18}/></span><span><b>Local database</b><small>IndexedDB on this browser profile</small></span><span className="setting-state">Enabled</span></div><div className="setting-row"><span className="setting-icon"><Wifi size={18}/></span><span><b>API connection</b><small>{apiOnline?'API health check passed':'Server API not connected'}</small></span><span className={`setting-state ${apiOnline?'':'muted'}`}>{apiOnline?'Connected':'Local only'}</span></div><div className="setting-row"><span className="setting-icon"><LockKeyhole size={18}/></span><span><b>Encrypted backup</b><small>Client-side AES-GCM file export</small></span><button className="text-button" onClick={()=>navTo('backups')}>Configure →</button></div><div className="setting-row"><span className="setting-icon"><HardDrive size={18}/></span><span><b>Export inventory</b><small>Download a portable CSV file</small></span><button className="text-button" onClick={exportCsv}>Export →</button></div><div className="setting-row"><span className="setting-icon"><Archive size={18}/></span><span><b>Clear local workspace</b><small>Remove locally stored objects and pending changes</small></span><button className="danger-button" onClick={async()=>{if(window.confirm('Clear all local ObjectOS records and pending changes? Export a backup first if you need the data.')){await clearLocal();setObjects([]);setPending(0);setSelected(null);setNotice('Local workspace cleared.')}}}>Clear data</button></div></section><section className="panel settings-panel"><div className="panel-heading"><div><h3>About this build</h3><p>Product foundations</p></div><span className="quick-icon"><CircleHelp size={17}/></span></div><div className="about-block"><span className="about-mark"><img src="/objectos-crimson-eclipse-icon.png" alt="ObjectOS cube logo" /></span><div><h3>ObjectOS <span className="version-tag">0.2.0</span></h3><p>Find it. Remember it. Keep it.</p></div></div><div className="about-facts"><div><span>Architecture</span><b>Local-first PWA</b></div><div><span>Backup format</span><b>Encrypted .oob</b></div><div><span>Storage</span><b>IndexedDB + API-ready</b></div></div><p className="about-disclaimer">This build stores your records locally and supports encrypted file backup. Cloud sync is available only after configuring and deploying the API and database. Multi-device conflict resolution and Fire TV support remain separate work.</p></section></div></>}
      </div>
      <footer className="footer"><span>© 2026 ObjectOS <span className="footer-dot">·</span> Find it. Remember it. Keep it.</span><span><span className="footer-live-dot"/> Designed for the things that matter.</span></footer>
    </main>

    {selectedRecord&&<div className="detail-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="detail-panel"><div className="detail-top"><span className="eyebrow">OBJECT RECORD</span><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Close object details"><X/></button></div><div className="detail-art"><div className="detail-art-orbit"/>{selectedRecord.imageData?<img src={selectedRecord.imageData} alt={selectedRecord.name}/>:<div className="detail-monogram">{initials(selectedRecord.name)}</div>}</div><div className="detail-title-row"><div><span className="category-pill">{selectedRecord.category}</span><h2>{selectedRecord.name}</h2><p>{selectedRecord.description||'No description has been added yet.'}</p></div></div><div className="detail-location"><MapPin size={18}/><div><small>LAST RECORDED LOCATION</small><b>{[selectedRecord.room,selectedRecord.location].filter(Boolean).join(' · ')||'No location recorded'}</b>{selectedRecord.container&&<span>Inside {selectedRecord.container}</span>}</div></div><div className="detail-facts"><div><span>Last updated</span><b>{relativeDate(selectedRecord.updatedAt)}</b></div><div><span>Record status</span><b><span className="status-dot green"/> {selectedRecord.status.toLowerCase()}</b></div>{selectedRecord.serialNumber&&<div><span>Serial number</span><b>{selectedRecord.serialNumber}</b></div>}{selectedRecord.purchaseDate&&<div><span>Purchased</span><b>{selectedRecord.purchaseDate}</b></div>}{selectedRecord.warrantyUntil&&<div><span>Warranty until</span><b>{selectedRecord.warrantyUntil}</b></div>}</div><div className="detail-actions"><button className="button button-primary" onClick={()=>{beginEdit(selectedRecord);setSelected(null)}}>Edit record</button><button className="button button-secondary" onClick={()=>void createQr(selectedRecord)}><QrCode size={16}/> QR label</button></div><button className="detail-delete" onClick={()=>void removeObject(selectedRecord)}>Delete this record</button><p className="detail-footnote"><Clock3 size={13}/> Location is user-recorded, not GPS-verified.</p></aside></div>}

    {modal==='object'&&<div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><form className="modal-card object-modal" onSubmit={e=>void saveObject(e)}><div className="modal-heading"><div><span className="eyebrow">{editing?'UPDATE RECORD':'NEW MEMORY'}</span><h2>{editing?'Edit object':'Add an object'}</h2><p>Record what it is and where you last left it.</p></div><button type="button" className="icon-button" onClick={()=>setModal(null)} aria-label="Close"><X/></button></div><div className="form-grid"><div className="form-field full"><label htmlFor="obj-name">Object name *</label><input id="obj-name" className="form-input" autoFocus required maxLength={120} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="e.g. USB-C laptop charger"/></div><div className="form-field"><label htmlFor="obj-category">Category</label><select id="obj-category" className="form-input" value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></div><div className="form-field"><label htmlFor="obj-status">Record status</label><select id="obj-status" className="form-input" value={draft.status??'ACTIVE'} onChange={e=>setDraft({...draft,status:e.target.value as ObjectRecord['status']})}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option><option value="LOST">Lost / missing</option></select></div><div className="form-field"><label htmlFor="obj-room">Room / area</label><input id="obj-room" className="form-input" value={draft.room} onChange={e=>setDraft({...draft,room:e.target.value})} placeholder="e.g. Bedroom"/></div><div className="form-field full"><label htmlFor="obj-location">Specific location</label><input id="obj-location" className="form-input" value={draft.location} onChange={e=>setDraft({...draft,location:e.target.value})} placeholder="e.g. Top drawer of the desk"/></div><div className="form-field"><label htmlFor="obj-container">Container / box</label><input id="obj-container" className="form-input" value={draft.container} onChange={e=>setDraft({...draft,container:e.target.value})} placeholder="e.g. Electronics Box 02"/></div><div className="form-field"><label htmlFor="obj-serial">Serial number</label><input id="obj-serial" className="form-input" value={draft.serialNumber} onChange={e=>setDraft({...draft,serialNumber:e.target.value})} placeholder="Optional"/></div><div className="form-field full"><label htmlFor="obj-description">Description / notes</label><textarea id="obj-description" className="form-input" rows={3} maxLength={1000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="What makes this item easy to recognize?"/></div><div className="form-field"><label htmlFor="obj-purchase">Purchase date</label><input id="obj-purchase" className="form-input" type="date" value={draft.purchaseDate} onChange={e=>setDraft({...draft,purchaseDate:e.target.value})}/></div><div className="form-field"><label htmlFor="obj-warranty">Warranty ends</label><input id="obj-warranty" className="form-input" type="date" value={draft.warrantyUntil} onChange={e=>setDraft({...draft,warrantyUntil:e.target.value})}/></div><div className="form-field full"><label htmlFor="obj-photo">Photo</label><input id="obj-photo" className="form-input file-input" type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2_000_000){setNotice('Choose an image under 2 MB.');return;}const reader=new FileReader();reader.onload=()=>setDraft({...draft,imageData:String(reader.result)});reader.readAsDataURL(file);}}/>{draft.imageData&&<div className="photo-preview"><img src={draft.imageData} alt="Object preview"/><button type="button" className="text-button" onClick={()=>setDraft({...draft,imageData:undefined})}>Remove photo</button></div>}</div></div><div className="modal-footer"><span className="required-note">* Required field</span><div><button type="button" className="button button-secondary" onClick={()=>setModal(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy||!draft.name.trim()}>{busy?'Saving…':editing?'Save changes':'Save object'} <Check size={16}/></button></div></div></form></div>}

    {modal==='scan'&&<div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><div className="modal-card scan-modal"><div className="modal-heading"><div><span className="eyebrow">QUICK RETRIEVAL</span><h2>Scan a QR label</h2><p>Point your camera at an ObjectOS object or container label.</p></div><button className="icon-button" onClick={()=>setModal(null)} aria-label="Close scanner"><X/></button></div><div id="objectos-reader" ref={cameraRegion} className="qr-reader"/><div className="scan-help"><Camera size={17}/><span>Allow camera access when prompted. If scanning fails, search by the object's name or QR token.</span></div><div className="scan-fallback"><label htmlFor="qr-manual">Or enter a QR token / object ID</label><div className="search-box"><Search size={16}/><input id="qr-manual" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Paste token or object ID"/><button className="button button-primary button-compact" onClick={()=>{const match=objects.find(o=>query.includes(o.qrToken)||query.includes(o.id));if(match){setSelected(match.id);setModal(null);setNotice(`Found ${match.name}`)}else{setModal(null);setView('objects');setNotice('No exact QR match; showing search results.')}}}>Find</button></div></div></div></div>}

    {modal==='qr'&&qrRecord&&<div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><div className="modal-card qr-modal"><div className="modal-heading"><div><span className="eyebrow">PHYSICAL LABEL</span><h2>{qrRecord.name}</h2><p>Print or save this QR label and attach it to the object or its container.</p></div><button className="icon-button" onClick={()=>setModal(null)} aria-label="Close"><X/></button></div>{qrData&&<img className="qr-large" src={qrData} alt={`QR code for ${qrRecord.name}`}/>}<div className="qr-label-name">{qrRecord.name}</div><div className="qr-label-location">{[qrRecord.room,qrRecord.location,qrRecord.container].filter(Boolean).join(' · ')||'No location recorded'}</div><div className="qr-token">ID: {qrRecord.id}</div><div className="modal-footer"><button className="button button-secondary" onClick={()=>{if(qrData){const a=document.createElement('a');a.href=qrData;a.download=`objectos-${qrRecord.id}-qr.png`;a.click();}}}><ArrowDownToLine size={16}/> Download PNG</button><button className="button button-primary" onClick={()=>window.print()}>Print label</button></div><p className="muted-note">QR contains a local ObjectOS identifier, not private item details. Scanning works only where the corresponding record exists.</p></div></div>}

    {modal==='import'&&<div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><div className="modal-card import-modal"><div className="modal-heading"><div><span className="eyebrow">BULK IMPORT</span><h2>Import a CSV file</h2><p>Use the ObjectOS export format or a CSV with a <code>name</code> column.</p></div><button className="icon-button" onClick={()=>setModal(null)} aria-label="Close"><X/></button></div><div className="import-drop"><FileText size={28}/><p>Select a CSV inventory file from your device.</p><input type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];if(file)void importCsv(file).catch(err=>setNotice(String(err)));}}/></div><div className="modal-footer"><button className="button button-secondary" onClick={()=>setModal(null)}>Cancel</button><button className="button button-secondary" onClick={exportCsv}><ArrowDownToLine size={16}/> Download CSV template</button></div></div></div>}

    {notice&&<div className="toast" role="status"><span className="toast-icon"><Check size={16}/></span><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
  </div>;
}

function ObjectTable({records,onSelect,onEdit,onQr,onDelete}:{records:ObjectRecord[];onSelect:(r:ObjectRecord)=>void;onEdit:(r:ObjectRecord)=>void;onQr:(r:ObjectRecord)=>void;onDelete:(r:ObjectRecord)=>void}) {
  if(!records.length) return <div className="empty-state"><Package size={30}/><h3>No objects found</h3><p>Try a different search or add an object to your memory.</p></div>;
  return <div className="table-wrap"><table className="object-table"><thead><tr><th>OBJECT</th><th>LOCATION</th><th>CONTAINER</th><th>UPDATED</th><th>STATUS</th><th></th></tr></thead><tbody>{records.map(record=><tr key={record.id}><td><button className="object-cell" onClick={()=>onSelect(record)}><span className={`object-thumb thumb-${record.category.toLowerCase().replaceAll(' ','-')}`}>{record.imageData?<img src={record.imageData} alt=""/>:<span>{initials(record.name)}</span>}</span><span className="object-cell-copy"><b>{record.name}</b><small>{record.category}</small></span></button></td><td><span className="table-location"><MapPin size={14}/>{[record.room,record.location].filter(Boolean).join(' · ')||'—'}</span></td><td>{record.container?<span className="container-pill"><BoxIcon size={13}/>{record.container}</span>:<span className="muted-dash">—</span>}</td><td><span className="updated-cell">{relativeDate(record.updatedAt)}</span></td><td><span className={`record-status ${record.status.toLowerCase()}`}><span/>{record.status.toLowerCase()}</span></td><td><div className="row-actions"><button className="icon-button" onClick={()=>onQr(record)} aria-label={`Create QR for ${record.name}`} title="QR label"><QrCode size={16}/></button><button className="icon-button" onClick={()=>onEdit(record)} aria-label={`Edit ${record.name}`} title="Edit"><Settings2 size={16}/></button><button className="icon-button row-delete" onClick={()=>onDelete(record)} aria-label={`Delete ${record.name}`} title="Delete"><X size={16}/></button></div></td></tr>)}</tbody></table></div>;
}
function EmptySmall({text}:{text:string}) {return <div className="empty-small"><MapPin size={19}/><span>{text}</span></div>;}
export default App;