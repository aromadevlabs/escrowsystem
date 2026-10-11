'use strict';
(async function () {
  const me = await mountChrome('create');
  if (!me) return;
  if (!me.team) { location.href = '/app/vault'; return; }
  document.getElementById('bannerSlot').innerHTML = bannerMarkup(230);
  document.getElementById('dropIc').innerHTML = icon('up', 30, 1.8);
  document.getElementById('platChip').innerHTML = icon('check', 16) + ' FiveM';
  // prefill creator Discord ID with the signed-in team member, keep digits-only
  const creatorEl = document.getElementById('f-creator');
  if (creatorEl) { creatorEl.value = me.id || ''; creatorEl.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); }); }
  document.querySelector('#publishCard .secrow').insertAdjacentHTML('afterbegin', `<span style="color:var(--accent2)">${icon('shield', 22)}</span>`);

  let state = { file: null, inspect: null, visible: new Set(), publishing: false, done: null };

  const $ = (id) => document.getElementById(id);
  const fileInput = $('file');
  const drop = $('drop');

  // category -> toggle custom field
  $('f-category').addEventListener('change', (e) => { $('otherWrap').hidden = e.target.value !== 'other'; });

  // drag & drop
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

  async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) return QX.toast('Please upload a .zip resource.', 'bad');
    state.file = file;
    renderUpload(0);
    const fd = new FormData();
    fd.append('file', file);
    try {
      // simulate progress bar during the request
      renderUpload(35);
      const res = await QX.api('POST', '/api/assets/inspect', fd, true);
      renderUpload(100);
      state.inspect = res;
      state.visible = new Set(res.files.filter((f) => !res.lockable.includes(f))); // non-lockable always visible
      // sensible default: configs + locales visible
      res.lockable.forEach((f) => { if (/config|locale/i.test(f)) state.visible.add(f); });
      if (!$('f-name').value) $('f-name').value = res.manifest.name || '';
      if (!$('f-version').value) $('f-version').value = res.manifest.version || '';
      if (!$('f-desc').value && res.manifest.description) $('f-desc').value = res.manifest.description;
      renderProtect();
    } catch (e) {
      QX.toast(e.message, 'bad');
      renderUpload(-1);
    }
  }

  function renderUpload(pct) {
    const el = $('uploadInfo');
    if (pct < 0) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="filerow"><span style="color:var(--accent2)">${icon('file', 22)}</span>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:14px"><span class="mono" style="color:#fff">${QX.esc(state.file.name)}</span><span class="dim">${pct >= 100 ? 'Ready' : 'Reading…'}</span></div>
        <div class="bar"><b style="width:${Math.max(6, pct)}%"></b></div>
      </div></div>`;
  }

  function renderProtect() {
    $('protectSec').hidden = false;
    $('manifestCard').hidden = false;
    $('publishCard').hidden = false;
    const list = $('fileList');
    list.innerHTML = state.inspect.files.map((f) => {
      const lockable = state.inspect.lockable.includes(f);
      const visible = state.visible.has(f);
      const label = visible ? 'VISIBLE' : 'HIDDEN';
      const cls = visible ? 'lock open' : 'lock';
      return `<div class="filerow"><span class="dim">${icon('file', 20, 1.8)}</span>
        <span class="fname" style="flex:1">${QX.esc(f)}</span>
        ${lockable
          ? `<button type="button" class="${cls}" data-file="${QX.esc(f)}" aria-label="Toggle ${QX.esc(f)}">${label}</button>`
          : `<span class="tag warn" title="Not a locked Lua file">always visible</span>`}
      </div>`;
    }).join('');
    list.querySelectorAll('button[data-file]').forEach((b) => b.addEventListener('click', () => {
      const f = b.getAttribute('data-file');
      if (state.visible.has(f)) state.visible.delete(f); else state.visible.add(f);
      renderProtect();
    }));
    const hidden = state.inspect.lockable.filter((f) => !state.visible.has(f));
    $('hiddenCount').textContent = `${hidden.length} hidden`;
    $('visibleCount').textContent = `${state.inspect.files.length - hidden.length} visible`;
    renderManifest(hidden);
    renderPublish(hidden.length);
  }

  function renderManifest(hidden) {
    const openLua = state.inspect.files.filter((f) => f.endsWith('.lua') && state.visible.has(f));
    const lines = openLua.map((f) => `    <span class="s">'${QX.esc(f)}'</span>,`).join('\n');
    $('manifestPreview').innerHTML =
`<span class="k">fx_version</span> <span class="s">'cerulean'</span>
<span class="k">game</span> <span class="s">'gta5'</span>
<span class="k">lua54</span> <span class="s">'yes'</span>

<span class="c">-- Quantix loader runs the ${hidden.length} hidden file(s)</span>
<span class="k">server_script</span> <span class="s">'qx_loader/qx_server.lua'</span>
<span class="k">client_script</span> <span class="s">'qx_loader/qx_client.lua'</span>

<span class="c">-- Files buyers can see</span>
<span class="k">escrow_visible</span> {
${lines || '    <span class="c">-- (none)</span>'}
}`;
  }

  function renderPublish(hiddenCount) {
    const body = $('publishBody');
    if (state.done) {
      body.innerHTML = `<div class="pop" style="display:flex;flex-direction:column;gap:16px;padding:18px;border-radius:14px;background:rgba(61,220,151,.08);border:1px solid rgba(61,220,151,.35)">
        <div style="display:flex;align-items:center;gap:12px">
          <svg class="check" width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#3DDC97" stroke-width="2" opacity=".4"></circle><path d="m12 20 6 6 11-12" stroke="#3DDC97" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          <div><div style="font:600 18px var(--head);color:#fff">Asset locked in escrow</div><div class="muted" style="font-size:13px">Ready to grant to buyers</div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px"><span class="lbl" style="margin:0">Creator</span><span style="color:#CFE2FF;font-size:14px">${QX.esc(state.done.creatorName || state.done.creatorId)} <span class="mono dim" style="font-size:12px">· ${QX.esc(state.done.creatorId)}</span></span></div>
        <div style="display:flex;flex-direction:column;gap:6px"><span class="lbl" style="margin:0">Asset ID</span><span class="mono" style="color:#CFE2FF">${QX.esc(state.done.id)}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <a href="/app/grant?asset=${encodeURIComponent(state.done.id)}" class="btn" style="flex:1 1 160px">Grant this asset</a>
          <button type="button" class="ghost" id="againBtn">Create another</button>
        </div></div>`;
      $('againBtn').addEventListener('click', () => location.reload());
      return;
    }
    if (state.publishing) {
      body.innerHTML = `<div class="scanline" aria-hidden="true"></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;justify-content:space-between;font:600 13px var(--mono)"><span style="color:#CFE2FF">Encrypting…</span><span style="color:var(--accent2)" id="pct">0%</span></div>
          <div class="bar"><b id="pbar" style="width:0%"></b></div>
        </div>`;
      return;
    }
    body.innerHTML = `<p class="muted" style="margin:0 0 16px;font-size:14px;line-height:1.6">${hiddenCount} file(s) will be encrypted with a per-asset key and stored in escrow. You can grant this asset to buyers as soon as it's published.</p>
      <button type="button" class="btn" id="publishBtn" style="width:100%">${icon('shield', 18)} Encrypt &amp; publish</button>`;
    $('publishBtn').addEventListener('click', publish);
  }

  async function publish() {
    if (!state.file) return;
    const creatorId = ($('f-creator').value || '').trim();
    if (!/^\d{17,20}$/.test(creatorId)) {
      $('f-creator').classList.add('err'); setTimeout(() => $('f-creator').classList.remove('err'), 500);
      $('f-creator').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return QX.toast('Enter a valid 17–20 digit Creator Discord ID before publishing.', 'bad');
    }
    state.publishing = true; renderPublish();
    let p = 0;
    const timer = setInterval(() => { p = Math.min(92, p + 4); const b = document.getElementById('pbar'); const t = document.getElementById('pct'); if (b) b.style.width = p + '%'; if (t) t.textContent = p + '%'; }, 60);
    const fd = new FormData();
    fd.append('file', state.file);
    fd.append('visible', JSON.stringify([...state.visible]));
    ['name', 'version', 'category', 'price', 'desc'].forEach((k) => {});
    fd.append('name', $('f-name').value.trim());
    fd.append('version', $('f-version').value.trim() || '1.0.0');
    fd.append('category', $('f-category').value);
    fd.append('customCategory', $('f-custom') ? ($('f-custom').value || '') : '');
    fd.append('price', $('f-price').value.trim());
    fd.append('description', $('f-desc').value.trim());
    fd.append('creatorId', creatorId);
    try {
      const res = await QX.api('POST', '/api/assets', fd, true);
      clearInterval(timer);
      const b = document.getElementById('pbar'); const t = document.getElementById('pct');
      if (b) b.style.width = '100%'; if (t) t.textContent = '100%';
      setTimeout(() => { state.publishing = false; state.done = res.asset; renderPublish(); QX.toast('Asset published to escrow.', 'good'); }, 400);
    } catch (e) {
      clearInterval(timer);
      state.publishing = false; renderPublish(state.inspect.lockable.filter((f) => !state.visible.has(f)).length);
      QX.toast(e.message, 'bad');
    }
  }

  // presets
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const mode = b.getAttribute('data-preset');
    const lock = state.inspect.lockable;
    if (mode === 'all') lock.forEach((f) => state.visible.delete(f));
    else if (mode === 'none') lock.forEach((f) => state.visible.add(f));
    else { lock.forEach((f) => { if (/config|locale/i.test(f)) state.visible.add(f); else state.visible.delete(f); }); }
    renderProtect();
  }));
})();
