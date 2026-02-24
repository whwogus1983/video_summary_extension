const SETTINGS_WINDOW_WIDTH = 980;
const SETTINGS_WINDOW_HEIGHT = 780;

function openSettingsWindow() {
  const url = chrome.runtime.getURL('options.html');
  chrome.windows.create({
    url,
    type: 'popup',
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    focused: true
  });
}

document.getElementById('openSettings').addEventListener('click', openSettingsWindow);