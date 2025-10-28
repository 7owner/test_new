document.addEventListener('DOMContentLoaded', () => {
      const pw = document.getElementById('inputPassword');
      const t = document.getElementById('togglePassword');
      if (pw && t) {
        t.addEventListener('click', () => {
          const isPwd = pw.type === 'password';
          pw.type = isPwd ? 'text' : 'password';
          t.textContent = isPwd ? 'Masquer' : 'Afficher';
        });
      }

      // Placeholder for login form submission handling
      const loginForm = document.getElementById('loginForm');
      const errorMessageDiv = document.getElementById('error-message');

      if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const email = document.getElementById('inputEmail').value;
          const password = document.getElementById('inputPassword').value;

          try {
            // Try to fetch CSRF token (optional for login)
            let csrfToken = null;
            try {
              const csrfResponse = await fetch('/api/csrf-token');
              if (csrfResponse.ok) {
                const ct = csrfResponse.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                  const csrfData = await csrfResponse.json();
                  csrfToken = csrfData && csrfData.csrfToken ? csrfData.csrfToken : null;
                }
              }
            } catch {}

            const response = await fetch('/api/login', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, csrfToken ? { 'csrf-token': csrfToken } : {}),
              body: JSON.stringify({ email, password }),
            });
            let data = {};
            try {
              const ct = response.headers.get('content-type') || '';
              if (ct.includes('application/json')) data = await response.json();
            } catch {}

            if (!response.ok) {
              errorMessageDiv.textContent = data.error || 'Email ou mot de passe incorrect.';
              errorMessageDiv.classList.remove('d-none');
              localStorage.removeItem('token');
              localStorage.removeItem('userRole');
              return;
            }

            if (data.token) {
              localStorage.setItem('token', data.token);
              // Decode JWT to get roles
              const base64Url = data.token.split('.')[1];
              const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
              const decodedToken = JSON.parse(atob(base64));
              localStorage.setItem('userRole', decodedToken.roles.includes('ROLE_ADMIN') ? 'admin' : 'user');

              window.location.href = '/dashboard.html'; // Redirect to dashboard
            } else {
              errorMessageDiv.textContent = 'La connexion a échoué : jeton manquant.';
              errorMessageDiv.classList.remove('d-none');
              localStorage.removeItem('token');
              localStorage.removeItem('userRole');
            }
          } catch (error) {
            console.error('Erreur de connexion:', error);
            errorMessageDiv.textContent = 'Une erreur inattendue est survenue.';
            errorMessageDiv.classList.remove('d-none');
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
          }
        });
      }
    });