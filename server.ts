import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { App as AdminApp, cert, getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { Auth as AdminAuth, getAuth as getAdminAuth } from 'firebase-admin/auth';
import { Firestore as AdminFirestore, getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const PORT = 3000;
const OWNER_ADMIN_EMAIL = 'tushargadariyagadariya@gmail.com';
const OWNER_ADMIN_UID = 'tisahara_owner_admin';
const OWNER_AUTH_FILE = path.resolve(process.cwd(), '.tisahara-owner-auth.json');
const OWNER_COOKIE_NAME = 'tisahara_owner_sid';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000;

interface StoredOwnerAuth {
  salt: string;
  hash: string;
  updatedAt: string;
}

interface OwnerSessionRecord {
  sid: string;
  expiresAt: number;
  createdAt: number;
}

interface LockoutRecord {
  failures: number;
  lockedUntil: number;
}

const sessionSigningSecret =
  process.env.OWNER_SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
const activeSessions = new Map<string, OwnerSessionRecord>();
const loginAttempts = new Map<string, LockoutRecord>();

interface FirebaseAppletConfig {
  projectId?: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    return JSON.parse(raw) as FirebaseAppletConfig;
  } catch {
    return {};
  }
}

function loadFirebaseApiKey(): string | null {
  return loadFirebaseConfig().apiKey || null;
}

interface AdminFirebaseBundle {
  app: AdminApp;
  auth: AdminAuth;
  db: AdminFirestore;
}

let cachedAdminBundle: AdminFirebaseBundle | null | undefined;

function getAdminFirebase(): AdminFirebaseBundle | null {
  if (cachedAdminBundle !== undefined) return cachedAdminBundle;
  try {
    const cfg = loadFirebaseConfig();
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

    let app: AdminApp | null = getAdminApps()[0] || null;
    if (!app && rawSa) {
      const parsedSa = JSON.parse(rawSa);
      app = initializeAdminApp({
        credential: cert(parsedSa),
        ...(cfg.projectId ? { projectId: cfg.projectId } : {}),
      });
    } else if (!app && gacPath && fs.existsSync(gacPath)) {
      const parsedSa = JSON.parse(fs.readFileSync(gacPath, 'utf8'));
      app = initializeAdminApp({
        credential: cert(parsedSa),
        ...(cfg.projectId ? { projectId: cfg.projectId } : {}),
      });
    }

    if (!app) {
      cachedAdminBundle = null;
      return null;
    }

    const adminAuth = getAdminAuth(app);
    const adminDb = cfg.firestoreDatabaseId
      ? getAdminFirestore(app, cfg.firestoreDatabaseId)
      : getAdminFirestore(app);
    cachedAdminBundle = { app, auth: adminAuth, db: adminDb };
    return cachedAdminBundle;
  } catch {
    cachedAdminBundle = null;
    return null;
  }
}

async function mintOwnerFirebaseCustomToken(): Promise<string | null> {
  const bundle = getAdminFirebase();
  if (!bundle) return null;
  try {
    await bundle.db.doc(`admins/${OWNER_ADMIN_UID}`).set(
      {
        uid: OWNER_ADMIN_UID,
        name: 'TISAHARA Owner Admin',
        email: OWNER_ADMIN_EMAIL,
        role: 'admin',
        referralCode: 'OWNRADMN',
        rewardPoints: 0,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return await bundle.auth.createCustomToken(OWNER_ADMIN_UID, { ownerAdmin: true });
  } catch {
    return null;
  }
}

function serializeFirestoreValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && val !== null) {
    const maybeTs = val as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') {
      return maybeTs.toMillis();
    }
    if (Array.isArray(val)) {
      return val.map(serializeFirestoreValue);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = serializeFirestoreValue(v);
    }
    return out;
  }
  return val;
}

