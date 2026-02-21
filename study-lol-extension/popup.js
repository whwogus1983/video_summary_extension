const SUMMARY_LANGUAGE_KEY = 'summaryLanguage';
const DEFAULT_SUMMARY_LANGUAGE = 'Korean';

const LANGUAGE_OPTIONS = [
  'Korean',
  'English',
  'Japanese',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
  'Russian',
  'Arabic',
  'Hindi'
];

const I18N = {
  ko: {
    title: 'Video Summary',
    subtitle: 'Gemini 요약 설정',
    languageLabel: '요약 언어',
    meta1: '실행 단축키는 Alt+Q로 고정입니다.',
    meta2: '요약 언어만 이 화면에서 변경할 수 있습니다.',
    statusLanguageSaved: '언어 설정을 저장했습니다.'
  },
  en: {
    title: 'Video Summary',
    subtitle: 'Gemini summary settings',
    languageLabel: 'Summary language',
    meta1: 'Shortcut is fixed to Alt+Q.',
    meta2: 'Only summary language can be changed here.',
    statusLanguageSaved: 'Language setting saved.'
  }
};

const LANGUAGE_LABELS = {
  ko: {
    Korean: '한국어',
    English: '영어',
    Japanese: '일본어',
    'Chinese (Simplified)': '중국어(간체)',
    'Chinese (Traditional)': '중국어(번체)',
    Spanish: '스페인어',
    French: '프랑스어',
    German: '독일어',
    Portuguese: '포르투갈어',
    Italian: '이탈리아어',
    Russian: '러시아어',
    Arabic: '아랍어',
    Hindi: '힌디어'
  },
  en: {
    Korean: 'Korean',
    English: 'English',
    Japanese: 'Japanese',
    'Chinese (Simplified)': 'Chinese (Simplified)',
    'Chinese (Traditional)': 'Chinese (Traditional)',
    Spanish: 'Spanish',
    French: 'French',
    German: 'German',
    Portuguese: 'Portuguese',
    Italian: 'Italian',
    Russian: 'Russian',
    Arabic: 'Arabic',
    Hindi: 'Hindi'
  }
};

let currentUiLocale = 'ko';

function uiLocaleFromLanguage(language) {
  return language === 'Korean' ? 'ko' : 'en';
}

function t(key) {
  const dict = I18N[currentUiLocale] || I18N.en;
  return dict[key] || key;
}

function languageLabel(language) {
  const dict = LANGUAGE_LABELS[currentUiLocale] || LANGUAGE_LABELS.en;
  return dict[language] || language;
}

function applyUiLocale(uiLocale) {
  currentUiLocale = uiLocale;
  document.documentElement.lang = uiLocale;

  document.getElementById('titleText').textContent = t('title');
  document.getElementById('subtitleText').textContent = t('subtitle');
  document.getElementById('languageLabel').textContent = t('languageLabel');
  document.getElementById('meta1').textContent = t('meta1');
  document.getElementById('meta2').textContent = t('meta2');
}

function buildLanguageOptions(selectEl, selected) {
  selectEl.innerHTML = '';
  for (const language of LANGUAGE_OPTIONS) {
    const option = document.createElement('option');
    option.value = language;
    option.textContent = languageLabel(language);
    if (language === selected) option.selected = true;
    selectEl.appendChild(option);
  }
}

function showStatus(text, type = 'ok') {
  const status = document.getElementById('statusMessage');
  status.textContent = text;
  status.className = `status ${type}`;
}

async function loadLanguage() {
  const data = await chrome.storage.local.get(SUMMARY_LANGUAGE_KEY);
  return data[SUMMARY_LANGUAGE_KEY] || DEFAULT_SUMMARY_LANGUAGE;
}

async function saveLanguage(language) {
  await chrome.storage.local.set({ [SUMMARY_LANGUAGE_KEY]: language });
}

document.addEventListener('DOMContentLoaded', async () => {
  const languageSelect = document.getElementById('summaryLanguage');

  const currentLanguage = await loadLanguage();
  applyUiLocale(uiLocaleFromLanguage(currentLanguage));
  buildLanguageOptions(languageSelect, currentLanguage);

  languageSelect.addEventListener('change', async (event) => {
    const selectedLanguage = event.target.value;
    await saveLanguage(selectedLanguage);

    applyUiLocale(uiLocaleFromLanguage(selectedLanguage));
    buildLanguageOptions(languageSelect, selectedLanguage);
    showStatus(t('statusLanguageSaved'), 'ok');
  });
});
