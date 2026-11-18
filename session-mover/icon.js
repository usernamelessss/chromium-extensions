// 图标：青绿色圆角方块 + 白色双向箭头（切换 / 搬运）
// 用代码画出来，不需要图片文件

export function drawIcon(ctx, size) {
  const s = size;
  ctx.clearRect(0, 0, s, s);

  // 背景：圆角方块 + 渐变
  const r = s * 0.22;
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#2fb594');
  g.addColorStop(1, '#0e7c66');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(s, 0, s, s, r);
  ctx.arcTo(s, s, 0, s, r);
  ctx.arcTo(0, s, 0, 0, r);
  ctx.arcTo(0, 0, s, 0, r);
  ctx.closePath();
  ctx.fill();

  // 双向箭头
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.5, s * 0.095);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const l = s * 0.26, rr = s * 0.74, head = s * 0.13;
  const y1 = s * 0.37, y2 = s * 0.63;

  ctx.beginPath();
  // 上：向右
  ctx.moveTo(l, y1); ctx.lineTo(rr, y1);
  ctx.moveTo(rr - head, y1 - head); ctx.lineTo(rr, y1); ctx.lineTo(rr - head, y1 + head);
  // 下：向左
  ctx.moveTo(rr, y2); ctx.lineTo(l, y2);
  ctx.moveTo(l + head, y2 - head); ctx.lineTo(l, y2); ctx.lineTo(l + head, y2 + head);
  ctx.stroke();
}

export function iconImageData(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawIcon(ctx, size);
  return ctx.getImageData(0, 0, size, size);
}

// 工具栏图标
export function applyToolbarIcon() {
  const imageData = {};
  for (const n of [16, 32, 48]) imageData[n] = iconImageData(n);
  return chrome.action.setIcon({ imageData }).catch(() => {});
}