function readStoredOwnerAuth(): StoredOwnerAuth | null {
  try {
    if (!fs.existsSync(OWNER_AUTH_FILE)) return null;
    const raw = fs.readFileSync(OWNER_AUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredOwnerAuth>;
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
      return {
        salt: parsed.salt,
        hash: parsed.hash,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredOwnerAuth(password: string): void {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const payload: StoredOwnerAuth = {
    salt,
    hash,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(OWNER_AUTH_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

function getEnvOwnerPassword(): string | null {
  const val =
    process.env.OWNER_PANEL_PASSWORD ||
    process.env['owner panel password'] ||
    process.env.owner_panel_password ||
    process.env.OWNER_SESSION_SECRET_PASSWORD;
  if (!val) return null;
  const cleaned = val.replace(/\r?\n$/, '');
  return cleaned.length > 0 ? cleaned : null;
}

function getOwnerPasswordState(): { configured: boolean; source: 'env' | 'hash' | 'none' } {
  if (getEnvOwnerPassword()) {
    return { configured: true, source: 'env' };
  }
  if (readStoredOwnerAuth()) {
    return { configured: true, source: 'hash' };
  }
  return { configured: false, source: 'none' };
}

function timingSafeStringMatch(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function verifyOwnerPassword(candidate: string): boolean {
  const envPw = getEnvOwnerPassword();
  if (envPw) {
    return timingSafeStringMatch(candidate, envPw);
  }
  const stored = readStoredOwnerAuth();
  if (!stored) return false;
  const derived = crypto.scryptSync(candidate, stored.salt, 64);
  const expected = Buffer.from(stored.hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function signSessionToken(sid: string, expiresAt: number): string {
  const payload = `${sid}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', sessionSigningSecret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined | null): OwnerSessionRecord | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [sid, expStr, sig] = parts;
  const expiresAt = Number(expStr);
  if (!sid || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    if (sid) activeSessions.delete(sid);
    return null;
  }
  const payload = `${sid}.${expStr}`;
  const expectedSig = crypto.createHmac('sha256', sessionSigningSecret).update(payload).digest('hex');
  if (!timingSafeStringMatch(sig, expectedSig)) return null;
  const record = activeSessions.get(sid);
  if (!record || record.expiresAt <= Date.now()) {
    activeSessions.delete(sid);
    return null;
  }
  return record;
}

type PayoutProviderCode = 'manual' | 'razorpayx' | 'cashfree';

interface PayoutProviderStatus {
  provider: PayoutProviderCode;
  connected: boolean;
  label: string;
  supportsAutoPayout: boolean;
  supportsBeneficiaryVerification: boolean;
}

function getPayoutProviderStatus(): PayoutProviderStatus {
  const configured = (process.env.PAYOUT_PROVIDER || 'manual').trim().toLowerCase();
  if (configured === 'razorpayx') {
    const hasCreds = Boolean(
      process.env.RAZORPAYX_KEY_ID?.trim() &&
        process.env.RAZORPAYX_KEY_SECRET?.trim() &&
        process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim()
    );
    return {
      provider: 'razorpayx',
      connected: hasCreds,
      label: hasCreds
        ? 'RazorpayX Payouts (Live API Configured)'
        : 'RazorpayX Selected — Credentials Missing (Manual UTR Mode)',
      supportsAutoPayout: hasCreds,
      supportsBeneficiaryVerification: hasCreds,
    };
  }
  if (configured === 'cashfree') {
    const hasCreds = Boolean(
      process.env.CASHFREE_PAYOUT_CLIENT_ID?.trim() &&
        process.env.CASHFREE_PAYOUT_CLIENT_SECRET?.trim()
    );
    return {
      provider: 'cashfree',
      connected: hasCreds,
      label: hasCreds
        ? 'Cashfree Payouts (Live API Configured)'
        : 'Cashfree Selected — Credentials Missing (Manual UTR Mode)',
      supportsAutoPayout: hasCreds,
      supportsBeneficiaryVerification: hasCreds,
    };
  }
  return {
    provider: 'manual',
    connected: false,
    label: 'Manual Bank Transfer & Owner UTR Verification',
    supportsAutoPayout: false,
    supportsBeneficiaryVerification: false,
  };
}

function getBankVaultKey(): Buffer {
  const raw = process.env.BANK_VAULT_SECRET?.trim() || sessionSigningSecret;
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptBankVault(payload: Record<string, string>): string {
  const key = getBankVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decryptBankVault(token: string): Record<string, string> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const [, ivHex, tagHex, encHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getBankVaultKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plain) as Record<string, string>;
  } catch {
    return null;
  }
}

function maskBankAccountNumber(accountNumber: string): { masked: string; last4: string } {
  const last4 = accountNumber.slice(-4);
  const masked = `${'X'.repeat(Math.max(4, accountNumber.length - 4))}${last4}`;
  return { masked, last4 };
}

function hashBankAccountNumber(accountNumber: string, ifscCode: string): string {
  return crypto
    .createHmac('sha256', getBankVaultKey())
    .update(`${accountNumber}:${ifscCode}`)
    .digest('hex');
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

function extractOwnerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[OWNER_COOKIE_NAME] || null;
}

function issueOwnerCookie(res: Response, req: Request, token: string): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  res.cookie(OWNER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearOwnerCookie(res: Response, req: Request): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  res.clearCookie(OWNER_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    path: '/',
  });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

async function verifyVerifiedOwnerFirebaseToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  const apiKey = loadFirebaseApiKey();
  if (!apiKey || !idToken) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (
      !user ||
      !user.localId ||
      !user.email ||
      !user.emailVerified ||
      user.email.toLowerCase() !== OWNER_ADMIN_EMAIL
    ) {
      return null;
    }
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

function requireOwnerSession(req: Request, res: Response, next: NextFunction): void {
  const token = extractOwnerToken(req);
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Owner authentication required.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '512kb' }));

  // Owner session & configuration status
  app.get('/api/owner/session', (req: Request, res: Response) => {
    const state = getOwnerPasswordState();
    const token = extractOwnerToken(req);
    const session = verifySessionToken(token);
    const ip = getClientIp(req);
    const attempt = loginAttempts.get(ip);
    const now = Date.now();
    const retryAfterSeconds =
      attempt && attempt.lockedUntil > now
        ? Math.ceil((attempt.lockedUntil - now) / 1000)
        : 0;

    res.json({
      authenticated: Boolean(session),
      configured: state.configured,
      authSource: state.source,
      expiresAt: session?.expiresAt || null,
      retryAfterSeconds,
      firebaseAdminConfigured: Boolean(getAdminFirebase()),
      ownerAdminEmail: OWNER_ADMIN_EMAIL,
    });
  });

  // First-time password setup (allowed only when unconfigured and verified via owner's Google ID token)
  app.post('/api/owner/setup', async (req: Request, res: Response) => {
    const state = getOwnerPasswordState();
    if (state.configured) {
      res.status(409).json({ error: 'Owner password is already configured.' });
      return;
    }

    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const verifiedOwner = await verifyVerifiedOwnerFirebaseToken(idToken);
    if (!verifiedOwner) {
      res.status(403).json({
        error: `Sign in with the authorized owner Google account (${OWNER_ADMIN_EMAIL}) to initialize the Owner Panel password.`,
      });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
      return;
    }

    writeStoredOwnerAuth(password);

    const sid = crypto.randomBytes(24).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + SESSION_TTL_MS;
    activeSessions.set(sid, { sid, createdAt, expiresAt });
    const sessionToken = signSessionToken(sid, expiresAt);
    issueOwnerCookie(res, req, sessionToken);
    const customToken = await mintOwnerFirebaseCustomToken();

    res.json({
      authenticated: true,
      configured: true,
      authSource: 'hash',
      expiresAt,
      token: sessionToken,
      firebaseAdminConfigured: Boolean(getAdminFirebase()),
      ownerAdminEmail: OWNER_ADMIN_EMAIL,
      customToken,
    });
  });

  // Single-password Owner Login
  app.post('/api/owner/login', async (req: Request, res: Response) => {
    const state = getOwnerPasswordState();
    if (!state.configured) {
      res.status(503).json({
        error: 'Owner password is not configured yet.',
        configured: false,
      });
      return;
    }

    const ip = getClientIp(req);
    const now = Date.now();
    const record = loginAttempts.get(ip) || { failures: 0, lockedUntil: 0 };

    if (record.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      res.status(429).json({
        error: 'Incorrect owner password. Please try again after 1 minute.',
        retryAfterSeconds,
      });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      res.status(400).json({ error: 'Please enter the Owner Panel password.' });
      return;
    }

    if (!verifyOwnerPassword(password)) {
      const nextFailures = record.failures + 1;
      if (nextFailures >= LOCKOUT_MAX_ATTEMPTS) {
        const lockedUntil = now + LOCKOUT_DURATION_MS;
        loginAttempts.set(ip, { failures: 0, lockedUntil });
        res.status(429).json({
          error: 'Incorrect owner password. Please try again after 1 minute.',
          retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
        });
        return;
      }
      loginAttempts.set(ip, { failures: nextFailures, lockedUntil: 0 });
      res.status(401).json({
        error: 'Incorrect owner password.',
        attemptsRemaining: LOCKOUT_MAX_ATTEMPTS - nextFailures,
      });
      return;
    }

    loginAttempts.delete(ip);
    const sid = crypto.randomBytes(24).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + SESSION_TTL_MS;
    activeSessions.set(sid, { sid, createdAt, expiresAt });
    const sessionToken = signSessionToken(sid, expiresAt);
    issueOwnerCookie(res, req, sessionToken);
    const customToken = await mintOwnerFirebaseCustomToken();

    res.json({
      authenticated: true,
      configured: true,
      authSource: state.source,
      expiresAt,
      token: sessionToken,
      firebaseAdminConfigured: Boolean(getAdminFirebase()),
      ownerAdminEmail: OWNER_ADMIN_EMAIL,
      customToken,
    });
  });

  // Mint custom Firebase admin token for already-authenticated Owner session
  app.post('/api/owner/firebase-token', requireOwnerSession, async (_req: Request, res: Response) => {
    const customToken = await mintOwnerFirebaseCustomToken();
    res.json({
      firebaseAdminConfigured: Boolean(getAdminFirebase()),
      customToken,
    });
  });

  // Protected server-side admin snapshot when Firebase Admin credentials are configured
  app.get('/api/owner/admin-snapshot', requireOwnerSession, async (_req: Request, res: Response) => {
    const bundle = getAdminFirebase();
    if (!bundle) {
      res.status(503).json({
        firebaseAdminConfigured: false,
        error: 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured on the backend server.',
      });
      return;
    }
    try {
      const colNames = [
        'orders',
        'users',
        'returns',
        'refunds',
        'payouts',
        'payoutRequests',
        'payoutTransactions',
        'commissions',
        'platformFees',
        'sellerBankAccounts',
        'sellerEarnings',
        'suppliers',
        'supplierProducts',
      ] as const;
      const snaps = await Promise.all(colNames.map((name) => bundle.db.collection(name).get()));
      const data: Record<string, unknown[]> = {};
      colNames.forEach((name, idx) => {
        data[name] = snaps[idx].docs.map((d) => serializeFirestoreValue(d.data()));
      });
      res.json({ firebaseAdminConfigured: true, ...data });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to fetch admin snapshot.',
      });
    }
  });

  // Non-secret Payout Provider status for Seller & Owner UI
  app.get('/api/payout-provider/status', (_req: Request, res: Response) => {
    res.json(getPayoutProviderStatus());
  });

  // Server-side Seller Bank Account Validation, Masking & AES-256-GCM Tokenization
  app.post('/api/bank-accounts/prepare', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const forbiddenFields = ['pin', 'atmpin', 'upipin', 'cvv', 'otp', 'password', 'mpin', 'bankingpassword'];
    for (const key of Object.keys(body)) {
      if (forbiddenFields.includes(key.toLowerCase())) {
        res.status(400).json({
          error: 'Security policy: TISAHARA never collects ATM PIN, UPI PIN, banking password, CVV, or OTP.',
        });
        return;
      }
    }

    const sellerId = typeof body.sellerId === 'string' ? body.sellerId.trim() : '';
    const accountHolderName = typeof body.accountHolderName === 'string' ? body.accountHolderName.trim() : '';
    const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.replace(/\s+/g, '') : '';
    const confirmAccountNumber =
      typeof body.confirmAccountNumber === 'string' ? body.confirmAccountNumber.replace(/\s+/g, '') : '';
    const ifscCode = typeof body.ifscCode === 'string' ? body.ifscCode.trim().toUpperCase() : '';
    const bankName = typeof body.bankName === 'string' ? body.bankName.trim() : '';
    const branchName = typeof body.branchName === 'string' ? body.branchName.trim() : '';

    if (!sellerId || sellerId.length > 128) {
      res.status(400).json({ error: 'Valid sellerId is required.' });
      return;
    }
    if (accountHolderName.length < 2 || accountHolderName.length > 120) {
      res.status(400).json({ error: 'Account Holder Name must be between 2 and 120 characters.' });
      return;
    }
    if (!/^\d{9,18}$/.test(accountNumber)) {
      res.status(400).json({ error: 'Bank Account Number must contain 9 to 18 numeric digits.' });
      return;
    }
    if (accountNumber !== confirmAccountNumber) {
      res.status(400).json({ error: 'Bank Account Number and Confirm Bank Account Number do not match.' });
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      res.status(400).json({
        error: 'Enter a valid 11-character IFSC Code (e.g. SBIN0001234 — 4 letters, 0, then 6 alphanumeric characters).',
      });
      return;
    }
    if (bankName.length < 2 || bankName.length > 120) {
      res.status(400).json({ error: 'Bank Name must be between 2 and 120 characters.' });
      return;
    }
    if (branchName.length > 120) {
      res.status(400).json({ error: 'Branch Name must not exceed 120 characters.' });
      return;
    }

    const { masked, last4 } = maskBankAccountNumber(accountNumber);
    const accountNumberHash = hashBankAccountNumber(accountNumber, ifscCode);
    const encryptedVaultToken = encryptBankVault({
      sellerId,
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      branchName,
    });
    const providerStatus = getPayoutProviderStatus();

    res.json({
      accountHolderName: accountHolderName.slice(0, 120),
      maskedAccountNumber: masked,
      accountLast4: last4,
      accountNumberHash,
      encryptedVaultToken,
      ifscCode,
      bankName: bankName.slice(0, 120),
      ...(branchName ? { branchName: branchName.slice(0, 120) } : {}),
      provider: providerStatus.provider,
    });
  });

  // Owner-Only Live Payout Provider Execution (never simulates or fakes transfers)
  app.post('/api/owner/payout-provider/execute', requireOwnerSession, async (req: Request, res: Response) => {
    const providerStatus = getPayoutProviderStatus();
    if (!providerStatus.connected || !providerStatus.supportsAutoPayout || providerStatus.provider === 'manual') {
      res.status(400).json({
        error:
          'No live Indian payout provider API credentials are configured. Complete the bank transfer manually and enter the verified UTR / Bank Reference ID before marking Paid.',
      });
      return;
    }

    const payoutId = typeof req.body?.payoutId === 'string' ? req.body.payoutId.trim() : '';
    const amount = Number(req.body?.amount || 0);
    const encryptedVaultToken =
      typeof req.body?.encryptedVaultToken === 'string' ? req.body.encryptedVaultToken.trim() : '';
    const beneficiaryId =
      typeof req.body?.beneficiaryId === 'string' ? req.body.beneficiaryId.trim() : '';

    if (!payoutId || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid payoutId and positive amount are required.' });
      return;
    }

    const decrypted = encryptedVaultToken ? decryptBankVault(encryptedVaultToken) : null;
    if (!decrypted && !beneficiaryId) {
      res.status(400).json({ error: 'Seller bank vault token or provider beneficiaryId is missing.' });
      return;
    }

    try {
      if (providerStatus.provider === 'razorpayx') {
        const keyId = process.env.RAZORPAYX_KEY_ID!.trim();
        const keySecret = process.env.RAZORPAYX_KEY_SECRET!.trim();
        const sourceAccount = process.env.RAZORPAYX_ACCOUNT_NUMBER!.trim();
        const authBasic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

        let fundAccountId = beneficiaryId;
        if (!fundAccountId && decrypted) {
          const faResp = await fetch('https://api.razorpay.com/v1/fund_accounts', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authBasic}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              account_type: 'bank_account',
              bank_account: {
                name: decrypted.accountHolderName,
                ifsc: decrypted.ifscCode,
                account_number: decrypted.accountNumber,
              },
              contact: {
                name: decrypted.accountHolderName,
                type: 'vendor',
                reference_id: decrypted.sellerId,
              },
            }),
            signal: AbortSignal.timeout(10000),
          });
          const faData = (await faResp.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
          if (!faResp.ok || !faData.id) {
            res.status(502).json({
              error: faData.error?.description || 'RazorpayX fund account setup failed.',
            });
            return;
          }
          fundAccountId = faData.id;
        }

        const payoutResp = await fetch('https://api.razorpay.com/v1/payouts', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authBasic}`,
            'Content-Type': 'application/json',
            'X-Payout-Idempotency': payoutId,
          },
          body: JSON.stringify({
            account_number: sourceAccount,
            fund_account_id: fundAccountId,
            amount: Math.round(amount * 100),
            currency: 'INR',
            mode: 'IMPS',
            purpose: 'payout',
            reference_id: payoutId,
            narration: `TISAHARA Payout ${payoutId}`.slice(0, 30),
          }),
          signal: AbortSignal.timeout(10000),
        });
        const payoutData = (await payoutResp.json().catch(() => ({}))) as {
          id?: string;
          utr?: string;
          status?: string;
          error?: { description?: string };
        };
        if (!payoutResp.ok || !payoutData.id) {
          res.status(502).json({
            error: payoutData.error?.description || 'RazorpayX payout execution failed.',
          });
          return;
        }
        res.json({
          paymentProvider: 'razorpayx',
          beneficiaryId: fundAccountId,
          paymentReference: payoutData.utr || payoutData.id,
          status: payoutData.status === 'processed' ? 'Paid' : 'Processing',
        });
        return;
      }

      if (providerStatus.provider === 'cashfree') {
        const clientId = process.env.CASHFREE_PAYOUT_CLIENT_ID!.trim();
        const clientSecret = process.env.CASHFREE_PAYOUT_CLIENT_SECRET!.trim();
        const isProdEnv = (process.env.CASHFREE_PAYOUT_ENV || '').trim().toUpperCase() === 'PROD';
        const baseUrl = isProdEnv
          ? 'https://payout-api.cashfree.com/payout/v1'
          : 'https://payout-gamma.cashfree.com/payout/v1';

        const authResp = await fetch(`${baseUrl}/authorize`, {
          method: 'POST',
          headers: {
            'X-Client-Id': clientId,
            'X-Client-Secret': clientSecret,
          },
          signal: AbortSignal.timeout(10000),
        });
        const authData = (await authResp.json().catch(() => ({}))) as {
          data?: { token?: string };
          message?: string;
        };
        const bearerToken = authData.data?.token;
        if (!authResp.ok || !bearerToken) {
          res.status(502).json({
            error: authData.message || 'Cashfree payout authorization failed.',
          });
          return;
        }

        const beneId = beneficiaryId || `tisa_${payoutId}`;
        if (!beneficiaryId && decrypted) {
          await fetch(`${baseUrl}/addBeneficiary`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              beneId,
              name: decrypted.accountHolderName,
              email: 'seller-payouts@tisahara.in',
              phone: '9999999999',
              bankAccount: decrypted.accountNumber,
              ifsc: decrypted.ifscCode,
              address1: decrypted.bankName,
            }),
            signal: AbortSignal.timeout(10000),
          });
        }

        const transferResp = await fetch(`${baseUrl}/requestTransfer`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            beneId,
            amount: Number(amount.toFixed(2)),
            transferId: payoutId,
            transferMode: 'imps',
            remarks: `TISAHARA Payout ${payoutId}`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const transferData = (await transferResp.json().catch(() => ({}))) as {
          status?: string;
          message?: string;
          data?: { referenceId?: string; utr?: string };
        };
        if (!transferResp.ok || transferData.status === 'ERROR') {
          res.status(502).json({
            error: transferData.message || 'Cashfree transfer initiation failed.',
          });
          return;
        }
        res.json({
          paymentProvider: 'cashfree',
          beneficiaryId: beneId,
          paymentReference: transferData.data?.utr || transferData.data?.referenceId || payoutId,
          status: transferData.data?.utr ? 'Paid' : 'Processing',
        });
        return;
      }

      res.status(400).json({ error: 'Unsupported payout provider.' });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Payment provider request failed.',
      });
    }
  });

  // Change Owner Panel Password (requires active owner session)
  app.post('/api/owner/change-password', requireOwnerSession, (req: Request, res: Response) => {
    if (getEnvOwnerPassword()) {
      res.status(400).json({
        error:
          'Password is currently managed via the OWNER_PANEL_PASSWORD environment secret. Update OWNER_PANEL_PASSWORD in AI Studio Secrets to change it.',
      });
      return;
    }

    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!verifyOwnerPassword(currentPassword)) {
      res.status(401).json({ error: 'Current owner password is incorrect.' });
      return;
    }

    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be between 6 and 128 characters.' });
      return;
    }

    writeStoredOwnerAuth(newPassword);
    res.json({ success: true });
  });

  // Owner Logout
  app.post('/api/owner/logout', (req: Request, res: Response) => {
    const token = extractOwnerToken(req);
    if (token) {
      const sid = token.split('.')[0];
      if (sid) activeSessions.delete(sid);
    }
    clearOwnerCookie(res, req);
    res.json({ authenticated: false });
  });

  // Checkout Idempotency Cache (prevents duplicate order/fee submissions)
  const checkoutIdempotencyCache = new Map<string, { createdAt: number; payload: unknown }>();
  const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

  // Authoritative Server-Side Order Split, Price, Margin & Fee Calculator
  app.post('/api/orders/prepare', (req: Request, res: Response) => {
    const now = Date.now();
    for (const [key, entry] of checkoutIdempotencyCache.entries()) {
      if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) {
        checkoutIdempotencyCache.delete(key);
      }
    }

    const idempotencyKey =
      typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    if (idempotencyKey) {
      const cached = checkoutIdempotencyCache.get(idempotencyKey);
      if (cached && now - cached.createdAt < 15000) {
        res.status(409).json({
          error: 'Duplicate order submission prevented. Please wait a moment before retrying.',
        });
        return;
      }
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0 || rawItems.length > 50) {
      res.status(400).json({ error: 'Cart must contain between 1 and 50 items.' });
      return;
    }

    type PrepareItem = {
      productId: string;
      storeProductId?: string;
      sellerId: string;
      sellerStoreName: string;
      title: string;
      image: string;
      basePrice: number;
      sellingPrice: number;
      sellerMargin: number;
      ownershipType: 'OWNER' | 'SELLER_OWNED';
      orderType: 'DIRECT_OWNER' | 'SELLER_OWN_PRODUCT' | 'SELLER_DROPSHIP';
      quantity: number;
    };

    const normalizedGroups = new Map<string, PrepareItem[]>();

    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') {
        res.status(400).json({ error: 'Invalid cart item payload.' });
        return;
      }
      const productId = String(raw.productId || '').trim();
      const sellerId = String(raw.sellerId || '').trim();
      const storeProductId =
        typeof raw.storeProductId === 'string' && raw.storeProductId.trim()
          ? raw.storeProductId.trim()
          : undefined;
      const quantity = Math.max(1, Math.min(100, Math.floor(Number(raw.quantity || 1))));
      const basePrice = Math.max(0, Math.round(Number(raw.basePrice || 0)));
      const sellingPrice = Math.max(0, Math.round(Number(raw.sellingPrice || 0)));

      if (!productId || !sellerId || sellingPrice <= 0) {
        res.status(400).json({ error: 'Each item must have valid productId, sellerId, and sellingPrice.' });
        return;
      }

      const rawOwnership = raw.ownershipType === 'SELLER_OWNED' ? 'SELLER_OWNED' : 'OWNER';
      let orderType: PrepareItem['orderType'];
      let ownershipType: PrepareItem['ownershipType'];

      if (storeProductId || (rawOwnership === 'OWNER' && sellerId !== 'tisahara_owner')) {
        orderType = 'SELLER_DROPSHIP';
        ownershipType = 'OWNER';
      } else if (rawOwnership === 'SELLER_OWNED' && sellerId !== 'tisahara_owner') {
        orderType = 'SELLER_OWN_PRODUCT';
        ownershipType = 'SELLER_OWNED';
      } else {
        orderType = 'DIRECT_OWNER';
        ownershipType = 'OWNER';
      }

      const computedMargin =
        orderType === 'DIRECT_OWNER'
          ? 0
          : orderType === 'SELLER_OWN_PRODUCT'
          ? sellingPrice
          : Math.max(0, sellingPrice - basePrice);

      const groupKey = `${sellerId}__${orderType}`;
      const list = normalizedGroups.get(groupKey) || [];
      list.push({
        productId,
        ...(storeProductId ? { storeProductId } : {}),
        sellerId,
        sellerStoreName: String(raw.sellerStoreName || 'TISAHARA Central').slice(0, 100),
        title: String(raw.title || 'Product').slice(0, 140),
        image: String(raw.image || ''),
        basePrice,
        sellingPrice,
        sellerMargin: computedMargin,
        ownershipType,
        orderType,
        quantity,
      });
      normalizedGroups.set(groupKey, list);
    }

    const checkoutGroupId = `grp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const orderGroups = Array.from(normalizedGroups.entries()).map(([groupKey, groupItems]) => {
      const first = groupItems[0];
      const subtotal = groupItems.reduce((s, i) => s + i.sellingPrice * i.quantity, 0);
      const totalSellerMargin =
        first.orderType === 'DIRECT_OWNER'
          ? 0
          : groupItems.reduce((s, i) => s + i.sellerMargin * i.quantity, 0);
      const deliveryFee = subtotal >= 499 ? 0 : 49;
      const totalAmount = subtotal + deliveryFee;
      const tisaharaFee =
        first.orderType === 'SELLER_OWN_PRODUCT'
          ? 10
          : first.orderType === 'SELLER_DROPSHIP'
          ? 5
          : 0;
      const sellerPayableAmount =
        first.orderType === 'DIRECT_OWNER'
          ? 0
          : first.orderType === 'SELLER_OWN_PRODUCT'
          ? Math.max(0, subtotal - 10)
          : Math.max(0, totalSellerMargin - 5);

      return {
        groupKey,
        sellerId: first.sellerId,
        sellerStoreName: first.sellerStoreName,
        ownershipType: first.ownershipType,
        orderType: first.orderType,
        items: groupItems,
        subtotal,
        deliveryFee,
        discountAmount: 0,
        totalAmount,
        totalSellerMargin,
        tisaharaFee,
        sellerPayableAmount,
      };
    });

    const responsePayload = {
      checkoutGroupId,
      orderGroups,
      grandTotal: orderGroups.reduce((s, g) => s + g.totalAmount, 0),
    };

    if (idempotencyKey) {
      checkoutIdempotencyCache.set(idempotencyKey, { createdAt: now, payload: responsePayload });
    }

    res.json(responsePayload);
  });

  // Authoritative Server-Side Seller Financial & Payout Eligibility Calculator
  app.post('/api/payouts/calculate', (req: Request, res: Response) => {
    const sellerId = typeof req.body?.sellerId === 'string' ? req.body.sellerId.trim() : '';
    if (!sellerId) {
      res.status(400).json({ error: 'sellerId is required.' });
      return;
    }

    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    const returns = Array.isArray(req.body?.returns) ? req.body.returns : [];
    const payouts = Array.isArray(req.body?.payouts) ? req.body.payouts : [];
    const nowMs = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    const activeReturnByOrder = new Map<string, string>();
    for (const r of returns) {
      if (r && typeof r.orderId === 'string' && typeof r.status === 'string') {
        activeReturnByOrder.set(r.orderId, r.status);
      }
    }

    let totalSales = 0;
    let ownProductGross = 0;
    let dropshipMarginGross = 0;
    let totalTisaharaFees = 0;
    let totalEarnings = 0;
    let pendingEarnings = 0;
    let heldReturnWindowAmount = 0;
    let heldDisputeAmount = 0;
    let availableBalance = 0;
    let grossForAvailableOrders = 0;
    let feesForAvailableOrders = 0;
    const eligibleOrderIds: string[] = [];

    for (const ord of orders) {
      if (!ord || ord.sellerId !== sellerId) continue;
      if (ord.status === 'Cancelled') continue;

      const orderType =
        ord.orderType ||
        (ord.ownershipType === 'SELLER_OWNED'
          ? 'SELLER_OWN_PRODUCT'
          : ord.sellerId === 'tisahara_owner'
          ? 'DIRECT_OWNER'
          : 'SELLER_DROPSHIP');

      if (orderType === 'DIRECT_OWNER') continue;

      const subtotal = Math.max(0, Number(ord.subtotal || 0));
      const margin = Math.max(0, Number(ord.totalSellerMargin || 0));
      const fee =
        typeof ord.tisaharaFee === 'number'
          ? ord.tisaharaFee
          : orderType === 'SELLER_OWN_PRODUCT'
          ? 10
          : 5;
      const payable =
        typeof ord.sellerPayableAmount === 'number'
          ? ord.sellerPayableAmount
          : orderType === 'SELLER_OWN_PRODUCT'
          ? Math.max(0, subtotal - 10)
          : Math.max(0, margin - 5);

      totalSales += Math.max(0, Number(ord.totalAmount || subtotal));
      if (orderType === 'SELLER_OWN_PRODUCT') {
        ownProductGross += subtotal;
      } else {
        dropshipMarginGross += margin;
      }

      if (ord.status !== 'Delivered') {
        pendingEarnings += payable;
        continue;
      }

      const retStatus = activeReturnByOrder.get(ord.id) || ord.returnStatus || 'None';
      if (retStatus === 'Refunded' || ord.paymentStatus === 'Refunded' || ord.payoutStatus === 'Forfeited_Refunded') {
        continue;
      }

      totalTisaharaFees += fee;
      totalEarnings += payable;

      if (ord.payoutStatus === 'Paid' || ord.payoutStatus === 'Payout_Requested') {
        continue;
      }

      if (retStatus === 'Requested' || retStatus === 'Approved' || ord.payoutStatus === 'Held_Return') {
        heldDisputeAmount += payable;
        continue;
      }

      const deliveredAtMs = Number(ord.deliveredAtMs || 0);
      const returnDeadlineMs = Number(
        ord.returnDeadlineMs || (deliveredAtMs > 0 ? deliveredAtMs + SEVEN_DAYS_MS : 0)
      );

      if (returnDeadlineMs > nowMs && ord.payoutStatus !== 'Eligible') {
        heldReturnWindowAmount += payable;
      } else {
        availableBalance += payable;
        grossForAvailableOrders += orderType === 'SELLER_OWN_PRODUCT' ? subtotal : margin;
        feesForAvailableOrders += fee;
        if (typeof ord.id === 'string') {
          eligibleOrderIds.push(ord.id);
        }
      }
    }

    let paidOutTotal = 0;
    let pendingPayoutRequestTotal = 0;
    for (const p of payouts) {
      if (!p || p.sellerId !== sellerId) continue;
      if (p.status === 'Paid') paidOutTotal += Number(p.netPayableAmount || 0);
      if (
        p.status === 'Pending' ||
        p.status === 'Requested' ||
        p.status === 'Under Review' ||
        p.status === 'Approved' ||
        p.status === 'Processing' ||
        p.status === 'On Hold'
      ) {
        pendingPayoutRequestTotal += Number(p.netPayableAmount || 0);
      }
    }

    res.json({
      sellerId,
      totalSales,
      ownProductGross,
      dropshipMarginGross,
      totalTisaharaFees,
      totalEarnings,
      pendingEarnings,
      returnPeriodHold: heldReturnWindowAmount + heldDisputeAmount,
      heldReturnWindowAmount,
      heldDisputeAmount,
      availableBalance,
      grossForAvailableOrders,
      feesForAvailableOrders,
      eligibleOrderIds,
      paidOutTotal,
      pendingPayoutRequestTotal,
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TISAHARA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TISAHARA server:', err);
  process.exit(1);
});
