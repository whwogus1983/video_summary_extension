const GEMINI_APP_URL = 'https://gemini.google.com/app';
const PENDING_KEY = 'pendingGeminiTabs';
const SUMMARY_LANGUAGE_KEY = 'summaryLanguage';
const DEFAULT_SUMMARY_LANGUAGE = 'Korean';
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
    autoSubmitFailed: 'Gemini 자동 입력에 실패했습니다. 탭으로 이동해 수동으로 붙여넣어 주세요.',
    submitted: 'Gemini에 요약 요청을 전송했습니다.',
    processingError: '처리 중 오류가 발생했습니다: {error}'
  },
  en: {
    appTitle: 'Video Summary Extension',
    summaryDoneTitle: 'Summary Request Sent',
    btnOk: 'OK',
    btnMove: 'Go to tab',
    unsupportedUrl: 'This works only on supported video URLs (YouTube/Vimeo, etc.).',
    autoSubmitFailed: 'Automatic Gemini input failed. Move to the tab and paste manually.',
    submitted: 'Summary prompt was submitted to Gemini.',
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

async function getSummaryLanguage() {
  const data = await chrome.storage.local.get(SUMMARY_LANGUAGE_KEY);
  return data[SUMMARY_LANGUAGE_KEY] || DEFAULT_SUMMARY_LANGUAGE;
}

function buildSummaryPrompt(videoUrl, summaryLanguage) {
  return [
    'Summarize the video from the URL below.',
    '',
    `Video URL: ${videoUrl}`,
    '',
    `Write the entire response in ${summaryLanguage}.`,
    '',
    'Please include:',
    '1) A concise overall summary',
    '2) Key points as bullet points',
    '3) Actionable takeaways',
    '4) If transcript access is limited, clearly say what was inferred'
  ].join('\n');
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

async function addPendingGeminiTab(geminiTabId, sourceTabId, prompt, locale) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  pending[String(geminiTabId)] = {
    sourceTabId,
    prompt,
    locale,
    createdAt: Date.now(),
    submitted: false
  };
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
}

async function getPendingGeminiTab(geminiTabId) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  return pending[String(geminiTabId)] || null;
}

async function patchPendingGeminiTab(geminiTabId, patch) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  const key = String(geminiTabId);
  if (!pending[key]) return false;

  pending[key] = { ...pending[key], ...patch };
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
  return true;
}

async function removePendingGeminiTab(geminiTabId) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  delete pending[String(geminiTabId)];
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
}

async function triggerGeminiAutoSubmit(geminiTabId, pending, attempt = 0) {
  const MAX_RETRY = 8;
  const RETRY_DELAY_MS = 1000;

  chrome.tabs.sendMessage(
    geminiTabId,
    {
      type: 'AUTO_SUBMIT_GEMINI_PROMPT',
      prompt: pending.prompt
    },
    async (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        if (attempt < MAX_RETRY) {
          setTimeout(() => triggerGeminiAutoSubmit(geminiTabId, pending, attempt + 1), RETRY_DELAY_MS);
          return;
        }

        notify(pending.locale || 'en', message(pending.locale || 'en', 'autoSubmitFailed'), 'appTitle', geminiTabId);
        await removePendingGeminiTab(geminiTabId);
        return;
      }

      await patchPendingGeminiTab(geminiTabId, { submitted: true, submittedAt: Date.now() });
      setTimeout(() => {
        const locale = pending.locale || 'en';
        notify(locale, message(locale, 'submitted'), 'summaryDoneTitle', geminiTabId);
      }, 8000);
      await removePendingGeminiTab(geminiTabId);
    }
  );
}

async function handleSummaryFromTab(tab) {
  const currentUrl = tab?.url || '';
  const summaryLanguage = await getSummaryLanguage();
  const locale = getLocaleFromLanguage(summaryLanguage);

  if (!tab?.id || !isSupportedVideoUrl(currentUrl)) {
    notify(locale, message(locale, 'unsupportedUrl'));
    return;
  }

  const prompt = buildSummaryPrompt(currentUrl, summaryLanguage);
  const geminiTab = await chrome.tabs.create({ url: GEMINI_APP_URL, active: false });

  if (geminiTab?.id) {
    await addPendingGeminiTab(geminiTab.id, tab.id, prompt, locale);
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
    const summaryLanguage = await getSummaryLanguage();
    const locale = getLocaleFromLanguage(summaryLanguage);
    notify(locale, message(locale, 'processingError', { error: e?.message || e }));
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('https://gemini.google.com/')) return;

  const pending = await getPendingGeminiTab(tabId);
  if (!pending || pending.submitted) return;

  triggerGeminiAutoSubmit(tabId, pending);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await removePendingGeminiTab(tabId);
});
