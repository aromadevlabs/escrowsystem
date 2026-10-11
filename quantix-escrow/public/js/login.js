'use strict';
// Login page behaviour (external file so a strict script-src CSP allows it).
(function () {
  const noteIcon = document.querySelector('.note span');
  if (noteIcon) noteIcon.innerHTML = icon('shield', 18);
  if (new URLSearchParams(location.search).get('denied')) QX.toast('Discord sign-in was cancelled.', 'bad');
  // If already signed in, go straight in.
  QX.get('/api/me').then((d) => { if (d.user) location.href = '/'; }).catch(() => {});
})();
