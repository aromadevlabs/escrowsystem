'use strict';
// Minimal Discord bot client — just enough to DM buyers when an asset updates.
// Needs DISCORD_BOT_TOKEN, and the bot must share a server with the buyer
// (your Quantix server) for the DM to go through.
const https = require('https');
const config = require('./config');

const API = 'discord.com';
const V = '/api/v10';

function api(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      hostname: API, path: V + path, method,
      headers: {
        Authorization: `Bot ${config.botToken}`,
        'Content-Type': 'application/json',
        'Content-Length': data ? data.length : 0,
        'User-Agent': 'QuantixEscrow (https://quantixlabs, 1.0)',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
        resolve({ status: res.statusCode, json, retryAfter: json && json.retry_after });
      });
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openDm(userId) {
  const r = await api('POST', '/users/@me/channels', { recipient_id: userId });
  if (r.status === 429) { await sleep((r.retryAfter || 1) * 1000); return openDm(userId); }
  return r.status < 300 && r.json ? r.json.id : null;
}

async function sendDm(userId, payload) {
  const channelId = await openDm(userId);
  if (!channelId) return false; // user not reachable (not in a shared server, or DMs closed)
  const r = await api('POST', `/channels/${channelId}/messages`, payload);
  if (r.status === 429) { await sleep((r.retryAfter || 1) * 1000); const r2 = await api('POST', `/channels/${channelId}/messages`, payload); return r2.status < 300; }
  return r.status < 300;
}

function updateMessage({ assetName, version, changelog, url }) {
  const lines = [`**${assetName}** has been updated to **v${version}**.`];
  if (changelog) lines.push('', '**What changed:**', changelog.slice(0, 1500));
  lines.push('', 'Please download the updated version from your assets.');
  return {
    embeds: [{
      title: `🔄 ${assetName} updated`,
      description: lines.join('\n'),
      color: 0x2f8bff,
      footer: { text: 'Quantix Escrow System' },
      timestamp: new Date().toISOString(),
    }],
    components: [{
      type: 1,
      components: [{ type: 2, style: 5, label: 'Download update', url }],
    }],
  };
}

// DM a list of Discord IDs about an asset update. De-dupes IDs.
async function notifyUpdate(discordIds, info) {
  if (!config.botToken) return { enabled: false, sent: 0, failed: 0, total: 0 };
  const ids = [...new Set(discordIds.filter(Boolean))];
  const payload = updateMessage(info);
  let sent = 0, failed = 0;
  for (const id of ids) {
    const ok = await sendDm(id, payload);
    if (ok) sent++; else failed++;
    await sleep(350); // stay well under Discord's DM rate limits
  }
  return { enabled: true, sent, failed, total: ids.length };
}

module.exports = { notifyUpdate, sendDm };
