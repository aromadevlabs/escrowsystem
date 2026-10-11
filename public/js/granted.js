'use strict';
(async function () {
  const me = await mountChrome('granted');
  if (!me) return;
  if (!me.team) { location.href = '/app/vault'; return; }
  document.getElementById('bannerSlot').innerHTML = bannerMarkup(190);
  document.querySelector('#shareTop').innerHTML = icon('share', 18) + ' Share asset';
  document.querySelector('.phead .ghost').innerHTML = icon('plus', 18) + ' Grant asset';
  document.querySelector('#search').previousElementSibling.innerHTML = icon('search', 18);
  document.getElementById('shareIc').innerHTML = icon('share', 20);
  document.getElementById('shareClose').innerHTML = icon('x', 18);

  const $ = (id) => document.getElementById(id);
  let grants = [], assets = [], filter = 'all', q = '';

  async function load() {
    [grants, assets] = await Promise.all([
      QX.get('/api/grants').then((d) => d.grants),
      QX.get('/api/assets').then((d) => d.assets).catch(() => []),
    ]);
    render();
  }

  function counts() {
    const c = { all: grants.length, active: 0, revoked: 0 };
    grants.forEach((g) => { c[g.status] = (c[g.status] || 0) + 1; });
    return c;
  }

  function render() {
    const c = counts();
    const total = grants.length || 1;
    $('stats').innerHTML = [
      ['Total grants', c.all, 100, 'var(--accent2)'],
      ['Active', c.active || 0, Math.round((c.active || 0) / total * 100), 'var(--good)'],
      ['Revoked', c.revoked || 0, Math.round((c.revoked || 0) / total * 100), 'var(--bad)'],
      ['Assets', assets.length, assets.length ? 100 : 0, 'var(--accent2)'],
    ].map(([l, n, pct, col]) => `<div class="card stat"><span class="lbl" style="margin:0">${l}</span><span class="n">${n}</span><div class="meter"><b style="width:${pct}%;background:${col}"></b></div></div>`).join('');

    const fl = [['all', 'All', c.all], ['active', 'Active', c.active || 0], ['revoked', 'Revoked', c.revoked || 0]];
    $('filters').innerHTML = fl.map(([id, label, n]) => `<button type="button" class="chip${filter === id ? ' on' : ''}" data-f="${id}" aria-pressed="${filter === id}">${label} <span class="tag" style="padding:2px 8px">${n}</span></button>`).join('');
    $('filters').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.getAttribute('data-f'); render(); }));

    const query = q.trim().toLowerCase();
    const rows = grants.filter((g) => (filter === 'all' || g.status === filter) && (!query || g.assetName.toLowerCase().includes(query) || g.discordId.includes(query)));
    const head = `<div class="tr head"><span>Asset</span><span>Buyer Discord ID</span><span>License</span><span>Server lock</span><span>Status</span><span style="text-align:right">Actions</span></div>`;
    const body = rows.map((g, i) => {
      const revoked = g.status === 'revoked';
      const date = new Date(g.grantedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `<div class="tr body" style="animation-delay:${(0.05 + i * 0.05).toFixed(2)}s">
        <span style="display:flex;align-items:center;gap:12px;min-width:0">
          <span style="width:36px;height:36px;border-radius:10px;background:rgba(47,139,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent2)">${icon('box', 18, 1.8)}</span>
          <span style="display:flex;flex-direction:column;min-width:0"><span class="mono" style="font-weight:600;font-size:14px;color:#fff">${QX.esc(g.assetName)}</span><span class="dim" style="font-size:12px">v${QX.esc(g.assetVersion)} · granted ${date}</span></span></span>
        <span class="mono" style="font-size:13px;color:var(--ink)">${QX.esc(g.discordId)}</span>
        <span style="font-size:14px;color:#CFE2FF">${QX.esc(g.term)}</span>
        <span class="mono" style="font-size:13px;color:var(--muted)">${g.boundTo ? 'Bound' : 'Pending'}</span>
        <span class="pill ${revoked ? 'revoked' : 'active'}"><i></i>${revoked ? 'Revoked' : 'Active'}</span>
        <span style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="share-sm" data-share-asset="${g.assetId}">${icon('share', 14, 2.2)}Share</button>
          <button type="button" class="act ${revoked ? 'restore' : ''}" data-toggle="${g.id}" data-status="${revoked ? 'active' : 'revoked'}">${revoked ? 'Restore' : 'Revoke'}</button>
        </span></div>`;
    }).join('');
    const empty = rows.length ? '' : `<div class="empty">${icon('search', 40, 1.4)}<span style="font:600 18px var(--head);color:#fff">No grants match</span><span class="muted">Try another search or filter.</span></div>`;
    $('table').innerHTML = head + body + empty;

    $('table').querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      try { await QX.patch('/api/grants/' + b.getAttribute('data-toggle'), { status: b.getAttribute('data-status') }); await load(); QX.toast('License ' + b.getAttribute('data-status') + '.', 'good'); }
      catch (e) { QX.toast(e.message, 'bad'); }
    }));
    $('table').querySelectorAll('[data-share-asset]').forEach((b) => b.addEventListener('click', () => openShare(b.getAttribute('data-share-asset'))));
  }

  $('search').addEventListener('input', (e) => { q = e.target.value; render(); });

  // ---- Share modal ----
  let shareState = null;
  function openShare(assetId) {
    if (!assets.length) return QX.toast('Create an asset first.', 'bad');
    shareState = { assetId: assetId || assets[0].id, ids: [], draft: '', term: 'Lifetime', done: null };
    $('shareOverlay').hidden = false;
    renderShare();
  }
  function closeShare() { $('shareOverlay').hidden = true; shareState = null; }
  $('shareTop').addEventListener('click', () => openShare());
  $('shareClose').addEventListener('click', closeShare);
  $('shareOverlay').addEventListener('click', (e) => { if (e.target === $('shareOverlay')) closeShare(); });

  function renderShare() {
    const s = shareState;
    if (s.done) {
      $('shareBody').innerHTML = `<div style="padding:28px 8px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
        <svg class="check" width="64" height="64" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#3DDC97" stroke-width="2" opacity=".4"></circle><path d="m12 20 6 6 11-12" stroke="#3DDC97" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        <span style="font:600 22px var(--head);color:#fff">Access shared</span>
        <span class="muted" style="font-size:14px;max-width:380px;line-height:1.6">${s.done}</span>
        <button type="button" class="btn" id="shareDone" style="margin-top:8px">Done</button></div>`;
      $('shareDone').addEventListener('click', closeShare);
      return;
    }
    const a = assets.find((x) => x.id === s.assetId);
    $('shareBody').innerHTML = `
      <div><label class="lbl" for="s-asset">Locked asset</label>
        <select id="s-asset" class="input">${assets.map((x) => `<option value="${x.id}" ${x.id === s.assetId ? 'selected' : ''}>${QX.esc(x.name)} · v${QX.esc(x.version)}</option>`).join('')}</select></div>
      <div><label class="lbl" for="s-id">Buyer Discord IDs</label>
        <div style="display:flex;gap:10px"><input id="s-id" class="input mono" inputmode="numeric" placeholder="123456789012345678" value="${QX.esc(s.draft)}"><button type="button" class="ghost" id="s-add" style="flex-shrink:0">Add</button></div>
        <span class="dim" style="display:block;margin-top:8px;font-size:12px">Discord → Settings → Advanced → Developer Mode, then right-click the buyer → Copy User ID.</span></div>
      ${s.ids.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px" id="s-chips">${s.ids.map((d) => `<span class="idchip">${QX.esc(d)}<button type="button" data-rm="${QX.esc(d)}" aria-label="Remove ${QX.esc(d)}">${icon('x', 12, 2.6)}</button></span>`).join('')}</div>` : ''}
      <div><span class="lbl">Access term</span><div style="display:flex;flex-wrap:wrap;gap:8px" id="s-terms">${['Lifetime', 'Monthly', '7-day trial'].map((t) => `<button type="button" class="chip${t === s.term ? ' on' : ''}" data-t="${t}">${t}</button>`).join('')}</div></div>
      <div style="display:flex;gap:10px;padding:14px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)">
        <span style="flex-shrink:0;margin-top:2px;color:var(--accent2)">${icon('shield', 18, 1.8)}</span>
        <span class="muted" style="font-size:13px;line-height:1.6">Buyers sign in with this Discord account to download the asset. Hidden files stay encrypted — they only get the files you marked visible.</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end">
        <button type="button" class="ghost" id="s-cancel">Cancel</button>
        <button type="button" class="btn" id="s-confirm">Share with ${s.ids.length || 0} buyer${s.ids.length === 1 ? '' : 's'}</button></div>`;

    const idInput = $('s-id');
    $('s-asset').addEventListener('change', (e) => { s.assetId = e.target.value; });
    idInput.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); s.draft = e.target.value; });
    idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addId(); } });
    $('s-add').addEventListener('click', addId);
    $('s-cancel').addEventListener('click', closeShare);
    $('s-confirm').addEventListener('click', confirmShare);
    $('s-terms').querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { s.term = b.getAttribute('data-t'); renderShare(); }));
    document.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { s.ids = s.ids.filter((x) => x !== b.getAttribute('data-rm')); renderShare(); }));
  }

  function addId() {
    const s = shareState;
    const v = ($('s-id').value || '').trim();
    if (!/^\d{17,20}$/.test(v)) { $('s-id').classList.add('err'); setTimeout(() => $('s-id').classList.remove('err'), 500); return QX.toast('A Discord ID is 17–20 digits.', 'bad'); }
    if (s.ids.includes(v)) return QX.toast('Already added.', 'bad');
    s.ids.push(v); s.draft = ''; renderShare();
  }

  async function confirmShare() {
    const s = shareState;
    const v = ($('s-id').value || '').trim();
    if (/^\d{17,20}$/.test(v) && !s.ids.includes(v)) s.ids.push(v);
    if (!s.ids.length) return QX.toast('Add at least one Discord ID.', 'bad');
    try {
      const res = await QX.post('/api/grants', { assetId: s.assetId, discordIds: s.ids, term: s.term });
      const ok = res.results.filter((r) => r.ok).length;
      const asset = assets.find((x) => x.id === s.assetId);
      s.done = `${asset ? asset.name : 'The asset'} is now unlocked for ${ok} Discord account${ok === 1 ? '' : 's'}. They'll see it in their assets after signing in with Discord.`;
      renderShare();
      await load();
    } catch (e) { QX.toast(e.message, 'bad'); }
  }

  await load();
})();
