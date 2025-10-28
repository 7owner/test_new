document.addEventListener('DOMContentLoaded', () => {
      const forgotPasswordForm = document.getElementById('forgotPasswordForm');
      const errorMessageDiv = document.getElementById('error-message');
      const successMessageDiv = document.getElementById('success-message');

      const showError = (message) => { errorMessageDiv.textContent = message; errorMessageDiv.classList.remove('d-none'); successMessageDiv.classList.add('d-none'); };
      const showSuccess = (message) => { successMessageDiv.textContent = message; successMessageDiv.classList.remove('d-none'); errorMessageDiv.classList.add('d-none'); };

      let csrfToken = null;
      // Fetch CSRF token for this public page
      fetch('/api/csrf-token', { credentials: 'same-origin' })
        .then(r => r.ok ? r.json() : {})
        .then(d => { csrfToken = d && d.csrfToken; })
        .catch(() => {});

      if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const email = document.getElementById('inputEmail').value;

          try {
            const response = await fetch('/api/forgot-password', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
              credentials: 'same-origin',
              body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
              showError(data.error || 'Erreur lors de l\'envoi du lien de réinitialisation.');
              return;
            }

            showSuccess(data.message || 'Un lien de réinitialisation a été envoyé à votre adresse email.');
          } catch (error) {
            console.error('Erreur lors de la demande de réinitialisation:', error);
            showError('Une erreur inattendue est survenue.');
          }
        });
      }
    });