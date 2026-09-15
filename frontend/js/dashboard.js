document.addEventListener('DOMContentLoaded', async () => {
  const SE = window.SE || {};
  const authenticatedContent = document.querySelectorAll('[data-authenticated-content]');
  const guestContent = document.querySelector('[data-guest-content]');
  const guestLinks = document.querySelectorAll('[data-guest-link]');
  const loginLink = document.querySelector('[data-dashboard-login]');
  const logoutEl = document.querySelector('[data-logout]');
  const status = document.querySelector('[data-dashboard-status]');

  const showGuestView = () => {
    guestContent.hidden = false;
    loginLink.hidden = false;
    logoutEl.classList.add('hidden');
  };

  const showAuthenticatedView = () => {
    authenticatedContent.forEach((section) => { section.hidden = false; });
    guestContent.hidden = true;
    loginLink.hidden = true;
    guestLinks.forEach((link) => { link.classList.add('hidden'); });
    logoutEl.classList.remove('hidden');
  };

  const formatDate = (value) => value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
    : 'Date unavailable';

  const getJson = async (url) => {
    if (SE.apiData) return SE.apiData(url, { redirectOn401: false });
    const response = await fetch(url, { credentials: 'include' });
    if (response.status === 401 || response.status === 403) {
      const error = new Error('Authentication required');
      error.status = response.status;
      throw error;
    }
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message);
    return result.data;
  };

  const renderExams = (exams) => {
    // Safe DOM rendering: exam titles/descriptions/subjects are untrusted input
    // and must use textContent so stored XSS cannot execute on the dashboard.
    const container = document.querySelector('[data-exam-list]');
    container.innerHTML = '';
    if (!exams.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No published exams are available right now.';
      container.appendChild(empty);
      return;
    }
    exams.forEach((exam) => {
      const card = document.createElement('article');
      card.className = 'exam-card';
      const subject = document.createElement('span');
      subject.className = 'exam-subject';
      subject.textContent = exam.subject;
      const heading = document.createElement('h3');
      heading.textContent = exam.title;
      const description = document.createElement('p');
      description.textContent = exam.description;
      const footer = document.createElement('footer');
      const duration = document.createElement('span');
      duration.textContent = `${exam.duration} min`;
      const marks = document.createElement('span');
      marks.textContent = `${exam.totalMarks} marks`;
      footer.appendChild(duration);
      footer.appendChild(marks);
      const action = document.createElement('a');
      action.className = 'btn primary exam-action';
      action.href = `/exam.html?id=${encodeURIComponent(exam._id)}`;
      action.textContent = 'Start exam';
      card.appendChild(subject);
      card.appendChild(heading);
      card.appendChild(description);
      card.appendChild(footer);
      card.appendChild(action);
      container.appendChild(card);
    });
  };

  const renderRecent = (attempts) => {
    const container = document.querySelector('[data-results-list]');
    container.innerHTML = '';
    if (!attempts.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Your completed exams will appear here.';
      container.appendChild(empty);
      return;
    }
    attempts.forEach((attempt) => {
      const row = document.createElement('article');
      row.className = 'result-row';
      const left = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = attempt.examId?.title || 'Exam';
      const date = document.createElement('span');
      date.textContent = formatDate(attempt.submittedAt);
      left.appendChild(heading);
      left.appendChild(date);
      const score = document.createElement('b');
      const isPending = attempt.resultStatus === 'pending-review';
      if (isPending) {
        score.textContent = 'Under review';
        score.title = 'Admin will check your answer sheet and declare the result soon.';
        const link = document.createElement('a');
        link.href = `/result.html?id=${encodeURIComponent(attempt._id)}`;
        link.textContent = 'Check status';
        link.className = 'result-pending-link';
        row.appendChild(left);
        row.appendChild(score);
        row.appendChild(link);
        container.appendChild(row);
        return;
      }
      score.textContent = `${attempt.score}/${attempt.totalMarks}`;
      row.appendChild(left);
      row.appendChild(score);
      container.appendChild(row);
    });
  };

  try {
    const userData = await getJson('/api/users/me');
    if (userData.user?.role === 'admin') {
      window.location.href = '/admin.html';
      return;
    }
    const { dashboard } = await getJson('/api/users/me/dashboard');
    showAuthenticatedView();
    document.querySelector('[data-welcome]').textContent = dashboard.welcome;
    document.querySelector('[data-stat="totalExamsAttempted"]').textContent = dashboard.totalExamsAttempted;
    document.querySelector('[data-stat="averageScore"]').textContent = Math.round(dashboard.averageScore);
    document.querySelector('[data-stat="bestScore"]').textContent = dashboard.bestScore;
    document.querySelector('[data-exam-count]').textContent = `${dashboard.availableExams.length} exams`;
    renderExams(dashboard.availableExams);
    const allResults = [...(dashboard.pendingResults || []), ...dashboard.recentResults]
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    renderRecent(allResults);
  } catch (error) {
    if (error && (error.status === 401 || error.status === 403)) {
      showGuestView();
      return;
    }
    status.textContent = 'Unable to load your dashboard right now.';
    showGuestView();
  }

  const logoutButton = document.querySelector('[data-logout]');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      if (SE.api) {
        try {
          await SE.api('/api/auth/logout', { method: 'POST', redirectOn401: false });
        } catch (_error) { /* Local logout is still correct. */ }
      } else {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      }
      window.location.reload();
    });
  }
});