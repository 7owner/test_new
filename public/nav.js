document.addEventListener('DOMContentLoaded', async () => {
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
    await ensureSessionAndCsrf();
    
    // Populate logged-in user info and handle dynamic menu items
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const email = payload.email || 'Utilisateur';
        const matricule = payload.matricule || payload.sub;
        
        const userIconLink = document.getElementById('user-icon-link');
        const userInfoContainer = document.querySelector('#user-info-container .text-secondary');
        
        if (userIconLink) userIconLink.setAttribute('title', email);
        if (userInfoContainer) userInfoContainer.textContent = `Bienvenue`;
        
        if (matricule) {
          userIconLink.href = `/agent-view.html?matricule=${encodeURIComponent(matricule)}`;
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
      }
    } catch (e) {
      console.error('Error setting up user-specific navbar elements:', e);
    }
    
    // Logout button
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', (event) => {
        event.preventDefault();
        if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
          fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
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

  async function ensureSessionAndCsrf() {
    const unprotected = ['/', '/login.html', '/register.html', '/forgot-password.html', '/reset-password.html'];
    if (unprotected.includes(window.location.pathname)) return;

    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login.html';
      return;
    }

    try {
      const response = await fetch('/api/csrf-token', { credentials: 'same-origin', headers: { 'Authorization': `Bearer ${token}` } });
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



