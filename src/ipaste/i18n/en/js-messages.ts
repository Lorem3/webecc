import type { JsMessages } from '../types/messages';

export const jsMessages: JsMessages = {
  errEmptyPhrase: 'Please enter a passphrase',
  errEmptyPubkey: 'Public key is empty',
  errNeedBookmark: 'Please regenerate the bookmark link and open from it',
  errPubkeyMismatchPhrase: 'Generated public key does not match the bookmark. Check your passphrase.',
  errEmptyContent: 'Please enter content',
  bookmarkHint: 'If your public key is derived from a passphrase, use the passphrase bookmark',
  emailSubjectDefault: 'Backup',
  inputDataLabel: 'Info from bookmark link',
  saveSuccess: 'Saved to cloud',
  loadSuccess: 'Loaded from cloud',
  loadEmpty: 'No data on cloud',
  bmSavePrivkeyConfirm: 'Warning: With the private key saved, anyone who has this bookmark link can decrypt all history without a passphrase. Please keep your bookmark safe. Continue?',
};
