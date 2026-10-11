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
  document.getElementById('updIc').innerHTML = icon('refresh', 20);
  document.getElementById('updClose').innerHTML = icon('x', 18);

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
        <span style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="upd" data-upd="${a.id}" aria-label="Update ${QX.esc(a.name)}">${icon('up', 15, 2)} Update</button>
          <button type="button" class="act" data-del="${a.id}" aria-label="Delete ${QX.esc(a.name)}">${icon('trash', 15, 2)}</button>
        </span>
      </div>`;
    }).join('');
    const empty = rows.length ? '' : `<div class="empty">${icon('box', 40, 1.4)}<span style="font:600 18px var(--head);color:#fff">${assets.length ? 'No matches' : 'No assets yet'}</span><span class="muted">${assets.length ? 'Try another search.' : 'Lock your first resource from Create Escrow Asset.'}</span></div>`;
    $('table').innerHTML = head + body + empty;
    $('table').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => confirmDelete(b.getAttribute('data-del'))));
    $('table').querySelectorAll('[data-upd]').forEach((b) => b.addEventListener('click', () => openUpdate(b.getAttribute('data-upd'))));
  }

  // ---- update / notify modal ----
  function bumpVersion(v) {
    const m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)/);
    if (m) return `${m[1]}.${m[2]}.${+m[3] + 1}`;
    return v || '1.0.1';
  }
  let up = null;
  function openUpdate(id) {
    const a = assets.find((x) => x.id === id);
    if (!a) return;
    up = { asset: a, file: null, inspect: null, visible: new Set((a.files || []).filter((f) => f.visible).map((f) => f.path)), busy: false, done: null };
    $('updOverlay').hidden = false;
    $('updSub').textContent = `${a.name} · ${grantCount(a.id)} buyer(s) will be notified`;
    renderUpdate();
  }
  function closeUpdate() { $('updOverlay').hidden = true; up = null; }
  $('updClose').addEventListener('click', closeUpdate);
  $('updOverlay').addEventListener('click', (e) => { if (e.target === $('updOverlay')) closeUpdate(); });

  function renderUpdate() {
    const a = up.asset, n = grantCount(a.id);
    if (up.done) {
      const r = up.done;
      const line = r.notify.enabled
        ? `${r.notify.sent} of ${r.notify.total} buyer(s) got a Discord DM${r.notify.failed ? ` · ${r.notify.failed} couldn't be reached` : ''}.`
        : `Discord DMs are off (no bot token set), so buyers weren't notified. They'll still get the new version on their next download.`;
      $('updBody').innerHTML = `<div style="padding:28px 8px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
        <svg class="check" width="64" height="64" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#3DDC97" stroke-width="2" opacity=".4"></circle><path d="m12 20 6 6 11-12" stroke="#3DDC97" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        <span style="font:600 22px var(--head);color:#fff">Updated to v${QX.esc(r.asset.version)}</span>
        <span class="muted" style="font-size:14px;max-width:400px;line-height:1.6">${QX.esc(line)}</span>
        <button type="button" class="btn" id="updDone" style="margin-top:8px">Done</button></div>`;
      $('updDone').addEventListener('click', closeUpdate);
      return;
    }
    if (up.busy) {
      $('updBody').innerHTML = `<div style="padding:28px 8px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center"><svg class="spin" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#5FB4FF" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-9-9"></path></svg><span class="muted">Encrypting new version${n ? ' and notifying buyers' : ''}…</span></div>`;
      return;
    }
    const fileList = up.inspect ? up.inspect.files.map((f) => {
      const lockable = up.inspect.lockable.includes(f);
      const vis = up.visible.has(f);
      return `<div class="filerow"><span class="dim">${icon('file', 20, 1.8)}</span><span class="fname" style="flex:1">${QX.esc(f)}</span>${lockable ? `<button type="button" class="lock ${vis ? 'open' : ''}" data-uf="${QX.esc(f)}">${vis ? 'VISIBLE' : 'HIDDEN'}</button>` : `<span class="tag warn">always visible</span>`}</div>`;
    }).join('') : '';
    $('updBody').innerHTML = `
      <label class="drop" id="updDrop" style="min-height:150px">
        <svg class="border" aria-hidden="true"><rect x="1" y="1" width="99.4%" height="97%" rx="16" ry="16"></rect></svg>
        <span class="ic" style="width:52px;height:52px">${icon('up', 26, 1.8)}</span>
        <span style="font:600 16px var(--head);color:#fff">${up.file ? QX.esc(up.file.name) : 'Drop the updated .zip'}</span>
        <span class="muted" style="font-size:13px">${up.file ? 'Click to choose a different file' : 'or browse · same resource, new code'}</span>
        <input id="updFile" type="file" accept=".zip" hidden>
      </label>
      ${up.inspect ? `<div><span class="lbl">Files buyers can see</span><div style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow:auto">${fileList}</div></div>` : ''}
      <div class="grid2">
        <div><label class="lbl" for="updVer">New version</label><input id="updVer" class="input mono" value="${QX.esc(up.version || bumpVersion(a.version))}" placeholder="1.0.1"></div>
        <div style="display:flex;flex-direction:column;justify-content:flex-end"><span class="dim" style="font-size:12px">Current: v${QX.esc(a.version)}</span></div>
      </div>
      <div><label class="lbl" for="updLog">What changed (sent in the DM)</label><textarea id="updLog" class="input" placeholder="e.g. Fixed dispatch blips, added config option">${QX.esc(up.changelog || '')}</textarea></div>
      <div style="display:flex;gap:10px;padding:12px 14px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)">
        <span style="flex-shrink:0;margin-top:2px;color:var(--accent2)">${icon('bell', 18, 1.8)}</span>
        <span class="muted" style="font-size:13px;line-height:1.6">${n ? `${n} buyer(s) with an active license will get a Discord DM to re-download. Existing licenses keep working.` : 'No active buyers yet — this just stores the new version.'}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end">
        <button type="button" class="ghost" id="updCancel">Cancel</button>
        <button type="button" class="btn" id="updGo"${up.file ? '' : ' disabled'}>${icon('up', 16, 2)} Update${n ? ` & notify ${n}` : ''}</button>
      </div>`;

    const fileEl = $('updFile'), drop = $('updDrop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) pickFile(f); });
    fileEl.addEventListener('change', () => { if (fileEl.files[0]) pickFile(fileEl.files[0]); });
    const verEl = $('updVer'), logEl = $('updLog');
    if (verEl) verEl.addEventListener('input', (e) => { up.version = e.target.value; });
    if (logEl) logEl.addEventListener('input', (e) => { up.changelog = e.target.value; });
    $('updCancel').addEventListener('click', closeUpdate);
    $('updBody').querySelectorAll('[data-uf]').forEach((b) => b.addEventListener('click', () => { const f = b.getAttribute('data-uf'); if (up.visible.has(f)) up.visible.delete(f); else up.visible.add(f); renderUpdate(); }));
    $('updGo').addEventListener('click', submitUpdate);
  }

  async function pickFile(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) return QX.toast('Upload a .zip resource.', 'bad');
    up.file = file; up.version = up.version || bumpVersion(up.asset.version);
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await QX.api('POST', '/api/assets/inspect', fd, true);
      up.inspect = res;
      // carry over previous visibility where filenames match; else keep configs/locales visible
      const prev = new Set((up.asset.files || []).filter((f) => f.visible).map((f) => f.path));
      up.visible = new Set(res.files.filter((f) => !res.lockable.includes(f)));
      res.lockable.forEach((f) => { if (prev.has(f) || /config|locale/i.test(f)) up.visible.add(f); });
      renderUpdate();
    } catch (e) { QX.toast(e.message, 'bad'); }
  }

  async function submitUpdate() {
    if (!up.file) return;
    const version = ($('updVer').value || '').trim();
    if (!version) return QX.toast('Enter a new version.', 'bad');
    up.busy = true; renderUpdate();
    const fd = new FormData();
    fd.append('file', up.file);
    fd.append('version', version);
    fd.append('changelog', ($('updLog') ? $('updLog').value : up.changelog || '').trim());
    fd.append('visible', JSON.stringify([...up.visible]));
    try {
      const res = await QX.api('POST', '/api/assets/' + up.asset.id + '/update', fd, true);
      up.done = res; up.busy = false; renderUpdate();
      await load();
    } catch (e) { up.busy = false; renderUpdate(); QX.toast(e.message, 'bad'); }
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
