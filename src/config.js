'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Minimal .env loader (no dependencies). Existing environment variables win.
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnv();

const problems = [];
function need(name) {
  const v = (process.env[name] || '').trim();
  if (!v) problems.push(`${name} is not set`);
  return v;
}

const baseUrl = need('BASE_URL').replace(/\/+$/, '');
const masterKeyHex = need('MASTER_KEY');
const sessionSecret = need('SESSION_SECRET');

if (masterKeyHex && !/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) problems.push('MASTER_KEY must be 64 hex characters (run: npm run setup)');
if (sessionSecret && sessionSecret.length < 32) problems.push('SESSION_SECRET must be at least 32 characters (run: npm run setup)');

const config = {
  ROOT,
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  baseUrl,
  secureCookies: baseUrl.startsWith('https://'),
  discord: {
    clientId: need('DISCORD_CLIENT_ID'),
    clientSecret: need('DISCORD_CLIENT_SECRET'),
    redirectUri: `${baseUrl}/auth/discord/callback`,
  },
  guildId: need('DISCORD_GUILD_ID'),
  teamRoleId: need('TEAM_ROLE_ID'),
  masterKey: masterKeyHex ? Buffer.from(masterKeyHex, 'hex') : null,
  sessionSecret,
  botToken: (process.env.DISCORD_BOT_TOKEN || '').trim(), // optional — enables update DMs
  supportDiscord: (process.env.SUPPORT_DISCORD || 'https://discord.gg/quantixlabs').trim(),
  storageDir: path.resolve(ROOT, process.env.STORAGE_DIR || 'storage'),
  maxUploadBytes: Math.max(1, parseInt(process.env.MAX_UPLOAD_MB || '50', 10)) * 1024 * 1024,
  trustProxy: /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || ''),
  recheckSeconds: Math.max(300, parseInt(process.env.LICENSE_RECHECK_SECONDS || '1800', 10)),
  problems,
};

if (config.guildId && !/^\d{17,20}$/.test(config.guildId)) problems.push('DISCORD_GUILD_ID must be a Discord server ID');
if (config.teamRoleId && !/^\d{17,20}$/.test(config.teamRoleId)) problems.push('TEAM_ROLE_ID must be a Discord role ID');

module.exports = config;
