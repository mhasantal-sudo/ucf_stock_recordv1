import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { generateChallanPngIcon } from './server/pngIcon.ts';
import {
  DEFAULT_ANDROID_CONFIG,
  generateActivityMainXml,
  generateAdaptiveForegroundXml,
  generateAdaptiveIconXml,
  generateAndroidManifestXml,
  generateAppBuildGradleKts,
  generateColorsXml,
  generateFilePathsXml,
  generateGitHubActionsWorkflow,
  generateGradleProperties,
  generateGradleWrapperProperties,
  generateMainActivityKt,
  generateProjectReadme,
  generateRootBuildGradleKts,
  generateSettingsGradleKts,
  generateStringsXml,
  generateThemesXml,
  validateAndroidConfig,
  type AndroidAppConfig,
} from './src/shared/androidConfig.ts';
import {
  isDoPending,
  normalizeExternalDoList,
} from './src/shared/externalDoSync.ts';
import type { DeliveryOrder } from './src/types/grain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const EXTERNAL_DO_DATA_FILE = path.join(__dirname, 'data', 'external-dos.json');

function loadServerExternalDos(): DeliveryOrder[] {
  try {
    if (!fs.existsSync(EXTERNAL_DO_DATA_FILE)) return [];
    const raw = fs.readFileSync(EXTERNAL_DO_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DeliveryOrder[]) : [];
  } catch {
    return [];
  }
}

function saveServerExternalDos(list: DeliveryOrder[]): void {
  try {
    const dir = path.dirname(EXTERNAL_DO_DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(EXTERNAL_DO_DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {
    // Ignore disk write failure on read-only fs
  }
}

function addDirectoryToZip(zip: JSZip, sourceDir: string, zipPrefix: string) {
  if (!fs.existsSync(sourceDir)) return;
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'aistudio' || entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }
    const fullPath = path.join(sourceDir, entry.name);
    const targetPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, targetPath);
    } else if (entry.isFile()) {
      zip.file(targetPath, fs.readFileSync(fullPath));
    }
  }
}

function addCleanSourceDirToZip(zip: JSZip, sourceDir: string, zipPrefix: string) {
  if (!fs.existsSync(sourceDir)) return;
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
      continue;
    }
    const fullPath = path.join(sourceDir, entry.name);
    const targetPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (
      targetPath === 'public/assets/aistudio' ||
      targetPath.endsWith('/public/assets/aistudio')
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      addCleanSourceDirToZip(zip, fullPath, targetPath);
    } else if (entry.isFile()) {
      zip.file(targetPath, fs.readFileSync(fullPath));
    }
  }
}

function packageWebSourceIntoZip(zip: JSZip, baseDir: string, prefix = '') {
  const joinZip = (p: string) => (prefix ? `${prefix}/${p}` : p);
  addCleanSourceDirToZip(zip, path.join(baseDir, 'src'), joinZip('src'));
  addCleanSourceDirToZip(zip, path.join(baseDir, 'server'), joinZip('server'));
  addCleanSourceDirToZip(zip, path.join(baseDir, 'public'), joinZip('public'));

  const rootFiles = [
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    'server.ts',
    'metadata.json',
    'firebase-applet-config.json',
    '.env.example',
    '.gitignore',
  ];
  for (const fileName of rootFiles) {
    const filePath = path.join(baseDir, fileName);
    if (fs.existsSync(filePath)) {
      zip.file(joinZip(fileName), fs.readFileSync(filePath));
    }
  }
}

