'use strict';
// Generates MASTER_KEY and SESSION_SECRET and writes a .env if missing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const master = crypto.randomBytes(32).toString('hex');
const secret = crypto.randomBytes(48).toString('base64url');

if (fs.existsSync(envPath)) {
  console.log('\n.env already exists — not overwriting it.');
  console.log('Here are fresh secrets if you need them:\n');
  console.log('  MASTER_KEY=' + master);
  console.log('  SESSION_SECRET=' + secret + '\n');
  console.log('WARNING: changing MASTER_KEY makes existing encrypted assets unreadable.\n');
  process.exit(0);
}

const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const filled = example
  .replace(/^MASTER_KEY=.*$/m, 'MASTER_KEY=' + master)
  .replace(/^SESSION_SECRET=.*$/m, 'SESSION_SECRET=' + secret);
fs.writeFileSync(envPath, filled);
console.log('\nCreated .env with freshly generated MASTER_KEY and SESSION_SECRET.');
console.log('Now open .env and fill in your Discord app details and TEAM_DISCORD_IDS.\n');
