'use strict';
// Shared helpers: API calls, icons, sidebar, toasts.
const QX = {
  async api(method, url, body, isForm) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body && isForm) opts.body = body;
    else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : null;
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  },
  get(u) { return this.api('GET', u); },
  post(u, b) { return this.api('POST', u, b); },
  patch(u, b) { return this.api('PATCH', u, b); },
  del(u) { return this.api('DELETE', u); },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  toast(msg, kind) {
    let wrap = document.getElementById('toast');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toast'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
  },
};

const ICONS = {
  create: '<rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path><path d="M12 14v3"></path>',
  grant: '<circle cx="8" cy="15" r="4"></circle><path d="M10.8 12.2 20 3"></path><path d="m16 7 3 3"></path><path d="m18 5 2 2"></path>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"></path><path d="m9 12 2 2 4-4"></path>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="12" cy="12" r="4"></circle><path d="M12 8v1"></path><path d="M12 15v1"></path>',
  share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 13.5 6.8 4"></path><path d="m15.4 6.5-6.8 4"></path>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path>',
  box: '<path d="m21 16-9 5-9-5V8l9-5 9 5z"></path><path d="m3 8 9 5 9-5"></path><path d="M12 13v8"></path>',
  plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  x: '<path d="M6 6l12 12"></path><path d="M18 6 6 18"></path>',
  check: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path>',
  up: '<path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"></path>',
  download: '<path d="M12 4v12"></path><path d="m7 11 5 5 5-5"></path><path d="M4 20h16"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16h.01"></path>',
  resources: '<path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path><circle cx="7" cy="7" r="0.5"></circle>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path><path d="M7 7l1 13h8l1-13"></path>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"></path><path d="M21 4v5h-5"></path>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path>',
};
function icon(name, size = 20, stroke = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function avatarMarkup(user) {
  if (user && user.avatar) return `<img src="${QX.esc(user.avatar)}" alt="">`;
  const initials = user && user.username ? user.username.slice(0, 2).toUpperCase() : 'QX';
  return QX.esc(initials);
}

// Build the sidebar. `active` = create|grant|granted|vault. team-only links hidden for buyers.
async function mountChrome(active) {
  let me;
  try { me = (await QX.get('/api/me')).user; } catch { me = null; }
  if (!me) { location.href = '/login'; return null; }

  const links = [];
  if (me.team) {
    links.push(['create', '/app/create', 'Create Escrow Asset']);
    links.push(['grant', '/app/grant', 'Grant Assets']);
    links.push(['granted', '/app/granted', 'Granted Assets']);
    links.push(['resources', '/app/resources', 'Resources']);
  }
  links.push(['vault', '/app/vault', 'My Assets']);

  const nav = links.map(([id, href, label]) => {
    const ic = id === 'create' ? 'create' : id === 'grant' ? 'grant' : id === 'granted' ? 'shield' : id === 'resources' ? 'resources' : 'vault';
    return `<a href="${href}" class="nav${id === active ? ' on' : ''}"${id === active ? ' aria-current="page"' : ''}>${icon(ic)} ${label}</a>`;
  }).join('');

  const sb = document.querySelector('.sidebar');
  sb.innerHTML = `
    <a href="/" class="brand" aria-label="Quantix Escrow home">
      <img src="/static/img/logo.png" alt="">
      <span style="display:flex;flex-direction:column;line-height:1.1">
        <span class="t1">QUANTIX</span><span class="t2">ESCROW SYSTEM</span>
      </span>
    </a>
    <nav aria-label="Escrow" style="display:flex;flex-direction:column;gap:6px">
      <span class="navlabel">${me.team ? 'ESCROW' : 'BUYER'}</span>${nav}
    </nav>
    <div class="userbox">
      <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:#CFE2FF;padding:0 8px"><span class="dot"></span>${me.team ? 'Escrow online' : 'Signed in'}</div>
      <div class="userpill">
        <span class="av">${avatarMarkup(me)}</span>
        <span style="display:flex;flex-direction:column;min-width:0;flex:1">
          <span class="nm">${QX.esc(me.username)}</span>
          <span class="rl">Discord · ${me.team ? 'Team' : 'Buyer'}</span>
        </span>
      </div>
      <button class="signout" id="logoutBtn">${icon('logout', 18)} Sign out</button>
    </div>`;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await QX.post('/auth/logout'); location.href = '/login';
  });
  return me;
}

function bannerMarkup(h = 200) {
  return `<div class="banner in d1" style="height:${h}px">
    <img src="/static/img/banner.jpg" alt="Quantix Labs — Engineered beyond expectations">
    <div class="shine" aria-hidden="true"></div><div class="fade" aria-hidden="true"></div>
  </div>`;
}
