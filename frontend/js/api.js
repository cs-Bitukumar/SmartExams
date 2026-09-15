/* SmartExams shared API client.
   All requests are same-origin and cookie based; the backend stays the source of truth. */
(function initApiClient(global) {
  const SE = global.SE || (global.SE = {});
  const DEFAULT_TIMEOUT = 20000;
  const LOGIN_PAGE = /\/login\.html$/;

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload || null;
    }
  }

  const friendlyStatusMessage = (status) => {
    if (status === 400) return 'Please check the information you entered and try again.';
    if (status === 401) return 'Your session has expired. Please log in again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'We could not find the record you requested.';
    if (status === 409) return 'That action conflicts with the current state of the record.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status >= 500) return 'Something went wrong on our side. Please try again.';
    return 'The request could not be completed.';
  };

  const redirectToLogin = () => {
    if (LOGIN_PAGE.test(global.location.pathname)) return;
    const next = encodeURIComponent(global.location.pathname + global.location.search);
    global.location.href = `/login.html?next=${next}`;
  };

  const handleSessionExpired = () => {
    if (typeof SE.toast === 'function') SE.toast('Your session has expired. Please log in again.', 'warning');
    redirectToLogin();
  };

  const parseBody = async (response) => {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  };

  const request = async (path, options) => {
    const opts = options || {};
    const controller = new AbortController();
    const timeout = opts.timeout === undefined ? DEFAULT_TIMEOUT : opts.timeout;
    const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
    const init = {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: Object.assign({ Accept: 'application/json' }, opts.headers || {}),
      signal: controller.signal,
    };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    let response;
    try {
      response = await fetch(path, init);
    } catch (error) {
      if (timer) clearTimeout(timer);
      if (error && error.name === 'AbortError') {
        throw new ApiError('The request timed out. Please try again.', 0, null);
      }
      throw new ApiError('Unable to connect to the server. Please try again.', 0, null);
    }
    if (timer) clearTimeout(timer);

    const payload = await parseBody(response);
    if (!response.ok) {
      const message = payload && payload.message ? payload.message : friendlyStatusMessage(response.status);
      if (response.status === 401 && opts.redirectOn401 !== false) handleSessionExpired();
      throw new ApiError(message, response.status, payload);
    }
    return payload || { success: true, data: {} };
  };

  SE.ApiError = ApiError;
  SE.api = request;
  SE.apiData = async (path, options) => {
    const payload = await request(path, options);
    return payload.data === undefined ? {} : payload.data;
  };
  SE.friendlyStatusMessage = friendlyStatusMessage;
})(window);
