'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { createRouter, readJson, readBody, parseCookies, enhance, serveStatic, sendFile, HttpError } = require('./lib/http');
const multipart = require('./lib/multipart');
const Store = require('./lib/store');
const auth = require('./auth');
const assetSvc = require('./assets');
const grantSvc = require('./grants');
const { buildBuyerZip } = require('./package');
const discord = require('./discord');

if (config.problems.length) {
  console.error('\n  Quantix Escrow cannot start — configuration is incomplete:\n');
  for (const p of config.problems) console.error('   • ' + p);
  console.error('\n  Copy .env.example to .env and fill it in (run: npm run setup to generate keys).\n');
  process.exit(1);
}

const store = new Store(path.join(config.storageDir, 'data.json'));
const PAGES = path.join(config.ROOT, 'pages');
const PUBLIC = path.join(config.ROOT, 'public');
const router = createRouter();

const page = (file) => (req, res) => sendFile(res, path.join(PAGES, file));

// ---- Pages ----
router.get('/', (req, res) => {
  const u = auth.currentUser(req, store);
  res.redirect(u ? (u.team ? '/app/create' : '/app/vault') : '/login');
});
router.get('/login', page('login.html'));
router.get('/app/create', page('create.html'));
router.get('/app/grant', page('grant.html'));
router.get('/app/granted', page('granted.html'));
router.get('/app/resources', page('resources.html'));
router.get('/app/vault', page('vault.html'));

// ---- Auth ----
router.get('/auth/discord', (req, res) => auth.beginLogin(res));
router.get('/auth/discord/callback', async (req, res) => {
  if (req.query.error) return res.redirect('/login?denied=1');
  await auth.completeLogin(req, res, store);
  res.redirect('/');
});
router.post('/auth/logout', (req, res) => { auth.logout(res); res.json(200, { ok: true }); });

router.get('/api/me', (req, res) => {
  const u = auth.currentUser(req, store);
  if (!u) return res.json(200, { user: null });
  res.json(200, { user: { id: u.id, username: u.username, handle: u.handle, avatar: u.avatar, team: u.team } });
});

// ---- Creator: assets ----
router.post('/api/assets/inspect', async (req, res) => {
  auth.requireTeam(req, store);
  const { fields, files } = await readMultipart(req);
  if (!files.file) throw new HttpError(400, 'No file uploaded.');
  const info = assetSvc.inspectZip(files.file.data);
  res.json(200, {
    manifest: { name: info.info.name, version: info.info.version, description: info.info.description },
    files: info.paths,
    lockable: info.lockable,
  });
});

