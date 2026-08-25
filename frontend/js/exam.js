document.addEventListener('DOMContentLoaded', async () => {
  const examId = new URLSearchParams(window.location.search).get('id');
  const title = document.querySelector('[data-exam-title]');
  const meta = document.querySelector('[data-exam-meta]');
  const list = document.querySelector('[data-question-list]');
  const status = document.querySelector('[data-exam-status]');
  const timer = document.querySelector('[data-timer]');
  const submit = document.querySelector('[data-submit]');
  let attempt;
  let remainingSeconds;
  let timerId;

  const getJson = async (url, options) => {
    const response = await fetch(url, { credentials: 'include', ...options });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
    return result.data;
  };

  const renderTimer = () => {
    const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
    const seconds = (remainingSeconds % 60).toString().padStart(2, '0');
    timer.textContent = `${minutes}:${seconds}`;
  };

  const finish = async (autoSubmitted = false) => {
    clearInterval(timerId);
    submit.disabled = true;
    const answers = Object.fromEntries(new FormData(list).entries());
    try {
      const data = await getJson(`/api/exams/attempts/${attempt._id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
      document.querySelector('[data-result]').hidden = false;
      document.querySelector('[data-result-title]').textContent = data.attempt.passed ? 'You passed' : 'Keep practicing';
      document.querySelector('[data-result-summary]').textContent = `Score: ${data.attempt.score}/${data.attempt.totalMarks} (${Math.round(data.attempt.percentage)}%).${autoSubmitted ? ' Time expired and the exam was submitted automatically.' : ''}`;
      list.hidden = true;
      submit.hidden = true;
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message;
      submit.disabled = false;
    }
  };

  try {
    if (!examId) throw new Error('Exam not found');
    const startData = await getJson(`/api/exams/${examId}/start`, { method: 'POST' });
    const questionsData = await getJson(`/api/exams/${examId}/questions`);
    attempt = startData.attempt;
    title.textContent = startData.exam.title;
    meta.textContent = `${startData.exam.subject} · ${startData.exam.duration} minutes · ${questionsData.questions.length} questions`;
    list.innerHTML = questionsData.questions.map((question, index) => `<fieldset class="question"><legend>${index + 1}. ${question.questionText}</legend>${question.options.map((option, optionIndex) => `<label><input type="radio" name="${question._id}" value="${optionIndex}"><span>${option}</span></label>`).join('')}</fieldset>`).join('');
    remainingSeconds = Math.max(0, Math.floor((new Date(attempt.startedAt).getTime() + startData.exam.duration * 60000 - Date.now()) / 1000));
    renderTimer();
    timerId = window.setInterval(() => { remainingSeconds -= 1; renderTimer(); if (remainingSeconds <= 0) finish(true); }, 1000);
    submit.addEventListener('click', () => finish(false));
  } catch (error) {
    status.textContent = error.message;
    submit.hidden = true;
  }
});