function packageAndroidProjectIntoZip(
  zip: JSZip,
  prefix: string,
  config: AndroidAppConfig,
  distDir: string,
  hasDist: boolean,
  webSeed?: unknown
) {
  const joinZip = (p: string) => (prefix ? `${prefix}/${p}` : p);
  const pkgPath = config.packageName.replace(/\./g, '/');

  zip.file(joinZip('README.md'), generateProjectReadme(config));
  zip.file(joinZip('settings.gradle.kts'), generateSettingsGradleKts(config));
  zip.file(joinZip('build.gradle.kts'), generateRootBuildGradleKts());
  zip.file(joinZip('gradle.properties'), generateGradleProperties());
  zip.file(
    joinZip('gradle/wrapper/gradle-wrapper.properties'),
    generateGradleWrapperProperties()
  );
  zip.file(joinZip('.github/workflows/build-apk.yml'), generateGitHubActionsWorkflow(config));

  zip.file(joinZip('app/build.gradle.kts'), generateAppBuildGradleKts(config));
  zip.file(joinZip('app/proguard-rules.pro'), '# Custom ProGuard rules\n');
  zip.file(joinZip('app/src/main/AndroidManifest.xml'), generateAndroidManifestXml(config));
  zip.file(
    joinZip(`app/src/main/java/${pkgPath}/MainActivity.kt`),
    generateMainActivityKt(config)
  );

  if (hasDist) {
    addDirectoryToZip(zip, distDir, joinZip('app/src/main/assets'));
  }
  if (webSeed && typeof webSeed === 'object') {
    zip.file(joinZip('app/src/main/assets/web-seed.json'), JSON.stringify(webSeed));
  }

  zip.file(joinZip('app/src/main/res/layout/activity_main.xml'), generateActivityMainXml());
  zip.file(joinZip('app/src/main/res/values/strings.xml'), generateStringsXml(config));
  zip.file(joinZip('app/src/main/res/values/colors.xml'), generateColorsXml(config));
  zip.file(joinZip('app/src/main/res/values/themes.xml'), generateThemesXml());
  zip.file(joinZip('app/src/main/res/xml/file_paths.xml'), generateFilePathsXml());

  zip.file(joinZip('app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), generateAdaptiveIconXml());
  zip.file(
    joinZip('app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'),
    generateAdaptiveIconXml()
  );
  zip.file(
    joinZip('app/src/main/res/drawable/ic_launcher_foreground.xml'),
    generateAdaptiveForegroundXml(config)
  );

  const densities: Array<{ folder: string; size: number }> = [
    { folder: 'mipmap-mdpi', size: 48 },
    { folder: 'mipmap-hdpi', size: 72 },
    { folder: 'mipmap-xhdpi', size: 96 },
    { folder: 'mipmap-xxhdpi', size: 144 },
    { folder: 'mipmap-xxxhdpi', size: 192 },
  ];

  for (const d of densities) {
    const squarePng = generateChallanPngIcon({
      size: d.size,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      roundedBackground: true,
    });
    const roundPng = generateChallanPngIcon({
      size: d.size,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      maskable: true,
    });
    zip.file(joinZip(`app/src/main/res/${d.folder}/ic_launcher.png`), squarePng);
    zip.file(joinZip(`app/src/main/res/${d.folder}/ic_launcher_round.png`), roundPng);
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api/external-dos', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/external-dos', (_req, res) => {
    const list = loadServerExternalDos();
    const pending = list.filter((d) => isDoPending(d));
    const distributed = list.filter((d) => !isDoPending(d));
    res.json({
      ok: true,
      pending,
      distributed,
      deliveryOrders: list,
    });
  });

  app.post('/api/external-dos', (req, res) => {
    const normalized = normalizeExternalDoList(req.body);
    if (normalized.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'সঠিক ডিও তথ্য পাওয়া যায়নি (doNumber আবশ্যক)।',
      });
      return;
    }

    const existing = loadServerExternalDos();
    const byKey = new Map<string, DeliveryOrder>();
    for (const d of existing) {
      const k = d.externalId || `${d.doNumber}::${d.product}`;
      byKey.set(k, d);
    }

    let added = 0;
    let updated = 0;
    const nowIso = new Date().toISOString();

    for (const item of normalized) {
      const key = item.externalId || `${item.doNumber}::${item.product}`;
      const match =
        byKey.get(key) ||
        existing.find(
          (d) =>
            d.doNumber.trim().toLowerCase() === item.doNumber.trim().toLowerCase() &&
            d.product === item.product
        );

      if (match) {
        const keepDistributed = !isDoPending(match) || item.status === 'distributed';
        const next: DeliveryOrder = {
          ...match,
          externalId: item.externalId,
          category: item.category || match.category,
          totalBags: item.totalBags || match.totalBags,
          totalMt: item.totalMt || match.totalMt,
          recipient: item.recipient || match.recipient,
          date: item.date || match.date,
          source: 'external_app',
          status: keepDistributed ? 'distributed' : 'pending',
        };
        byKey.set(match.externalId || `${match.doNumber}::${match.product}`, next);
        updated += 1;
      } else {
        const created: DeliveryOrder = {
          id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          externalId: item.externalId,
          doNumber: item.doNumber,
          product: item.product,
          category: item.category,
          totalBags: item.totalBags,
          totalMt: item.totalMt,
          deliveredBags: item.deliveredBags,
          deliveredMt: item.deliveredMt,
          recipient: item.recipient,
          date: item.date,
          source: 'external_app',
          status: item.status,
          createdAt: nowIso,
        };
        byKey.set(key, created);
        added += 1;
      }
    }

    const merged = Array.from(byKey.values());
    saveServerExternalDos(merged);
    res.json({ ok: true, added, updated, total: merged.length });
  });

  app.post('/api/external-dos/mark-distributed', (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      res.json({ ok: true, updated: 0 });
      return;
    }

    const existing = loadServerExternalDos();
    let updated = 0;
    const nowIso = new Date().toISOString();

    const nextList = existing.map((d) => {
      const hit = items.find(
        (m: { externalId?: string; id?: string; doNumber?: string; product?: string }) =>
          (m.externalId && d.externalId && m.externalId === d.externalId) ||
          (m.id && d.id === m.id) ||
          (m.doNumber &&
            d.doNumber.trim().toLowerCase() === String(m.doNumber).trim().toLowerCase() &&
            (!m.product || m.product === d.product))
      );
      if (!hit) return d;
      updated += 1;
      return {
        ...d,
        deliveredBags: Number(hit.deliveredBags ?? d.totalBags),
        deliveredMt: Number(hit.deliveredMt ?? d.totalMt),
        status: 'distributed' as const,
        distributedAt: hit.distributedAt || nowIso,
        distributedFrom: Array.isArray(hit.distributedFrom)
          ? hit.distributedFrom
          : d.distributedFrom,
      };
    });

    if (updated > 0) {
      saveServerExternalDos(nextList);
    }
    res.json({ ok: true, updated });
  });

  app.post('/api/external-sync/pull', async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const apiSecret = String(req.body?.apiSecret || '').trim();
    const serverStored = loadServerExternalDos();

    if (!rawUrl) {
      res.json({
        ok: true,
        deliveryOrders: serverStored,
        externalCount: 0,
        webhookCount: serverStored.length,
      });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      res.status(400).json({ ok: false, error: 'সঠিক https:// বা http:// ওয়েব অ্যাপ লিংক দিন।' });
      return;
    }

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (apiSecret) {
        headers['X-API-Key'] = apiSecret;
        headers['Authorization'] = `Bearer ${apiSecret}`;
      }

      const upstream = await fetch(parsedUrl.toString(), {
        method: 'GET',
        headers,
        redirect: 'follow',
      });

      if (!upstream.ok) {
        res.status(502).json({
          ok: false,
          error: `অন্য ওয়েব অ্যাপ থেকে রেসপন্স পাওয়া যায়নি (HTTP ${upstream.status})।`,
        });
        return;
      }

      const text = await upstream.text();
      let jsonBody: unknown;
      try {
        jsonBody = JSON.parse(text);
      } catch {
        res.status(502).json({
          ok: false,
          error: 'অন্য ওয়েব অ্যাপ থেকে সঠিক JSON ডেটা আসেনি।',
        });
        return;
      }

      const externalNormalized = normalizeExternalDoList(jsonBody);
      const nowIso = new Date().toISOString();

      const externalAsOrders: DeliveryOrder[] = externalNormalized.map((item) => ({
        id: `ext-${item.externalId}`,
        externalId: item.externalId,
        doNumber: item.doNumber,
        product: item.product,
        category: item.category,
        totalBags: item.totalBags,
        totalMt: item.totalMt,
        deliveredBags: item.deliveredBags,
        deliveredMt: item.deliveredMt,
        recipient: item.recipient,
        date: item.date,
        source: 'external_app',
        status: item.status,
        createdAt: nowIso,
      }));

      res.json({
        ok: true,
        deliveryOrders: [...externalAsOrders, ...serverStored],
        externalCount: externalAsOrders.length,
        webhookCount: serverStored.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'সংযোগ ব্যর্থ হয়েছে।';
      res.status(502).json({
        ok: false,
        error: `অন্য ওয়েব অ্যাপের সাথে সংযোগ করা যায়নি: ${msg}`,
      });
    }
  });

  app.post('/api/external-sync/push-status', async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const apiSecret = String(req.body?.apiSecret || '').trim();
    const distributedDos = Array.isArray(req.body?.distributedDos) ? req.body.distributedDos : [];

    if (!rawUrl || distributedDos.length === 0) {
      res.json({ ok: true, skipped: true });
      return;
    }

    try {
      const parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        res.status(400).json({ ok: false, error: 'Invalid URL protocol' });
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiSecret) {
        headers['X-API-Key'] = apiSecret;
        headers['Authorization'] = `Bearer ${apiSecret}`;
      }

      const upstream = await fetch(parsedUrl.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'mark_distributed',
          distributedDos,
        }),
        redirect: 'follow',
      });

      res.json({ ok: upstream.ok, status: upstream.status });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Push status failed',
      });
    }
  });

  app.post('/api/gas-proxy', async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const action = String(req.body?.action || 'getAppData').trim();
    const payload =
      req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};

    if (!rawUrl) {
      res.json({ ok: false, code: 'API_ERROR', error: 'অ্যাপস স্ক্রিপ্ট URL দেওয়া হয়নি।' });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      res.json({ ok: false, code: 'API_ERROR', error: 'সঠিক https:// অ্যাপস স্ক্রিপ্ট URL দিন।' });
      return;
    }

    try {
      let upstream: Response;
      if (action === 'getAppData') {
        parsedUrl.searchParams.set('api', '1');
        parsedUrl.searchParams.set('action', 'getAppData');
        if (payload.fy) {
          parsedUrl.searchParams.set('fy', String(payload.fy));
        }
        upstream = await fetch(parsedUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          redirect: 'follow',
        });
      } else {
        upstream = await fetch(parsedUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            Accept: 'application/json',
          },
          body: JSON.stringify({ action, payload }),
          redirect: 'follow',
        });
      }

      const text = await upstream.text();
      const trimmed = text.trim();

      if (!trimmed || trimmed.startsWith('<')) {
        res.json({
          ok: false,
          code: 'HTML_NOT_JSON',
          error:
            'মেইন ওয়েব অ্যাপটি এখনো HTML মোডে রয়েছে। সরাসরি লাইভ সিঙ্কের জন্য Code.gs-এ JSON ব্রিজ কোড যুক্ত করুন।',
        });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        res.json({
          ok: false,
          code: 'HTML_NOT_JSON',
          error: 'অ্যাপস স্ক্রিপ্ট থেকে সঠিক JSON রেসপন্স আসেনি।',
        });
        return;
      }

      if (parsed.ok === false) {
        res.json({
          ok: false,
          code: 'API_ERROR',
          error: String(parsed.error || 'অ্যাপস স্ক্রিপ্ট অনুরোধ ব্যর্থ হয়েছে।'),
        });
        return;
      }

      if ('data' in parsed) {
        res.json({
          ok: true,
          data: parsed.data,
          message: parsed.message ? String(parsed.message) : undefined,
        });
        return;
      }

      res.json({
        ok: true,
        data: parsed,
      });
    } catch (err) {
      res.json({
        ok: false,
        code: 'NETWORK_ERROR',
        error: err instanceof Error ? err.message : 'মেইন ওয়েব অ্যাপে সংযোগ ব্যর্থ হয়েছে।',
      });
    }
  });

  app.use('/api/public-sheets', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.post('/api/public-sheets/fetch', async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Google Sheet URL দেওয়া হয়নি।' });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (
        parsedUrl.protocol !== 'https:' ||
        parsedUrl.hostname !== 'docs.google.com' ||
        !parsedUrl.pathname.startsWith('/spreadsheets/')
      ) {
        throw new Error('Invalid Google Sheets URL');
      }
    } catch {
      res.status(400).json({ ok: false, error: 'শুধুমাত্র বৈধ Google Sheets লিংক সমর্থিত।' });
      return;
    }

    try {
      const upstream = await fetch(parsedUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'text/csv, text/html, text/plain, */*',
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        },
        redirect: 'follow',
      });
      const finalUrl = upstream.url || parsedUrl.toString();
      const text = await upstream.text();
      if (
        finalUrl.includes('accounts.google.com') ||
        text.includes('accounts.google.com/ServiceLogin') ||
        upstream.status === 401 ||
        upstream.status === 403
      ) {
        res.json({
          ok: false,
          code: 'PRIVATE_SHEET',
          status: upstream.status,
          error:
            'এই গুগল শিটটি এখনো পাবলিক লিংক শেয়ার করা নেই। Google Sheet-এ Share → General access → Anyone with the link (Viewer) চালু করুন।',
        });
        return;
      }
      res.json({
        ok: upstream.ok,
        status: upstream.status,
        finalUrl,
        text,
      });
    } catch (err) {
      res.json({
        ok: false,
        code: 'NETWORK_ERROR',
        error: err instanceof Error ? err.message : 'Google Sheet পড়া যায়নি।',
      });
    }
  });

  const androidAuthSessions = new Map<
    string,
    {
      accessToken: string;
      user: {
        uid: string;
        email: string | null;
        displayName: string | null;
        photoURL: string | null;
      };
      expiresAt: number;
    }
  >();

  const pruneAndroidAuthSessions = () => {
    const now = Date.now();
    for (const [k, v] of androidAuthSessions.entries()) {
      if (v.expiresAt <= now) {
        androidAuthSessions.delete(k);
      }
    }
  };

  app.use('/api/android-auth', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.post('/api/android-auth/complete', (req, res) => {
    pruneAndroidAuthSessions();
    const state = String(req.body?.state || '').trim();
    const accessToken = String(req.body?.accessToken || '').trim();
    const rawUser = req.body?.user && typeof req.body.user === 'object' ? req.body.user : {};
    if (state.length < 16 || !accessToken) {
      res.status(400).json({ ok: false, error: 'অবৈধ সাইন-ইন সেশন।' });
      return;
    }
    androidAuthSessions.set(state, {
      accessToken,
      user: {
        uid: String(rawUser.uid || ''),
        email: rawUser.email ? String(rawUser.email) : null,
        displayName: rawUser.displayName ? String(rawUser.displayName) : null,
        photoURL: rawUser.photoURL ? String(rawUser.photoURL) : null,
      },
      expiresAt: Date.now() + 3 * 60 * 1000,
    });
    res.json({ ok: true });
  });

  app.get('/api/android-auth/consume', (req, res) => {
    pruneAndroidAuthSessions();
    const state = String(req.query?.state || '').trim();
    if (!state) {
      res.status(400).json({ ok: false, error: 'Missing state' });
      return;
    }
    const entry = androidAuthSessions.get(state);
    if (!entry) {
      res.json({ ok: true, pending: true });
      return;
    }
    androidAuthSessions.delete(state);
    res.json({
      ok: true,
      pending: false,
      accessToken: entry.accessToken,
      user: entry.user,
    });
  });

  app.use(['/api/build-android-project', '/api/download-source-zip', '/api/download-source-txt', '/api/download-single-source-file'], (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const handleBuildAndroidProjectZip = async (
    incoming: Partial<AndroidAppConfig>,
    webSeed: unknown,
    res: express.Response
  ) => {
    const distDir = path.join(__dirname, 'dist');
    const hasDist = fs.existsSync(path.join(distDir, 'index.html'));

    const config: AndroidAppConfig = {
      ...DEFAULT_ANDROID_CONFIG,
      ...incoming,
      versionCode: Number(incoming.versionCode ?? DEFAULT_ANDROID_CONFIG.versionCode),
      bundleOfflineAssets: hasDist,
    };

    const errors = validateAndroidConfig(config);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join(' ') });
      return;
    }

    try {
      const zip = new JSZip();
      packageAndroidProjectIntoZip(zip, '', config, distDir, hasDist, webSeed);
      packageWebSourceIntoZip(zip, __dirname, 'web-source');

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="khaddo-boraddo-android-apk.zip"'
      );
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to package Android project';
      res.status(500).json({ error: message });
    }
  };

  app.get('/api/build-android-project', async (req, res) => {
    const incoming: Partial<AndroidAppConfig> = {};
    if (typeof req.query.appName === 'string' && req.query.appName.trim()) {
      incoming.appName = req.query.appName.trim();
    }
    if (typeof req.query.packageName === 'string' && req.query.packageName.trim()) {
      incoming.packageName = req.query.packageName.trim();
    }
    if (typeof req.query.targetUrl === 'string' && req.query.targetUrl.trim()) {
      incoming.targetUrl = req.query.targetUrl.trim();
    }
    await handleBuildAndroidProjectZip(incoming, undefined, res);
  });

  app.post('/api/build-android-project', async (req, res) => {
    const incoming = (req.body || {}) as Partial<AndroidAppConfig>;
    const webSeed = (req.body as { webSeed?: unknown })?.webSeed;
    await handleBuildAndroidProjectZip(incoming, webSeed, res);
  });

  const collectWebSourceFiles = () => {
    const files: Array<{ path: string; category: string; size: number; content: string }> = [];
    const textExts = new Set([
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.css',
      '.html',
      '.json',
      '.svg',
      '.md',
      '.example',
      '.gitignore',
      '.yml',
      '.yaml',
    ]);

    const walkDir = (sourceDir: string, prefix: string, category: string) => {
      if (!fs.existsSync(sourceDir)) return;
      const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
          continue;
        }
        const fullPath = path.join(sourceDir, entry.name);
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (relPath.startsWith('public/assets/aistudio')) {
          continue;
        }
        if (entry.isDirectory()) {
          walkDir(fullPath, relPath, category);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!textExts.has(ext) && entry.name !== '.gitignore' && entry.name !== '.env.example') {
            continue;
          }
          const content = fs.readFileSync(fullPath, 'utf-8');
          files.push({
            path: relPath,
            category,
            size: Buffer.byteLength(content, 'utf-8'),
            content,
          });
        }
      }
    };

    const rootFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'index.html',
      'server.ts',
      'metadata.json',
      'firebase-applet-config.json',
      '.env.example',
      '.gitignore',
    ];
    for (const fileName of rootFiles) {
      const filePath = path.join(__dirname, fileName);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        files.push({
          path: fileName,
          category: 'Root & Config',
          size: Buffer.byteLength(content, 'utf-8'),
          content,
        });
      }
    }

    walkDir(path.join(__dirname, 'src'), 'src', 'Frontend (src)');
    walkDir(path.join(__dirname, 'server'), 'server', 'Server');
    walkDir(path.join(__dirname, 'public'), 'public', 'Public Assets');

    return files;
  };

  app.get('/api/source-files', (_req, res) => {
    try {
      const files = collectWebSourceFiles();
      const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
      res.json({ ok: true, totalFiles: files.length, totalBytes, files });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'সোর্স ফাইল পড়া যায়নি।',
      });
    }
  });

  const collectAndroidSourceFiles = (incoming: Partial<AndroidAppConfig>) => {
    const config: AndroidAppConfig = {
      ...DEFAULT_ANDROID_CONFIG,
      ...incoming,
      versionCode: Number(incoming.versionCode ?? DEFAULT_ANDROID_CONFIG.versionCode),
    };
    const pkgPath = config.packageName.replace(/\./g, '/');
    const rawList: Array<{ path: string; category: string; content: string }> = [
      { path: 'README.md', category: 'Root & Gradle', content: generateProjectReadme(config) },
      { path: 'settings.gradle.kts', category: 'Root & Gradle', content: generateSettingsGradleKts(config) },
      { path: 'build.gradle.kts', category: 'Root & Gradle', content: generateRootBuildGradleKts() },
      { path: 'gradle.properties', category: 'Root & Gradle', content: generateGradleProperties() },
      { path: 'gradle/wrapper/gradle-wrapper.properties', category: 'Root & Gradle', content: generateGradleWrapperProperties() },
      { path: '.github/workflows/build-apk.yml', category: 'GitHub Actions', content: generateGitHubActionsWorkflow(config) },
      { path: 'app/build.gradle.kts', category: 'Android App', content: generateAppBuildGradleKts(config) },
      { path: 'app/proguard-rules.pro', category: 'Android App', content: '# Custom ProGuard rules\n' },
      { path: 'app/src/main/AndroidManifest.xml', category: 'Android App', content: generateAndroidManifestXml(config) },
      { path: `app/src/main/java/${pkgPath}/MainActivity.kt`, category: 'Android Kotlin', content: generateMainActivityKt(config) },
      { path: 'app/src/main/res/layout/activity_main.xml', category: 'Android Resources', content: generateActivityMainXml() },
      { path: 'app/src/main/res/values/strings.xml', category: 'Android Resources', content: generateStringsXml(config) },
      { path: 'app/src/main/res/values/colors.xml', category: 'Android Resources', content: generateColorsXml(config) },
      { path: 'app/src/main/res/values/themes.xml', category: 'Android Resources', content: generateThemesXml() },
      { path: 'app/src/main/res/xml/file_paths.xml', category: 'Android Resources', content: generateFilePathsXml() },
      { path: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', category: 'Android Resources', content: generateAdaptiveIconXml() },
      { path: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', category: 'Android Resources', content: generateAdaptiveIconXml() },
      { path: 'app/src/main/res/drawable/ic_launcher_foreground.xml', category: 'Android Resources', content: generateAdaptiveForegroundXml(config) },
    ];
    return rawList.map((f) => ({
      ...f,
      size: Buffer.byteLength(f.content, 'utf-8'),
    }));
  };

  app.post('/api/android-source-files', (req, res) => {
    try {
      const incoming = (req.body || {}) as Partial<AndroidAppConfig>;
      const files = collectAndroidSourceFiles(incoming);
      const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
      res.json({ ok: true, totalFiles: files.length, totalBytes, files });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Android সোর্স ফাইল তৈরি করা যায়নি।',
      });
    }
  });

  app.get('/api/download-source-txt', (req, res) => {
    try {
      const scope = req.query.scope === 'android' ? 'android' : 'web';
      const files =
        scope === 'android'
          ? collectAndroidSourceFiles({
              appName:
                typeof req.query.appName === 'string' && req.query.appName.trim()
                  ? req.query.appName.trim()
                  : undefined,
              packageName:
                typeof req.query.packageName === 'string' && req.query.packageName.trim()
                  ? req.query.packageName.trim()
                  : undefined,
            })
          : collectWebSourceFiles();
      const combined = files
        .map(
          (f) =>
            `// ==========================================\n// FILE: ${f.path}\n// ==========================================\n${f.content}`
        )
        .join('\n\n');
      const fileName =
        scope === 'android'
          ? 'khaddo-stock-android-all-code.txt'
          : 'khaddo-stock-web-all-code.txt';
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(combined);
    } catch (err) {
      res.status(500).send(err instanceof Error ? err.message : 'Failed to build text bundle');
    }
  });

  app.get('/api/download-single-source-file', (req, res) => {
    try {
      const scope = req.query.scope === 'android' ? 'android' : 'web';
      const targetPath = typeof req.query.path === 'string' ? req.query.path : '';
      const files =
        scope === 'android'
          ? collectAndroidSourceFiles({
              appName:
                typeof req.query.appName === 'string' && req.query.appName.trim()
                  ? req.query.appName.trim()
                  : undefined,
              packageName:
                typeof req.query.packageName === 'string' && req.query.packageName.trim()
                  ? req.query.packageName.trim()
                  : undefined,
            })
          : collectWebSourceFiles();
      const found = files.find((f) => f.path === targetPath);
      if (!found) {
        res.status(404).send('File not found');
        return;
      }
      const baseName = (found.path.split('/').pop() || 'code.txt').replace(/"/g, '');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}"`);
      res.send(found.content);
    } catch (err) {
      res.status(500).send(err instanceof Error ? err.message : 'Failed to download file');
    }
  });

  app.get('/api/download-source-zip', async (_req, res) => {
    try {
      const zip = new JSZip();
      const distDir = path.join(__dirname, 'dist');
      const hasDist = fs.existsSync(path.join(distDir, 'index.html'));
      const config: AndroidAppConfig = {
        ...DEFAULT_ANDROID_CONFIG,
        bundleOfflineAssets: hasDist,
      };

      packageWebSourceIntoZip(zip, __dirname, '');
      packageAndroidProjectIntoZip(zip, 'android', config, distDir, hasDist);
      zip.file('.github/workflows/build-apk.yml', generateGitHubActionsWorkflow(config));

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="khaddo-boraddo-source-code.zip"'
      );
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to package source code';
      res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
