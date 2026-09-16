document.addEventListener('DOMContentLoaded', async () => {
  const SE = window.SE || {};
  const escapeHtml = SE.escapeHtml || ((value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]));
  const list = document.querySelector('[data-results-list]');
  const status = document.querySelector('[data-results-status]');
  const logout = document.querySelector('[data-logout]');

  const getJson = async (url) => {
    if (SE.apiData) return SE.apiData(url);
    const response = await fetch(url, { credentials: 'include' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message);
    return result.data;
  };

  const renderResults = (attempts) => {
    // Safe DOM rendering: user-controlled exam titles/subjects use textContent
    // so a malicious title cannot execute stored XSS in the results list.
    list.innerHTML = '';
    if (!attempts.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No submitted results yet.';
      list.appendChild(empty);
      return;
    }
    attempts.forEach((attempt) => {
      const card = document.createElement('article');
      card.className = 'result-card';
      const isPending = attempt.resultStatus === 'pending-review';
      const left = document.createElement('div');
      const subject = document.createElement('span');
      subject.textContent = attempt.examId?.subject || 'Assessment';
      const heading = document.createElement('h2');
      heading.textContent = attempt.examId?.title || 'Exam';
      const date = document.createElement('p');
      date.textContent = attempt.submittedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(attempt.submittedAt)) : 'Not submitted';
      left.appendChild(subject);
      left.appendChild(heading);
      left.appendChild(date);
      const right = document.createElement('div');
      right.className = 'result-score';
      const score = document.createElement('strong');
      score.textContent = isPending ? '—' : `${attempt.score}/${attempt.totalMarks}`;
      const meta = document.createElement('span');
      meta.textContent = isPending ? 'Result under review' : `${Math.round(attempt.percentage)}% · ${attempt.passed ? 'Passed' : 'Not passed'}`;
      const link = document.createElement('a');
      link.href = `/result.html?id=${encodeURIComponent(attempt._id)}`;
      link.textContent = isPending ? 'Check status' : 'View details';
      if (isPending) link.classList.add('result-pending-link');
      right.appendChild(score);
      right.appendChild(meta);
      right.appendChild(link);
      card.appendChild(left);
      card.appendChild(right);
      list.appendChild(card);
    });
  };

  try {
    const data = await getJson('/api/users/me/attempts');
    const attempts = (data.attempts || []).filter((attempt) => attempt.status !== 'in-progress');
    renderResults(attempts);
  } catch (_error) {
    status.textContent = 'Please log in to view your results.';
    window.setTimeout(() => { window.location.href = '/login.html'; }, 1000);
  }

  if (logout) {
    logout.addEventListener('click', async () => {
      if (SE.api) {
        try {
          await SE.api('/api/auth/logout', { method: 'POST', redirectOn401: false });
        } catch (_error) { /* Local logout is still correct. */ }
      } else {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      }
      window.location.href = '/login.html';
    });
  }
});