const AI_APP_URLS = {
  gemini: 'https://gemini.google.com/app',
  gpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/chats'
};

const DEFAULT_AI_TARGET = 'gemini';
const PENDING_KEY = 'pendingAiTabs';
const SUMMARY_LANGUAGE_KEY = 'summaryLanguage';
const SHORT_SUMMARY_KEY = 'shortSummaryEnabled';
const OPEN_PAGE_IMMEDIATELY_KEY = 'openPageImmediately';
const CUSTOM_PROMPTS_KEY = 'customPromptsByLanguage';
const DEFAULT_SUMMARY_LANGUAGE = 'English';
const COMMAND_NAME = 'open_gemini_summary';

const SUPPORTED_VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'twitch.tv',
  'dailymotion.com'
];

const notificationTargetTabs = new Map();

const MESSAGES = {
  ko: {
    appTitle: 'Video Summary Extension',
    summaryDoneTitle: '요약 요청 완료',
    btnOk: '확인',
    btnMove: '해당 탭으로 이동',
    unsupportedUrl: '지원되는 영상 URL(YouTube/Vimeo 등)에서만 사용할 수 있습니다.',
    autoSubmitFailed: '자동 입력에 실패했습니다. 탭으로 이동해 수동으로 붙여넣어 주세요.',
    submitted: '요약 요청을 전송했습니다.',
    processingError: '처리 중 오류가 발생했습니다: {error}'
  },
  en: {
    appTitle: 'Video Summary Extension',
    summaryDoneTitle: 'Summary Request Sent',
    btnOk: 'OK',
    btnMove: 'Go to tab',
    unsupportedUrl: 'This works only on supported video URLs (YouTube/Vimeo, etc.).',
    autoSubmitFailed: 'Automatic input failed. Move to the tab and paste manually.',
    submitted: 'Summary prompt was submitted.',
    processingError: 'An error occurred: {error}'
  }
};

function getLocaleFromLanguage(summaryLanguage) {
  return summaryLanguage === 'Korean' ? 'ko' : 'en';
}

function message(locale, key, vars = {}) {
  const dict = MESSAGES[locale] || MESSAGES.en;
  let text = dict[key] || key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replace(`{${name}}`, String(value));
  }
  return text;
}

function isSupportedVideoUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return false;

    const host = u.hostname.toLowerCase();
    return SUPPORTED_VIDEO_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function isSupportedAiUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    return host.includes('gemini.google.com') || host.includes('chatgpt.com') || host.includes('claude.ai');
  } catch {
    return false;
  }
}

function defaultPromptTemplate(language, isShortSummary) {
  const shortLine = isShortSummary
    ? 'Keep it short and focused in 3-5 bullet points.'
    : 'Provide enough detail to understand key ideas.';

  if (language === 'Korean') {
    return [
      '다음 영상 URL을 요약해 주세요: {videoUrl}',
      '',
      '반드시 한국어로 답변해 주세요.',
      shortLine,
      '아래 형식으로 작성해 주세요:',
      '1) 전체 요약',
      '2) 핵심 포인트',
      '3) 실천 가능한 인사이트',
      '4) 추론한 내용이 있으면 명확히 표시'
    ].join('\n');
  }

  return [
    `Summarize the video from this URL: {videoUrl}`,
    '',
    `Write the full response in ${language}.`,
    shortLine,
    'Please include:',
    '1) A concise overall summary',
    '2) Key points as bullet points',
    '3) Actionable takeaways',
    '4) If something is inferred, clearly state it'
  ].join('\n');
}

function buildSummaryPrompt(videoUrl, template) {
  return template.replaceAll('{videoUrl}', videoUrl);
}

async function getSettings() {
  const data = await chrome.storage.local.get([
    SUMMARY_LANGUAGE_KEY,
    SHORT_SUMMARY_KEY,
    OPEN_PAGE_IMMEDIATELY_KEY,
    CUSTOM_PROMPTS_KEY
  ]);

  const summaryLanguage = data[SUMMARY_LANGUAGE_KEY] || DEFAULT_SUMMARY_LANGUAGE;
  const shortSummaryEnabled = Boolean(data[SHORT_SUMMARY_KEY] ?? false);
  const openPageImmediately = Boolean(data[OPEN_PAGE_IMMEDIATELY_KEY] ?? false);
  const customPrompts = data[CUSTOM_PROMPTS_KEY] || {};

  const template = customPrompts[summaryLanguage] || defaultPromptTemplate(summaryLanguage, shortSummaryEnabled);

  return { summaryLanguage, shortSummaryEnabled, openPageImmediately, template };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    if (typeof tab.windowId === 'number') {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return true;
  } catch {
    return false;
  }
}

