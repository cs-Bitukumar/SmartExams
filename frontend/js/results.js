document.addEventListener('DOMContentLoaded', async () => {
  const list = document.querySelector('[data-results-list]');
  const status = document.querySelector('[data-results-status]');
  const logout = document.querySelector('[data-logout]');

  try {
    const response = await fetch('/api/users/me/attempts', { credentials: 'include' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message);
    const attempts = result.data.attempts.filter((attempt) => attempt.status !== 'in-progress');
    list.innerHTML = attempts.length ? attempts.map((attempt) => `<article class="result-card"><div><span>${attempt.examId?.subject || 'Assessment'}</span><h2>${attempt.examId?.title || 'Exam'}</h2><p>${attempt.submittedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(attempt.submittedAt)) : 'Not submitted'}</p></div><div class="result-score"><strong>${attempt.score}/${attempt.totalMarks}</strong><span>${Math.round(attempt.percentage)}% · ${attempt.passed ? 'Passed' : 'Not passed'}</span><a href="/result.html?id=${attempt._id}">View details</a></div></article>`).join('') : '<p class="empty-state">No submitted results yet.</p>';
  } catch (_error) {
    status.textContent = 'Please log in to view your results.';
    window.setTimeout(() => { window.location.href = '/login.html'; }, 1000);
  }

  logout.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
  });
});