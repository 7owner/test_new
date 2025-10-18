(() => {
  function buildNav() {
    const token = localStorage.getItem('token');
    const links = [
      { href: '/dashboard.html', label: 'Dashboard', icon: 'home' },
      { href: '/agents.html', label: 'Agents', icon: 'users' },
      { href: '/sites.html', label: 'Sites', icon: 'building' },
      { href: '/interventions.html', label: 'Interventions', icon: 'wrench' },
      { href: '/rendezvous.html', label: 'Rendez-vous', icon: 'calendar' },
      { href: '/achats.html', label: 'Achats', icon: 'cart' },
      { href: '/factures.html', label: 'Factures', icon: 'receipt' },
    ];

    function iconSVG(name, cls) {
      const common = `class="${cls||'w-5 h-5'}" aria-hidden="true"`;
      switch (name) {
        case 'home':
          return `<svg ${common} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/></svg>`;
        case 'users':
          return `<svg ${common} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
        case 'building':
          return `<svg ${common} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V9h6v12"/><path d="M9 9h6"/><path d="M7 12h2M7 16h2M15 12h2M15 16h2"/></svg>`;
        case 'wrench':
          return `<svg ${common} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a5 5 0 0 1-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3-3Z"/></svg>`;
        case 'calendar':
          return `<svg ${common} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
        case 'cart':
          return `<svg ${common} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h7.72a2 2 0 0 0 2-1.61L21 6H6"/></svg>`;
        case 'receipt':
          return `<svg ${common} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21V3a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18l3-2 3 2 3-2 3 2 3-2 3 2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>`;
      }
      return '';
    }

    const current = location.pathname.replace(/\\/g, '/');
    const navItems = links.map(l => {
      const active = current.endsWith(l.href);
      return `<a class="${active ? 'text-indigo-700 font-semibold' : 'text-slate-600 hover:text-indigo-600'} inline-flex items-center gap-2" href="${l.href}">${iconSVG(l.icon)}<span>${l.label}</span></a>`;
    }).join('');

    const authItems = token
      ? '<button id="logoutBtn" class="text-slate-600 hover:text-red-600">Déconnexion</button>'
      : '<a class="text-slate-600 hover:text-indigo-600" href="/login.html">Connexion</a> <a class="text-slate-600 hover:text-indigo-600 ml-4" href="/register.html">Inscription</a>';

    return `
      <div class="container mx-auto px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button id="navToggle" class="md:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:text-indigo-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-controls="mobileNav" aria-expanded="false" aria-label="Ouvrir le menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M3.75 6.75h16.5v1.5H3.75v-1.5Zm0 4.5h16.5v1.5H3.75v-1.5Zm0 4.5h16.5v1.5H3.75v-1.5Z"/></svg>
          </button>
          <a href="/dashboard.html" class="text-xl font-semibold text-indigo-700">Gestion Projets</a>
        </div>
        <nav class="hidden md:flex items-center space-x-4 text-sm">
          ${navItems}
        </nav>
        <div class="text-sm hidden md:block">${authItems}</div>
      </div>
      <div id="mobileNav" class="md:hidden border-t border-slate-200 bg-white">
        <div class="container mx-auto px-6 py-3 flex flex-col space-y-2 text-sm">
          ${links.map(l => {
            const active = current.endsWith(l.href);
            return `<a class="${active ? 'text-indigo-700 font-semibold' : 'text-slate-700'} inline-flex items-center gap-2" href="${l.href}">${iconSVG(l.icon)}<span>${l.label}</span></a>`;
          }).join('')}
          <div class="pt-2 border-t border-slate-200">${authItems}</div>
        </div>
      </div>
    `;
  }

  function ensureHeader() {
    let header = document.querySelector('header');
    if (!header) {
      header = document.createElement('header');
      header.className = 'app-header';
      document.body.prepend(header);
    }
    header.innerHTML = buildNav();
    header.className = 'app-header';

    const logout = document.getElementById('logoutBtn');
    if (logout) {
      logout.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
      });
    }

    const toggle = document.getElementById('navToggle');
    const mobile = document.getElementById('mobileNav');
    if (toggle && mobile) {
      // collapsed by default via CSS (max-height)
      mobile.classList.remove('open');
      toggle.addEventListener('click', () => {
        const isOpen = mobile.classList.contains('open');
        if (isOpen) {
          mobile.style.maxHeight = mobile.scrollHeight + 'px';
          requestAnimationFrame(() => {
            mobile.style.maxHeight = '0px';
            mobile.classList.remove('open');
          });
        } else {
          mobile.classList.add('open');
          mobile.style.maxHeight = mobile.scrollHeight + 'px';
        }
        toggle.setAttribute('aria-expanded', (!isOpen).toString());
      });
    }
  }

  function protectRoutes() {
    const unprotected = ['/', '/login.html', '/register.html'];
    const path = location.pathname;
    const token = localStorage.getItem('token');
    if (!unprotected.includes(path) && !token) {
      // redirect to login if not authenticated
      try { window.location.replace('/login.html'); } catch (_) { window.location.href = '/login.html'; }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    protectRoutes();
    try {
      const head = document.querySelector('head');
      if (head && !document.querySelector('link[href="/custom.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/custom.css';
        head.appendChild(link);
      }
      // Ensure favicon is present
      const hasFavicon = document.querySelector('link[rel="icon"]');
      if (head && !hasFavicon) {
        const fav = document.createElement('link');
        fav.rel = 'icon';
        fav.type = 'image/svg+xml';
        fav.href = '/favicon.svg';
        head.appendChild(fav);
      }
      // Lucide icons CDN (optional): load once if not present
      if (head && !document.querySelector('script[data-lucide]')) {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/lucide@latest';
        s.defer = true;
        s.setAttribute('data-lucide','true');
        head.appendChild(s);
      }
    } catch (_) {}
    ensureHeader();
    try { document.body.classList.add('app-bg'); } catch(_){}
    try { if (window.lucide && typeof window.lucide.createIcons === 'function') { window.lucide.createIcons(); } } catch(_){}
    // Ensure toast container
    if (!document.getElementById('toast-root')) { const tr = document.createElement('div'); tr.id = 'toast-root'; tr.className = 'toast-root'; document.body.appendChild(tr); }

    // Dashboard small enhancements: add links under metric cards and make grid clickable
    try {
      const path = location.pathname.replace(/\\/g,'/');
      if (path.endsWith('/dashboard.html') || path.endsWith('dashboard.html')) {
        const addLinkUnder = (id, href, text) => {
          const el = document.getElementById(id);
          if (!el) return;
          const body = el.closest('.card-body');
          if (!body || body.querySelector('.metric-extra-link')) return;
          const div = document.createElement('div');
          div.className = 'mt-2 text-xs metric-extra-link';
          const a = document.createElement('a');
          a.href = href; a.textContent = text;
          div.appendChild(a);
          body.appendChild(div);
        };
        addLinkUnder('activeMaintenances','/maintenances.html','Voir les maintenances');
        addLinkUnder('activeAgents','/agents.html','Voir les agents');
        const grids = Array.from(document.querySelectorAll('.grid.grid-autofit-cards'));
        const mk = (container) => {
          if (!container) return;
          container.addEventListener('click', (ev) => {
            if (ev.defaultPrevented) return;
            const isBtn = ev.target && (ev.target.closest('button') || ev.target.closest('.btn'));
            if (isBtn) return;
            const card = ev.target.closest('.card');
            if (!card || !container.contains(card)) return;
            const link = card.querySelector('a[href]');
            if (link && link.getAttribute('href')) {
              ev.preventDefault();
              try { window.location.href = link.getAttribute('href'); } catch(_) {}
            }
          });
        };
        if (grids[0]) mk(grids[0]);
        const fc = document.getElementById('financeCounters');
        if (fc) mk(fc);
      }      // Agent detail: no extra DOM observers to avoid potential loops
    } catch(_){}
  });
})();





