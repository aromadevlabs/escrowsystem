'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { writeZip } = require('./lib/zip');
const { openFiles } = require('./assets');

const LOADER_DIR = path.join(config.ROOT, 'loader');

/**
 * Build the buyer's downloadable resource zip.
 * Contains: generated fxmanifest.lua, all VISIBLE files (configs etc.),
 * and the Quantix loader that fetches + runs the protected code at runtime.
 * The protected source is NEVER written into this zip.
 */
function buildBuyerZip(asset, grant) {
  const resourceName = asset.resourceName || 'quantix_resource';
  const entries = [];

  // Visible files, kept at their original paths inside the resource.
  const visible = openFiles(asset);
  for (const f of visible) entries.push({ name: `${resourceName}/${f.name}`, data: f.data });

  // Loader lua
  const serverLoader = fs.readFileSync(path.join(LOADER_DIR, 'qx_server.lua'), 'utf8');
  const clientLoader = fs.readFileSync(path.join(LOADER_DIR, 'qx_client.lua'), 'utf8');
  entries.push({ name: `${resourceName}/qx_loader/qx_server.lua`, data: serverLoader });
  entries.push({ name: `${resourceName}/qx_loader/qx_client.lua`, data: clientLoader });

  // license.cfg — buyer adds `exec` or sets the convar; we bake the key here.
  const licenseCfg =
`# Quantix Escrow license for ${asset.name} ${asset.version}
# Keep this file private. Do not share your license key.
set qx_license "${grant.licenseKey}"
set qx_endpoint "${config.baseUrl}"
`;
  entries.push({ name: `${resourceName}/license.cfg`, data: licenseCfg });

  // Generated manifest: references ONLY visible scripts + the loader.
  entries.push({ name: `${resourceName}/fxmanifest.lua`, data: buildManifest(asset) });

  // Readme for the buyer
  entries.push({ name: `${resourceName}/QUANTIX_README.txt`, data: buyerReadme(asset, grant, resourceName) });

  return { zip: writeZip(entries), filename: `${resourceName}-${asset.version}.zip` };
}

function buildManifest(asset) {
  const visibleClient = [];
  const visibleServer = [];
  const visibleShared = [];
  // Visible referenced lua keeps running normally; non-lua assets (html/img) stay as files.
  for (const f of asset.files) {
    if (!f.visible || !f.path.endsWith('.lua')) continue;
    // Heuristic bucket from folder name for visible lua.
    if (/(^|\/)server/i.test(f.path)) visibleServer.push(f.path);
    else if (/(^|\/)(shared|config|locale)/i.test(f.path)) visibleShared.push(f.path);
    else visibleClient.push(f.path);
  }
  const uiPage = asset.files.find((f) => /html\/index\.html$/i.test(f.path));
  const files = asset.files.filter((f) => f.visible && /\.(html|css|js|png|jpg|jpeg|svg|ttf|otf|woff2?|ogg|json)$/i.test(f.path));

  const list = (arr) => arr.map((s) => `    '${s}',`).join('\n');
  return `fx_version 'cerulean'
game 'gta5'
lua54 'yes'

-- Protected by Quantix Escrow System
-- ${asset.name} v${asset.version}
author '${(asset.owner || 'Quantix Labs').replace(/'/g, '')}'
description '${(asset.description || '').replace(/'/g, '').slice(0, 120)}'
version '${asset.version}'

-- Quantix loader (fetches and runs the protected code at runtime)
server_script 'qx_loader/qx_server.lua'
client_script 'qx_loader/qx_client.lua'
${visibleShared.length ? `\n-- Open shared files\nshared_scripts {\n${list(visibleShared)}\n}\n` : ''}${visibleServer.length ? `\n-- Open server files\nserver_scripts {\n${list(visibleServer)}\n}\n` : ''}${visibleClient.length ? `\n-- Open client files\nclient_scripts {\n${list(visibleClient)}\n}\n` : ''}${uiPage ? `\nui_page '${uiPage.path}'\n` : ''}${files.length ? `\nfiles {\n${list(files.map((f) => f.path))}\n}\n` : ''}`;
}

function buyerReadme(asset, grant, resourceName) {
  return `QUANTIX ESCROW SYSTEM
=====================

Asset:   ${asset.name} ${asset.version}
Buyer:   Discord ID ${grant.discordId}
License: ${grant.licenseKey}

INSTALL
-------
1. Drop the "${resourceName}" folder into your server's resources directory.
2. In your server.cfg, before "ensure ${resourceName}", add:

       exec @${resourceName}/license.cfg

   (or set the convar yourself: set qx_license "${grant.licenseKey}")

3. Add:   ensure ${resourceName}
4. Restart the server.

HOW IT WORKS
------------
The protected scripts are not in this folder. On start, the Quantix loader
validates your license with the Quantix server and streams the protected code
into memory. You can edit any visible file (configs, locales, UI) freely.

Your license key is tied to your Discord account${grant.boundTo ? ' and server' : ''}.
Do not share it. Sharing or leaking the key will get the license revoked.

Need help? Contact the Quantix team.
Discord: https://discord.gg/quantixlabs
`;
}

module.exports = { buildBuyerZip };
