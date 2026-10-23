import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient, ObjectStatus } from '@prisma/client';
import { z } from 'zod';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const sessionDays = 30;

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(cors({ origin: clientOrigin.split(',').map(v => v.trim()), credentials: false }));
app.use(express.json({ limit: '3mb' }));
// In-memory throttle is a useful baseline for a single API process; production deployments should also rate-limit at the edge.
const authAttempts = new Map<string, { count: number; resetAt: number }>();
function authRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = `${req.ip ?? 'unknown'}:${req.path}`;
  const now = Date.now();
  const current = authAttempts.get(key);
  if (!current || current.resetAt <= now) authAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
  else if (current.count >= 12) { res.status(429).json({ error: 'Too many authentication attempts. Try again in 15 minutes.' }); return; }
  else current.count++;
  if (authAttempts.size > 5000) for (const [entry, value] of authAttempts) if (value.resetAt <= now) authAttempts.delete(entry);
  next();
}

const registerSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(12).max(200),
  householdName: z.string().trim().min(1).max(80).default('My household')
});
const loginSchema = z.object({ email: z.string().trim().email().transform(v => v.toLowerCase()), password: z.string().min(1).max(200) });
const objectSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(''),
  category: z.string().max(80).default('Other'),
  status: z.enum(['ACTIVE','ARCHIVED','LOST']).default('ACTIVE'),
  room: z.string().max(120).default(''),
  location: z.string().max(200).default(''),
  container: z.string().max(120).default(''),
  serialNumber: z.string().max(200).default(''),
  purchaseDate: z.string().max(20).refine(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Purchase date must use YYYY-MM-DD.').default(''),
  warrantyUntil: z.string().max(20).refine(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Warranty date must use YYYY-MM-DD.').default(''),
  imageData: z.string().max(2_700_000).optional(),
  qrToken: z.string().min(1).max(100),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

type AuthContext = { userId: string; householdId: string; role: string };
declare global { namespace Express { interface Request { auth?: AuthContext } } }

function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
function bearer(req: express.Request): string | null {
  const value = req.header('authorization');
  if (!value?.startsWith('Bearer ')) return null;
  return value.slice(7).trim() || null;
}
async function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const token = bearer(req);
    if (!token) { res.status(401).json({ error: 'Authentication required.' }); return; }
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { memberships: true } } } });
    if (!session || session.expiresAt <= new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      res.status(401).json({ error: 'Session expired. Sign in again.' }); return;
    }
    const membership = session.user.memberships[0];
    if (!membership) { res.status(403).json({ error: 'No household membership found.' }); return; }
    req.auth = { userId: session.userId, householdId: membership.householdId, role: membership.role };
    next();
  } catch (error) { next(error); }
}
function issueToken() { return randomBytes(32).toString('base64url'); }

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'objectos-api', timestamp: new Date().toISOString() }));

app.post('/api/auth/register', authRateLimit, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid registration details.' }); return; }
    const { email, password, householdName } = parsed.data;
    if (await prisma.user.findUnique({ where: { email } })) { res.status(409).json({ error: 'An account with this email already exists.' }); return; }
    const passwordHash = await bcrypt.hash(password, 12);
    const token = issueToken();
    const user = await prisma.user.create({
      data: {
        email, passwordHash,
        memberships: { create: { role: 'OWNER', household: { create: { name: householdName } } } },
        sessions: { create: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + sessionDays * 86400_000) } }
      },
      select: { id: true, email: true, createdAt: true }
    });
    res.status(201).json({ token, user, expiresInDays: sessionDays });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') { res.status(409).json({ error: 'An account with this email already exists.' }); return; }
    next(error);
  }
});

app.post('/api/auth/login', authRateLimit, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Enter a valid email and password.' }); return; }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const matches = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
    if (!user || !matches) { res.status(401).json({ error: 'Email or password is incorrect.' }); return; }
    const token = issueToken();
    await prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + sessionDays * 86400_000) } });
    res.json({ token, user: { id: user.id, email: user.email }, expiresInDays: sessionDays });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', authenticate, async (req, res, next) => {
  try {
    const token = bearer(req)!;
    await prisma.session.delete({ where: { tokenHash: hashToken(token) } });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/objects', authenticate, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim().slice(0, 120);
    const records = await prisma.storedObject.findMany({
      where: {
        householdId: req.auth!.householdId,
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { room: { contains: q, mode: 'insensitive' } }, { location: { contains: q, mode: 'insensitive' } }, { container: { contains: q, mode: 'insensitive' } }, { serialNumber: { contains: q, mode: 'insensitive' } }] } : {})
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(records);
  } catch (error) { next(error); }
});

app.post('/api/objects', authenticate, async (req, res, next) => {
  try {
    const parsed = objectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid object record.' }); return; }
    const data = parsed.data;
    const record = await prisma.storedObject.create({
      data: {
        ...data,
        status: data.status as ObjectStatus,
        householdId: req.auth!.householdId,
        ...(data.createdAt ? { createdAt: new Date(data.createdAt) } : {}),
        ...(data.updatedAt ? { updatedAt: new Date(data.updatedAt) } : {})
      }
    });
    res.status(201).json(record);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') { res.status(409).json({ error: 'This object ID or QR token already exists.' }); return; }
    next(error);
  }
});

app.put('/api/objects/:id', authenticate, async (req, res, next) => {
  try {
    const parsed = objectSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid object record.' }); return; }
    const existing = await prisma.storedObject.findFirst({ where: { id: req.params.id, householdId: req.auth!.householdId } });
    if (!existing) { res.status(404).json({ error: 'Object not found.' }); return; }
    const data = parsed.data;
    const record = await prisma.storedObject.update({
      where: { id: existing.id },
      data: {
        name: data.name, description: data.description, category: data.category, status: data.status as ObjectStatus,
        room: data.room, location: data.location, container: data.container, serialNumber: data.serialNumber,
        purchaseDate: data.purchaseDate, warrantyUntil: data.warrantyUntil, imageData: data.imageData, qrToken: data.qrToken
      }
    });
    res.json(record);
  } catch (error) { next(error); }
});

app.delete('/api/objects/:id', authenticate, async (req, res, next) => {
  try {
    const result = await prisma.storedObject.deleteMany({ where: { id: req.params.id, householdId: req.auth!.householdId } });
    if (!result.count) { res.status(404).json({ error: 'Object not found.' }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  console.error('[ObjectOS API]', message);
  res.status(500).json({ error: 'The server could not complete this request.' });
});

app.listen(port, () => {
  console.log(`ObjectOS API listening on http://localhost:${port}`);
});

process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
