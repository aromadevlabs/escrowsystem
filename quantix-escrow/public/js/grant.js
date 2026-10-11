'use strict';
(async function () {
  const me = await mountChrome('grant');
  if (!me) return;
  if (!me.team) { location.href = '/app/vault'; return; }
  document.getElementById('bannerSlot').innerHTML = bannerMarkup(190);
  document.getElementById('warnIc').innerHTML = icon('info', 20, 1.8);
  document.getElementById('grantBtn').innerHTML = icon('grant', 18) + ' Grant access';

  const $ = (id) => document.getElementById(id);
  let assets = [];
  let sel = new URLSearchParams(location.search).get('asset') || null;
  let term = 'Lifetime';

  try { assets = (await QX.get('/api/assets')).assets; } catch (e) { QX.toast(e.message, 'bad'); }
  if (!assets.length) {
    $('assetGrid').innerHTML = `<div class="empty" style="grid-column:1/-1;border:1px dashed var(--line);border-radius:14px">${icon('box', 40, 1.4)}<span style="font:600 18px var(--head);color:#fff">No assets yet</span><span class="muted">Create an escrow asset first.</span><a href="/app/create" class="btn" style="margin-top:8px">Create asset</a></div>`;
    $('grantBtn').disabled = true;
  }
  if (!sel && assets[0]) sel = assets[0].id;

  function renderAssets() {
    $('assetGrid').innerHTML = assets.map((a) => `
      <button type="button" class="asset-pick" data-id="${a.id}" aria-pressed="${a.id === sel}"
        style="text-align:left;min-height:96px;padding:16px;border-radius:14px;border:1px solid ${a.id === sel ? 'var(--accent)' : 'var(--line)'};background:${a.id === sel ? 'rgba(47,139,255,.12)' : 'var(--panel2)'};${a.id === sel ? 'box-shadow:0 0 0 1px var(--accent)' : ''};color:var(--ink);cursor:pointer;display:flex;gap:14px;align-items:center">
        <span style="width:48px;height:48px;border-radius:12px;background:rgba(47,139,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent2)">${icon('box', 24, 1.8)}</span>
        <span style="display:flex;flex-direction:column;gap:4px;min-width:0">
          <span class="mono" style="font-weight:600;font-size:15px;color:#fff">${QX.esc(a.name)}</span>
          <span class="dim" style="font-size:13px">v${QX.esc(a.version)} · ${a.protectedCount} locked</span>
        </span></button>`).join('');
    document.querySelectorAll('.asset-pick').forEach((b) => b.addEventListener('click', () => { sel = b.getAttribute('data-id'); renderAssets(); renderCard(); }));
  }

  $('termRow').innerHTML = ['Lifetime', 'Monthly', '7-day trial'].map((t) => `<button type="button" class="chip${t === term ? ' on' : ''}" data-term="${t}" aria-pressed="${t === term}">${t}</button>`).join('');
  $('termRow').querySelectorAll('[data-term]').forEach((b) => b.addEventListener('click', () => { term = b.getAttribute('data-term'); $('termRow').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); renderCard(); }));
  $('g-id').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); renderCard(); });

  function renderCard() {
    const a = assets.find((x) => x.id === sel);
    const idVal = $('g-id').value.trim() || '[discord id]';
    $('licenseCard').innerHTML = `
      <div style="position:relative;border-radius:22px;padding:1.5px;overflow:hidden">
        <div style="position:relative;border-radius:21px;background:radial-gradient(ellipse at 100% 0%,rgba(47,139,255,.3),transparent 55%),#070C18;padding:24px;display:flex;flex-direction:column;gap:20px;border:1px solid rgba(95,180,255,.2)">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:10px">
              <img src="/static/img/logo.png" alt="" style="width:40px;height:40px;border-radius:50%">
              <span style="font:700 14px var(--head);letter-spacing:.2em;color:#fff;line-height:1.2">QUANTIX<br><span style="color:var(--accent2);font-size:10px;letter-spacing:.3em">ESCROW LICENSE</span></span>
            </div>
            <span style="color:var(--accent2)">${icon('shield', 34, 1.4)}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px"><span class="dim" style="font-size:12px;letter-spacing:.14em">ASSET</span><span class="mono" style="font-weight:600;font-size:22px;color:#fff">${a ? QX.esc(a.name) : '—'}</span></div>
          <div class="grid2" style="gap:16px">
            <div style="display:flex;flex-direction:column;gap:4px"><span class="dim" style="font-size:12px;letter-spacing:.14em">DISCORD ID</span><span class="mono" style="font-size:14px;color:var(--ink);overflow:hidden;text-overflow:ellipsis">${QX.esc(idVal)}</span></div>
            <div style="display:flex;flex-direction:column;gap:4px"><span class="dim" style="font-size:12px;letter-spacing:.14em">TERM</span><span style="font-size:15px;color:var(--ink)">${QX.esc(term)}</span></div>
            <div style="display:flex;flex-direction:column;gap:4px"><span class="dim" style="font-size:12px;letter-spacing:.14em">VERSION</span><span style="font-size:15px;color:var(--ink)">${a ? 'v' + QX.esc(a.version) : '—'}</span></div>
            <div style="display:flex;flex-direction:column;gap:4px"><span class="dim" style="font-size:12px;letter-spacing:.14em">SERVER LOCK</span><span style="font-size:15px;color:var(--ink)">On first run</span></div>
          </div>
          <div style="padding:12px 14px;border-radius:12px;background:rgba(4,6,12,.7);border:1px dashed rgba(95,180,255,.35);font:500 14px var(--mono);color:var(--faint);text-align:center">License key generated on grant</div>
        </div>
      </div>`;
  }

  $('grantBtn').addEventListener('click', async () => {
    const id = $('g-id').value.trim();
    if (!/^\d{17,20}$/.test(id)) { $('g-id').classList.add('err'); setTimeout(() => $('g-id').classList.remove('err'), 500); return QX.toast('Enter a valid 17–20 digit Discord ID.', 'bad'); }
    if (!sel) return QX.toast('Choose an asset.', 'bad');
    $('grantBtn').disabled = true;
    try {
      const res = await QX.post('/api/grants', { assetId: sel, discordIds: [id], term, note: $('g-note').value.trim() });
      const r = res.results[0];
      if (!r.ok) throw new Error(r.error);
      QX.toast('Access granted — license ' + r.licenseKey, 'good');
      setTimeout(() => { location.href = '/app/granted'; }, 900);
    } catch (e) { QX.toast(e.message, 'bad'); $('grantBtn').disabled = false; }
  });

  renderAssets(); renderCard();
})();
