// © 2026 김용현
import { formatTime } from './utils.js';

const MAX_LOG = 100;
const URL_RE = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const TRAIL_PUNCT = /[.,;:!?)\]}»"']+$/;

function linkifyInto(el, text) {
  let lastIdx = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    let url = m[0];
    const trail = url.match(TRAIL_PUNCT);
    if (trail) {
      url = url.slice(0, -trail[0].length);
      URL_RE.lastIndex -= trail[0].length;
    }
    const start = m.index;
    if (start > lastIdx) el.appendChild(document.createTextNode(text.slice(lastIdx, start)));
    const a = document.createElement('a');
    a.href = url.startsWith('http') ? url : `https://${url}`;
    a.textContent = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    el.appendChild(a);
    lastIdx = start + url.length;
  }
  if (lastIdx < text.length) el.appendChild(document.createTextNode(text.slice(lastIdx)));
}

export function createChatUI({ listEl, formEl, inputEl, onSubmit }) {
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    onSubmit(text);
    inputEl.value = '';
  });

  function append(item) {
    const li = document.createElement('li');
    if (item.system) {
      li.className = 'system';
      li.textContent = item.text;
    } else {
      const header = document.createElement('div');
      header.className = 'msg-header';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = (item.self ? '나 · ' : '') + (item.name || '익명');
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = formatTime(item.at || Date.now());
      header.append(name, time);
      const text = document.createElement('div');
      text.className = 'text';
      linkifyInto(text, item.text);
      li.append(header, text);
    }
    listEl.append(li);
    while (listEl.children.length > MAX_LOG) listEl.removeChild(listEl.firstChild);
    listEl.scrollTop = listEl.scrollHeight;
  }

  return { append };
}
