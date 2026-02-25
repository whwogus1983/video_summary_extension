const STORAGE_KEYS = {
  language: 'summaryLanguage',
  shortSummary: 'shortSummaryEnabled',
  openImmediately: 'openPageImmediately',
  customInclude: 'customIncludeByLanguage'
};

const DEFAULTS = {
  language: 'English',
  shortSummary: false,
  openImmediately: false
};

const LANGUAGES = [
  'Arabic',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Dutch',
  'English',
  'French',
  'German',
  'Hindi',
  'Indonesian',
  'Italian',
  'Japanese',
  'Korean',
  'Portuguese',
  'Russian',
  'Spanish',
  'Turkish',
  'Vietnamese'
];

function defaultIncludeSection(language) {
  if (language === 'Korean') {
    return [
      '1) 전체 요약',
      '2) 핵심 포인트',
      '3) 실천 가능한 인사이트',
      '4) 추론한 내용이 있으면 명확히 표시'
    ].join('\n');
  }

  return [
    '1) A concise overall summary',
    '2) Key points as bullet points',
    '3) Actionable takeaways',
    '4) If something is inferred, clearly state it'
  ].join('\n');
}

function buildFixedPromptPreview(language, isShort) {
  const shortLine = isShort
    ? 'Keep it short and focused in 3-5 bullet points.'
    : 'Provide enough detail to understand key ideas.';

  if (language === 'Korean') {
    return [
      '다음 영상 URL을 요약해 주세요: {videoUrl}',
      '',
      '반드시 한국어로 답변해 주세요.',
      shortLine,
      'Please include:',
      '[Editable section below]'
    ].join('\n');
  }

  return [
    'Summarize the video from this URL: {videoUrl}',
    '',
    `Write the full response in ${language}.`,
    shortLine,
    'Please include:',
    '[Editable section below]'
  ].join('\n');
}

async function loadSettings() {
  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));

  return {
    language: data[STORAGE_KEYS.language] || DEFAULTS.language,
    shortSummary: Boolean(data[STORAGE_KEYS.shortSummary] ?? DEFAULTS.shortSummary),
    openImmediately: Boolean(data[STORAGE_KEYS.openImmediately] ?? DEFAULTS.openImmediately),
    customInclude: data[STORAGE_KEYS.customInclude] || {}
  };
}

async function saveSettings(next) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.language]: next.language,
    [STORAGE_KEYS.shortSummary]: next.shortSummary,
    [STORAGE_KEYS.openImmediately]: next.openImmediately,
    [STORAGE_KEYS.customInclude]: next.customInclude
  });
}

function populateLanguageOptions(currentLanguage) {
  const select = document.getElementById('summaryLanguage');
  select.innerHTML = '';

  for (const language of LANGUAGES) {
    const option = document.createElement('option');
    option.value = language;
    option.textContent = language;
    if (language === currentLanguage) option.selected = true;
    select.appendChild(option);
  }
}

function showStatus(text) {
  document.getElementById('statusMessage').textContent = text;
}

document.addEventListener('DOMContentLoaded', async () => {
  const languageSelect = document.getElementById('summaryLanguage');
  const shortSummarySelect = document.getElementById('shortSummary');
  const openImmediatelySelect = document.getElementById('openImmediately');
  const fixedPromptTextarea = document.getElementById('fixedPrompt');
  const includeSectionTextarea = document.getElementById('includeSection');

  let state = await loadSettings();

  populateLanguageOptions(state.language);
  shortSummarySelect.value = state.shortSummary ? 'yes' : 'no';
  openImmediatelySelect.value = state.openImmediately ? 'yes' : 'no';

  function syncFields() {
    const language = languageSelect.value;
    const isShort = shortSummarySelect.value === 'yes';

    fixedPromptTextarea.value = buildFixedPromptPreview(language, isShort);
    includeSectionTextarea.value = state.customInclude[language] || defaultIncludeSection(language);
  }

  syncFields();

  languageSelect.addEventListener('change', () => {
    syncFields();
  });

  shortSummarySelect.addEventListener('change', () => {
    syncFields();
  });

  document.getElementById('saveOptions').addEventListener('click', async () => {
    const selectedLanguage = languageSelect.value;
    const next = {
      language: selectedLanguage,
      shortSummary: shortSummarySelect.value === 'yes',
      openImmediately: openImmediatelySelect.value === 'yes',
      customInclude: {
        ...state.customInclude,
        [selectedLanguage]: includeSectionTextarea.value.trim() || defaultIncludeSection(selectedLanguage)
      }
    };

    await saveSettings(next);
    state = next;
    syncFields();
    showStatus('Saved.');
  });

  document.getElementById('restoreDefaults').addEventListener('click', async () => {
    const next = {
      language: DEFAULTS.language,
      shortSummary: DEFAULTS.shortSummary,
      openImmediately: DEFAULTS.openImmediately,
      customInclude: {}
    };

    await saveSettings(next);
    state = await loadSettings();

    populateLanguageOptions(state.language);
    shortSummarySelect.value = state.shortSummary ? 'yes' : 'no';
    openImmediatelySelect.value = state.openImmediately ? 'yes' : 'no';
    syncFields();
    showStatus('Restored default options.');
  });
});
