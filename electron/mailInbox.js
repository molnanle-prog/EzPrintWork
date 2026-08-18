const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const PRESETS = {
  gmail: { host: 'imap.gmail.com', port: 993, secure: true, mailbox: 'INBOX' },
  naver: { host: 'imap.naver.com', port: 993, secure: true, mailbox: 'INBOX' },
  daum: { host: 'imap.daum.net', port: 993, secure: true, mailbox: 'INBOX' },
  outlook: { host: 'outlook.office365.com', port: 993, secure: true, mailbox: 'INBOX' },
};

function configPath() {
  return path.join(app.getPath('userData'), 'mail-inbox.json');
}

function imapResponseText(err) {
  const parts = [];
  if (err?.responseText) parts.push(String(err.responseText));
  const attrs = err?.response?.attributes;
  if (Array.isArray(attrs)) {
    for (const a of attrs) {
      if (a && a.type === 'TEXT' && a.value) parts.push(String(a.value).trim());
    }
  }
  if (err?.executedCommand) parts.push(String(err.executedCommand));
  return parts.filter(Boolean).join(' ');
}

function normalizeMailUser(user) {
  return String(user || '').trim();
}

function normalizeMailPassword(pass) {
  return String(pass || '').replace(/\s+/g, '').trim();
}

function isGmailHost(host) {
  return /gmail\.com/i.test(String(host || ''));
}

function mapImapError(err, hostHint) {
  const host = hostHint || readStore()?.host || '';
  const raw = `${err?.message || ''} ${imapResponseText(err)} ${err?.code || ''}`;
  const m = raw.replace(/\s+/g, ' ').trim();
  const authFail = /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|AUTHENTICATE|\[AUTHENTICATIONFAILED\]|Application-specific password|app password|웹로그인|web login|Command failed/i.test(m);
  if (authFail && isGmailHost(host)) {
    return (
      'Gmail은 평소 쓰는 로그인 비밀번호로는 연결되지 않습니다.\n\n' +
      '1) Google 계정에서 2단계 인증을 켭니다.\n' +
      '2) 앱 비밀번호를 새로 만듭니다. (메일용, 16자리)\n' +
      '3) 화면에 띄어쓰기가 있어도 그대로 붙여 넣으면 됩니다.\n\n' +
      '만드는 곳: https://myaccount.google.com/apppasswords'
    );
  }
  if (/AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|AUTHENTICATE|\[AUTHENTICATIONFAILED\]/i.test(m)) {
    return '로그인에 실패했습니다. 이메일과 IMAP/앱 비밀번호를 확인해 주세요. 네이버·다음은 메일 설정에서 IMAP을 먼저 켜야 합니다.';
  }
  if (/ENOTFOUND|getaddrinfo/i.test(m)) return '메일 서버 주소를 찾을 수 없습니다.';
  if (/ETIMEOUT|ETIMEDOUT|Socket timeout|timed out|GREETING_TIMEOUT|CONNECT_TIMEOUT/i.test(m)) {
    return '메일 서버 연결 시간이 지났습니다. 인터넷, 방화벽, 메일 IMAP 사용 설정을 확인해 주세요.';
  }
  if (/ECONNREFUSED/i.test(m)) return '메일 서버가 연결을 거부했습니다. 호스트·포트를 확인해 주세요.';
  if (/certificate|CERT_/i.test(m)) return '보안 인증서 오류입니다. 서버 주소를 확인해 주세요.';
  if (/Command failed/i.test(m)) {
    return '메일 서버가 연결을 거부했습니다. IMAP 사용이 켜져 있는지, 이메일·앱 비밀번호가 맞는지 확인해 주세요.';
  }
  return (m || '메일함 연결에 실패했습니다.').slice(0, 280);
}

function isBenignImapSocketError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === 'ETIMEOUT' || /Socket timeout/i.test(msg);
}

function attachClientGuards(client) {
  if (!client) return;
  client.on('error', (err) => {
    if (isBenignImapSocketError(err)) return;
    console.warn('[mailInbox]', err && err.message);
  });
}

