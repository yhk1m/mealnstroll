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

// Longest-match @mention parser. Returns segments so URLs inside the text portions
// can still be linkified separately.
function parseMentions(text, names, myName) {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const result = [];
  let i = 0;
  let buffer = '';
  while (i < text.length) {
    const c = text[i];
    const prev = i === 0 ? '' : text[i - 1];
    const isBoundary = i === 0 || /[\s(\[「『【]/.test(prev);
    if (c === '@' && isBoundary) {
      let matched = null;
      for (const n of sorted) {
        if (n && text.startsWith(n, i + 1)) { matched = n; break; }
      }
      if (matched) {
        if (buffer) { result.push({ type: 'text', value: buffer }); buffer = ''; }
        result.push({ type: 'mention', name: matched, mine: !!myName && matched === myName });
        i += 1 + matched.length;
        continue;
      }
    }
    buffer += c;
    i++;
  }
  if (buffer) result.push({ type: 'text', value: buffer });
  return result;
}

function renderMessageBody(el, text, names, myName) {
  const segments = parseMentions(text, names, myName);
  for (const seg of segments) {
    if (seg.type === 'mention') {
      const span = document.createElement('span');
      span.className = 'mention' + (seg.mine ? ' mine' : '');
      span.textContent = '@' + seg.name;
      el.appendChild(span);
    } else {
      linkifyInto(el, seg.value);
    }
  }
}

function hasMentionOfMe(text, names, myName) {
  if (!myName) return false;
  const segs = parseMentions(text, names, myName);
  return segs.some(s => s.type === 'mention' && s.mine);
}

export function createChatUI({ listEl, formEl, inputEl, onSubmit, getUsers, getMyName }) {
  // ---------- mention autocomplete ----------
  formEl.style.position = 'relative';
  const popup = document.createElement('div');
  popup.className = 'mention-popup';
  popup.hidden = true;
  formEl.appendChild(popup);

  let mentionState = null; // { start, end, query, items, selectedIdx }

  function closePopup() {
    if (popup.hidden) return;
    popup.hidden = true;
    popup.innerHTML = '';
    mentionState = null;
  }

  // Walk backwards from the cursor looking for an '@' that starts a mention context.
  function findActiveMention() {
    const pos = inputEl.selectionStart;
    if (pos == null) return null;
    const val = inputEl.value;
    let i = pos - 1;
    while (i >= 0) {
      const ch = val[i];
      if (/\s/.test(ch)) return null;
      if (ch === '@') {
        const prev = i === 0 ? '' : val[i - 1];
        if (i === 0 || /\s/.test(prev)) {
          const query = val.slice(i + 1, pos);
          if (/\s/.test(query)) return null;
          return { start: i, end: pos, query };
        }
        return null;
      }
      i--;
    }
    return null;
  }

  function renderPopup() {
    if (!mentionState) { closePopup(); return; }
    popup.innerHTML = '';
    let selectedEl = null;
    mentionState.items.forEach((u, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSel = i === mentionState.selectedIdx;
      btn.className = 'mention-item' + (isSel ? ' selected' : '');
      const emo = document.createElement('span');
      emo.className = 'mention-emoji';
      emo.textContent = u.emoji || '🙂';
      const nm = document.createElement('span');
      nm.className = 'mention-name';
      nm.textContent = u.name;
      btn.append(emo, nm);
      // mousedown (not click) so we fire before the input's blur closes the popup
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); selectMention(i); });
      // Move highlight when hovering so keyboard + mouse stay in sync
      btn.addEventListener('mousemove', () => {
        if (mentionState && mentionState.selectedIdx !== i) {
          mentionState.selectedIdx = i;
          renderPopup();
        }
      });
      popup.appendChild(btn);
      if (isSel) selectedEl = btn;
    });
    popup.hidden = false;
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }

  function updateMention() {
    if (typeof getUsers !== 'function') return;
    const m = findActiveMention();
    if (!m) { closePopup(); return; }
    const myName = typeof getMyName === 'function' ? getMyName() : null;
    const q = m.query.toLowerCase();
    const seen = new Set();
    const users = getUsers()
      .filter(u => u && u.name && u.name !== myName)
      .filter(u => { if (seen.has(u.name)) return false; seen.add(u.name); return true; });
    const matches = (q
      ? users.filter(u => u.name.toLowerCase().includes(q))
      : users
    ).slice(0, 8);
    if (matches.length === 0) { closePopup(); return; }
    const prevIdx = mentionState?.selectedIdx ?? 0;
    mentionState = {
      start: m.start,
      end: m.end,
      query: m.query,
      items: matches,
      selectedIdx: Math.min(prevIdx, matches.length - 1)
    };
    renderPopup();
  }

  function selectMention(idx) {
    if (!mentionState) return;
    const user = mentionState.items[idx];
    if (!user) return;
    const val = inputEl.value;
    const before = val.slice(0, mentionState.start);
    const after = val.slice(mentionState.end);
    const insert = '@' + user.name + ' ';
    inputEl.value = before + insert + after;
    const cursor = before.length + insert.length;
    inputEl.setSelectionRange(cursor, cursor);
    closePopup();
    inputEl.focus();
  }

  inputEl.addEventListener('input', updateMention);
  inputEl.addEventListener('click', updateMention);
  inputEl.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateMention();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (popup.hidden || !mentionState) return;
    const len = mentionState.items.length;
    // Arrows/Escape must work even during Korean IME composition so the user
    // can navigate the popup while still in a composing state.
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      mentionState.selectedIdx = (mentionState.selectedIdx + 1) % len;
      renderPopup();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      mentionState.selectedIdx = (mentionState.selectedIdx - 1 + len) % len;
      renderPopup();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePopup();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing && e.keyCode !== 229) {
      // Skip Enter during IME so Korean composition can finalize first.
      e.preventDefault();
      selectMention(mentionState.selectedIdx);
    }
  });
  inputEl.addEventListener('blur', () => {
    // Defer so popup mousedown handlers can run first.
    setTimeout(closePopup, 120);
  });

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    onSubmit(text);
    inputEl.value = '';
    closePopup();
  });

  function append(item) {
    const li = document.createElement('li');
    if (item.system) {
      li.className = 'system';
      li.textContent = item.text;
    } else {
      const names = typeof getUsers === 'function'
        ? getUsers().map(u => u.name).filter(Boolean)
        : [];
      const myName = typeof getMyName === 'function' ? getMyName() : null;
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
      renderMessageBody(text, item.text, names, myName);
      li.append(header, text);
      if (!item.self && hasMentionOfMe(item.text, names, myName)) {
        li.classList.add('mentioned-me');
      }
    }
    listEl.append(li);
    while (listEl.children.length > MAX_LOG) listEl.removeChild(listEl.firstChild);
    listEl.scrollTop = listEl.scrollHeight;
  }

  return { append };
}