router.post('/api/assets', async (req, res) => {
  const user = auth.requireTeam(req, store);
  const { fields, files } = await readMultipart(req);
  if (!files.file) throw new HttpError(400, 'No file uploaded.');
  let visible = [];
  try { visible = JSON.parse(fields.visible || '[]'); } catch { throw new HttpError(400, 'Bad visible list'); }
  const creatorId = (fields.creatorId || '').trim();
  if (!/^\d{17,20}$/.test(creatorId)) throw new HttpError(400, 'A valid creator Discord ID is required to lock an asset.');
  const creatorName = (store.users[creatorId] && store.users[creatorId].username) || creatorId;
  const meta = {
    name: fields.name, version: fields.version, category: fields.category,
    customCategory: fields.customCategory, price: fields.price, description: fields.description,
    creatorId, creatorName,
  };
  try {
    const asset = assetSvc.createAsset(store, user.username, files.file.data, meta, visible);
    res.json(201, { asset });
  } catch (e) {
    if (e instanceof assetSvc.ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
});

router.get('/api/assets', (req, res) => {
  auth.requireTeam(req, store);
  res.json(200, { assets: store.assets.map(assetSvc.publicAsset) });
});

// Upload a new version of an existing asset, then DM every active buyer.
router.post('/api/assets/:id/update', async (req, res) => {
  const user = auth.requireTeam(req, store);
  const asset = store.assets.find((a) => a.id === req.params.id);
  if (!asset) throw new HttpError(404, 'Asset not found');
  const { fields, files } = await readMultipart(req);
  if (!files.file) throw new HttpError(400, 'No file uploaded.');
  let visible = [];
  try { visible = JSON.parse(fields.visible || '[]'); } catch { throw new HttpError(400, 'Bad visible list'); }
  const changelog = (fields.changelog || '').trim();
  const chosenVisible = (visible.length || fields.visible !== undefined) ? visible : asset.files.filter((f) => f.visible).map((f) => f.path);
  let updated;
  try {
    updated = assetSvc.updateAsset(store, asset, files.file.data, { version: fields.version, description: fields.description, changelog, actor: user.username }, chosenVisible);
  } catch (e) {
    if (e instanceof assetSvc.ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
  const buyers = store.grants.filter((g) => g.assetId === asset.id && g.status === 'active');
  const notify = await discord.notifyUpdate(buyers.map((g) => g.discordId), {
    assetName: asset.name, version: asset.version, changelog, url: `${config.baseUrl}/app/vault`,
  });
  store.audit(user.username, 'asset.update.notify', { assetId: asset.id, ...notify });
  store.save();
  res.json(200, { asset: updated, notify, buyers: buyers.length });
});

router.delete('/api/assets/:id', (req, res) => {
  auth.requireTeam(req, store);
  const i = store.assets.findIndex((a) => a.id === req.params.id);
  if (i < 0) throw new HttpError(404, 'Asset not found');
  assetSvc.removeAsset(store, store.assets[i]);
  store.data.grants = store.grants.filter((g) => g.assetId !== req.params.id);
  const [removed] = store.assets.splice(i, 1);
  store.audit(auth.currentUser(req, store).username, 'asset.delete', { assetId: removed.id });
  store.save();
  res.json(200, { ok: true });
});

// ---- Creator: grants / sharing ----
router.post('/api/grants', async (req, res) => {
  const user = auth.requireTeam(req, store);
  const body = await readJson(req);
  const ids = (body.discordIds || (body.discordId ? [body.discordId] : [])).map(String);
  if (!ids.length) throw new HttpError(400, 'Add at least one Discord ID.');
  const results = [];
  for (const id of ids) {
    try {
      const g = grantSvc.grantAccess(store, user.username, body.assetId, id.trim(), { term: body.term, note: body.note });
      results.push({ discordId: id, ok: true, licenseKey: g.licenseKey });
    } catch (e) {
      results.push({ discordId: id, ok: false, error: e.message });
    }
  }
  res.json(200, { results });
});

router.get('/api/grants', (req, res) => {
  auth.requireTeam(req, store);
  res.json(200, { grants: store.grants.map(grantSvc.publicGrant) });
});

router.patch('/api/grants/:id', async (req, res) => {
  const user = auth.requireTeam(req, store);
  const body = await readJson(req);
  if (!['active', 'revoked'].includes(body.status)) throw new HttpError(400, 'status must be active or revoked');
  const g = grantSvc.setStatus(store, user.username, req.params.id, body.status);
  res.json(200, { grant: grantSvc.publicGrant(g) });
});

// ---- Buyer: vault + download ----
router.get('/api/vault', (req, res) => {
  const user = auth.requireUser(req, store);
  const grants = grantSvc.grantsForBuyer(store, user.id).map((g) => {
    const a = grantSvc.findAsset(store, g.assetId);
    return {
      grantId: g.id, licenseKey: g.licenseKey, term: g.term, grantedAt: g.grantedAt,
      asset: a ? { id: a.id, name: a.name, version: a.version, category: a.category, description: a.description, creatorId: a.creatorId || '', creatorName: a.creatorName || a.owner } : null,
    };
  }).filter((x) => x.asset);
  res.json(200, { grants });
});

router.get('/api/download/:grantId', (req, res) => {
  const user = auth.requireUser(req, store);
  const g = store.grants.find((x) => x.id === req.params.grantId);
  if (!g || g.discordId !== user.id) throw new HttpError(404, 'Not found');
  if (g.status !== 'active') throw new HttpError(403, 'This license has been revoked.');
  const asset = grantSvc.findAsset(store, g.assetId);
  if (!asset) throw new HttpError(404, 'Asset no longer available');
  const { zip, filename } = buildBuyerZip(asset, g);
  store.audit(user.username, 'asset.download', { assetId: asset.id, grantId: g.id });
  store.save();
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': zip.length,
    'Cache-Control': 'no-store',
  });
  res.end(zip);
});

// ---- Runtime: FiveM loader validates the license and pulls protected code ----
router.post('/api/runtime/bundle', async (req, res) => {
  const body = await readJson(req);
  const g = grantSvc.grantByLicense(store, (body.license || '').trim());
  if (!g) return res.json(403, { ok: false, error: 'Unknown license key' });
  if (g.status !== 'active') return res.json(403, { ok: false, error: 'License revoked' });

  // Bind to the first server that uses it (soft server-lock on the sv_licenseKey fragment).
  const fragment = (body.sv_license || '').trim();
  if (g.boundTo && fragment && g.boundTo !== fragment) {
    return res.json(403, { ok: false, error: 'License is locked to a different server' });
  }
  if (!g.boundTo && fragment) g.boundTo = fragment;
  g.lastCheck = new Date().toISOString();
  g.lastResource = body.resource || '';
  store.save();

  const asset = grantSvc.findAsset(store, g.assetId);
  if (!asset) return res.json(404, { ok: false, error: 'Asset unavailable' });

  const protectedFiles = assetSvc.openVault(asset); // [{name,data}]
  const byBucket = { client: [], server: [], shared: [] };
  for (const f of protectedFiles) {
    const meta = asset.files.find((x) => x.path === f.name);
    const bucket = meta && meta.bucket ? meta.bucket : 'shared';
    byBucket[bucket].push({ name: f.name, source: f.data.toString('utf8') });
  }
  res.json(200, { ok: true, recheck: config.recheckSeconds, ...byBucket });
});

router.get('/api/health', (req, res) => res.json(200, { ok: true, assets: store.assets.length, grants: store.grants.length }));

// ---- helpers ----
async function readMultipart(req) {
  const type = req.headers['content-type'] || '';
  if (!type.includes('multipart/form-data')) throw new HttpError(415, 'Expected a file upload');
  const buf = await readBody(req, config.maxUploadBytes);
  return multipart.parse(buf, type);
}

// ---- server ----
const server = http.createServer(async (req, res) => {
  enhance(res);
  req.cookies = parseCookies(req.headers.cookie);
  try {
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url.startsWith('/static/')) {
      const rewritten = { ...req, url: req.url.replace('/static', '') };
      if (serveStatic(PUBLIC, rewritten, res)) return;
    }
    await router.handle(req, res, (rq, rs) => {
      if (rq.path.startsWith('/api/')) rs.json(404, { error: 'Not found' });
      else { rs.writeHead(302, { Location: '/' }); rs.end(); }
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    if (!res.writableEnded) {
      if ((req.headers.accept || '').includes('text/html') && !req.path.startsWith('/api/')) {
        res.writeHead(status, { 'Content-Type': 'text/html' });
        res.end(`<h1>${status}</h1><p>${escapeHtml(err.message || 'Error')}</p><p><a href="/">Home</a></p>`);
      } else {
        res.json(status, { error: err.message || 'Server error' });
      }
    }
  }
});

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

server.listen(config.port, config.host, () => {
  console.log(`\n  Quantix Escrow System`);
  console.log(`  running at ${config.baseUrl}  (bound to ${config.host}:${config.port})`);
  console.log(`  dev team role: ${config.teamRoleId} · assets: ${store.assets.length} · grants: ${store.grants.length}\n`);
});
