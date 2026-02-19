const STUDY_BASE = "https://study.lol/";
const PENDING_KEY = "pendingStudyTabs";

const SUPPORTED_VIDEO_HOSTS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "twitch.tv",
  "dailymotion.com"
];

function isSupportedVideoUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (u.origin === 'https://study.lol') return false;

    const host = u.hostname.toLowerCase();
    return SUPPORTED_VIDEO_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function toStudyUrl(originalUrl) {
  return `${STUDY_BASE}${encodeURIComponent(originalUrl)}`;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function notify(message, title = 'Study.lol Bridge') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message
  });
}

function showError(tabId, message) {
  chrome.tabs.sendMessage(tabId, { type: 'SHOW_ERROR', message }, () => {
    if (chrome.runtime.lastError) {
      notify(message);
    }
  });
}

function showSummaryCompleteDialog(sourceTabId, studyTabId) {
  chrome.tabs.sendMessage(
    sourceTabId,
    {
      type: 'SHOW_SUMMARY_COMPLETE',
      message: '요약 생성이 완료되었습니다.',
      studyTabId
    },
    () => {
      if (chrome.runtime.lastError) {
        notify('요약 생성이 완료되었습니다. 생성된 탭으로 이동해 확인하세요.', 'Study.lol 준비 완료');
      }
    }
  );
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

async function addPendingTab(studyTabId, sourceTabId, sourceUrl) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  pending[String(studyTabId)] = {
    sourceTabId,
    sourceUrl,
    createdAt: Date.now()
  };
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
}

async function popPendingTab(studyTabId) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY] || {};
  const key = String(studyTabId);

  if (!pending[key]) return null;

  const value = pending[key];
  delete pending[key];
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
  return value;
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open_study_lol') return;

  try {
    const tab = await getActiveTab();
    const currentUrl = tab?.url || '';

    if (!tab?.id || !isSupportedVideoUrl(currentUrl)) {
      if (tab?.id) {
        showError(tab.id, '지원되는 영상 URL(YouTube/Vimeo 등)에서만 사용할 수 있습니다.');
      } else {
        notify('현재 탭 URL을 읽을 수 없습니다.');
      }
      return;
    }

    const studyUrl = toStudyUrl(currentUrl);
    const newTab = await chrome.tabs.create({ url: studyUrl, active: false });

    if (newTab?.id) {
      await addPendingTab(newTab.id, tab.id, currentUrl);
    }
  } catch (e) {
    notify(`처리 중 오류가 발생했습니다: ${e?.message || e}`);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith(STUDY_BASE)) return;

  const pending = await popPendingTab(tabId);
  if (!pending) return;

  if (typeof pending.sourceTabId === 'number') {
    showSummaryCompleteDialog(pending.sourceTabId, tabId);
  } else {
    notify('요약 생성이 완료되었습니다.', 'Study.lol 준비 완료');
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'FOCUS_STUDY_TAB') return;

  (async () => {
    const ok = await focusTab(msg.studyTabId);
    sendResponse({ ok });
  })();

  return true;
});
