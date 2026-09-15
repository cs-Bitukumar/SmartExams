document.addEventListener('DOMContentLoaded', async () => {
  const SE = window.SE || {};
  const status = document.querySelector('[data-admin-status]');
  const logout = document.querySelector('[data-logout]');
  const examForm = document.querySelector('[data-exam-form]');
  const questionSection = document.querySelector('[data-question-section]');
  const questionForm = document.querySelector('[data-question-form]');
  let createdExam;
  let examsCache = [];

  const getJson = async (url, options = {}) => {
    if (SE.apiData) {
      return SE.apiData(url, options.method
        ? { method: options.method, body: options.body ? JSON.parse(options.body) : undefined }
        : undefined);
    }
    const response = await fetch(url, { credentials: 'include', ...options });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
    return result.data;
  };

  const renderExams = (exams) => {
    // Safe DOM rendering: exam titles/subjects are admin input shown to all
    // students, so they use textContent to block stored XSS.
    const container = document.querySelector('[data-exam-list]');
    container.innerHTML = '';
    if (!exams.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No exams created yet.';
      container.appendChild(empty);
      return;
    }
    exams.forEach((exam) => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      const left = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = exam.title;
      const meta = document.createElement('span');
      meta.textContent = `${exam.subject} · ${exam.duration} min · ${exam.questionCount} questions`;
      left.appendChild(heading);
      left.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const badge = document.createElement('b');
      badge.className = `status-${exam.status}`;
      badge.textContent = exam.status;
      actions.appendChild(badge);
      if (exam.status === 'draft') {
        // Drafts can be edited and published; publishing is blocked server-side
        // until the exam has at least one question.
        const editButton = document.createElement('button');
        editButton.className = 'text-button';
        editButton.type = 'button';
        editButton.dataset.editExam = exam._id;
        editButton.textContent = 'Edit';
        const publishButton = document.createElement('button');
        publishButton.className = 'text-button';
        publishButton.type = 'button';
        publishButton.dataset.publishExam = exam._id;
        publishButton.textContent = 'Publish';
        actions.appendChild(editButton);
        actions.appendChild(publishButton);
      } else if (exam.status === 'published') {
        const unpublishButton = document.createElement('button');
        unpublishButton.className = 'text-button';
        unpublishButton.type = 'button';
        unpublishButton.dataset.unpublishExam = exam._id;
        unpublishButton.textContent = 'Unpublish';
        actions.appendChild(unpublishButton);
      }
      const remove = document.createElement('button');
      remove.className = 'text-button danger-button';
      remove.type = 'button';
      remove.dataset.deleteExam = exam._id;
      remove.textContent = 'Delete';
      actions.appendChild(remove);
      row.appendChild(left);
      row.appendChild(actions);
      container.appendChild(row);
    });
  };

  const renderUsers = (users) => {
    // Safe DOM rendering: student names/emails are untrusted display data.
    const container = document.querySelector('[data-user-list]');
    container.innerHTML = '';
    if (!users.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No students registered yet.';
      container.appendChild(empty);
      return;
    }
    users.forEach((user) => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      const left = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = user.name;
      const meta = document.createElement('span');
      meta.textContent = user.email;
      left.appendChild(heading);
      left.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const badge = document.createElement('b');
      badge.className = user.isActive ? 'active' : 'inactive';
      badge.textContent = user.isActive ? 'Active' : 'Inactive';
      const toggle = document.createElement('button');
      toggle.className = 'text-button';
      toggle.type = 'button';
      toggle.dataset.toggleUser = user._id;
      toggle.dataset.active = String(user.isActive);
      toggle.textContent = user.isActive ? 'Disable' : 'Enable';
      actions.appendChild(badge);
      actions.appendChild(toggle);
      row.appendChild(left);
      row.appendChild(actions);
      container.appendChild(row);
    });
  };

  // ----- Draft exam management: edit, publish, unpublish -----
  const refreshExams = async () => {
    const data = await getJson('/api/exams');
    examsCache = data.exams;
    document.querySelector('[data-exam-count]').textContent = `${examsCache.length} exams`;
    renderExams(examsCache);
    try {
      const stats = await getJson('/api/admin/stats');
      const publishedTarget = document.querySelector('[data-stat="publishedExams"]');
      if (publishedTarget) publishedTarget.textContent = stats.stats.publishedExams;
    } catch (_error) { /* Stat refresh is best-effort only. */ }
  };

  const openEditExam = async (exam) => {
    if (!SE.openModal) {
      status.textContent = 'Edit dialog is unavailable in this browser session.';
      return;
    }
    const contentHtml = `
      <label class="review-field">Title<input name="title" value="${SE.escapeHtml(exam.title)}" required /></label>
      <label class="review-field">Subject<input name="subject" value="${SE.escapeHtml(exam.subject)}" required /></label>
      <label class="review-field">Description<textarea name="description" rows="2" required>${SE.escapeHtml(exam.description)}</textarea></label>
      <label class="review-field">Duration (minutes)<input type="number" name="duration" min="1" value="${SE.escapeHtml(exam.duration)}" required /></label>
      <label class="review-field">Total marks<input type="number" name="totalMarks" min="1" value="${SE.escapeHtml(exam.totalMarks)}" required /></label>
      <label class="review-field">Passing marks<input type="number" name="passingMarks" min="0" value="${SE.escapeHtml(exam.passingMarks)}" required /></label>`;
    await SE.openModal({
      title: `Edit exam: ${exam.title}`,
      contentHtml,
      closeText: 'Cancel',
      actions: [{
        label: 'Save changes',
        variant: 'primary',
        onClick: async (dialog) => {
          const getValue = (name) => dialog.querySelector(`[name="${name}"]`)?.value ?? '';
          try {
            await getJson(`/api/exams/${exam._id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: getValue('title'),
                subject: getValue('subject'),
                description: getValue('description'),
                duration: getValue('duration'),
                totalMarks: getValue('totalMarks'),
                passingMarks: getValue('passingMarks'),
              }),
            });
            if (SE.toast) SE.toast('Exam updated.', 'success');
            status.textContent = 'Exam updated.';
            await refreshExams();
            return true;
          } catch (error) {
            if (SE.toast) SE.toast(error.message, 'error');
            return false;
          }
        },
      }],
    });
  };

  const publishExamFromList = async (exam) => {
    const confirmed = SE.confirmDialog
      ? await SE.confirmDialog({ title: 'Publish this exam?', message: 'Students will see it on their dashboard immediately and can start attempting it.', confirmText: 'Publish' })
      : window.confirm('Publish this exam for students?');
    if (!confirmed) return;
    try {
      await getJson(`/api/exams/${exam._id}/publish`, { method: 'POST' });
      if (SE.toast) SE.toast('Exam published. Students can now attempt it.', 'success');
      status.textContent = 'Exam published.';
      await refreshExams();
    } catch (error) {
      status.textContent = error.message;
      if (SE.toast) SE.toast(error.message, 'error');
    }
  };

  const unpublishExamFromList = async (exam) => {
    const confirmed = SE.confirmDialog
      ? await SE.confirmDialog({ title: 'Unpublish this exam?', message: 'It moves back to draft and disappears from the student dashboard. Existing attempts and results are kept.', confirmText: 'Unpublish', danger: true })
      : window.confirm('Move this exam back to draft?');
    if (!confirmed) return;
    try {
      await getJson(`/api/exams/${exam._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'draft' }) });
      if (SE.toast) SE.toast('Exam moved back to draft.', 'info');
      status.textContent = 'Exam moved back to draft.';
      await refreshExams();
    } catch (error) {
      status.textContent = error.message;
      if (SE.toast) SE.toast(error.message, 'error');
    }
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
    examsCache = examsData.exams;
    renderExams(examsCache);
    renderUsers(usersData.users);
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
    const editButton = event.target.closest('[data-edit-exam]');
    if (editButton) {
      const exam = examsCache.find((item) => item._id === editButton.dataset.editExam);
      if (exam) await openEditExam(exam);
      return;
    }
    const publishButton = event.target.closest('[data-publish-exam]');
    if (publishButton) {
      const exam = examsCache.find((item) => item._id === publishButton.dataset.publishExam);
      if (exam) await publishExamFromList(exam);
      return;
    }
    const unpublishButton = event.target.closest('[data-unpublish-exam]');
    if (unpublishButton) {
      const exam = examsCache.find((item) => item._id === unpublishButton.dataset.unpublishExam);
      if (exam) await unpublishExamFromList(exam);
      return;
    }
    const button = event.target.closest('[data-delete-exam]');
    if (!button) return;
    const confirmed = SE.confirmDialog
      ? await SE.confirmDialog({ title: 'Delete exam?', message: 'This removes the exam and its questions. Results are preserved by blocking delete when attempts exist.', confirmText: 'Delete', danger: true })
      : window.confirm('Delete this exam and its questions?');
    if (!confirmed) return;
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


  // ----- Results awaiting review (manual result declaration workflow) -----
  const pendingList = document.querySelector('[data-pending-list]');
  const pendingCount = document.querySelector('[data-pending-count]');
  const escapeHtml = SE.escapeHtml || ((value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]));
  const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

  const renderPending = (attempts) => {
    if (!pendingList) return;
    if (pendingCount) pendingCount.textContent = `${attempts.length} awaiting review`;
    pendingList.innerHTML = '';
    if (!attempts.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No results are waiting for review.';
      pendingList.appendChild(empty);
      return;
    }
    attempts.forEach((attempt) => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      const left = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = attempt.examId?.title || 'Exam';
      const meta = document.createElement('span');
      meta.textContent = `${attempt.userId?.name || 'Student'} · ${attempt.userId?.email || ''} · submitted ${formatDateTime(attempt.submittedAt)}`;
      left.appendChild(heading);
      left.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const badge = document.createElement('b');
      badge.className = attempt.resultStatus === 'pending-review' ? 'status-draft' : 'status-published';
      badge.textContent = attempt.resultStatus === 'pending-review' ? 'Under review' : 'Published';
      const reviewButton = document.createElement('button');
      reviewButton.className = 'text-button';
      reviewButton.type = 'button';
      reviewButton.dataset.reviewAttempt = attempt._id;
      reviewButton.textContent = attempt.resultStatus === 'pending-review' ? 'Review & declare' : 'Re-review';
      actions.appendChild(badge);
      actions.appendChild(reviewButton);
      row.appendChild(left);
      row.appendChild(actions);
      pendingList.appendChild(row);
    });
  };

  const loadPending = async () => {
    if (!pendingList) return;
    try {
      const data = await getJson('/api/admin/results?resultStatus=pending-review&limit=25&page=1');
      renderPending(data.attempts || []);
    } catch (error) {
      pendingList.innerHTML = '';
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Could not load results awaiting review.';
      pendingList.appendChild(empty);
      status.textContent = error.message;
    }
  };

  const answerText = (question, index) => {
    if (index === null || index === undefined || question.options?.[index] === undefined) return 'Not answered';
    return question.options[index];
  };

  const openReview = async (attemptId) => {
    let attempt;
    try {
      const data = await getJson(`/api/admin/attempts/${attemptId}`);
      attempt = data.attempt;
    } catch (error) {
      status.textContent = error.message;
      if (SE.toast) SE.toast(error.message, 'error');
      return;
    }

    const answers = attempt.answers || {};
    const questions = Array.isArray(attempt.questionSnapshot) ? attempt.questionSnapshot : [];
    const questionRows = questions.map((question, index) => {
      const key = String(question.questionId?._id ?? question.questionId);
      const raw = answers[key];
      const selected = raw === undefined || raw === null || raw === '' ? null : Number(raw);
      const correct = Number(question.correctAnswer);
      const outcome = selected === null ? 'skipped' : (selected === correct ? 'correct' : 'incorrect');
      const outcomeClass = outcome === 'correct' ? 'status-published' : outcome === 'incorrect' ? 'status-closed' : 'status-draft';
      return `<li class="review-row">
        <div class="review-row-main">
          <strong>${index + 1}. ${escapeHtml(question.questionText)}</strong>
          <span>Your answer: ${escapeHtml(answerText(question, selected))} · Correct answer: ${escapeHtml(answerText(question, correct))}</span>
        </div>
        <b class="${outcomeClass}">${outcome}</b>
      </li>`;
    }).join('');

    const isPending = attempt.resultStatus === 'pending-review';
    const contentHtml = `
      <p><strong>${escapeHtml(attempt.userId?.name || 'Student')}</strong> (${escapeHtml(attempt.userId?.email || '')})</p>
      <p>Exam: ${escapeHtml(attempt.examId?.title || 'Exam')} · Submitted ${escapeHtml(formatDateTime(attempt.submittedAt))}</p>
      <p>Auto-checked score: <strong>${escapeHtml(attempt.score)} / ${escapeHtml(attempt.totalMarks)}</strong> (${escapeHtml(Math.round(attempt.percentage || 0))}%) · ${attempt.passed ? 'Passed' : 'Not passed'}</p>
      <label class="review-field">Override score (optional)<input type="number" name="review-score" min="0" step="0.5" placeholder="${escapeHtml(attempt.score)}" /></label>
      <label class="review-field">Feedback for the student (optional)<textarea name="review-feedback" rows="2">${escapeHtml(attempt.adminFeedback || '')}</textarea></label>
      <ol class="review-answer-list">${questionRows || '<li>No questions recorded.</li>'}</ol>`;

    if (!SE.openModal) {
      status.textContent = 'Review dialog unavailable in this browser session.';
      return;
    }
    await SE.openModal({
      title: isPending ? 'Review attempt & declare result' : 'Attempt review',
      contentHtml,
      closeText: 'Close',
      actions: [
        {
          label: isPending ? 'Publish result' : 'Republish result',
          variant: 'primary',
          onClick: async (dialog) => {
            const scoreInput = dialog.querySelector('[name="review-score"]');
            const feedbackInput = dialog.querySelector('[name="review-feedback"]');
            const body = { action: 'publish', feedback: feedbackInput ? feedbackInput.value : '' };
            if (scoreInput && scoreInput.value !== '') body.score = Number(scoreInput.value);
            try {
              await getJson(`/api/admin/attempts/${attemptId}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              if (SE.toast) SE.toast('Result published. The student can now see it.', 'success');
              await loadPending();
              return true;
            } catch (error) {
              if (SE.toast) SE.toast(error.message, 'error');
              return false;
            }
          },
        },
        {
          label: isPending ? 'Keep under review' : 'Move back to review',
          variant: 'secondary',
          onClick: async () => {
            if (isPending) return true;
            try {
              await getJson(`/api/admin/attempts/${attemptId}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unpublish' }) });
              if (SE.toast) SE.toast('Result moved back to pending review.', 'info');
              await loadPending();
              return true;
            } catch (error) {
              if (SE.toast) SE.toast(error.message, 'error');
              return false;
            }
          },
        },
      ],
    });
  };
  const pendingSection = document.querySelector('[data-pending-section]');
  if (pendingSection) {
    await loadPending();
    pendingList.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-review-attempt]');
      if (!button) return;
      await openReview(button.dataset.reviewAttempt);
    });
  }

  logout.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
  });
});