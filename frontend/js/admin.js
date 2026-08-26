document.addEventListener('DOMContentLoaded', async () => {
  const status = document.querySelector('[data-admin-status]');
  const logout = document.querySelector('[data-logout]');
  const examForm = document.querySelector('[data-exam-form]');
  const questionSection = document.querySelector('[data-question-section]');
  const questionForm = document.querySelector('[data-question-form]');
  let createdExam;

  const getJson = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'include', ...options });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
    return result.data;
  };

  try {
    const userData = await getJson('/api/users/me');
    if (userData.user.role !== 'admin') {
      window.location.href = '/';
      return;
    }
    const [statsData, examsData, usersData] = await Promise.all([
      getJson('/api/admin/stats'),
      getJson('/api/exams'),
      getJson('/api/admin/users?role=student'),
    ]);

    Object.entries(statsData.stats).forEach(([key, value]) => {
      const target = document.querySelector(`[data-stat="${key}"]`);
      if (target) target.textContent = key === 'averageScore' ? `${Math.round(value)}%` : value;
    });
    document.querySelector('[data-exam-count]').textContent = `${examsData.exams.length} exams`;
    document.querySelector('[data-user-count]').textContent = `${usersData.users.length} students`;
    document.querySelector('[data-exam-list]').innerHTML = examsData.exams.length
      ? examsData.exams.map((exam) => `<div class="admin-row"><div><strong>${exam.title}</strong><span>${exam.subject} · ${exam.duration} min · ${exam.questionCount} questions</span></div><div class="row-actions"><b class="status-${exam.status}">${exam.status}</b><button class="text-button danger-button" type="button" data-delete-exam="${exam._id}">Delete</button></div></div>`).join('')
      : '<p class="empty-state">No exams created yet.</p>';
    document.querySelector('[data-user-list]').innerHTML = usersData.users.length
      ? usersData.users.map((user) => `<div class="admin-row"><div><strong>${user.name}</strong><span>${user.email}</span></div><div class="row-actions"><b class="${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</b><button class="text-button" type="button" data-toggle-user="${user._id}" data-active="${user.isActive}">${user.isActive ? 'Disable' : 'Enable'}</button></div></div>`).join('')
      : '<p class="empty-state">No students registered yet.</p>';
  } catch (error) {
    status.textContent = error.message === 'Authentication required' ? 'Please log in as an administrator.' : 'Unable to load admin data right now.';
    window.setTimeout(() => { window.location.href = '/login.html'; }, 1200);
  }

  examForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = examForm.querySelector('button');
    button.disabled = true;
    try {
      const data = await getJson('/api/exams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(new FormData(examForm).entries()), instructions: [] }) });
      createdExam = data.exam;
      questionSection.hidden = false;
      document.querySelector('[data-question-exam-title]').textContent = `Add questions to ${createdExam.title}`;
      status.textContent = 'Exam created. Add at least one question before publishing it to students.';
      questionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      status.textContent = error.message;
    }
    button.disabled = false;
  });

  questionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!createdExam) return;
    const button = questionForm.querySelector('button[type="submit"]');
    const formData = Object.fromEntries(new FormData(questionForm).entries());
    button.disabled = true;
    try {
      await getJson(`/api/exams/${createdExam._id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: formData.questionText,
          options: [formData.option1, formData.option2, formData.option3, formData.option4],
          correctAnswer: formData.correctAnswer,
          marks: formData.marks,
          negativeMarks: formData.negativeMarks,
          explanation: formData.explanation,
        }),
      });
      status.textContent = 'Question added. You can add another question.';
      questionForm.reset();
      questionForm.elements.marks.value = '1';
      questionForm.elements.negativeMarks.value = '0';
    } catch (error) {
      status.textContent = error.message;
    }
    button.disabled = false;
  });

  document.querySelector('[data-finish-questions]').addEventListener('click', () => {
    window.location.reload();
  });

  document.querySelector('[data-exam-list]').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-exam]');
    if (!button || !window.confirm('Delete this exam and its questions?')) return;
    try {
      await getJson(`/api/exams/${button.dataset.deleteExam}`, { method: 'DELETE' });
      window.location.reload();
    } catch (error) { status.textContent = error.message; }
  });

  document.querySelector('[data-user-list]').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-toggle-user]');
    if (!button) return;
    try {
      await getJson(`/api/admin/users/${button.dataset.toggleUser}/toggle-status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: button.dataset.active !== 'true' }) });
      window.location.reload();
    } catch (error) { status.textContent = error.message; }
  });

  logout.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
  });
});