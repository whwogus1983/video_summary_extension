function openSettingsTab() {
  const url = chrome.runtime.getURL('options.html');
  chrome.tabs.create({
    url,
    active: true
  });
}

document.getElementById('openSettings').addEventListener('click', openSettingsTab);