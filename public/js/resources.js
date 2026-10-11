'use strict';
(async function () {
  const me = await mountChrome('resources');
  if (!me) return;
  if (!me.team) { location.href = '/app/vault'; return; }
  document.getElementById('bannerSlot').innerHTML = bannerMarkup(190);
  document.getElementById('newBtn').innerHTML = icon('plus', 18) + ' New escrow asset';
  document.getElementById('searchIc').innerHTML = icon('search', 18);
  document.getElementById('delIc').innerHTML = icon('trash', 20);
  document.getElementById('delClose').innerHTML = icon('x', 18);

  const $ = (id) => document.getElementById(id);
  let assets = [], grants = [], q = '';

  async function load() {
    [assets, grants] = await Promise.all([
      QX.get('/api/assets').then((d) => d.assets),
      QX.get('/api/grants').then((d) => d.grants).catch(() => []),
    ]);
    render();
  }

  const grantCount = (id) => grants.filter((g) => g.assetId === id && g.status === 'active').length;
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  function render() {
    const creators = new Set(assets.map((a) => a.creatorId).filter(Boolean));
    $('stats').innerHTML = [
      ['Assets', assets.length, 'var(--accent2)'],
      ['Creators', creators.size, 'var(--good)'],
      ['Active grants', grants.filter((g) => g.status === 'active').length, 'var(--accent2)'],
    ].map(([l, n, c]) => `<div class="card stat"><span class="lbl" style="margin:0">${l}</span><span class="n">${n}</span><div class="meter"><b style="width:100%;background:${c}"></b></div></div>`).join('');

    const query = q.trim().toLowerCase();
    const rows = assets.filter((a) => !query || (a.creatorId || '').includes(query) || (a.creatorName || '').toLowerCase().includes(query) || a.name.toLowerCase().includes(query));
    const head = `<div class="rtr head"><span>Creator</span><span>Asset name</span><span>Category</span><span>Created</span><span>Last updated</span><span style="text-align:right">Action</span></div>`;
    const body = rows.map((a, i) => {
      const cat = a.category === 'other' && a.customCategory ? a.customCategory : (a.category || '—');
      const named = a.creatorName && a.creatorName !== a.creatorId;
      return `<div class="rtr body" style="animation-delay:${(0.05 + i * 0.05).toFixed(2)}s">
        <span style="display:flex;align-items:center;gap:10px;min-width:0">
          <span style="width:34px;height:34px;border-radius:50%;background:#4752C4;display:flex;align-items:center;justify-content:center;font:700 12px var(--head);color:#fff;flex-shrink:0">${QX.esc((a.creatorName || 'QX').slice(0, 2).toUpperCase())}</span>
          <span style="display:flex;flex-direction:column;min-width:0"><span style="font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis">${QX.esc(named ? a.creatorName : 'Discord user')}</span><span class="mono dim" style="font-size:12px">${QX.esc(a.creatorId || '—')}</span></span>
        </span>
        <span style="display:flex;align-items:center;gap:12px;min-width:0">
          <span style="width:34px;height:34px;border-radius:9px;background:rgba(47,139,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent2)">${icon('box', 17, 1.8)}</span>
          <span style="display:flex;flex-direction:column;min-width:0"><span class="mono" style="font-weight:600;font-size:14px;color:#fff">${QX.esc(a.name)}</span><span class="dim" style="font-size:12px">v${QX.esc(a.version)} · ${a.protectedCount} locked · ${grantCount(a.id)} buyers</span></span>
        </span>
        <span style="font-size:14px;color:#CFE2FF;text-transform:capitalize">${QX.esc(cat)}</span>
        <span style="font-size:14px;color:var(--muted)">${fmt(a.createdAt)}</span>
        <span style="font-size:14px;color:var(--muted)">${fmt(a.updatedAt)}</span>
        <span style="text-align:right"><button type="button" class="act" data-del="${a.id}" aria-label="Delete ${QX.esc(a.name)}">${icon('trash', 15, 2)} Delete</button></span>
      </div>`;
    }).join('');
    const empty = rows.length ? '' : `<div class="empty">${icon('box', 40, 1.4)}<span style="font:600 18px var(--head);color:#fff">${assets.length ? 'No matches' : 'No assets yet'}</span><span class="muted">${assets.length ? 'Try another search.' : 'Lock your first resource from Create Escrow Asset.'}</span></div>`;
    $('table').innerHTML = head + body + empty;
    $('table').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => confirmDelete(b.getAttribute('data-del'))));
  }

  // delete confirm modal
  function confirmDelete(id) {
    const a = assets.find((x) => x.id === id);
    if (!a) return;
    $('delOverlay').hidden = false;
    $('delBody').innerHTML = `
      <p class="muted" style="margin:0;font-size:14px;line-height:1.6">Delete <span class="mono" style="color:#fff">${QX.esc(a.name)} v${QX.esc(a.version)}</span>? This removes the encrypted asset and <strong style="color:#FF9DB0">revokes access for all ${grantCount(a.id)} buyer(s)</strong>. It can't be undone.</p>
      <div style="display:flex;gap:10px;padding:12px 14px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)">
        <span style="width:34px;height:34px;border-radius:50%;background:#4752C4;display:flex;align-items:center;justify-content:center;font:700 12px var(--head);color:#fff;flex-shrink:0">${QX.esc((a.creatorName || 'QX').slice(0, 2).toUpperCase())}</span>
        <span style="display:flex;flex-direction:column"><span style="font-size:13px;color:#fff">Creator: ${QX.esc(a.creatorName || 'Discord user')}</span><span class="mono dim" style="font-size:12px">${QX.esc(a.creatorId || '—')}</span></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end">
        <button type="button" class="ghost" id="delCancel">Cancel</button>
        <button type="button" class="btn" id="delGo" style="background:#D13A54;box-shadow:0 10px 30px -10px rgba(255,92,122,.8)">${icon('trash', 16, 2)} Delete asset</button>
      </div>`;
    $('delCancel').addEventListener('click', closeDel);
    $('delGo').addEventListener('click', async () => {
      $('delGo').disabled = true;
      try { await QX.del('/api/assets/' + id); closeDel(); await load(); QX.toast('Asset deleted.', 'good'); }
      catch (e) { QX.toast(e.message, 'bad'); $('delGo').disabled = false; }
    });
  }
  function closeDel() { $('delOverlay').hidden = true; }
  $('delClose').addEventListener('click', closeDel);
  $('delOverlay').addEventListener('click', (e) => { if (e.target === $('delOverlay')) closeDel(); });

  $('search').addEventListener('input', (e) => { q = e.target.value; render(); });
  await load();
})();
