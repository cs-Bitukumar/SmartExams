document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const roleOptions = document.querySelectorAll('[data-login-role]');
  const loginSubmit = document.querySelector('[data-login-submit]');
  let selectedRole = 'student';

  // Eye-icon show/hide password on login + signup (works for all password fields).
  const EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_CLOSED = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  document.querySelectorAll('[data-password-toggle]').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const wrapper = toggle.closest('.password-wrap');
      const input = wrapper ? wrapper.querySelector('[data-password-input]') : null;
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.classList.toggle('is-visible', show);
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      toggle.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
      input.focus({ preventScroll: true });
    });
  });

  const submitAuthForm = async (form, endpoint, successMessage, expectedRole) => {
    const submitButton = form.querySelector('button[type="submit"]');
    const status = form.querySelector('[data-form-status]');
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = 'Please wait...';
    status.textContent = '';
    status.className = 'form-status';

    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to complete the request.');
      }

      if (expectedRole && result.data?.user?.role !== expectedRole) {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        throw new Error(`This account is not registered as ${expectedRole === 'admin' ? 'an admin' : 'a user'}.`);
      }

      status.textContent = successMessage;
      status.classList.add('success');
      window.setTimeout(() => {
        window.location.href = result.data?.user?.role === 'admin' ? '/admin.html' : '/';
      }, 500);
    } catch (error) {
      status.textContent = error.message || 'Something went wrong. Please try again.';
      status.classList.add('error');
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  };

  if (registerForm) {
    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitAuthForm(registerForm, 'register', 'Account created. Redirecting...');
    });
  }

  if (loginForm) {
    roleOptions.forEach((option) => {
      option.addEventListener('click', () => {
        selectedRole = option.dataset.loginRole;
        roleOptions.forEach((roleOption) => {
          const isActive = roleOption === option;
          roleOption.classList.toggle('active', isActive);
          roleOption.setAttribute('aria-pressed', String(isActive));
        });
        loginSubmit.textContent = `Login as ${selectedRole === 'admin' ? 'Admin' : 'User'}`;
      });
    });

    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitAuthForm(loginForm, 'login', 'Login successful. Redirecting...', selectedRole);
    });
  }
});
