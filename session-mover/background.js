// 保存、恢复、撤销都在后台完成，弹窗关掉也不会中断
import { getSnapshots, setSnapshots, getUndo, setUndo, clearUndo, originOf, hostMatches } from './lib.js';
import { applyToolbarIcon } from './icon.js';

applyToolbarIcon();
chrome.runtime.onInstalled.addListener(applyToolbarIcon);
chrome.runtime.onStartup.addListener(applyToolbarIcon);

/* ---------- localStorage ---------- */

async function readLocalStorage(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          data[k] = localStorage.getItem(k);
        }
        return data;
      },
    });
    return res?.result ?? null;
  } catch {
    return null; // 商店页、浏览器内置页等不允许注入
  }
}

async function writeLocalStorage(tabId, data) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (d) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
    },
    args: [data],
  });
}

/* ---------- Cookie ---------- */

function cookieUrl(c) {
  return (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path;
}

async function clearCookies(domain) {
  const list = await chrome.cookies.getAll({ domain });
  await Promise.all(list.map((c) =>
    chrome.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId }).catch(() => {})
  ));
}

async function setCookies(cookies) {
  const now = Date.now() / 1000;
  let ok = 0, fail = 0, expired = 0;
  for (const c of cookies) {
    if (!c.session && c.expirationDate && c.expirationDate < now) {
      expired++;
      continue;
    }
    const details = {
      url: cookieUrl(c),
      name: c.name,
      value: c.value,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
    };
    if (!c.hostOnly) details.domain = c.domain;
    if (!c.session && c.expirationDate) details.expirationDate = c.expirationDate;
    try {
      (await chrome.cookies.set(details)) ? ok++ : fail++;
    } catch {
      fail++;
    }
  }
  return { ok, fail, expired };
}

/* ---------- 抓取与应用 ---------- */

async function capture(domain, tab) {
  const cookies = await chrome.cookies.getAll({ domain });
  const origin = originOf(tab.url);
  let ls = null;
  if (origin && hostMatches(new URL(origin).hostname, domain)) {
    ls = await readLocalStorage(tab.id);
  }
  return { domain, origin: ls ? origin : null, cookies, localStorage: ls || {} };
}

function waitComplete(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeout);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') done();
    }
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function applyState(state, tabId) {
  await clearCookies(state.domain);
  const result = await setCookies(state.cookies);

  // localStorage 按来源（协议+域名+端口）保存，需要在对应页面里写入
  result.lsWritten = false;
  if (state.origin) {
    const tab = await chrome.tabs.get(tabId);
    if (originOf(tab.url) !== state.origin) {
      await chrome.tabs.update(tabId, { url: state.origin });
      await waitComplete(tabId);
    }
    try {
      await writeLocalStorage(tabId, state.localStorage || {});
      result.lsWritten = true;
    } catch {}
  }

  await chrome.tabs.reload(tabId);
  return result;
}

/* ---------- 命令 ---------- */

const handlers = {
  async save({ tabId, domain, name }) {
    const tab = await chrome.tabs.get(tabId);
    const state = await capture(domain, tab);
    if (!state.cookies.length && !Object.keys(state.localStorage).length) {
      throw new Error('没有找到可保存的登录数据，请确认已登录');
    }
    const snapshots = await getSnapshots();
    snapshots.push({ id: crypto.randomUUID(), name, savedAt: Date.now(), ...state });
    await setSnapshots(snapshots);
    return { cookies: state.cookies.length, ls: Object.keys(state.localStorage).length };
  },

  // 用当前登录状态覆盖已有的快照
  async update({ tabId, id }) {
    const snapshots = await getSnapshots();
    const s = snapshots.find((x) => x.id === id);
    if (!s) throw new Error('快照不存在');
    const tab = await chrome.tabs.get(tabId);
    Object.assign(s, await capture(s.domain, tab), { savedAt: Date.now() });
    await setSnapshots(snapshots);
    return { cookies: s.cookies.length, ls: Object.keys(s.localStorage).length };
  },

  async restore({ tabId, id }) {
    const s = (await getSnapshots()).find((x) => x.id === id);
    if (!s) throw new Error('快照不存在');
    const tab = await chrome.tabs.get(tabId);
    // 先备份当前状态，用于撤销
    await setUndo({ ...(await capture(s.domain, tab)), at: Date.now(), from: s.name });
    return applyState(s, tabId);
  },

  // 只清除本地的登录数据，不通知网站，已保存的登录态在服务器端仍然有效
  async clear({ tabId, domain }) {
    const tab = await chrome.tabs.get(tabId);
    const current = await capture(domain, tab);
    await setUndo({ ...current, at: Date.now(), from: '清空前' });
    return applyState({ domain, origin: current.origin, cookies: [], localStorage: {} }, tabId);
  },

  async undo({ tabId, domain }) {
    const undo = await getUndo();
    if (!undo || undo.domain !== domain) throw new Error('没有可撤销的操作');
    const result = await applyState(undo, tabId);
    await clearUndo();
    return result;
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = handlers[msg.cmd];
  if (!fn) return false;
  fn(msg)
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
});
