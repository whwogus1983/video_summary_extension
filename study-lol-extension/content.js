(() => {
  const MODAL_ID = 'study-lol-modal';

  function removeModal() {
    const existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
  }

  function createBaseModal(titleText, messageText) {
    removeModal();

    if (!document.body) {
      alert(messageText);
      return null;
    }

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      width: min(92vw, 440px);
      background: #fff;
      color: #111;
      border-radius: 12px;
      padding: 18px 16px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    `;

    const title = document.createElement('h3');
    title.textContent = titleText;
    title.style.cssText = 'margin:0 0 10px 0; font-size:16px;';

    const text = document.createElement('p');
    text.textContent = messageText;
    text.style.cssText = 'margin:0 0 14px 0; font-size:14px; line-height:1.45;';

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';

    box.appendChild(title);
    box.appendChild(text);
    box.appendChild(buttonRow);
    overlay.appendChild(box);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) removeModal();
    });

    document.body.appendChild(overlay);
    return { buttonRow };
  }

  function makeButton(label, styleType, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;

    const palette = styleType === 'primary'
      ? 'background:#111; color:#fff;'
      : 'background:#f1f3f5; color:#111;';

    btn.style.cssText = `
      border: none;
      ${palette}
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
    `;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function showErrorModal(message) {
    const modal = createBaseModal('Study.lol Bridge', message);
    if (!modal) return;

    modal.buttonRow.appendChild(
      makeButton('확인', 'primary', removeModal)
    );
  }

  function showSummaryCompleteModal(message, studyTabId) {
    const modal = createBaseModal('Study.lol Bridge', message);
    if (!modal) return;

    const moveBtn = makeButton('해당 탭으로 이동', 'primary', () => {
      chrome.runtime.sendMessage({ type: 'FOCUS_STUDY_TAB', studyTabId }, () => {
        removeModal();
      });
    });

    const okBtn = makeButton('확인', 'secondary', removeModal);

    modal.buttonRow.appendChild(moveBtn);
    modal.buttonRow.appendChild(okBtn);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'SHOW_ERROR') {
      showErrorModal(msg.message || '요청을 처리할 수 없습니다.');
      return;
    }

    if (msg?.type === 'SHOW_SUMMARY_COMPLETE') {
      showSummaryCompleteModal(
        msg.message || '요약 생성이 완료되었습니다.',
        msg.studyTabId
      );
    }
  });
})();
