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
  });