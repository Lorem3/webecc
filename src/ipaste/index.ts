import { jsMessages as messages } from '@i18n/js-messages';
import { htmlMessages } from '@i18n/html-messages';
import {
  KDF_V2, WEB_PUBLIC, InputData,
  createAppState,
  openUrl, getPlainText, setErrMsg, maskKey, showMaskedPrivkey,
  generateRandomSalt, pbkdf2, generateKey, generateContentKey, aesGcmEncrypt,
  bindCommonButtons, initBookmark, showBuildInfo, initSquircle, applyComputePrivkeyBtnSquircle,
  encryptFileContent, encryptContent, bindFilePaste,
  showFileLocked, hideFileLocked, setResultText, enterFileModeUI,
} from './common';
import { GoogleDriveManager } from './gdrive';

// --- Google Drive ---

const GDRIVE_CLIENT_ID = '181745577501-dj4fpc5lks5seruejnh7ftkvkv4odgit.apps.googleusercontent.com';
let gdrive: GoogleDriveManager | null = null;

function getGDriveManager(): GoogleDriveManager {
  if (!gdrive) {
    gdrive = new GoogleDriveManager(GDRIVE_CLIENT_ID);
  }
  return gdrive;
}

async function bindGoogleDriveSaveBtn(ec: any, state: any) {
  const btn = document.getElementById("saveToGDrive");
  if (!btn) return;

  btn.onclick = async () => {
    const pubkey = state.G_Input?.pubkey;
    const salt = state.G_Input?.salt;
    if (!pubkey || !salt) {
      setErrMsg(messages.errNeedBookmark);
      return;
    }

    try {
      const manager = getGDriveManager();
      setSyncStatus(messages.gdriveLoading || 'Saving...');

      if (state.fileMode && state.fileData) {
        // === File mode ===
        const file = state.fileData;
        const fileBytes = new Uint8Array(await file.arrayBuffer());
        const ciphertext = await encryptFileContent(ec, fileBytes, pubkey, salt);

        // description = JSON with note and ft
        const desc = JSON.stringify({ note: file.name, ft: "F" });
        await manager.saveBackup(ec, file.name, ciphertext, pubkey, salt, desc);
        showFileLocked();
        setSyncStatus(messages.gdriveSaveSuccessFile);
      } else {
        // === Text mode ===
        const plainText = getPlainText()?.trim();
        if (!plainText) {
          setErrMsg(messages.errEmptyContent);
          return;
        }
        const ciphertext = await encryptContent(ec, plainText, pubkey, salt);
        setResultText(ciphertext);
        const descInput = (document.getElementById('gdriveDesc') as HTMLInputElement)?.value?.trim() || '';
        if (!descInput) {
          setErrMsg(messages.gdriveDescRequired);
          return;
        }
        const description = JSON.stringify({ note: descInput, ft: "N" });
        await manager.saveBackup(ec, plainText, ciphertext, pubkey, salt, description);
        setSyncStatus(messages.gdriveSaveSuccess);
      }
    } catch (error) {
      const errMsg = (error as Error).message;
      setErrMsg(errMsg.includes('Google authorization') ? messages.gdriveAuthFailed : `${messages.gdriveSaveFailed}: ${errMsg}`);
    }
  };
}

async function bindGoogleDriveLoadBtn(ec: any, state: any) {
  const btn = document.getElementById("loadFromGDrive");
  if (!btn) return;

  btn.onclick = async () => {
    const pubkey = state.G_Input?.pubkey;
    const salt = state.G_Input?.salt;
    if (!pubkey || !salt) {
      setErrMsg(messages.errNeedBookmark);
      return;
    }

    try {
      const manager = getGDriveManager();
      setSyncStatus(messages.gdriveLoading || 'Loading...');
      const files = await manager.listBackups(pubkey, salt, ec);

      if (files.length === 0) {
        setErrMsg(messages.gdriveNoFiles);
        setSyncStatus('');
        return;
      }

      const selectedFile = await showFilePicker(files);
      if (!selectedFile) {
        setSyncStatus('');
        return;
      }

      const content = await manager.readBackup(selectedFile.id);
      if (content) {
        if (content.startsWith('F.')) {
          // File mode: show lock + decrypt btn
          // Extract note from description for filename
          let fileName = 'decrypted-file';
          try {
            const desc = selectedFile.description || '';
            const obj = JSON.parse(desc);
            if (obj.note) fileName = obj.note;
          } catch {}
          enterFileModeUI(state, fileName);
          setResultText(content);
          hideFileLocked();
          const decryptBtn = document.getElementById("decryptBtn");
          if (decryptBtn) {
            decryptBtn.style.display = '';
            const btnTitle = decryptBtn.querySelector('.btnTitle');
            if (btnTitle) btnTitle.textContent = messages.btnDecryptText;
          }
          setSyncStatus(messages.gdriveLoadSuccessFile);
        } else {
          // Text mode
          setResultText(content);
          setSyncStatus(messages.gdriveLoadSuccess);
        }
      }
    } catch (error) {
      const errMsg = (error as Error).message;
      if (errMsg.includes('canceled') || errMsg.includes('cancel')) {
        setSyncStatus('');
        return;
      }
      setErrMsg(errMsg.includes('Google authorization') ? messages.gdriveAuthFailed : `${messages.gdriveLoadFailed}: ${errMsg}`);
    }
  };
}

function showFilePicker(files: any[]): Promise<any> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#fff;border-radius:12px;padding:1.5rem;max-width:500px;width:90%;max-height:80vh;display:flex;flex-direction:column;';

    const title = document.createElement('h3');
    title.textContent = 'Select a backup file';
    title.style.cssText = 'margin:0 0 1rem;font-size:1rem;color:#333;';

    const select = document.createElement('select');
    select.style.cssText = 'width:100%;padding:0.5rem;font-size:0.875rem;border:1px solid #e3e6ea;border-radius:8px;margin-bottom:1rem;';

    files.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.id;
      const date = new Date(f.modifiedTime);
      const dateStr = date.toLocaleString();
      const desc = f.description || f.name;
      let note = desc;
      try { const obj = JSON.parse(desc); if (obj.note) note = obj.note; } catch {}
      option.textContent = `${note} (${dateStr})`;
      select.appendChild(option);
    });

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.5rem 1rem;border:1px solid #e3e6ea;border-radius:8px;background:#fff;cursor:pointer;font-size:0.875rem;';
    cancelBtn.onclick = () => {
      overlay.remove();
      resolve(null);
    };

    const okBtn = document.createElement('button');
    okBtn.textContent = 'Load';
    okBtn.style.cssText = 'padding:0.5rem 1rem;border:none;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;font-size:0.875rem;';
    okBtn.onclick = () => {
      const selectedId = select.value;
      const selectedFile = files.find((f) => f.id === selectedId);
      overlay.remove();
      resolve(selectedFile || null);
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);

    dialog.appendChild(title);
    dialog.appendChild(select);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}

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

    // Bind file paste and GDrive
    bindFilePaste(ec, state);
    bindGoogleDriveSaveBtn(ec, state);
    bindGoogleDriveLoadBtn(ec, state);

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
