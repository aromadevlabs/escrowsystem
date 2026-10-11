'use strict';
const { licenseKey, newId } = require('./lib/crypto');

function findAsset(store, id) { return store.assets.find((a) => a.id === id); }

/** Grant or share an asset to a Discord ID. Idempotent per (asset, discordId). */
function grantAccess(store, actor, assetId, discordId, opts = {}) {
  const asset = findAsset(store, assetId);
  if (!asset) throw new Error('Asset not found');
  if (!/^\d{17,20}$/.test(discordId)) throw new Error(`"${discordId}" is not a valid Discord ID`);

  let grant = store.grants.find((g) => g.assetId === assetId && g.discordId === discordId);
  if (grant) {
    grant.status = 'active';
    grant.term = opts.term || grant.term;
    grant.boundTo = opts.boundTo ?? grant.boundTo;
    grant.updatedAt = new Date().toISOString();
  } else {
    grant = {
      id: newId('grant'),
      assetId,
      assetName: asset.name,
      assetVersion: asset.version,
      discordId,
      licenseKey: licenseKey(),
      term: opts.term || 'Lifetime',
      boundTo: opts.boundTo || null, // server license key fragment, set on first run
      note: opts.note || '',
      grantedBy: actor,
      grantedAt: new Date().toISOString(),
      lastCheck: null,
      status: 'active',
    };
    store.grants.unshift(grant);
  }
  store.audit(actor, 'grant.create', { assetId, discordId });
  store.save();
  return grant;
}

function setStatus(store, actor, grantId, status) {
  const g = store.grants.find((x) => x.id === grantId);
  if (!g) throw new Error('Grant not found');
  g.status = status;
  g.updatedAt = new Date().toISOString();
  store.audit(actor, `grant.${status}`, { grantId, assetId: g.assetId });
  store.save();
  return g;
}

/** Grants visible to a buyer (their Discord ID), active only. */
function grantsForBuyer(store, discordId) {
  return store.grants.filter((g) => g.discordId === discordId && g.status === 'active');
}

function grantByLicense(store, key) {
  return store.grants.find((g) => g.licenseKey === key);
}

function publicGrant(g) {
  return {
    id: g.id, assetId: g.assetId, assetName: g.assetName, assetVersion: g.assetVersion,
    discordId: g.discordId, term: g.term, status: g.status, boundTo: g.boundTo ? true : false,
    note: g.note, grantedAt: g.grantedAt, lastCheck: g.lastCheck,
  };
}

module.exports = { grantAccess, setStatus, grantsForBuyer, grantByLicense, findAsset, publicGrant };
