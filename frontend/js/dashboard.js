document.addEventListener('DOMContentLoaded', async () => {
  const authenticatedContent = document.querySelectorAll('[data-authenticated-content]');
  const guestContent = document.querySelector('[data-guest-content]');
  const guestLinks = document.querySelectorAll('[data-guest-link]');
  const loginLink = document.querySelector('[data-dashboard-login]');
  const logoutButton = document.querySelector('[data-logout]');
  const status = document.querySelector('[data-dashboard-status]');

  const showGuestView = () => {
    guestContent.hidden = false;
    loginLink.hidden = false;
    logoutButton.classList.add('hidden');
  };

  const showAuthenticatedView = () => {
    authenticatedContent.forEach((section) => { section.hidden = false; });
    guestContent.hidden = true;
    loginLink.hidden = true;
    guestLinks.forEach((link) => { link.classList.add('hidden'); });
    logoutButton.classList.remove('hidden');
  };

  const formatDate = (value) => value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
    : 'Date unavailable';

  try {
    const userResponse = await fetch('/api/users/me', { credentials: 'include' });
    if (userResponse.ok) {
      const userResult = await userResponse.json();
      if (userResult.data?.user?.role === 'admin') {
        window.location.href = '/admin.html';
        return;
      }
    }
    const response = await fetch('/api/users/me/dashboard', { credentials: 'include' });
    if (response.status === 401 || response.status === 403) {
      showGuestView();
      return;
    }
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message);

    const { dashboard } = result.data;
    showAuthenticatedView();
    document.querySelector('[data-welcome]').textContent = dashboard.welcome;
    document.querySelector('[data-stat="totalExamsAttempted"]').textContent = dashboard.totalExamsAttempted;
    document.querySelector('[data-stat="averageScore"]').textContent = Math.round(dashboard.averageScore);
    document.querySelector('[data-stat="bestScore"]').textContent = dashboard.bestScore;
    document.querySelector('[data-exam-count]').textContent = `${dashboard.availableExams.length} exams`;

    document.querySelector('[data-exam-list]').innerHTML = dashboard.availableExams.length
      ? dashboard.availableExams.map((exam) => `<article class="exam-card"><span class="exam-subject">${exam.subject}</span><h3>${exam.title}</h3><p>${exam.description}</p><footer><span>${exam.duration} min</span><span>${exam.totalMarks} marks</span></footer><a class="btn primary exam-action" href="/exam.html?id=${exam._id}">Start exam</a></article>`).join('')
      : '<p class="empty-state">No published exams are available right now.</p>';

    document.querySelector('[data-results-list]').innerHTML = dashboard.recentResults.length
      ? dashboard.recentResults.map((attempt) => `<article class="result-row"><div><strong>${attempt.examId?.title || 'Exam'}</strong><span>${formatDate(attempt.submittedAt)}</span></div><b>${attempt.score}/${attempt.totalMarks}</b></article>`).join('')
      : '<p class="empty-state">Your completed exams will appear here.</p>';
  } catch (_error) {
    status.textContent = 'Unable to load your dashboard right now.';
    showGuestView();
  }

  logoutButton.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.reload();
  });
});