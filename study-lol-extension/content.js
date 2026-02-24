(() => {
  async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function detectProvider() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('chatgpt.com')) return 'gpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('gemini.google.com')) return 'gemini';
    return 'generic';
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

  function selectorsByProvider(provider) {
    if (provider === 'gpt') {
      return {
        inputs: [
          '#prompt-textarea',
          'textarea#prompt-textarea',
          'textarea[data-id="root"]',
          'textarea'
        ],
        buttons: [
          'button[data-testid="send-button"]',
          'button[aria-label*="Send" i]'
        ]
      };
    }

    if (provider === 'claude') {
      return {
        inputs: [
          'div[contenteditable="true"][role="textbox"]',
          'div[contenteditable="true"]',
          'textarea'
        ],
        buttons: [
          'button[aria-label*="Send" i]',
          'button[data-testid*="send" i]',
          'button[title*="Send" i]'
        ]
      };
    }

    if (provider === 'gemini') {
      return {
        inputs: [
          'div[role="textbox"][contenteditable="true"]',
          'rich-textarea div[contenteditable="true"]',
          'textarea[aria-label]',
          'textarea'
        ],
        buttons: [
          'button[aria-label*="Send" i]',
          'button[aria-label*="전송" i]',
          'button[data-test-id="send-button"]',
          'button.send-button'
        ]
      };
    }

    return {
      inputs: ['div[contenteditable="true"]', 'textarea', 'input[type="text"]'],
      buttons: ['button[aria-label*="Send" i]', 'button[type="submit"]']
    };
  }

  function findInput(provider) {
    const { inputs } = selectorsByProvider(provider);
    for (const selector of inputs) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function findSendButton(provider) {
    const { buttons } = selectorsByProvider(provider);
    for (const selector of buttons) {
      const btn = document.querySelector(selector);
      if (btn && !btn.disabled) return btn;
    }
    return null;
  }

  async function submitPrompt(inputEl, provider) {
    for (let i = 0; i < 16; i += 1) {
      const sendBtn = findSendButton(provider);
      if (sendBtn) {
        sendBtn.click();
        return true;
      }
      await wait(200);
    }

    inputEl.focus();
    const useMetaEnter = provider === 'gpt' || provider === 'claude';
    inputEl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      metaKey: useMetaEnter,
      ctrlKey: useMetaEnter
    }));
    inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

    return true;
  }

  async function autoSubmitPrompt(prompt) {
    const provider = detectProvider();
    const MAX_WAIT_MS = 30000;
    const STEP_MS = 500;
    const maxStep = Math.floor(MAX_WAIT_MS / STEP_MS);

    for (let i = 0; i < maxStep; i += 1) {
      const inputEl = findInput(provider);
      if (inputEl && setPromptToElement(inputEl, prompt)) {
        await wait(250);

        const submitted = await submitPrompt(inputEl, provider);
        if (!submitted) {
          return { ok: false, reason: 'submit_failed' };
        }

        return { ok: true, provider };
      }

      await wait(STEP_MS);
    }

    return { ok: false, reason: 'composer_not_found', provider };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'AUTO_SUBMIT_PROMPT' || msg?.type === 'AUTO_SUBMIT_GEMINI_PROMPT') {
      autoSubmitPrompt(msg.prompt || '').then((result) => sendResponse(result));
      return true;
    }
  });
})();
