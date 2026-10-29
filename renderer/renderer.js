const MAX = 4;
const panes = new Map(); // id -> { el, term, fit, dot, state, title }
let servers = [];

const grid = document.getElementById('grid');
const emptyEl = document.getElementById('empty');
const addBtn = document.getElementById('add');
const countEl = document.getElementById('count');

// ------------------------------------------------------------ layout
function layout() {
  const n = servers.length;
  grid.style.gridTemplateColumns = n <= 1 ? '1fr' : '1fr 1fr';
  grid.style.gridTemplateRows = n <= 2 ? '1fr' : '1fr 1fr';
  grid.classList.toggle('three', n === 3);
  grid.style.display = n ? 'grid' : 'none';
  emptyEl.style.display = n ? 'none' : 'flex';
  addBtn.disabled = n >= MAX;
  countEl.textContent = `${n} of ${MAX} servers`;
}

const titleOf = (s) => `${s.name}  ${s.username}@${s.host}${s.port && s.port !== 22 ? ':' + s.port : ''}`;

// ------------------------------------------------------------ panes
function createPane(s) {
  const el = document.createElement('div');
  el.className = 'pane';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = titleOf(s);
  const state = document.createElement('span');
  state.className = 'state';
  state.textContent = 'starting';
  const btnEdit = button('Edit');
  const btnReconnect = button('Reconnect');
  const btnRemove = button('Remove', 'danger');
  bar.append(dot, title, state, btnEdit, btnReconnect, btnRemove);

  const termDiv = document.createElement('div');
  termDiv.className = 'term';
  el.append(bar, termDiv);
  grid.appendChild(el);

  const term = new Terminal({
    fontFamily: 'Menlo, Consolas, "Courier New", monospace',
    fontSize: 14,
    cursorBlink: true,
    scrollback: 5000,
    theme: { background: '#1e1e1e' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(termDiv);

  // Copy / paste: Ctrl+C copies when text is selected (otherwise it stays "interrupt"),
  // Ctrl+Shift+C always copies, Ctrl/Cmd+V pastes, right-click copies selection or pastes.
  const doCopy = () => {
    if (term.hasSelection()) { window.api.writeClipboard(term.getSelection()); term.clearSelection(); }
  };
  const doPaste = async () => {
    const text = await window.api.readClipboard();
    if (text) term.paste(text);
  };
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'c' && (term.hasSelection() || e.shiftKey || e.metaKey)) {
      e.preventDefault(); doCopy(); return false;
    }
    if (mod && k === 'v') { e.preventDefault(); doPaste(); return false; }
    return true;
  });
  termDiv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (term.hasSelection()) doCopy(); else doPaste();
  });

  term.onData((data) => window.api.input(s.id, data));
  term.onResize(({ cols, rows }) => window.api.resize(s.id, cols, rows));
  new ResizeObserver(() => { try { fit.fit(); } catch (_) {} }).observe(termDiv);
  termDiv.addEventListener('mousedown', () => term.focus());

  const pane = { el, term, fit, dot, state, title };
  panes.set(s.id, pane);

  btnReconnect.addEventListener('click', () => reconnect(s.id, true));
  btnEdit.addEventListener('click', () => openModal(s.id));
  btnRemove.addEventListener('click', () => removeServer(s.id));

  // wait one frame so the grid has sized the pane, then fit and connect
  requestAnimationFrame(() => {
    try { fit.fit(); } catch (_) {}
    window.api.connect(s.id, term.cols, term.rows);
  });
  return pane;
}

function button(label, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (cls) b.className = cls;
  return b;
}

function reconnect(id, announce) {
  const p = panes.get(id);
  if (!p) return;
  if (announce) p.term.write('\r\n\x1b[33m[reconnecting...]\x1b[0m\r\n');
  try { p.fit.fit(); } catch (_) {}
  window.api.connect(id, p.term.cols, p.term.rows);
  p.term.focus();
}

// Bring the panes in line with a server list returned by the main process.
function applyList(list) {
  const ids = new Set(list.map((s) => s.id));
  for (const [id, p] of [...panes]) {
    if (!ids.has(id)) {
      p.term.dispose();
      p.el.remove();
      panes.delete(id);
    }
  }
  servers = list;
  layout();
  for (const s of list) {
    const p = panes.get(s.id);
    if (p) p.title.textContent = titleOf(s);
    else createPane(s);
  }
}

async function removeServer(id) {
  const s = servers.find((x) => x.id === id);
  if (!s) return;
  if (!confirm(`Remove ${s.name} (${s.username}@${s.host}) from the app?`)) return;
  applyList(await window.api.saveServers(servers.filter((x) => x.id !== id)));
}

// ------------------------------------------------------------ add / edit dialog
const modal = document.getElementById('modal');
const form = document.getElementById('form');
const fName = document.getElementById('fName');
const fHost = document.getElementById('fHost');
const fPort = document.getElementById('fPort');
const fUser = document.getElementById('fUser');
const fPass = document.getElementById('fPass');
const formError = document.getElementById('formError');
let editingId = null;

function openModal(id) {
  editingId = id || null;
  const s = id ? servers.find((x) => x.id === id) : null;
  document.getElementById('formTitle').textContent = s ? `Edit ${s.name}` : 'Add server';
  fName.value = s ? s.name : '';
  fHost.value = s ? s.host : '';
  fPort.value = s ? s.port : 22;
  fUser.value = s ? s.username : '';
  fPass.value = '';
  fPass.placeholder = s ? 'leave blank to keep current' : '';
  formError.textContent = '';
  modal.classList.add('open');
  (s ? fPass : fName).focus();
}

function closeModal() { modal.classList.remove('open'); }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const host = fHost.value.trim();
  const username = fUser.value.trim();
  if (!host || !username) { formError.textContent = 'Host and username are required.'; return; }
  if (!editingId && !fPass.value) { formError.textContent = 'Enter a password.'; return; }
  const entry = {
    name: fName.value.trim() || host,
    host,
    port: parseInt(fPort.value, 10) || 22,
    username,
  };
  if (fPass.value) entry.password = fPass.value;

  let list;
  if (editingId) {
    list = servers.map((s) => (s.id === editingId ? { ...s, ...entry } : s));
  } else {
    if (servers.length >= MAX) { formError.textContent = `Maximum ${MAX} servers.`; return; }
    list = [...servers, entry];
  }
  const savedId = editingId;
  closeModal();
  applyList(await window.api.saveServers(list));
  if (savedId) reconnect(savedId, true); // new panes connect themselves
});

document.getElementById('fCancel').addEventListener('click', closeModal);
modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
addBtn.addEventListener('click', () => openModal(null));

// ------------------------------------------------------------ events from main
window.api.onOut(({ id, data }) => {
  const p = panes.get(id);
  if (p) p.term.write(data);
});

window.api.onStatus(({ id, state, message }) => {
  const p = panes.get(id);
  if (!p) return;
  p.dot.className = `dot ${state}`;
  p.state.textContent = state;
  if (state === 'error') p.term.write(`\r\n\x1b[31m[connection error: ${message}]\x1b[0m\r\n`);
  if (state === 'closed') p.term.write('\r\n\x1b[31m[connection closed]\x1b[0m\r\n');
});

// ------------------------------------------------------------ start
(async () => {
  applyList(await window.api.listServers());
  const first = servers[0] && panes.get(servers[0].id);
  if (first) first.term.focus();
})();
