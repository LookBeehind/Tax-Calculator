"use strict";

// ============================================================
// FILE INPUT WIRING
// ============================================================
const bnmSlot = document.getElementById('bnm-slot');
const bnmInput = document.getElementById('bnm-input');
const bnmFname = document.getElementById('bnm-fname');

bnmSlot.addEventListener('dragover', e => { e.preventDefault(); bnmSlot.classList.add('dragging'); });
bnmSlot.addEventListener('dragleave', () => bnmSlot.classList.remove('dragging'));
bnmSlot.addEventListener('drop', e => {
    e.preventDefault();
    bnmSlot.classList.remove('dragging');
    if (e.dataTransfer.files.length) handleBNM(e.dataTransfer.files[0]);
});
bnmInput.addEventListener('change', () => {
    if (bnmInput.files.length) handleBNM(bnmInput.files[0]);
});

function handleBNM(file) {
    const reader = new FileReader();
    reader.onload = e => {
        state.bnm = e.target.result;
        state.bnmFilename = file.name;
        bnmSlot.classList.add('has-file');
        bnmFname.textContent = file.name;
        refreshUI();
    };
    reader.readAsArrayBuffer(file);
}

const csvInput = document.getElementById('csv-input');
const addBtn = document.getElementById('add-activity-btn');

addBtn.addEventListener('dragover', e => { e.preventDefault(); addBtn.classList.add('dragging'); });
addBtn.addEventListener('dragleave', () => addBtn.classList.remove('dragging'));
addBtn.addEventListener('drop', e => {
    e.preventDefault();
    addBtn.classList.remove('dragging');
    for (const f of e.dataTransfer.files) handleCSV(f);
});
csvInput.addEventListener('change', () => {
    for (const f of csvInput.files) handleCSV(f);
    csvInput.value = '';  // allow re-selecting same file
});

function handleCSV(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const text = e.target.result;
        let year, nTrades;
        try {
            const rows = parseCSV(text);
            year = detectStatementYear(rows);
            nTrades = countTrades(rows);
        } catch (err) {
            year = null;
            nTrades = 0;
        }
        state.activities.push({
            id: _nextId++,
            filename: file.name,
            csvText: text,
            year: year,
            nTrades: nTrades,
        });
        refreshUI();
    };
    reader.readAsText(file, 'utf-8');
}

document.getElementById('btn-reset').addEventListener('click', () => {
    state.bnm = state.bnmFilename = null;
    state.activities = [];
    state.result = null;
    bnmSlot.classList.remove('has-file');
    bnmFname.textContent = '';
    bnmInput.value = '';
    document.getElementById('results').classList.remove('shown');
    document.getElementById('status').textContent = '';
    document.getElementById('status').className = 'status-bar';
    refreshUI();
});

function removeActivity(id) {
    state.activities = state.activities.filter(a => a.id !== id);
    refreshUI();
}

// ============================================================
// UI REFRESH (upload area)
// ============================================================
function refreshUI() {
    const list = document.getElementById('activity-list');
    list.innerHTML = '';
    // Sort by year (or filename if no year)
    const sorted = [...state.activities].sort((a, b) => {
        if (a.year && b.year) return a.year - b.year;
        if (a.year) return -1;
        if (b.year) return 1;
        return a.filename.localeCompare(b.filename);
    });
    for (const a of sorted) {
        const chip = document.createElement('div');
        chip.className = 'activity-chip';
        const yearLabel = a.year ? a.year : '?';
        const yearClass = a.year ? '' : 'unknown';
        chip.innerHTML = `
      <div class="year-badge ${yearClass}">${yearLabel}</div>
      <div class="fname">${escapeHTML(a.filename)}</div>
      <div class="meta">${a.nTrades} trades</div>
      <button class="remove" title="Remove">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6l-12 12"/></svg>
      </button>
    `;
        chip.querySelector('.remove').addEventListener('click', () => removeActivity(a.id));
        list.appendChild(chip);
    }
    document.getElementById('csv-count').textContent = state.activities.length;
    document.getElementById('upload-meta').textContent =
        `${state.activities.length} activity file${state.activities.length === 1 ? '' : 's'} · BNM ${state.bnm ? 'loaded' : 'pending'}`;
    document.getElementById('btn-compute').disabled = !(state.bnm && state.activities.length > 0);
}

// ============================================================
// BUTTON WIRING
// ============================================================
document.getElementById('btn-compute').addEventListener('click', compute);
document.getElementById('btn-export').addEventListener('click', exportXLSX);

// ============================================================
// HELP MODAL
// ============================================================
const helpOverlay = document.getElementById('help-overlay');

document.getElementById('help-btn').addEventListener('click', () => {
    helpOverlay.classList.add('shown');
});
document.getElementById('help-close').addEventListener('click', () => {
    helpOverlay.classList.remove('shown');
});
helpOverlay.addEventListener('click', e => {
    if (e.target === helpOverlay) helpOverlay.classList.remove('shown');
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && helpOverlay.classList.contains('shown')) {
        helpOverlay.classList.remove('shown');
    }
});

document.querySelectorAll('.help-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-help-tab');
        document.querySelectorAll('.help-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.help-pane').forEach(p => p.classList.toggle('active', p.getAttribute('data-help-pane') === target));
    });
});

// initial UI render
refreshUI();
