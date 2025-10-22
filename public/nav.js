(() => {
  function protectRoutes() {
    const unprotected = ['/', '/login.html', '/register.html'];
    const path = location.pathname;
    const token = localStorage.getItem('token');
    if (!unprotected.includes(path) && !token) { try { window.location.replace('/login.html'); } catch (_) { window.location.href = '/login.html'; } }
  }

  document.addEventListener('DOMContentLoaded', () => {
    protectRoutes();
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