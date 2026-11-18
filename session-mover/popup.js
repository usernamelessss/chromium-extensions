import { baseDomain, originOf, faviconUrl, getSnapshots, setSnapshots, getUndo, formatTime, timeAgo, formatSize, initial, confirmClick } from './lib.js';

const $ = (s) => document.querySelector(s);
const $domain = $('#domain');
const $name = $('#name');
const $list = $('#list');
const $status = $('#status');
const $undo = $('#undo');

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const origin = originOf(tab?.url || '');

function status(text, type = '') {
  $status.textContent = text;
  $status.className = 'status ' + type;
}

function send(msg) {
  return chrome.runtime.sendMessage({ tabId: tab.id, ...msg });
}

function domain() {
  return $domain.value.trim().replace(/^\./, '').toLowerCase();
}

async function render() {
  const d = domain();
  const list = (await getSnapshots()).filter((s) => s.domain === d).sort((a, b) => b.savedAt - a.savedAt);
  $name.placeholder = `起个名字，如：账号 ${list.length + 1}`;
  $('#count').textContent = list.length;

  $list.innerHTML = '';
  if (!list.length) {
    $list.innerHTML = '<div class="empty">这个网站还没有保存过账号<br>登录后点上面的「保存当前登录」</div>';
  }
  for (const s of list) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div class="avatar"></div>
      <div class="info">
        <div class="name"></div>
        <div class="meta"></div>
      </div>
      <div class="btns">
        <button class="small primary" data-act="restore">切换</button>
        <button class="small ghost" data-act="update" title="用当前登录状态覆盖这个账号">更新</button>
        <button class="small ghost" data-act="delete" title="删除">✕</button>
      </div>`;
    el.querySelector('.avatar').textContent = initial(s.name);
    el.querySelector('.name').textContent = s.name;
    const $meta = el.querySelector('.meta');
    $meta.textContent = `${timeAgo(s.savedAt)} · ${s.cookies.length} Cookie · ${formatSize(s)}`;
    $meta.title = `保存于 ${formatTime(s.savedAt)}\nlocalStorage ${Object.keys(s.localStorage).length} 项`;

    confirmClick(el.querySelector('[data-act="restore"]'), '确认？', async () => {
      status('正在切换…');
      const r = await send({ cmd: 'restore', id: s.id });
      if (!r.ok) return status(r.error, 'err');
      const extra = [r.fail && `${r.fail} 个写入失败`, r.expired && `${r.expired} 个已过期`].filter(Boolean).join('，');
      status(`已切换到「${s.name}」，页面已刷新${extra ? '（' + extra + '）' : ''}`, 'ok');
      renderUndo();
    });
    confirmClick(el.querySelector('[data-act="update"]'), '覆盖？', async () => {
      const r = await send({ cmd: 'update', id: s.id });
      r.ok ? status(`已更新「${s.name}」`, 'ok') : status(r.error, 'err');
      render();
    });
    confirmClick(el.querySelector('[data-act="delete"]'), '删除？', async () => {
      await setSnapshots((await getSnapshots()).filter((x) => x.id !== s.id));
      status(`已删除「${s.name}」`);
      render();
    });
    $list.append(el);
  }
}

async function renderUndo() {
  const undo = await getUndo();
  const show = undo && undo.domain === domain();
  $undo.hidden = !show;
  if (show) $undo.title = `回到「${undo.from}」之前的状态（${formatTime(undo.at)}）`;
}

/* ---------- 初始化 ---------- */

$('#open-manage').addEventListener('click', () => chrome.runtime.openOptionsPage());

if (!origin) {
  $domain.disabled = $name.disabled = $('#save').disabled = $('#clear').disabled = true;
  $domain.value = '当前页面不支持';
  $('#favicon').hidden = true;
  $list.innerHTML = '<div class="empty">当前页面不是普通网页，无法保存<br>可以点右上角管理已保存的账号</div>';
} else {
  $domain.value = baseDomain(new URL(origin).hostname);
  $('#favicon').src = faviconUrl(tab.url, 32);
  $domain.addEventListener('change', () => { render(); renderUndo(); });

  $('#save').addEventListener('click', async () => {
    const d = domain();
    if (!d) return status('请填写域名', 'err');
    const count = (await getSnapshots()).filter((s) => s.domain === d).length;
    const name = $name.value.trim() || `账号 ${count + 1}`;
    status('正在保存…');
    const r = await send({ cmd: 'save', domain: d, name });
    if (!r.ok) return status(r.error, 'err');
    $name.value = '';
    status(`已保存「${name}」：${r.cookies} 个 Cookie，localStorage ${r.ls} 项`, 'ok');
    render();
  });
  $name.addEventListener('keydown', (e) => e.key === 'Enter' && $('#save').click());

  confirmClick($('#clear'), '确认清空？', async () => {
    status('正在清空…');
    const r = await send({ cmd: 'clear', domain: domain() });
    r.ok ? status('已清空本地登录，现在可以登录另一个账号了', 'ok') : status(r.error, 'err');
    renderUndo();
  });

  confirmClick($undo, '确认撤销？', async () => {
    const r = await send({ cmd: 'undo', domain: domain() });
    r.ok ? status('已撤销，回到之前的登录状态', 'ok') : status(r.error, 'err');
    renderUndo();
  });

  render();
  renderUndo();
}