function notify(locale, messageText, titleKey = 'appTitle', focusTabId = null) {
  const notificationId = `video-summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (typeof focusTabId === 'number') {
    notificationTargetTabs.set(notificationId, focusTabId);
  }

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon_loop.png',
    title: message(locale, titleKey),
    message: messageText,
    buttons: [
      { title: message(locale, 'btnOk') },
      { title: message(locale, 'btnMove') }
    ]
  });
}

async function addPendingAiTab(aiTabId, sourceTabId, prompt, locale) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  pending[String(aiTabId)] = {
    sourceTabId,
    prompt,
    locale,
    createdAt: Date.now(),
    submitted: false
  };
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
}

async function getPendingAiTab(aiTabId) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  return pending[String(aiTabId)] || null;
}

async function patchPendingAiTab(aiTabId, patch) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  const key = String(aiTabId);
  if (!pending[key]) return false;

  pending[key] = { ...pending[key], ...patch };
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
  return true;
}

async function removePendingAiTab(aiTabId) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  delete pending[String(aiTabId)];
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
}

async function triggerAiAutoSubmit(aiTabId, pending, attempt = 0) {
  const MAX_RETRY = 8;
  const RETRY_DELAY_MS = 1000;

  chrome.tabs.sendMessage(
    aiTabId,
    {
      type: 'AUTO_SUBMIT_PROMPT',
      prompt: pending.prompt
    },
    async (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        if (attempt < MAX_RETRY) {
          setTimeout(() => triggerAiAutoSubmit(aiTabId, pending, attempt + 1), RETRY_DELAY_MS);
          return;
        }

        notify(pending.locale || 'en', message(pending.locale || 'en', 'autoSubmitFailed'), 'appTitle', aiTabId);
        await removePendingAiTab(aiTabId);
        return;
      }

      await patchPendingAiTab(aiTabId, { submitted: true, submittedAt: Date.now() });
      setTimeout(() => {
        const locale = pending.locale || 'en';
        notify(locale, message(locale, 'submitted'), 'summaryDoneTitle', aiTabId);
      }, 3000);
      await removePendingAiTab(aiTabId);
    }
  );
}

async function handleSummaryFromTab(tab) {
  const currentUrl = tab?.url || '';
  const settings = await getSettings();
  const locale = getLocaleFromLanguage(settings.summaryLanguage);

  if (!tab?.id || !isSupportedVideoUrl(currentUrl)) {
    notify(locale, message(locale, 'unsupportedUrl'));
    return;
  }

  const prompt = buildSummaryPrompt(currentUrl, settings.template);
  const aiUrl = AI_APP_URLS[DEFAULT_AI_TARGET] || AI_APP_URLS.gemini;
  const aiTab = await chrome.tabs.create({
    url: aiUrl,
    active: settings.openPageImmediately
  });

  if (aiTab?.id) {
    await addPendingAiTab(aiTab.id, tab.id, prompt, locale);
  }
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    chrome.notifications.clear(notificationId);
    notificationTargetTabs.delete(notificationId);
    return;
  }

  if (buttonIndex === 1) {
    const tabId = notificationTargetTabs.get(notificationId);
    if (typeof tabId === 'number') {
      await focusTab(tabId);
    }
    chrome.notifications.clear(notificationId);
    notificationTargetTabs.delete(notificationId);
  }
});

chrome.notifications.onClosed.addListener((notificationId) => {
  notificationTargetTabs.delete(notificationId);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== COMMAND_NAME) return;

  try {
    const tab = await getActiveTab();
    await handleSummaryFromTab(tab);
  } catch (e) {
    const settings = await getSettings();
    const locale = getLocaleFromLanguage(settings.summaryLanguage);
    notify(locale, message(locale, 'processingError', { error: e?.message || e }));
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !isSupportedAiUrl(tab.url)) return;

  const pending = await getPendingAiTab(tabId);
  if (!pending || pending.submitted) return;

  triggerAiAutoSubmit(tabId, pending);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await removePendingAiTab(tabId);
});
