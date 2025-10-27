(() => {
  async function ensureSessionAndCsrf() {
    const unprotected = ['/', '/login.html', '/register.html', '/forgot-password.html', '/reset-password.html'];
    const path = location.pathname;
    const token = localStorage.getItem('token');

    if (unprotected.includes(path)) return;

    if (!token) {
      try { window.location.replace('/login.html'); } catch { window.location.href = '/login.html'; }
      return;
    }

    // If token exists, consider session valid for client-side routing
    // CSRF token fetching can still happen if needed for API calls
    try {
      const t = await fetch('/api/csrf-token', { credentials: 'same-origin', headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json()).catch(()=>({}));
      const csrfToken = t && t.csrfToken;
      if (csrfToken) {
        try {
          const orig = window.fetch;
          window.fetch = function(input, init={}) {
            const method = (init && init.method) ? String(init.method).toUpperCase() : 'GET';
            if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
              init.headers = Object.assign({}, init.headers, { 'X-CSRF-Token': csrfToken });
              init.credentials = init.credentials || 'same-origin';
            }
            return orig(input, init);
          };
        } catch(_){}
      }
    } catch (_) {
      // If CSRF token fetching fails, it might indicate an expired or invalid JWT
      localStorage.removeItem('token');
      localStorage.removeItem('userRole');
      try { window.location.replace('/login.html'); } catch { window.location.href = '/login.html'; }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureSessionAndCsrf().then(async () => {
      // Populate logged-in email into header via session
      try {
        // Populate from JWT only to avoid noisy /api/me failures
        const t = localStorage.getItem('token');
        if (t) {
          try {
            const p = JSON.parse(atob(t.split('.')[1]));
            const span = document.getElementById('logged-in-user-email');
            if (span && p && p.email) span.textContent = p.email;
          } catch {}
        }
      } catch {}
    });
    try { document.body.classList.add('app-bg'); } catch(_){}
    try {
      const head = document.querySelector('head');
      if (head && !document.querySelector('link[href^="/custom.css"]')) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/custom.css?v=1'; head.appendChild(link); }
      const main = document.querySelector('main'); if (main && !main.id) main.id = 'app-content';
      if (head && !document.querySelector('link[rel="icon"]')) { const fav = document.createElement('link'); fav.rel='icon'; fav.type='image/svg+xml'; fav.href='/favicon.svg'; head.appendChild(fav); }
    } catch(_){}

    // Bootstrap Offcanvas initialization
    const offcanvasElement = document.getElementById('offcanvasNavbar');
    if (offcanvasElement) {
      offcanvasElement.addEventListener('show.bs.offcanvas', () => {
        // Optional: Add custom logic when offcanvas shows
      });
      offcanvasElement.addEventListener('hide.bs.offcanvas', () => {
        // Optional: Add custom logic when offcanvas hides
      });
    }
  });
})();