function closeQuietly(client) {
  if (!client) return;
  try {
    attachClientGuards(client);
  } catch {
    /* ignore */
  }
  try {
    if (typeof client.close === 'function') client.close();
  } catch {
    /* ignore */
  }
  try {
    if (client.socket && !client.socket.destroyed) client.socket.destroy();
  } catch {
    /* ignore */
  }
}

function htmlToPlain(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function formatAddressList(list) {
  if (!Array.isArray(list) || !list.length) return '';
  return list
    .map((a) => {
      const addr = a.address || '';
      const name = (a.name || '').trim();
      if (name && addr) return `${name} <${addr}>`;
      return name || addr;
    })
    .filter(Boolean)
    .join(', ');
}

function readStore() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStore(data) {
  fs.writeFileSync(configPath(), JSON.stringify(data, null, 2), 'utf8');
}

function decryptPassword(store) {
  if (!store?.passwordEnc) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('이 PC에서 암호를 안전하게 읽을 수 없습니다.');
  }
  return safeStorage.decryptString(Buffer.from(store.passwordEnc, 'base64'));
}

function publicConfig(store) {
  if (!store) {
    return { configured: false, hasPassword: false, preset: 'gmail', host: '', port: 993, secure: true, user: '', mailbox: 'INBOX' };
  }
  return {
    configured: !!(store.host && store.user),
    hasPassword: !!store.passwordEnc,
    preset: store.preset || 'custom',
    host: store.host || '',
    port: Number(store.port) || 993,
    secure: store.secure !== false,
    user: store.user || '',
    mailbox: store.mailbox || 'INBOX',
  };
}

async function connectClient(store) {
  const password = normalizeMailPassword(decryptPassword(store));
  const user = normalizeMailUser(store.user);
  if (!store?.host || !user || !password) {
    throw new Error('메일함이 연결되지 않았습니다. 회사 정보에서 메일함을 저장해 주세요.');
  }
  const { ImapFlow } = require('imapflow');
  const client = new ImapFlow({
    host: store.host,
    port: Number(store.port) || 993,
    secure: store.secure !== false,
    auth: { user, pass: password },
    logger: false,
    emitLogs: false,
    disableAutoIdle: true,
    greetingTimeout: 20000,
    connectionTimeout: 25000,
    socketTimeout: 120000,
  });
  attachClientGuards(client);
  await client.connect();
  return client;
}

async function withImap(fn) {
  const store = readStore();
  const client = await connectClient(store);
  try {
    return await fn(client, store);
  } finally {
    closeQuietly(client);
  }
}

