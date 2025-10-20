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
      <a href="#app-content" class="skip-link">Aller au contenu</a>
      <div class="container mx-auto px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button id="navToggle" class="inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:text-indigo-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-expanded="false" aria-label="Ouvrir le menu">
            <i data-lucide="menu"></i>
          </button>
        </div>
        <div class="text-sm hidden md:flex items-center gap-3"><button id="themeToggle" class="inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:text-indigo-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label="Basculer le thème" title="Basculer le thème"></button>${authItems}</div>
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
    header.setAttribute('role', 'banner');
    header.innerHTML = buildNav();
    header.className = 'app-header';

    // Theme helpers and initialization
    function getPreferredTheme(){
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      try { return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch(_) { return 'light'; }
    }
    function applyTheme(theme){
      try {
        document.body.classList.toggle('theme-dark', theme === 'dark');
        document.body.classList.toggle('theme-light', theme === 'light');
      } catch(_) {}
    }
    function updateThemeToggleIcon(){
      try {
        const btn = document.getElementById('themeToggle');
        if (!btn) return;
        const isDark = document.body.classList.contains('theme-dark');
        const sun = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
        const moon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
        btn.innerHTML = isDark ? sun : moon;
        btn.setAttribute('aria-label', isDark ? 'Passer en mode clair' : 'Passer en mode sombre');
        btn.title = isDark ? 'Mode clair' : 'Mode sombre';
      } catch(_) {}
    }
    try {
      const initial = getPreferredTheme();
      applyTheme(initial);
      updateThemeToggleIcon();
      const tgl = document.getElementById('themeToggle');
      if (tgl) {
        tgl.addEventListener('click', () => {
          const isDark = document.body.classList.contains('theme-dark');
          const next = isDark ? 'light' : 'dark';
          localStorage.setItem('theme', next);
          applyTheme(next);
          updateThemeToggleIcon();
        });
      }
    } catch(_) {}

    const logout = document.getElementById('logoutBtn');
    if (logout) {
      logout.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
      });
    }

    // No horizontal/mobile top nav: menu icon now controls sidebar only
    // Helper: update menu button icon and label
    function updateMenuButtonIcon(isOpen){
      try {
        const btn = document.getElementById('navToggle');
        if (!btn) return;
        const icoOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>`; // X icon
        const icoClosed = `<i data-lucide="menu"></i>`; // Hamburger
        btn.innerHTML = isOpen ? icoOpen : icoClosed;
        btn.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
      } catch(_) {}
    }
  }

  function ensureAppShell() {
    try {
      // Normalize: if a static app-shell/aside exists in the page, unwrap its <main> and remove it
      try {
        const existingShell = document.querySelector('.app-shell');
        if (existingShell) {
          const existingMain = existingShell.querySelector('main');
          if (existingMain) {
            existingShell.insertAdjacentElement('beforebegin', existingMain);
          }
          existingShell.remove();
        }
      } catch(_) {}
      const header = document.querySelector('header');
      const shell = document.createElement('div');
      shell.className = 'app-shell';
      const aside = document.createElement('aside');
      aside.className = 'sidebar';
      const sh = document.createElement('div'); sh.className = 'sidebar-header'; sh.innerHTML = '<a href="/dashboard.html" class="brand">Gestion Projets</a>';
      const nav = document.createElement('nav'); nav.className = 'sidebar-nav';
      const links = [
        { href: '/dashboard.html', label: 'Dashboard', icon: 'home' },
        { href: '/agents.html', label: 'Agents', icon: 'users' },
        { href: '/sites.html', label: 'Sites', icon: 'building' },
        { href: '/interventions.html', label: 'Interventions', icon: 'wrench' },
        { href: '/rendezvous.html', label: 'Rendez-vous', icon: 'calendar' },
        { href: '/achats.html', label: 'Achats', icon: 'shopping-cart' },
        { href: '/factures.html', label: 'Factures', icon: 'receipt' }
      ];
      const current = location.pathname.replace(/\\/g, '/');
      nav.innerHTML = links.map(l => {
        const active = current.endsWith(l.href);
        return `<a href="${l.href}"><i data-lucide="${l.icon}"></i> ${l.label}</a>`;
      }).join('');
      aside.appendChild(sh); aside.appendChild(nav);

      // Determine main content
      let main = document.querySelector('main');
      if (!main) {
        main = document.createElement('main'); main.className = 'content';
        const toMove = [];
        Array.from(document.body.children).forEach(el => {
          if (el === header) return; // keep header outside
          if (el === shell) return; // skip our shell
          if (el.tagName && el.tagName.toLowerCase() === 'script') return; // leave scripts
          toMove.push(el);
        });
        toMove.forEach(el => main.appendChild(el));
      }
      shell.appendChild(aside);
      shell.appendChild(main);
      if (header) {
        header.insertAdjacentElement('afterend', shell);
      } else {
        document.body.prepend(shell);
      }
    } catch(_) {}
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
      // Ensure main content has an id for skip link target
      try {
        const main = document.querySelector('main');
        if (main && !main.id) { main.id = 'app-content'; }
      } catch(_) {}
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
    ensureAppShell();
    try { document.body.classList.add('app-bg'); } catch(_){}
    // Add a floating top-left menu button to toggle sidebar only
    try {
      if (!document.getElementById('headToggle')) {
        const btn = document.createElement('button');
        btn.id = 'headToggle';
        btn.className = 'head-toggle';
        // Inline SVG hamburger to avoid icon dependencies
        btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.75 6.75h16.5v1.5H3.75v-1.5Zm0 4.5h16.5v1.5H3.75v-1.5Zm0 4.5h16.5v1.5H3.75v-1.5Z"/></svg>';
        btn.title = 'Menu';
        btn.addEventListener('click', () => {
          const isOpen = document.body.classList.contains('sidebar-open');
          if (isOpen) {
            document.body.classList.remove('sidebar-open');
            document.body.classList.add('sidebar-hidden');
          } else {
            document.body.classList.add('sidebar-open');
            document.body.classList.remove('sidebar-hidden');
          }
        });
        document.body.appendChild(btn);
      }
    } catch(_){}
    // Ensure sidebar mobile toggle works
    try {
      const btn = document.getElementById('navToggle');
      if (btn) {
        btn.classList.add('sidebar-toggle-btn');
        // Set initial icon according to state
        updateMenuButtonIcon(document.body.classList.contains('sidebar-open'));
        btn.addEventListener('click', () => {
          const isOpen = document.body.classList.contains('sidebar-open');
          if (isOpen) {
            // Animate closing: keep open layout, fade/slide up, then hide
            document.body.classList.add('sidebar-animating');
            try { btn.setAttribute('aria-expanded', 'false'); } catch(_) {}
            updateMenuButtonIcon(false);
            setTimeout(() => {
              document.body.classList.remove('sidebar-open');
              document.body.classList.add('sidebar-hidden');
              document.body.classList.remove('sidebar-animating');
            }, 200);
          } else {
            // Open with slight delay for smooth slide-down
            document.body.classList.add('sidebar-open');
            document.body.classList.remove('sidebar-hidden');
            document.body.classList.add('sidebar-animating');
            setTimeout(() => { document.body.classList.remove('sidebar-animating'); }, 40);
            try { btn.setAttribute('aria-expanded', 'true'); } catch(_) {}
            updateMenuButtonIcon(true);
          }
        });
        // Close menu when a sidebar link is clicked
        try {
          const sideNav = document.querySelector('.sidebar-nav');
          if (sideNav) {
            sideNav.addEventListener('click', (e) => {
              const a = e.target && (e.target.closest('a'));
              if (!a) return;
              document.body.classList.add('sidebar-animating');
              setTimeout(() => {
                document.body.classList.remove('sidebar-open');
                document.body.classList.add('sidebar-hidden');
                document.body.classList.remove('sidebar-animating');
                updateMenuButtonIcon(false);
                try { btn.setAttribute('aria-expanded', 'false'); } catch(_) {}
              }, 150);
            });
          }
        } catch(_) {}
        // Initialize hidden by default on all screens
        document.body.classList.add('sidebar-hidden');
      }
    } catch(_){}
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
      }
      // Replace <i data-lucide> by inline SVG if Lucide not loaded
      try {
        if (!window.lucide) {
          document.querySelectorAll('i[data-lucide]').forEach((el) => {
            const name = el.getAttribute('data-lucide');
            const svg = (function icon(name){
              const cls='icon';
              switch(name){
                case 'home': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/></svg>`;
                case 'users': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
                case 'building': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V9h6v12"/><path d="M9 9h6"/><path d="M7 12h2M7 16h2M15 12h2M15 16h2"/></svg>`;
                case 'wrench': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a5 5 0 0 1-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3-3Z"/></svg>`;
                case 'calendar': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
                case 'shopping-cart': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h7.72a2 2 0 0 0 2-1.61L21 6H6"/></svg>`;
                case 'receipt': return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21V3a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18l3-2 3 2 3-2 3 2 3-2 3 2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>`;
                default: return '';
              }
            })(name);
            if (svg) el.outerHTML = svg;
          });
        }
      } catch(_){}
    } catch(_){}
  });
})();






