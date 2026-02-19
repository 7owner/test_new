document.addEventListener('DOMContentLoaded', async () => {
  const App = window.AppCore || {
    getToken: () => localStorage.getItem('token') || '',
    clearAuth: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('userRole');
    },
    decodeToken: (token) => {
      try {
        const payload = (token || '').split('.')[1];
        return payload ? JSON.parse(atob(payload)) : null;
      } catch (_) {
        return null;
      }
    }
  };
  const navbarPlaceholder = document.getElementById('navbar-placeholder');
  if (!navbarPlaceholder) {
    console.error('Navbar placeholder not found. Cannot inject navbar.');
    return;
  }

  // Fetch and inject the navbar
  try {
    const response = await fetch('/nav.html');
    if (!response.ok) {
      throw new Error('Failed to load navbar HTML');
    }
    const navbarHtml = await response.text();
    navbarPlaceholder.innerHTML = navbarHtml;

    // Now run the rest of the original nav.js logic
    await initializeNavbar();
  } catch (error) {
    console.error('Error loading navbar:', error);
  }

  async function initializeNavbar() {
    // ensureSessionAndCsrf doit aussi rediriger si 401/403
    try {
      await ensureSessionAndCsrf();
    } catch (e) {
      console.error('Session invalide', e);
      return redirectLogin();
    }
    
    // Populate logged-in user info and handle dynamic menu items
    // Vérifie session : si token manquant/expiré ou réponse 401/403 sur ensureSessionAndCsrf, on redirige
    const token = App.getToken();
    if (!token) {
      return redirectLogin();
    }

    try {
      const payload = App.decodeToken(token);
      if (!payload) return redirectLogin();
      const email = payload.email || 'Utilisateur';
      const matricule = payload.matricule || payload.sub;
      const userId = payload.id;
      
      const userIconLink = document.getElementById('user-icon-link');
      const userInfoContainer = document.querySelector('#user-info-container .text-secondary');
      
      if (userIconLink) userIconLink.setAttribute('title', email);
      if (userInfoContainer) userInfoContainer.textContent = `Bienvenue`;
      
      if (matricule) {
        userIconLink.dataset.matricule = matricule;
        userIconLink.addEventListener('click', (e) => {
          e.preventDefault();
          const modalEl = document.getElementById('navAgentModal');
          const frame = document.getElementById('navAgentFrame');
          if (modalEl && frame) {
            frame.src = `/agent-view.html?matricule=${encodeURIComponent(matricule)}&embed=1&modal=1`;
            const m = bootstrap.Modal.getOrCreateInstance(modalEl);
            m.show();
          } else {
            // fallback navigation
            window.location.href = `/agent-view.html?matricule=${encodeURIComponent(matricule)}`;
          }
        });
      }

      const roles = payload.roles || [];
      const navList = document.querySelector('.offcanvas-body ul.navbar-nav');
      if (navList) {
        if (roles.includes('ROLE_CLIENT') && !navList.querySelector('a[href="/client-dashboard.html"]')) {
          const li = document.createElement('li');
          li.className = 'nav-item';
          li.innerHTML = `<a class="nav-link" href="/client-dashboard.html"><i class="bi bi-person-workspace me-2"></i>Espace Client</a>`;
          navList.appendChild(li);
        }

        if (!navList.querySelector('a[href="/messagerie.html"]')) {
          const li = document.createElement('li');
          li.className = 'nav-item';
          li.innerHTML = `<a class="nav-link" href="/messagerie.html"><i class="bi bi-chat-dots-fill me-2"></i>Messagerie</a>`;
          const dashboardLi = navList.querySelector('a[href="/dashboard.html"]')?.parentElement;
          if (dashboardLi) {
            dashboardLi.insertAdjacentElement('afterend', li);
          } else {
            navList.prepend(li);
          }
        }

        // Active link
        const currentPath = window.location.pathname;
        navList.querySelectorAll('a.nav-link').forEach(a => {
          a.classList.remove('active');
          if (a.getAttribute('href') === currentPath) {
            a.classList.add('active');
          }
        });
      }

      // Notifications (cloche) comme sur le dashboard
      initNotifications(userId);
    } catch (e) {
      console.error('Error setting up user-specific navbar elements:', e);
      redirectLogin();
    }

    // Wrapper fetch pour rediriger automatiquement si session expirée
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      if (res.status === 401 || res.status === 403) {
        redirectLogin();
      }
      return res;
    };
    
    // Logout button
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', (event) => {
        event.preventDefault();
        if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
          fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
            App.clearAuth();
            window.location.href = '/login.html';
          });
        }
      });
    }

    // Bootstrap Offcanvas initialization
    const offcanvasElement = document.getElementById('offcanvasNavbar');
    if (offcanvasElement) {
      new bootstrap.Offcanvas(offcanvasElement);
    }
  }

  function redirectLogin() {
    App.clearAuth();
    window.location.href = '/login.html';
  }

  /**
   * Notifications via cloche (mêmes règles que dashboard : compte les nouveaux messages des demandes)
   */
  function initNotifications(userId) {
    const notifBadge = document.getElementById('notif-badge');
    const notifList = document.getElementById('notif-list');
    if (!notifBadge || !notifList || !userId) return;
    const currentUserId = Number(userId);
    if (!Number.isFinite(currentUserId)) return;

    const token = App.getToken();

    const readKey = `notifReads:${currentUserId}`;
    const getReadMap = () => {
      try { return JSON.parse(localStorage.getItem(readKey) || '{}'); } catch (_) { return {}; }
    };
    const setRead = (convId, ts) => {
      const map = getReadMap();
      map[convId] = ts;
      localStorage.setItem(readKey, JSON.stringify(map));
    };

  async function fetchDemandes() {
    const opts = {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'same-origin'
    };
    try {
      // Les comptes clients n'ont pas accès à la liste complète :
      // on commence par /mine pour éviter les 403 dans les logs,
      // puis on retente la liste complète pour les comptes internes.
      let r = await fetch('/api/demandes_client/mine', opts);
      if (!r.ok) {
        r = await fetch('/api/demandes_client?sort=id&direction=desc', opts);
      }
      if (!r.ok) return [];
      const data = await r.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  async function fetchConversations() {
    const opts = {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'same-origin'
    };
    try {
      const r = await fetch('/api/conversations', opts);
      if (!r.ok) return [];
      const data = await r.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

    async function updateNotifications() {
      const demandes = await fetchDemandes();
      const conversations = await fetchConversations();
      const demandeMap = new Map((demandes || []).map(d => [`demande-${d.id}`, d]));
      const readMap = getReadMap();
      let total = 0;
      const items = [];

      for (const c of conversations) {
        const convId = c && c.conversation_id ? String(c.conversation_id) : '';
        if (!convId) continue;
        const senderId = Number(c.sender_id);
        const receiverId = Number(c.receiver_id);
        const isIncoming = Number.isFinite(receiverId)
          ? receiverId === currentUserId
          : (Number.isFinite(senderId) && senderId !== currentUserId);
        if (!isIncoming) continue;

        const lastTs = c && c.created_at ? new Date(c.created_at).getTime() : 0;
        const lastRead = readMap[convId] ? Number(readMap[convId]) : 0;
        if (lastTs && lastTs <= lastRead) continue;

        total += 1;
        const d = demandeMap.get(convId);
        const convLabel = d
          ? `Demande #${d.id}${d.titre ? ' - ' + d.titre : ''}`
          : (convId.startsWith('demande-') ? `Demande #${convId.replace('demande-', '')}` : convId);
        items.push(`
          <div class="list-group-item">
            <div class="d-flex justify-content-between">
              <strong>${convLabel}</strong>
              <small>${c.created_at ? new Date(c.created_at).toLocaleString() : ''}</small>
            </div>
            <div class="text-truncate">${c.body || '(Pièce jointe)'}</div>
            <button class="btn btn-sm btn-primary mt-2 open-conv-btn" data-conversation-id="${convId}" data-ts="${lastTs}">Ouvrir</button>
          </div>
        `);
      }

      notifBadge.textContent = total;
      notifBadge.style.display = total ? 'inline-block' : 'none';
      notifList.innerHTML = items.length ? items.join('') : '<div class="list-group-item text-muted">Aucun nouveau message.</div>';

      notifList.querySelectorAll('.open-conv-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const convId = e.currentTarget.dataset.conversationId;
          const ts = Number(e.currentTarget.dataset.ts || 0);
          const dropdown = bootstrap.Dropdown.getOrCreateInstance(document.getElementById('notif-toggle'));
          if (dropdown) dropdown.hide();

          const modalEl = document.getElementById('notifConversationModal');
          const frame = document.getElementById('notifConversationFrame');
          if (modalEl && frame) {
            frame.src = `/messagerie.html?conversation=${encodeURIComponent(convId || '')}`;
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
          }

          setRead(convId || '', ts || Date.now());
          const item = e.currentTarget.closest('.list-group-item');
          if (item) item.remove();
          const remaining = notifList.querySelectorAll('.open-conv-btn').length;
          notifBadge.textContent = remaining;
          notifBadge.style.display = remaining ? 'inline-block' : 'none';
          if (!remaining) {
            notifList.innerHTML = '<div class="list-group-item text-muted">Aucun nouveau message.</div>';
          }
        });
      });
    }

    const refreshNotifications = () => updateNotifications().catch(err => console.warn('notif refresh failed:', err?.message || err));
    refreshNotifications();
    setInterval(refreshNotifications, 30000);
    const notifToggle = document.getElementById('notif-toggle');
    if (notifToggle) {
      notifToggle.addEventListener('shown.bs.dropdown', refreshNotifications);
    }
  }

  async function ensureSessionAndCsrf() {
    const unprotected = ['/', '/login.html', '/register.html', '/forgot-password.html', '/reset-password.html'];
    if (unprotected.includes(window.location.pathname)) return;

    const token = App.getToken();
    if (!token) {
      window.location.href = '/login.html';
      return;
    }

    try {
      const response = await fetch('/api/csrf-token', { credentials: 'same-origin', headers: { 'Authorization': `Bearer ${token}` } });
      if (response.status === 401 || response.status === 403) {
        return redirectLogin();
      }
      if (!response.ok) {
        console.warn('CSRF token fetch failed with status', response.status);
        return;
      }
      const data = await response.json();
      const csrfToken = data.csrfToken;
      if (csrfToken) {
        const originalFetch = window.fetch;
        window.fetch = function(input, init = {}) {
          if (init.method && init.method.toUpperCase() !== 'GET' && init.method.toUpperCase() !== 'HEAD' && init.method.toUpperCase() !== 'OPTIONS') {
            init.headers = { ...init.headers, 'X-CSRF-Token': csrfToken };
            init.credentials = init.credentials || 'same-origin';
          }
          return originalFetch(input, init);
        };
      }
    } catch (e) {
      console.warn('CSRF token fetch failed (tolerated):', e);
    }
  }
});
