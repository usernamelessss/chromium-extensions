// 公共函数：域名处理、存储、加密

// 常见的二级后缀，主域名要多取一段
const MULTI_SUFFIX = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'com.hk', 'com.tw', 'com.mo', 'co.uk', 'org.uk', 'co.jp', 'ne.jp', 'or.jp',
  'com.au', 'co.kr', 'com.sg', 'com.br', 'co.in',
  'github.io', 'gitlab.io', 'vercel.app', 'pages.dev', 'netlify.app', 'workers.dev',
]);

export function baseDomain(host) {
  if (!host || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join('.');
  return MULTI_SUFFIX.has(last2) ? parts.slice(-3).join('.') : last2;
}

// 只处理 http/https 页面
export function originOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
}

export function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

// 浏览器缓存的网站图标
export function faviconUrl(pageUrl, size = 32) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', size);
  return u.toString();
}

/* ---------- 存储 ---------- */

export async function getSnapshots() {
  const { snapshots = [] } = await chrome.storage.local.get('snapshots');
  return snapshots;
}

export async function setSnapshots(snapshots) {
  await chrome.storage.local.set({ snapshots });
}

export async function getUndo() {
  const { undo = null } = await chrome.storage.local.get('undo');
  return undo;
}

export async function setUndo(undo) {
  await chrome.storage.local.set({ undo });
}

export async function clearUndo() {
  await chrome.storage.local.remove('undo');
}

/* ---------- 加密（PBKDF2 + AES-GCM） ---------- */

const APP_ID = 'session-mover';
const ITERATIONS = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return {
    app: APP_ID,
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(data),
  };
}

export async function decryptJSON(file, password) {
  if (!file || file.app !== APP_ID) throw new Error('这不是本扩展导出的备份文件');
  const key = await deriveKey(password, fromB64(file.salt), file.iter || ITERATIONS);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, key, fromB64(file.data));
  } catch {
    throw new Error('密码错误，或文件已损坏');
  }
  return JSON.parse(dec.decode(plain));
}

/* ---------- 显示 ---------- */

export function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

// 刚刚 / 5 分钟前 / 3 天前，超过 30 天显示日期
export function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

export function formatSize(snapshot) {
  const n = JSON.stringify(snapshot).length;
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
}

// 头像文字：取名称第一个字符
export function initial(name) {
  return [...(name || '?').trim()][0] || '?';
}

// 两次点击确认：第一次变成提示文字，3 秒内再点才执行
export function confirmClick(btn, label, fn) {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) {
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.label;
      btn.classList.remove('danger');
      fn();
      return;
    }
    btn.dataset.label = btn.textContent;
    btn.dataset.armed = '1';
    btn.textContent = label;
    btn.classList.add('danger');
    setTimeout(() => {
      if (!btn.isConnected || !btn.dataset.armed) return;
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.label;
      btn.classList.remove('danger');
    }, 3000);
  });
}
