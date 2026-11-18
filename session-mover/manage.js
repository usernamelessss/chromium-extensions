import { getSnapshots, setSnapshots, encryptJSON, decryptJSON, formatTime, timeAgo, formatSize, initial, faviconUrl, confirmClick } from './lib.js';

const $ = (s) => document.querySelector(s);

function status(el, text, type = '') {
  el.textContent = text;
  el.className = 'status ' + type;
}

/* ---------- 列表 ---------- */

async function render() {
  const snapshots = await getSnapshots();
  $('#total').textContent = snapshots.length;
  const $groups = $('#groups');
  $groups.innerHTML = '';
  if (!snapshots.length) {
    $groups.innerHTML = '<div class="empty">还没有保存过账号。打开已登录的网站，点击扩展图标保存。</div>';
    return;
  }

  const byDomain = {};
  for (const s of snapshots) (byDomain[s.domain] ||= []).push(s);

  for (const domain of Object.keys(byDomain).sort()) {
    const list = byDomain[domain].sort((a, b) => b.savedAt - a.savedAt);
    const title = document.createElement('div');
    title.className = 'group-title';
    const icon = document.createElement('img');
    icon.src = faviconUrl(list[0].origin || `https://${domain}/`, 32);
    icon.alt = '';
    const text = document.createElement('span');
    text.textContent = domain;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = list.length;
    title.append(icon, text, count);
    $groups.append(title);

    for (const s of list) {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `
        <div class="avatar"></div>
        <div class="info">
          <input type="text" class="rename">
          <div class="meta"></div>
        </div>
        <div class="btns"><button class="small ghost">删除</button></div>`;

      const $avatar = el.querySelector('.avatar');
      $avatar.textContent = initial(s.name);
      el.querySelector('.meta').textContent =
        `${timeAgo(s.savedAt)}（${formatTime(s.savedAt)}）· ${s.cookies.length} Cookie · localStorage ${Object.keys(s.localStorage).length} 项 · ${formatSize(s)}`;

      const $rename = el.querySelector('.rename');
      $rename.value = s.name;
      $rename.title = '点击修改名称，回车保存';
      $rename.addEventListener('change', async () => {
        const name = $rename.value.trim();
        if (!name || name === s.name) return ($rename.value = s.name);
        const all = await getSnapshots();
        const target = all.find((x) => x.id === s.id);
        if (target) target.name = s.name = name;
        $avatar.textContent = initial(name);
        await setSnapshots(all);
      });
      $rename.addEventListener('keydown', (e) => e.key === 'Enter' && $rename.blur());

      confirmClick(el.querySelector('button'), '确认删除？', async () => {
        await setSnapshots((await getSnapshots()).filter((x) => x.id !== s.id));
      });
      $groups.append(el);
    }
  }
}

/* ---------- 导出 ---------- */

$('#export').addEventListener('click', async () => {
  const $s = $('#export-status');
  const p1 = $('#pwd1').value, p2 = $('#pwd2').value;
  if (p1.length < 8) return status($s, '密码至少 8 位', 'err');
  if (p1 !== p2) return status($s, '两次输入的密码不一致', 'err');
  const snapshots = await getSnapshots();
  if (!snapshots.length) return status($s, '没有可导出的账号', 'err');

  status($s, '正在加密…');
  const file = await encryptJSON({ snapshots, exportedAt: Date.now() }, p1);
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `登录态备份_${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  $('#pwd1').value = $('#pwd2').value = '';
  status($s, `已导出 ${snapshots.length} 个账号`, 'ok');
});

/* ---------- 导入 ---------- */

$('#import').addEventListener('click', async () => {
  const $s = $('#import-status');
  const f = $('#file').files[0];
  const pwd = $('#pwd-in').value;
  if (!f) return status($s, '请选择备份文件', 'err');
  if (!pwd) return status($s, '请输入密码', 'err');

  status($s, '正在解密…');
  try {
    const { snapshots: incoming = [] } = await decryptJSON(JSON.parse(await f.text()), pwd);
    const all = await getSnapshots();
    let added = 0, updated = 0, skipped = 0;
    for (const s of incoming) {
      const i = all.findIndex((x) => x.id === s.id);
      if (i < 0) { all.push(s); added++; }
      else if (s.savedAt > all[i].savedAt) { all[i] = s; updated++; }
      else skipped++;
    }
    await setSnapshots(all);
    $('#pwd-in').value = '';
    status($s, `导入完成：新增 ${added} 个，更新 ${updated} 个，跳过 ${skipped} 个`, 'ok');
  } catch (e) {
    status($s, e instanceof SyntaxError ? '文件格式不正确' : e.message, 'err');
  }
});

render();
chrome.storage.onChanged.addListener((changes) => changes.snapshots && render());
