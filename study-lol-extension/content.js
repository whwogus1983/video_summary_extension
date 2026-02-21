(() => {
  async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setPromptToElement(el, prompt) {
    if (!el) return false;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.focus();
      el.value = prompt;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (el.isContentEditable) {
      el.focus();
      el.textContent = '';
      const inserted = document.execCommand('insertText', false, prompt);
      if (!inserted) {
        el.textContent = prompt;
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt, inputType: 'insertText' }));
      return true;
    }

    return false;
  }

  function findGeminiInput() {
    const selectors = [
      'div[role="textbox"][contenteditable="true"]',
      'rich-textarea div[contenteditable="true"]',
      'textarea[aria-label]',
      'textarea'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    return null;
  }

  function findGeminiSendButton() {
    const selectors = [
      'button[aria-label*="Send" i]',
      'button[aria-label*="전송" i]',
      'button[data-test-id="send-button"]',
      'button.send-button'
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && !btn.disabled) return btn;
    }

    return null;
  }

  async function submitPrompt(inputEl) {
    for (let i = 0; i < 16; i += 1) {
      const sendBtn = findGeminiSendButton();
      if (sendBtn) {
        sendBtn.click();
        return true;
      }
      await wait(200);
    }

    inputEl.focus();
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

    return true;
  }

  async function autoSubmitGeminiPrompt(prompt) {
    const MAX_WAIT_MS = 30000;
    const STEP_MS = 500;
    const maxStep = Math.floor(MAX_WAIT_MS / STEP_MS);

    for (let i = 0; i < maxStep; i += 1) {
      const inputEl = findGeminiInput();
      if (inputEl && setPromptToElement(inputEl, prompt)) {
        await wait(250);

        const submitted = await submitPrompt(inputEl);
        if (!submitted) {
          return { ok: false, reason: 'submit_failed' };
        }

        return { ok: true };
      }

      await wait(STEP_MS);
    }

    return { ok: false, reason: 'composer_not_found' };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'AUTO_SUBMIT_GEMINI_PROMPT') {
      autoSubmitGeminiPrompt(msg.prompt || '').then((result) => sendResponse(result));
      return true;
    }
  });
})();