function setupMailInboxIpc(ipcMain) {
  if (!global.__ezpwImapUncaughtHook) {
    global.__ezpwImapUncaughtHook = true;
    process.on('uncaughtException', (err) => {
      if (isBenignImapSocketError(err)) {
        console.warn('[mailInbox] leftover socket timeout ignored');
        return;
      }
      console.error(err);
      try {
        const { dialog, app } = require('electron');
        if (app.isReady()) {
          dialog.showErrorBox(
            'A JavaScript error occurred in the main process',
            String((err && (err.stack || err.message)) || err)
          );
        }
      } catch {
        /* ignore */
      }
    });
  }
  ipcMain.handle('mail-inbox-get', async () => {
    try {
      return { ok: true, ...publicConfig(readStore()) };
    } catch (err) {
      return { ok: false, error: mapImapError(err) };
    }
  });

  ipcMain.handle('mail-inbox-save', async (_event, payload = {}) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, error: '이 PC에서는 메일 암호를 안전하게 저장할 수 없습니다.' };
      }
      const presetKey = String(payload.preset || 'custom');
      const preset = PRESETS[presetKey] || {};
      const host = String(payload.host || preset.host || '').trim();
      const user = normalizeMailUser(payload.user);
      const port = Number(payload.port || preset.port || 993) || 993;
      const secure = payload.secure !== false;
      const mailbox = String(payload.mailbox || preset.mailbox || 'INBOX').trim() || 'INBOX';
      if (!host || !user) {
        return { ok: false, error: '메일 서버와 이메일 주소를 입력해 주세요.' };
      }
      const prev = readStore() || {};
      let passwordEnc = prev.passwordEnc || '';
      const nextPassword = normalizeMailPassword(payload.password);
      if (nextPassword) {
        passwordEnc = safeStorage.encryptString(nextPassword).toString('base64');
      }
      if (!passwordEnc) {
        return { ok: false, error: '앱 비밀번호를 입력해 주세요.' };
      }
      writeStore({
        preset: PRESETS[presetKey] ? presetKey : 'custom',
        host,
        port,
        secure,
        user,
        mailbox,
        passwordEnc,
      });
      return { ok: true, ...publicConfig(readStore()) };
    } catch (err) {
      return { ok: false, error: mapImapError(err) };
    }
  });

  ipcMain.handle('mail-inbox-clear', async () => {
    try {
      const file = configPath();
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return { ok: true, ...publicConfig(null) };
    } catch (err) {
      return { ok: false, error: mapImapError(err) };
    }
  });

  ipcMain.handle('mail-inbox-test', async () => {
    try {
      const info = await withImap(async (client, store) => {
        const lock = await client.getMailboxLock(store.mailbox || 'INBOX');
        try {
          return { exists: client.mailbox?.exists || 0 };
        } finally {
          lock.release();
        }
      });
      return { ok: true, message: `연결되었습니다. 받은편지함 ${info.exists}통.` };
    } catch (err) {
      return { ok: false, error: mapImapError(err) };
    }
  });

  ipcMain.handle('mail-inbox-list', async (_event, payload = {}) => {
    const limit = Math.min(80, Math.max(10, Number(payload.limit) || 40));
    try {
      const messages = await withImap(async (client, store) => {
        const lock = await client.getMailboxLock(store.mailbox || 'INBOX');
        try {
          const exists = client.mailbox?.exists || 0;
          if (!exists) return [];
          const start = Math.max(1, exists - limit + 1);
          const rows = [];
          for await (const msg of client.fetch(`${start}:${exists}`, { envelope: true, uid: true })) {
            const env = msg.envelope || {};
            rows.push({
              uid: msg.uid,
              from: formatAddressList(env.from),
              subject: env.subject || '(제목 없음)',
              date: env.date ? new Date(env.date).toISOString() : null,
            });
          }
          rows.sort((a, b) => (b.uid || 0) - (a.uid || 0));
          return rows;
        } finally {
          lock.release();
        }
      });
      return { ok: true, messages };
    } catch (err) {
      return { ok: false, error: mapImapError(err), messages: [] };
    }
  });

  ipcMain.handle('mail-inbox-read', async (_event, payload = {}) => {
    const uid = Number(payload.uid);
    if (!uid) return { ok: false, error: '메일을 선택해 주세요.' };
    try {
      const { simpleParser } = require('mailparser');
      const mail = await withImap(async (client, store) => {
        const lock = await client.getMailboxLock(store.mailbox || 'INBOX');
        try {
          const downloaded = await client.download(uid, undefined, { uid: true });
          if (!downloaded?.content) {
            throw new Error('메일 본문을 가져오지 못했습니다.');
          }
          const parsed = await simpleParser(downloaded.content);
          const body =
            String(parsed.text || '').trim() ||
            htmlToPlain(parsed.html || '');
          const parts = [];
          if (parsed.subject) parts.push(`제목: ${parsed.subject}`);
          if (parsed.from?.text) parts.push(`보낸사람: ${parsed.from.text}`);
          if (parsed.date) parts.push(`날짜: ${parsed.date.toLocaleString('ko-KR')}`);
          parts.push('');
          parts.push(body);
          return {
            uid,
            from: parsed.from?.text || '',
            to: parsed.to?.text || '',
            subject: parsed.subject || '(제목 없음)',
            date: parsed.date ? parsed.date.toISOString() : null,
            text: parts.join('\n').trim(),
          };
        } finally {
          lock.release();
        }
      });
      return { ok: true, ...mail };
    } catch (err) {
      return { ok: false, error: mapImapError(err) };
    }
  });
}

module.exports = { setupMailInboxIpc, PRESETS };
