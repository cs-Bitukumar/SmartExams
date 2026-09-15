document.addEventListener('DOMContentLoaded', async () => {
  const SE = window.SE || {};
  const examId = new URLSearchParams(window.location.search).get('id');
  const title = document.querySelector('[data-exam-title]');
  const meta = document.querySelector('[data-exam-meta]');
  const list = document.querySelector('[data-question-list]');
  const status = document.querySelector('[data-exam-status]');
  const timer = document.querySelector('[data-timer]');
  const submitButton = document.querySelector('[data-submit]');
  const navigatorBox = document.querySelector('[data-navigator]');
  const saveState = document.querySelector('[data-save-state]');

  let attempt = null;
  let exam = null;
  let questions = [];
  let expiresAtMs = 0;
  let remainingSeconds = 0;
  let timerId = null;
  let resyncId = null;
  let saveTimer = null;
  let saving = false;
  let submitted = false;
  const marked = new Set();
  const dirty = new Map();

  const setStatus = (message) => { status.textContent = message || ''; };
  const setSaveState = (message) => { if (saveState) saveState.textContent = message || ''; };
  const clock = (seconds) => (SE.formatClock ? SE.formatClock(seconds) : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);

  const getJson = async (url, options) => {
    if (SE.apiData) {
      return SE.apiData(url, options ? { method: options.method, body: options.body ? JSON.parse(options.body) : undefined } : undefined);
    }
    const response = await fetch(url, { credentials: 'include', ...options });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
    return result.data;
  };

  const renderTimer = () => {
    timer.textContent = clock(remainingSeconds);
    timer.classList.toggle('is-urgent', remainingSeconds <= 300);
    timer.classList.toggle('is-critical', remainingSeconds <= 60);
  };

  const recomputeRemaining = () => {
    // Server owns expiry; the local clock only measures elapsed time between
    // resyncs, so rolling the OS clock back cannot grant extra time.
    remainingSeconds = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
    return remainingSeconds;
  };

  const collectAnswers = () => {
    const answers = {};
    questions.forEach((question) => {
      const checked = list.querySelector(`input[name="${CSS.escape(question.questionId)}"]:checked`);
      if (checked) answers[question.questionId] = Number(checked.value);
    });
    dirty.forEach((value, key) => {
      if (value === null || value === undefined) delete answers[key];
      else answers[key] = value;
    });
    return answers;
  };

  const updateNavigator = () => {
    if (!navigatorBox) return;
    navigatorBox.innerHTML = '';
    const answers = collectAnswers();
    questions.forEach((question, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-pill';
      button.textContent = String(index + 1);
      if (answers[question.questionId] !== undefined) button.classList.add('is-answered');
      if (marked.has(question.questionId)) button.classList.add('is-marked');
      button.addEventListener('click', () => {
        const target = document.getElementById(`question-${question.questionId}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      navigatorBox.appendChild(button);
    });
  };

  const persistNow = async () => {
    if (!attempt || submitted || dirty.size === 0 || saving) return;
    saving = true;
    setSaveState('Saving...');
    const payload = {};
    dirty.forEach((value, key) => { payload[key] = value; });
    try {
      const data = await getJson(`/api/exams/attempts/${attempt._id}/answers`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: payload }) });
      dirty.clear();
      if (data && typeof data.timeRemainingSeconds === 'number') {
        expiresAtMs = Date.now() + (data.timeRemainingSeconds * 1000);
        recomputeRemaining();
        renderTimer();
      }
      setSaveState('All answers saved');
    } catch (_error) {
      setSaveState('Save failed - will retry');
    } finally {
      saving = false;
    }
  };

  const scheduleSave = () => {
    setSaveState('Unsaved changes');
    updateNavigator();
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistNow, 1200);
  };

  const reportIntegrity = async (type) => {
    if (!attempt || submitted) return;
    try {
      await getJson(`/api/exams/attempts/${attempt._id}/violations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
    } catch (_error) { /* Advisory only. */ }
  };

  const renderQuestions = () => {
    list.innerHTML = '';
    if (!questions.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No questions are available for this exam yet. If your teacher just added them, reload the page. Otherwise please contact your teacher.';
      list.appendChild(empty);
      if (submitButton) submitButton.disabled = true;
      return;
    }
    if (submitButton) submitButton.disabled = false;
    questions.forEach((question, index) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'question';
      fieldset.id = `question-${question.questionId}`;
      const legend = document.createElement('legend');
      legend.textContent = `${index + 1}. ${question.questionText}`;
      fieldset.appendChild(legend);
      const grid = document.createElement('div');
      grid.className = 'options-grid';
      question.options.forEach((option, optionIndex) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = question.questionId;
        input.value = String(optionIndex);
        input.addEventListener('change', () => {
          dirty.set(question.questionId, optionIndex);
          scheduleSave();
        });
        const span = document.createElement('span');
        span.textContent = option;
        label.appendChild(input);
        label.appendChild(span);
        grid.appendChild(label);
      });
      fieldset.appendChild(grid);
      const actions = document.createElement('div');
      actions.className = 'question-actions';
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'text-button';
      clearButton.textContent = 'Clear answer';
      clearButton.addEventListener('click', () => {
        list.querySelectorAll(`input[name="${CSS.escape(question.questionId)}"]`).forEach((input) => { input.checked = false; });
        dirty.set(question.questionId, null);
        scheduleSave();
      });
      actions.appendChild(clearButton);
      fieldset.appendChild(actions);
      list.appendChild(fieldset);
    });
  };

  const finish = async (autoSubmitted = false) => {
    if (submitted) return;
    submitted = true;
    if (timerId) window.clearInterval(timerId);
    if (resyncId) window.clearInterval(resyncId);
    if (saveTimer) window.clearTimeout(saveTimer);
    await persistNow();
    submitButton.disabled = true;
    try {
      const confirmed = autoSubmitted
        || (SE.confirmDialog
          ? await SE.confirmDialog({ title: 'Submit exam?', message: 'You cannot change answers after submitting.', confirmText: 'Submit exam' })
          : window.confirm('Submit the exam?'));
      if (!confirmed && !autoSubmitted) {
        submitted = false;
        submitButton.disabled = false;
        return;
      }
      const data = await getJson(`/api/exams/attempts/${attempt._id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: collectAnswers() }) });
      const panel = document.querySelector('[data-result]');
      if (panel) panel.hidden = false;
      const resultTitle = document.querySelector('[data-result-title]');
      const summary = document.querySelector('[data-result-summary]');
      if (data.attempt.resultStatus === 'pending-review') {
        // Admin-declared exam: the score stays hidden until the admin publishes it.
        if (resultTitle) resultTitle.textContent = 'Exam submitted';
        if (summary) summary.textContent = `Your answer sheet has been submitted for review. Your result will be declared by the admin soon.${autoSubmitted || data.autoSubmitted ? ' Time expired and the exam was submitted automatically.' : ''}`;
      } else {
        if (resultTitle) resultTitle.textContent = data.attempt.passed ? 'You passed' : 'Keep practicing';
        if (summary) summary.textContent = `Score: ${data.attempt.score}/${data.attempt.totalMarks} (${Math.round(data.attempt.percentage)}%).${autoSubmitted || data.autoSubmitted ? ' Time expired and the exam was submitted automatically.' : ''}`;
      }
      list.hidden = true;
      submitButton.hidden = true;
      if (navigatorBox) navigatorBox.hidden = true;
      setStatus('');
      if (SE.toast) SE.toast(autoSubmitted ? 'Time expired. Your exam was submitted.' : 'Exam submitted', autoSubmitted ? 'warning' : 'success');
    } catch (error) {
      submitted = false;
      setStatus(error.message);
      submitButton.disabled = false;
      if (SE.toast) SE.toast(error.message, 'error');
    }
  };

  const resyncTime = async () => {
    if (!attempt || submitted) return;
    try {
      const data = await getJson(`/api/exams/attempts/${attempt._id}`);
      if (data && typeof data.timeRemainingSeconds === 'number') {
        expiresAtMs = Date.now() + (data.timeRemainingSeconds * 1000);
        recomputeRemaining();
        renderTimer();
        if (remainingSeconds <= 0) await finish(true);
      }
    } catch (_error) { /* Keep local countdown; next resync retries. */ }
  };

  const applyAnswers = (answers) => {
    if (!answers) return;
    Object.entries(answers).forEach(([questionId, value]) => {
      const input = list.querySelector(`input[name="${CSS.escape(questionId)}"][value="${CSS.escape(String(value))}"]`);
      if (input) input.checked = true;
    });
  };

  const applyMarked = (markedMap) => {
    if (!markedMap) return;
    Object.entries(markedMap).forEach(([questionId, value]) => {
      if (value === true || value === 'true') marked.add(questionId);
    });
  };

  try {
    if (!examId) throw new Error('Exam not found');
    const startData = await getJson(`/api/exams/${examId}/start`, { method: 'POST' });
    attempt = startData.attempt;
    exam = startData.exam;
    questions = startData.questions || [];
    expiresAtMs = Date.now() + ((Number(startData.timeRemainingSeconds) || 0) * 1000);
    title.textContent = exam.title;
    meta.textContent = `${exam.subject} · ${exam.duration} minutes · ${questions.length} questions${startData.resumed ? ' · Resumed' : ''}`;
    renderQuestions();
    applyAnswers(startData.attempt && startData.attempt.answers);
    applyMarked(startData.attempt && startData.attempt.markedForReview);
    updateNavigator();
    setSaveState('All answers saved');
    recomputeRemaining();
    renderTimer();
    timerId = window.setInterval(() => {
      recomputeRemaining();
      renderTimer();
      if (remainingSeconds <= 0) finish(true);
    }, 1000);
    resyncId = window.setInterval(resyncTime, 30000);
    submitButton.addEventListener('click', () => finish(false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        reportIntegrity('visibility-hidden');
        persistNow();
      }
    });
    window.addEventListener('blur', () => reportIntegrity('window-blur'));
  } catch (error) {
    setStatus(error.message);
    submitButton.hidden = true;
    if (SE.toast) SE.toast(error.message, 'error');
  }
});