const vscode = acquireVsCodeApi();
const modal = document.getElementById('settingsModal');
const themeSelect = document.getElementById('themeSelect');
const localeSelect = document.getElementById('localeSelect');
const storageSelect = document.getElementById('storageSelect');
const editModeButton = document.getElementById('editModeButton');
const accountList = document.querySelector('.account-list');
let draggingAccountId = null;
const persistedState = vscode.getState() || {};
let editModeEnabled = Boolean(persistedState.editMode);

function persistState() {
  vscode.setState({ editMode: editModeEnabled });
}

function syncEditModeUi() {
  document.body.classList.toggle('edit-mode', editModeEnabled);
  if (editModeButton) {
    editModeButton.classList.toggle('active', editModeEnabled);
    editModeButton.textContent = editModeEnabled
      ? editModeButton.dataset.labelExit
      : editModeButton.dataset.labelEnter;
  }
  document.querySelectorAll('.account-card').forEach((card) => {
    card.draggable = editModeEnabled;
  });
}

function toggleEditMode() {
  editModeEnabled = !editModeEnabled;
  persistState();
  syncEditModeUi();
}

function send(command, accountId, value) {
  const message = { command };
  if (accountId) {
    message.accountId = accountId;
  }
  if (value) {
    if (command === 'moveAccount') {
      message.direction = value;
    } else {
      message.value = value;
    }
  }
  vscode.postMessage(message);
}

function openSettings() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function applySettings() {
  send('setTheme', null, themeSelect.value);
  send('setLocale', null, localeSelect.value);
  send('setStorageMode', null, storageSelect.value);
  closeSettings();
}

function initDragAndDrop() {
  if (!accountList || accountList.dataset.dragBound === 'true') {
    return;
  }
  accountList.dataset.dragBound = 'true';

  accountList.addEventListener('dragstart', (event) => {
    if (!editModeEnabled) {
      event.preventDefault();
      return;
    }
    const card = event.target.closest('.account-card');
    if (!card) {
      return;
    }
    draggingAccountId = card.dataset.accountId;
    card.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.accountId);
    }
  });

  accountList.addEventListener('dragend', (event) => {
    const card = event.target.closest('.account-card');
    draggingAccountId = null;
    if (card) {
      card.classList.remove('dragging');
    }
    accountList.querySelectorAll('.drop-before, .drop-after').forEach((zone) => zone.classList.remove('drop-before', 'drop-after'));
  });

  accountList.addEventListener('dragenter', (event) => {
    if (!editModeEnabled) {
      return;
    }
    const card = event.target.closest('.account-card');
    if (!card) {
      return;
    }
    event.preventDefault();
    if (!draggingAccountId || draggingAccountId === card.dataset.accountId) {
      return;
    }
    const rect = card.getBoundingClientRect();
    const isBefore = event.clientY < rect.top + rect.height / 2;
    card.classList.toggle('drop-before', isBefore);
    card.classList.toggle('drop-after', !isBefore);
  });

  accountList.addEventListener('dragover', (event) => {
    if (!editModeEnabled) {
      return;
    }
    const card = event.target.closest('.account-card');
    if (card) {
      event.preventDefault();
    }
  });

  accountList.addEventListener('dragleave', (event) => {
    if (!editModeEnabled) {
      return;
    }
    const card = event.target.closest('.account-card');
    if (card) {
      card.classList.remove('drop-before', 'drop-after');
    }
  });

  accountList.addEventListener('drop', (event) => {
    if (!editModeEnabled) {
      return;
    }
    const card = event.target.closest('.account-card');
    if (!card) {
      return;
    }
    event.preventDefault();
    if (!draggingAccountId || draggingAccountId === card.dataset.accountId) {
      return;
    }
    const rect = card.getBoundingClientRect();
    const isBefore = event.clientY < rect.top + rect.height / 2;
    vscode.postMessage({
      command: 'moveAccount',
      accountId: draggingAccountId,
      targetAccountId: card.dataset.accountId,
      placement: isBefore ? 'before' : 'after'
    });
  });
}

function findCard(accountId) {
  return Array.from(document.querySelectorAll('.account-card')).find((card) => card.dataset.accountId === accountId) || null;
}

function setCardLoading(accountId, loading) {
  const card = findCard(accountId);
  if (!card) {
    return;
  }
  card.classList.toggle('refreshing', loading);
  card.dataset.refreshState = loading ? 'loading' : 'idle';
  card.querySelectorAll('button.card-action').forEach((button) => {
    if (button.dataset.allowWhileLoading === 'true') {
      return;
    }
    button.disabled = loading;
  });
}

function syncCardInteractiveState(card) {
  if (!card) {
    return;
  }
  card.draggable = editModeEnabled;
}

function replaceCardHtml(accountId, html) {
  const card = findCard(accountId);
  if (!card) {
    return;
  }
  const fragment = document.createRange().createContextualFragment(html.trim());
  const nextCard = fragment.firstElementChild;
  if (!nextCard) {
    return;
  }
  syncCardInteractiveState(nextCard);
  card.replaceWith(nextCard);
}

modal.addEventListener('click', (event) => {
  if (event.target === modal) closeSettings();
});

window.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.command === 'refresh-start' && message.accountId) {
    setCardLoading(message.accountId, true);
  }
  if (message.command === 'refresh-success' && message.accountId && message.html) {
    replaceCardHtml(message.accountId, message.html);
  }
  if (message.command === 'refresh-error' && message.accountId && message.html) {
    replaceCardHtml(message.accountId, message.html);
  }
  if (message.command === 'refresh-batch-start') {
    document.body.classList.add('refresh-all-running');
  }
  if (message.command === 'refresh-batch-end') {
    document.body.classList.remove('refresh-all-running');
  }
});

syncEditModeUi();
initDragAndDrop();
