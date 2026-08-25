document.addEventListener('DOMContentLoaded', async () => {
  const id = new URLSearchParams(window.location.search).get('id');
  const title = document.querySelector('[data-title]');
  const metrics = document.querySelector('[data-metrics]');
  const reviewSection = document.querySelector('[data-review-section]');
  const review = document.querySelector('[data-review]');

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
  try {
    const response = await fetch(`/api/users/me/attempts/${id}`, { credentials: 'include' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message);
    const attempt = result.data.attempt;
    title.textContent = attempt.examId?.title || 'Exam result';
    metrics.innerHTML = `<strong class="result-highlight">${attempt.passed ? 'Passed' : 'Not passed'}</strong><span>Score: ${attempt.score}/${attempt.totalMarks}</span><span>Percentage: ${Math.round(attempt.percentage)}%</span><span>Correct: ${attempt.correctAnswers}</span><span>Incorrect: ${attempt.incorrectAnswers}</span><span>Unanswered: ${attempt.unanswered}</span>`;
    if (attempt.review?.length) {
      review.innerHTML = attempt.review.map((question, index) => {
        const selected = question.selectedAnswer === null ? 'Not answered' : question.options[question.selectedAnswer] || 'Invalid answer';
        const correct = question.options[question.correctAnswer] || 'Unavailable';
        const outcome = question.selectedAnswer === question.correctAnswer ? 'Correct' : 'Review';
        return `<article class="review-item"><div class="review-heading"><strong>${index + 1}. ${escapeHtml(question.questionText)}</strong><span class="review-${outcome === 'Correct' ? 'correct' : 'incorrect'}">${outcome}</span></div><p>Your answer: ${escapeHtml(selected)}</p><p>Correct answer: ${escapeHtml(correct)}</p>${question.explanation ? `<p class="review-explanation">${escapeHtml(question.explanation)}</p>` : ''}</article>`;
      }).join('');
      reviewSection.hidden = false;
    }
  } catch (error) { title.textContent = error.message || 'Result not found'; }
});