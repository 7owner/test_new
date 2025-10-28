document.addEventListener('DOMContentLoaded', () => {
      const resetPasswordForm = document.getElementById('resetPasswordForm');
      const errorMessageDiv = document.getElementById('error-message');
      const successMessageDiv = document.getElementById('success-message');

      const showError = (message) => { errorMessageDiv.textContent = message; errorMessageDiv.classList.remove('d-none'); successMessageDiv.classList.add('d-none'); };
      const showSuccess = (message) => { successMessageDiv.textContent = message; successMessageDiv.classList.remove('d-none'); errorMessageDiv.classList.add('d-none'); };

      let csrfToken = null;
      fetch('/api/csrf-token', { credentials: 'same-origin' })
        .then(r => r.ok ? r.json() : {})
        .then(d => { csrfToken = d && d.csrfToken; })
        .catch(() => {});

      if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const password = document.getElementById('inputPassword').value;
          const confirmPassword = document.getElementById('confirmPassword').value;
          const urlParams = new URLSearchParams(window.location.search);
          const token = urlParams.get('token');

          if (password !== confirmPassword) {
            showError('Les mots de passe ne correspondent pas.');
            return;
          }

          if (!token) {
            showError('Jeton de réinitialisation manquant.');
            return;
          }

          try {
            const response = await fetch('/api/reset-password', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
              credentials: 'same-origin',
              body: JSON.stringify({ token, newPassword: password }),
            });

            const data = await response.json();

            if (!response.ok) {
              showError(data.error || 'Erreur lors de la réinitialisation du mot de passe.');
              return;
            }

            showSuccess(data.message || 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.');
            setTimeout(() => { window.location.href = '/login.html'; }, 3000);
          } catch (error) {
            console.error('Erreur lors de la réinitialisation du mot de passe:', error);
            showError('Une erreur inattendue est survenue.');
          }
        });
      }
    });