'use strict';
const crypto = require('crypto');

// AES-256-GCM. Output layout: [12-byte IV][16-byte auth tag][ciphertext]
function encrypt(key, plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function decrypt(key, blob) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

// Each asset has its own data key, stored wrapped (encrypted) with the master key.
function newDataKey() { return crypto.randomBytes(32); }
function wrapKey(masterKey, dataKey) { return encrypt(masterKey, dataKey).toString('base64'); }
function unwrapKey(masterKey, wrapped) { return decrypt(masterKey, Buffer.from(wrapped, 'base64')); }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
function randomCode(len) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}
function licenseKey() {
  return `QX-${randomCode(5)}-${randomCode(5)}-${randomCode(5)}-${randomCode(5)}`;
}
function newId(prefix) { return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`; }

function hmac(secret, data) { return crypto.createHmac('sha256', secret).update(data).digest('base64url'); }
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = { encrypt, decrypt, newDataKey, wrapKey, unwrapKey, licenseKey, newId, hmac, safeEqual, randomToken: (n = 24) => crypto.randomBytes(n).toString('base64url') };
