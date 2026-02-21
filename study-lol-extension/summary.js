const SUMMARY_RESULTS_KEY = 'summaryResults';

function getResultId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || '';
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

function renderResult(result) {
  const meta = document.getElementById('meta');
  const sourceUrl = document.getElementById('sourceUrl');
  const summaryText = document.getElementById('summaryText');

  meta.textContent = `${result.summaryLanguage} | ${result.model} | ${formatDate(result.createdAt)}`;
  sourceUrl.href = result.videoUrl;
  sourceUrl.textContent = result.videoUrl;
  summaryText.textContent = result.summaryText;
}

function renderError(message) {
  document.getElementById('meta').textContent = 'Failed to load summary';
  document.getElementById('summaryText').textContent = message;
}

(async () => {
  const resultId = getResultId();
  if (!resultId) {
    renderError('Missing result id.');
    return;
  }

  const result = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SUMMARY_RESULT', resultId }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve(null);
        return;
      }
      resolve(response.result);
    });
  });

  if (!result) {
    renderError('Summary data not found.');
    return;
  }

  renderResult(result);
})();
