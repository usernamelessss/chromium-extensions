import { drawIcon } from './icon.js';

const SIZES = [16, 32, 48, 128];
const canvases = SIZES.map((n) => {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  drawIcon(c.getContext('2d'), n);
  const wrap = document.createElement('figure');
  wrap.append(c);
  const cap = document.createElement('figcaption');
  cap.className = 'muted';
  cap.textContent = `${n}×${n}`;
  wrap.append(cap);
  document.querySelector('#preview').append(wrap);
  return c;
});

document.querySelector('#download').addEventListener('click', () => {
  canvases.forEach((c, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = `icon${SIZES[i]}.png`;
      a.click();
    }, i * 300);
  });
});
