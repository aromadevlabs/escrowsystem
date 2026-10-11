'use strict';
// Reads a FiveM fxmanifest.lua (or __resource.lua) well enough to know which
// Lua files are referenced, and generates the manifest that ships to buyers.

// Pull every quoted string out of a directive like: client_scripts { 'a.lua', 'b/*.lua' }
function stringsAfter(src, key) {
  const re = new RegExp(`${key}\\b`, 'g');
  const results = [];
  let m;
  while ((m = re.exec(src))) {
    // Grab the rest of the logical statement: up to the next top-level directive or blank line block.
    const tail = src.slice(m.index + key.length);
    // stop at the next directive keyword line, or end
    const stop = tail.search(/\n\s*[a-z_]+\s*[\{'"\s]/);
    const chunk = stop < 0 ? tail : tail.slice(0, stop + 1);
    const quoted = chunk.match(/(['"])((?:\\.|(?!\1).)*)\1/g) || [];
    for (const q of quoted) results.push(q.slice(1, -1));
  }
  return results;
}

function singleString(src, key) {
  const m = src.match(new RegExp(`${key}\\s+(['"])((?:\\\\.|(?!\\1).)*)\\1`));
  return m ? m[2] : null;
}

const SCRIPT_KEYS = [
  ['client_scripts', 'client'], ['client_script', 'client'],
  ['server_scripts', 'server'], ['server_script', 'server'],
  ['shared_scripts', 'shared'], ['shared_script', 'shared'],
];

function parseManifest(src) {
  const scripts = { client: [], server: [], shared: [] };
  for (const [key, bucket] of SCRIPT_KEYS) {
    for (const v of stringsAfter(src, key)) {
      if (v.endsWith('.lua') && !scripts[bucket].includes(v)) scripts[bucket].push(v);
    }
  }
  return {
    name: singleString(src, 'name'),
    version: singleString(src, 'version'),
    description: singleString(src, 'description'),
    author: singleString(src, 'author'),
    scripts,
  };
}

// Expand a glob like "client/*.lua" or "**/*.lua" against the list of file paths.
function matchGlob(pattern, files) {
  const re = new RegExp('^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '.') + '$');
  return files.filter((f) => re.test(f));
}

/**
 * Decide which Lua files are protected (encrypted) and which stay visible.
 * visibleSet = set of paths the creator chose to leave open.
 * Returns { protectedFiles:[], visibleFiles:[], byBucket:{client,server,shared} }
 */
function classify(src, filePaths, visibleSet) {
  const manifest = parseManifest(src);
  const lua = filePaths.filter((f) => f.endsWith('.lua'));
  const byBucket = { client: new Set(), server: new Set(), shared: new Set() };
  for (const bucket of Object.keys(byBucket)) {
    for (const pat of manifest.scripts[bucket]) {
      for (const f of matchGlob(pat, lua)) byBucket[bucket].add(f);
    }
  }
  const referenced = new Set([...byBucket.client, ...byBucket.server, ...byBucket.shared]);
  const protectedFiles = [];
  const visibleFiles = [];
  for (const f of filePaths) {
    const isLua = f.endsWith('.lua');
    const open = visibleSet.has(f) || !isLua && !referenced.has(f) ? true : false;
    // Only referenced Lua can be protected; everything else is shipped as-is (visible).
    if (isLua && referenced.has(f) && !visibleSet.has(f)) protectedFiles.push(f);
    else visibleFiles.push(f);
  }
  return { manifest, protectedFiles, visibleFiles, byBucket };
}

/** All referenced Lua files — the ones eligible to be locked. */
function lockableFiles(src, filePaths) {
  const manifest = parseManifest(src);
  const lua = filePaths.filter((f) => f.endsWith('.lua'));
  const set = new Set();
  for (const bucket of Object.keys(manifest.scripts)) {
    for (const pat of manifest.scripts[bucket]) for (const f of matchGlob(pat, lua)) set.add(f);
  }
  return [...set];
}

/** Which bucket (client/server/shared) a protected file loads in. */
function bucketOf(classified, file) {
  if (classified.byBucket.client.has(file)) return 'client';
  if (classified.byBucket.server.has(file)) return 'server';
  return 'shared';
}

module.exports = { parseManifest, classify, lockableFiles, matchGlob, bucketOf };
