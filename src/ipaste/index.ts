import { jsMessages as messages } from '@i18n/js-messages';
import { htmlMessages } from '@i18n/html-messages';
import {
  KDF_V2, WEB_PUBLIC, InputData,
  createAppState,
  openUrl, getPlainText, setErrMsg, maskKey, showMaskedPrivkey,
  generateRandomSalt, pbkdf2, generateKey, generateContentKey, aesGcmEncrypt,
  bindCommonButtons, initBookmark, showBuildInfo, initSquircle, applyComputePrivkeyBtnSquircle,
} from './common';

const App = (function () {

  async function init() {
    let ec = await ECC.initEC();
    const state = createAppState();

    function bindLoadLatestBtn() {
      const btn = document.getElementById("loadLatest");
      if (!btn) return;
      btn.onclick = () => {
        location.href = 'autofetch.html' + location.hash;
      };
    }

    function bindGenBookmarkBtn() {
      const btn = document.getElementById("genbookmark2");
      if (!btn) return;
      btn.onclick = async () => {
        let input = document.getElementById("keyphraseBookmark") as HTMLInputElement;
        let phrase = input?.value.trim();
        if (!phrase) {
          setErrMsg(messages.errEmptyPhrase);
          return;
        }

        const savePrivkey = (document.getElementById("savePrivkeyToggle") as HTMLInputElement)?.checked;
        const saltStr = generateRandomSalt(ec);
        let kp = await pbkdf2(phrase, saltStr, ec, {
          hash: KDF_V2.hash,
          iterations: KDF_V2.iterations,
        });

        await genbookmark(kp.public, saltStr, {
          kdf: { ...KDF_V2 },
          type: 'phrase',
          private: savePrivkey ? kp.private : undefined,
          targetPage: 'autofetch.html',
        });
      };
    }

    function bindGenBookmarkPageBtn() {
      const btn = document.getElementById("genbookmarkPage");
      if (!btn) return;
      btn.onclick = async () => {
        let input = document.getElementById("keyphraseBookmark") as HTMLInputElement;
        let phrase = input?.value.trim();
        if (!phrase) {
          setErrMsg(messages.errEmptyPhrase);
          return;
        }

        const savePrivkey = (document.getElementById("savePrivkeyToggle") as HTMLInputElement)?.checked;
        const saltStr = generateRandomSalt(ec);
        let kp = await pbkdf2(phrase, saltStr, ec, {
          hash: KDF_V2.hash,
          iterations: KDF_V2.iterations,
        });

        await genbookmark(kp.public, saltStr, {
          kdf: { ...KDF_V2 },
          type: 'phrase',
          private: savePrivkey ? kp.private : undefined,
        });
      };
    }

    function bindSavePrivkeyToggle() {
      const toggle = document.getElementById("savePrivkeyToggle") as HTMLInputElement;
      if (!toggle) return;

      function updateBookmarkUI() {
        const checked = toggle.checked;
        const bmGenTitleEl = document.getElementById("bmGenTitle");
        const btnAutofetch = document.getElementById("genbookmark2");
        const btnPage = document.getElementById("genbookmarkPage");
        if (bmGenTitleEl) {
          bmGenTitleEl.textContent = checked ? htmlMessages.bmGenTitlePrivkey : htmlMessages.bmGenTitle;
        }
        if (btnAutofetch) {
          btnAutofetch.style.backgroundColor = checked ? '#e74c3c' : '#45b787';
        }
        if (btnPage) {
          btnPage.style.backgroundColor = checked ? '#e74c3c' : '#1a1a1d';
        }
      }

      toggle.addEventListener('change', () => {
        if (toggle.checked && !confirm(messages.bmSavePrivkeyConfirm)) {
          toggle.checked = false;
        }
        updateBookmarkUI();
      });
    }

    async function genbookmark(
      pubkey: string,
      salt?: string,
      options?: {
        kdf?: { ver: string; hash: string; iterations: number };
        type?: 'phrase' | 'pubkey';
        private?: string;
        targetPage?: string;
      }
    ) {
      let s: InputData = { pubkey };
      if (salt) {
        s.salt = salt;
      }
      if (options?.kdf) {
        s.ver = options.kdf.ver;
        s.kdfHash = options.kdf.hash;
        s.kdfIterations = options.kdf.iterations;
      }
      if (options?.type) {
        s.type = options.type;
      }
      if (options?.private) {
        s.private = options.private;
      }

      let jsonstring = JSON.stringify(s);
      let arr = new TextEncoder().encode(jsonstring);
      let dataBuff = await ec.encrypt(WEB_PUBLIC, arr);
      let data = ec.base64Encode(dataBuff, 1).replace(/[\r\n]/g, '');

      let targetPath: string;
      if (options?.targetPage) {
        const currentDir = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
        targetPath = currentDir + options.targetPage;
      } else {
        targetPath = location.pathname;
      }

      let bookmark = `${location.origin}${targetPath}?t=${new Date().toISOString()}#&data2=${encodeURIComponent(data)}`;

      console.log('网页地址:', bookmark);

      let a = document.createElement("a");
      a.innerText = bookmark;
      a.href = bookmark;

      let holder = document.getElementById("bookmark");
      if (holder) {
        holder.innerHTML = '';
        holder.appendChild(a);
      }

      if (options?.type === 'phrase') {
        const hint = document.createElement("p");
        hint.className = "bookmark-hint";
        hint.textContent = messages.bookmarkHint;
        holder?.appendChild(hint);
      }

      const bmPubkey = document.getElementById("bmPubkey");
      const bmSalt = document.getElementById("bmSalt");
      const bmSaltRow = document.getElementById("bmSaltRow");
      const bmPrivkeyRow = document.getElementById("bmPrivkeyRow");
      const bookmarkInfo = document.getElementById("bookmarkInfo");
      if (bmPubkey) bmPubkey.textContent = pubkey;
      if (bmSalt && salt) {
        bmSalt.textContent = maskKey(salt);
        bmSaltRow!.style.display = "flex";
      }
      if (bmPrivkeyRow) bmPrivkeyRow.style.display = "none";
      if (options?.private) {
        showMaskedPrivkey(options.private);
      }
      if (bookmarkInfo) {
        bookmarkInfo.style.display = "block";
      }
    }

    // Bind index-specific buttons
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        bindGenBookmarkBtn();
        bindGenBookmarkPageBtn();
        bindLoadLatestBtn();
        bindSavePrivkeyToggle();
      });
    } else {
      bindGenBookmarkBtn();
      bindGenBookmarkPageBtn();
      bindLoadLatestBtn();
      bindSavePrivkeyToggle();
    }

    // Bind common buttons (decrypt, encrypt, save, restore, copy)
    bindCommonButtons(ec, state);

    // 绑定眼睛按钮事件
    function bindEyeBtn() {
      console.log('bindEyeBtn called');
      const eyeBtn = document.getElementById('eyeBtn');
      console.log('eyeBtn:', eyeBtn);
      const keyphrase = document.getElementById('keyphrase');
      console.log('keyphrase:', keyphrase);
      if (eyeBtn && keyphrase) {
        const eyeOpen = eyeBtn.querySelector('.eye-open');
        const eyeClosed = eyeBtn.querySelector('.eye-closed');
        console.log('eyeOpen:', eyeOpen);
        console.log('eyeClosed:', eyeClosed);
        console.log('Adding click event listener to eyeBtn');
        eyeBtn.addEventListener('click', function(e) {
          console.log('eyeBtn click event fired');
          console.log('Event target:', e.target);
          console.log('Event currentTarget:', e.currentTarget);
          const isPassword = keyphrase.type === 'password';
          console.log('isPassword:', isPassword);
          keyphrase.type = isPassword ? 'text' : 'password';
          console.log('keyphrase.type:', keyphrase.type);
          if (eyeOpen) {
            eyeOpen.style.display = isPassword ? 'none' : '';
            console.log('eyeOpen.style.display:', eyeOpen.style.display);
          }
          if (eyeClosed) {
            eyeClosed.style.display = isPassword ? '' : 'none';
            console.log('eyeClosed.style.display:', eyeClosed.style.display);
          }
        });
        console.log('Click event listener added successfully');
      } else {
        console.log('eyeBtn or keyphrase not found');
      }
    }

    // 立即绑定眼睛按钮事件
    bindEyeBtn();

    // Decode bookmark from hash and initialize
    await initBookmark(ec, state);

    // Show sync section when hash params are present
    (function () {
      function hasHashParams() {
        var h = window.location.hash.slice(1).trim();
        return h.length > 0 && h.indexOf('=') !== -1;
      }
      var syncSection = document.getElementById('syncSection');
      var usageSection = document.querySelector('.usage-section');
      var passphraseSection = document.getElementById('passphraseSection');
      if (hasHashParams() && syncSection && usageSection) {
        syncSection.style.display = '';
        usageSection.style.display = 'none';
        if (passphraseSection && !state.G_Input?.private) {
          passphraseSection.style.display = 'block';
          setTimeout(applyComputePrivkeyBtnSquircle, 50);
        }
      }
    })();

    showBuildInfo();
  }

  return { init };
})();
App.init();

initSquircle();
