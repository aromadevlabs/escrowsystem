'use strict';
const https = require('https');
const config = require('./config');
const { randomToken } = require('./lib/crypto');
const { HttpError, signValue, verifyValue } = require('./lib/http');

const SESSION_COOKIE = 'qx_sess';
const STATE_COOKIE = 'qx_oauth';
const SESSION_TTL = 7 * 24 * 3600 * 1000;

function postForm(hostname, path, form) {
  return request(hostname, path, 'POST', new URLSearchParams(form).toString(), {
    'Content-Type': 'application/x-www-form-urlencoded',
  });
}
function getJson(hostname, path, token, { allow404 = false } = {}) {
  return request(hostname, path, 'GET', null, { Authorization: `Bearer ${token}` }, { allow404 });
}
function request(hostname, path, method, body, headers, { allow404 = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers: { ...headers, 'Content-Length': body ? Buffer.byteLength(body) : 0, 'User-Agent': 'QuantixEscrow/1.0' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 404 && allow404) return resolve(null);
        if (res.statusCode >= 400) return reject(new HttpError(502, `Discord returned ${res.statusCode}`));
        try { resolve(JSON.parse(text)); } catch { reject(new HttpError(502, 'Bad response from Discord')); }
      });
    });
    req.on('error', () => reject(new HttpError(502, 'Could not reach Discord')));
    if (body) req.write(body);
    req.end();
  });
}

// Does this user hold the dev-team role in the configured guild?
async function hasTeamRole(accessToken) {
  try {
    const member = await getJson('discord.com', `/api/users/@me/guilds/${config.guildId}/member`, accessToken, { allow404: true });
    if (!member || !Array.isArray(member.roles)) return false; // not in the server
    return member.roles.includes(config.teamRoleId);
  } catch {
    return false; // if Discord can't confirm the role, treat as a buyer
  }
}

function beginLogin(res) {
  const state = randomToken(18);
  res.setCookie(STATE_COOKIE, signValue(config.sessionSecret, { state, exp: Date.now() + 10 * 60 * 1000 }), {
    secure: config.secureCookies, maxAge: 600, sameSite: 'Lax',
  });
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state,
    prompt: 'consent',
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
}

async function completeLogin(req, res, store) {
  const saved = verifyValue(config.sessionSecret, req.cookies[STATE_COOKIE]);
  res.setCookie(STATE_COOKIE, '', { secure: config.secureCookies, maxAge: 0 });
  if (!saved || !req.query.state || saved.state !== req.query.state) throw new HttpError(400, 'Login state mismatch — please try again.');
  if (!req.query.code) throw new HttpError(400, 'Discord did not return an authorization code.');

  const token = await postForm('discord.com', '/api/oauth2/token', {
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code: req.query.code,
    redirect_uri: config.discord.redirectUri,
  });
  const me = await getJson('discord.com', '/api/users/@me', token.access_token);
  const team = await hasTeamRole(token.access_token);

  const user = {
    id: me.id,
    username: me.global_name || me.username,
    handle: me.username,
    avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null,
    team,
  };
  store.users[me.id] = { ...user, lastLogin: new Date().toISOString() };
  store.save();

  res.setCookie(SESSION_COOKIE, signValue(config.sessionSecret, { uid: user.id, exp: Date.now() + SESSION_TTL }), {
    secure: config.secureCookies, maxAge: SESSION_TTL / 1000, sameSite: 'Lax',
  });
  return user;
}

function currentUser(req, store) {
  const sess = verifyValue(config.sessionSecret, req.cookies[SESSION_COOKIE]);
  if (!sess || !sess.uid) return null;
  const u = store.users[sess.uid];
  if (!u) return null;
  // team flag was set from the Discord role at login
  return { ...u, team: !!u.team };
}

function logout(res) {
  res.setCookie(SESSION_COOKIE, '', { secure: config.secureCookies, maxAge: 0 });
}

function requireUser(req, store) {
  const u = currentUser(req, store);
  if (!u) throw new HttpError(401, 'Sign in with Discord first.');
  return u;
}
function requireTeam(req, store) {
  const u = requireUser(req, store);
  if (!u.team) throw new HttpError(403, 'This area is for the Quantix dev team only.');
  return u;
}

module.exports = { beginLogin, completeLogin, currentUser, logout, requireUser, requireTeam, SESSION_COOKIE };
