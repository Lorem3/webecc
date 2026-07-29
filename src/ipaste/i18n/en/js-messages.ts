import type { JsMessages } from '../types/messages';

export const jsMessages: JsMessages = {
  errEmptyPhrase: 'Please enter a passphrase',
  errEmptyPubkey: 'Public key is empty',
  errNeedBookmark: 'Please regenerate the bookmark link and open from it',
  errPubkeyMismatchPhrase: 'Generated public key does not match the bookmark. Check your passphrase.',
  errEmptyContent: 'Please enter content',
  bookmarkHint: 'If your public key is derived from a passphrase, use the passphrase bookmark',
  errNeedNformat: 'Invalid ciphertext format, expected N. prefix',
  errDecodeBase64: 'Base64 decode failed, ciphertext may be corrupted',
  errDecryptAes: 'AES decryption failed, wrong passphrase or corrupted ciphertext',
  errDecryptEc: 'EC decryption failed, wrong passphrase',
  historyLoading: 'Loading...',
  historyFetchFailed: 'Failed to fetch history',
  historyFetchFailedCors: 'Cannot reach cloud (CORS blocked), use "Cloud Records" button to access manually',
  historyEmpty: 'No data on cloud',
  emailSubjectDefault: 'Backup',
  inputDataLabel: 'Info from bookmark link',
  saveSuccess: 'Saved to cloud',
  loadSuccess: 'Loaded from cloud',
  loadEmpty: 'No data on cloud',
  bmSavePrivkeyConfirm: 'Warning: With the private key saved, anyone who has this bookmark link can decrypt all history without a passphrase. Please keep your bookmark safe. Continue?',
};
