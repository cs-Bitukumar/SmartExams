document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const roleOptions = document.querySelectorAll('[data-login-role]');
  const loginSubmit = document.querySelector('[data-login-submit]');
  let selectedRole = 'student';

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
