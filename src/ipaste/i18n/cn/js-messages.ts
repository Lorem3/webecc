import type { JsMessages } from '../types/messages';

export const jsMessages: JsMessages = {
  errEmptyPhrase: '请输入密码短语',
  errEmptyPubkey: '公钥为空',
  errNeedBookmark: '请重新生成书签地址，从书签地址进入',
  errPubkeyMismatchPhrase: '生成的公钥与书签中保存的公钥不匹配，请检查短语是否正确',
  errEmptyContent: '请输入内容',
  bookmarkHint: '如果你的公钥是通过密码短语派生的，请使用密码短语书签',
  errNeedNformat: '密文格式错误，需要以 N. 开头的加密内容',
  errDecodeBase64: 'Base64 解码失败，密文可能已损坏',
  errDecryptAes: 'AES 解密失败，密码短语可能不正确或密文已损坏',
  errDecryptEc: 'EC 解密失败，密码短语可能不正确',
  historyLoading: '加载中...',
  historyFetchFailed: '获取历史记录失败',
  historyFetchFailedCors: '无法连接云端（CORS 限制），请通过「云端记录」按钮手动访问',
  historyEmpty: '云端暂无数据',
  emailSubjectDefault: '备份',
  inputDataLabel: '从书签链接带入的信息',
  saveSuccess: '已保存到云端',
  loadSuccess: '已从云端加载',
  loadEmpty: '云端暂无数据',
  bmSavePrivkeyConfirm: '警告：保存私钥后，任何持有此书签链接的人无需密码短语即可解密全部历史内容。请确保妥善保管书签链接。是否继续？',
};
