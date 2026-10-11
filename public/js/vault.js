'use strict';
(async function () {
  const me = await mountChrome('vault');
  if (!me) return;
  document.getElementById('bannerSlot').innerHTML = bannerMarkup(190);

  const grid = document.getElementById('vaultGrid');
  let grants = [];
  try { grants = (await QX.get('/api/vault')).grants; } catch (e) { QX.toast(e.message, 'bad'); }

  if (!grants.length) {
    grid.innerHTML = `<div class="card pad in d2" style="grid-column:1/-1;align-items:center;text-align:center;gap:14px;padding:56px 24px">
      <span style="color:var(--accent2)">${icon('vault', 44, 1.4)}</span>
      <span style="font:600 20px var(--head);color:#fff">Nothing here yet</span>
      <span class="muted" style="max-width:420px;line-height:1.6">When the Quantix team shares an asset with your Discord account, it shows up here to download. Your Discord ID: <span class="mono" style="color:#CFE2FF">${QX.esc(me.id)}</span></span></div>`;
    return;
  }

  grid.innerHTML = grants.map((g, i) => {
    const cat = g.asset.category ? g.asset.category : 'asset';
    return `<div class="card pad in d${Math.min(6, i + 2)}" style="gap:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="width:48px;height:48px;border-radius:12px;background:rgba(47,139,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent2)">${icon('box', 24, 1.8)}</span>
        <div style="min-width:0"><div class="mono" style="font-weight:600;font-size:17px;color:#fff">${QX.esc(g.asset.name)}</div><div class="dim" style="font-size:13px">v${QX.esc(g.asset.version)} · ${QX.esc(g.term)}</div></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)">
        <span style="width:30px;height:30px;border-radius:50%;background:#4752C4;display:flex;align-items:center;justify-content:center;font:700 11px var(--head);color:#fff;flex-shrink:0">${QX.esc((g.asset.creatorName || 'QX').slice(0, 2).toUpperCase())}</span>
        <span style="display:flex;flex-direction:column;min-width:0"><span class="dim" style="font-size:11px;letter-spacing:.1em">CREATOR</span><span style="font-size:13px;color:#CFE2FF;overflow:hidden;text-overflow:ellipsis">${QX.esc(g.asset.creatorName && g.asset.creatorName !== g.asset.creatorId ? g.asset.creatorName : 'Discord user')}${g.asset.creatorId ? ' · ' + QX.esc(g.asset.creatorId) : ''}</span></span>
      </div>
      ${g.asset.description ? `<p class="muted" style="margin:0;font-size:14px;line-height:1.6">${QX.esc(g.asset.description)}</p>` : ''}
      <div style="display:flex;flex-direction:column;gap:6px"><span class="lbl" style="margin:0">License key</span><span class="mono" style="font-size:14px;color:#CFE2FF;padding:10px 12px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);word-break:break-all">${QX.esc(g.licenseKey)}</span></div>
      <a class="btn" href="/api/download/${encodeURIComponent(g.grantId)}" style="width:100%">${icon('download', 18)} Download resource</a>
      <span class="dim" style="font-size:12px;text-align:center">License &amp; loader included · keep your key private</span>
    </div>`;
  }).join('');
})();
