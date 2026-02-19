(function () {
  'use strict';

  function getToken() {
    return localStorage.getItem('token') || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem('token', token);
  }

  function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
  }

  function decodeToken(token) {
    try {
      const t = token || getToken();
      if (!t) return null;
      const payload = t.split('.')[1];
      if (!payload) return null;
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (_) {
      return null;
    }
  }

  function authHeaders(token, includeJson) {
    const t = token || getToken();
    const headers = {};
    if (t) headers.Authorization = 'Bearer ' + t;
    if (includeJson) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function apiJson(url, opts) {
    const o = opts || {};
    const method = String(o.method || 'GET').toUpperCase();
    const includeJson = !o.formData && method !== 'GET' && method !== 'HEAD';
    const headers = Object.assign(
      {},
      authHeaders(o.token, includeJson),
      o.headers || {}
    );

    const init = Object.assign({}, o, {
      headers,
      credentials: o.credentials || 'same-origin'
    });

    const res = await fetch(url, init);
    const isJson = (res.headers.get('content-type') || '').includes('json');
    const payload = isJson ? await res.json().catch(function () { return null; }) : null;

    if (!res.ok) {
      const err = new Error((payload && payload.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  window.AppCore = {
    getToken: getToken,
    setToken: setToken,
    clearAuth: clearAuth,
    decodeToken: decodeToken,
    authHeaders: authHeaders,
    apiJson: apiJson
  };
})();
