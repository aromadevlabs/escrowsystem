'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { readZip, writeZip, ZipError } = require('./lib/zip');
const { encrypt, decrypt, newDataKey, wrapKey, unwrapKey, newId } = require('./lib/crypto');
const { classify, lockableFiles, bucketOf, parseManifest } = require('./manifest');

const BLOB_DIR = path.join(config.storageDir, 'blobs');
fs.mkdirSync(BLOB_DIR, { recursive: true });

function findManifest(files) {
  // fxmanifest.lua / __resource.lua at the shallowest depth
  const cands = files.filter((f) => /(^|\/)(fxmanifest|__resource)\.lua$/i.test(f.name));
  cands.sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  return cands[0] || null;
}

// If every file sits under one top folder (resource-name/...), strip it.
function stripRoot(files) {
  const tops = new Set(files.map((f) => f.name.split('/')[0]));
  if (tops.size !== 1) return files;
  const root = [...tops][0] + '/';
  if (!files.every((f) => f.name.startsWith(root) && f.name.length > root.length)) return files;
  return files.map((f) => ({ name: f.name.slice(root.length), data: f.data }));
}

/** Inspect an uploaded zip: returns manifest info + the list of lockable files. */
function inspectZip(buf) {
  let files;
  try { files = readZip(buf, { maxTotalBytes: config.maxUploadBytes * 4 }); }
  catch (e) { if (e instanceof ZipError) throw new ValidationError(e.message); throw e; }
  files = stripRoot(files);
  const manifestEntry = findManifest(files);
  if (!manifestEntry) throw new ValidationError('No fxmanifest.lua found in the zip — is this a FiveM resource?');
  const manifestSrc = manifestEntry.data.toString('utf8');
  const base = manifestEntry.name.includes('/') ? manifestEntry.name.slice(0, manifestEntry.name.lastIndexOf('/') + 1) : '';
  // normalize paths relative to the manifest folder
  const rel = files
    .filter((f) => !base || f.name.startsWith(base))
    .map((f) => ({ name: base ? f.name.slice(base.length) : f.name, data: f.data }))
    .filter((f) => f.name && !f.name.endsWith('/'))
    // The manifest is regenerated on download, so it is never stored or shipped as-is.
    .filter((f) => !/^(fxmanifest|__resource)\.lua$/i.test(f.name));
  const paths = rel.map((f) => f.name);
  const info = parseManifest(manifestSrc);
  return { files: rel, manifestSrc, paths, lockable: lockableFiles(manifestSrc, paths), info };
}

class ValidationError extends Error {}

/**
 * Create and store an encrypted asset.
 * visible = array of file paths the creator left open (everything else that is
 * referenced Lua gets encrypted).
 */
function createAsset(store, owner, buf, meta, visible) {
  const inspected = inspectZip(buf);
  const visibleSet = new Set(visible || []);
  const classified = classify(inspected.manifestSrc, inspected.paths, visibleSet);

  const dataKey = newDataKey();
  const id = newId('asset');
  const blobPath = path.join(BLOB_DIR, `${id}.qxv`);

  // Vault blob = encrypted zip of the PROTECTED files only (the secret source).
  const protectedEntries = inspected.files.filter((f) => classified.protectedFiles.includes(f.name));
  const vaultZip = writeZip(protectedEntries.length ? protectedEntries : [{ name: '.empty', data: '' }]);
  fs.writeFileSync(blobPath, encrypt(dataKey, vaultZip));

  // Open payload = everything that ships in the clear (configs, locales, NUI, non-locked Lua).
  const openEntries = inspected.files.filter((f) => classified.visibleFiles.includes(f.name));
  const openZip = writeZip(openEntries.length ? openEntries : [{ name: '.gitkeep', data: '' }]);
  const openPath = path.join(BLOB_DIR, `${id}.open.zip`);
  fs.writeFileSync(openPath, openZip);

  const fileList = inspected.paths.map((p) => ({
    path: p,
    visible: classified.visibleFiles.includes(p),
    bucket: classified.protectedFiles.includes(p) ? bucketOf(classified, p) : null,
  }));

  const asset = {
    id,
    name: (meta.name || inspected.info.name || 'resource').trim(),
    version: (meta.version || inspected.info.version || '1.0.0').trim(),
    category: meta.category || 'other',
    customCategory: meta.customCategory || '',
    price: meta.price || '',
    description: (meta.description || inspected.info.description || '').trim(),
    resourceName: (meta.resourceName || inspected.info.name || id).replace(/[^A-Za-z0-9_-]/g, '_'),
    owner,
    creatorId: meta.creatorId || '',
    creatorName: meta.creatorName || meta.creatorId || owner,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    wrappedKey: wrapKey(config.masterKey, dataKey),
    files: fileList,
    protectedCount: classified.protectedFiles.length,
    visibleCount: classified.visibleFiles.length,
    blob: path.basename(blobPath),
    open: path.basename(openPath),
  };
  store.assets.unshift(asset);
  store.audit(owner, 'asset.create', { assetId: id, name: asset.name });
  store.save();
  return publicAsset(asset);
}

function publicAsset(a) {
  return {
    id: a.id, name: a.name, version: a.version, category: a.category, customCategory: a.customCategory,
    price: a.price, description: a.description, resourceName: a.resourceName, owner: a.owner,
    creatorId: a.creatorId || '', creatorName: a.creatorName || a.owner,
    createdAt: a.createdAt, updatedAt: a.updatedAt || a.createdAt,
    files: a.files, protectedCount: a.protectedCount, visibleCount: a.visibleCount,
  };
}

/** Decrypt an asset's protected files back to [{name,data}] (used to build buyer package). */
function openVault(asset) {
  const dataKey = unwrapKey(config.masterKey, asset.wrappedKey);
  const blob = fs.readFileSync(path.join(BLOB_DIR, asset.blob));
  const zipBuf = decrypt(dataKey, blob);
  return readZip(zipBuf).filter((f) => f.name !== '.empty');
}

function openFiles(asset) {
  const zipBuf = fs.readFileSync(path.join(BLOB_DIR, asset.open));
  return readZip(zipBuf).filter((f) => f.name !== '.gitkeep');
}

function removeAsset(store, asset) {
  for (const f of [asset.blob, asset.open]) {
    try { fs.unlinkSync(path.join(BLOB_DIR, f)); } catch { /* already gone */ }
  }
}

module.exports = { inspectZip, createAsset, publicAsset, openVault, openFiles, removeAsset, ValidationError };
