"use strict";

// ============================================================
// CSV PARSER
// ============================================================
function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = [];
    let cur = '', inQ = false, row = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) {
            if (ch === '"') {
                if (text[i + 1] === '"') { cur += '"'; i++; }
                else inQ = false;
            } else cur += ch;
        } else {
            if (ch === '"') inQ = true;
            else if (ch === ',') { row.push(cur); cur = ''; }
            else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
            else if (ch === '\r') { }
            else cur += ch;
        }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
}

function detectStatementYear(rows) {
    // Look for "Period" field, or fall back to majority year of trades
    for (const r of rows) {
        if (r[0] === 'Statement' && r[1] === 'Data' && r[2] === 'Period') {
            // r[3] is e.g. "January 1, 2024 - December 31, 2024"
            const m = (r[3] || '').match(/(\d{4})/);
            if (m) return parseInt(m[1]);
        }
    }
    // Try trade dates
    const yearCounts = {};
    for (const r of rows) {
        if (r[0] === 'Trades' && r[1] === 'Data' && r[6]) {
            const m = r[6].match(/(\d{4})-/);
            if (m) yearCounts[m[1]] = (yearCounts[m[1]] || 0) + 1;
        }
    }
    let best = null, bestCount = 0;
    for (const [y, c] of Object.entries(yearCounts)) {
        if (c > bestCount) { best = parseInt(y); bestCount = c; }
    }
    return best;
}

function countTrades(rows) {
    return rows.filter(r => r[0] === 'Trades' && r[1] === 'Data' && r[2] === 'Order' && r[3] === 'Stocks').length;
}

// ============================================================
// IBKR PARSING
// ============================================================
function parseIBKRSection(rows, sectionName) {
    let header = null;
    const out = [];
    for (const r of rows) {
        if (!r || !r[0] || r[0] !== sectionName) continue;
        if (r[1] === 'Header') {
            header = r.slice(2);
        } else if (r[1] === 'Data' && header) {
            const obj = {};
            for (let i = 0; i < header.length; i++) {
                obj[header[i]] = r[2 + i] || '';
            }
            out.push(obj);
        }
    }
    return out;
}

function parseDateTime(s) {
    if (!s) return '';
    const m = s.match(/^(\d{4}-\d{2}-\d{2}),?\s*(\d{2}:\d{2}:\d{2})?/);
    if (!m) return s;
    return m[1] + (m[2] ? 'T' + m[2] : 'T00:00:00');
}

function parseTrades(rows) {
    const raw = parseIBKRSection(rows, 'Trades');
    const out = [];
    for (const r of raw) {
        if (r['DataDiscriminator'] !== 'Order') continue;
        if (r['Asset Category'] !== 'Stocks') continue;
        const dt = parseDateTime(r['Date/Time']);
        out.push({
            symbol: r['Symbol'],
            datetime: dt,
            date: dt.slice(0, 10),
            qty: parseFloat(String(r['Quantity']).replace(/,/g, '')),
            price: parseFloat(r['T. Price']),
            proceeds: parseFloat(r['Proceeds']),
            commission: parseFloat(r['Comm/Fee']),
        });
    }
    return out;
}

function parseCorpActions(rows) {
    const raw = parseIBKRSection(rows, 'Corporate Actions');
    const out = [];
    for (const r of raw) {
        if (r['Asset Category'] !== 'Stocks') continue;
        const desc = r['Description'] || '';
        const m = desc.match(/^([A-Z][A-Z0-9 .]*?)\(/);
        const sym = m ? m[1].trim() : '';
        const dt = parseDateTime(r['Date/Time']);
        out.push({
            symbol: sym, datetime: dt, date: dt.slice(0, 10),
            qty: parseFloat(String(r['Quantity']).replace(/,/g, '')),
            description: desc,
        });
    }
    return out;
}

function parseGrants(rows) {
    const raw = parseIBKRSection(rows, 'Grant Activity');
    const out = [];
    for (const r of raw) {
        const sym = r['Symbol'];
        if (!sym || sym === '' || sym === 'Total') continue;
        const qty = parseFloat(String(r['Quantity'] || '0').replace(/,/g, ''));
        if (isNaN(qty)) continue;
        out.push({
            symbol: sym,
            reportDate: (r['Report Date'] || '').slice(0, 10),
            description: r['Description'] || '',
            qty: qty,
            price: parseFloat(r['Price'] || '0'),
            value: parseFloat(r['Value'] || '0'),
        });
    }
    return out;
}

function parseDividends(rows) {
    const raw = parseIBKRSection(rows, 'Dividends');
    const out = [];
    for (const r of raw) {
        const d = r['Date'] || '';
        if (d.length !== 10) continue;
        const m = (r['Description'] || '').match(/^([A-Z][A-Z0-9 .]*?)\(/);
        const sym = m ? m[1].trim() : '';
        let type = 'Ordinary';
        if (r['Description'].includes('NRA Withholding Exempt')) type = 'NRA Exempt';
        else if (r['Description'].includes('Payment in Lieu')) type = 'In Lieu';
        else if (r['Description'].includes('Bonus')) type = 'Bonus';
        out.push({
            date: d, symbol: sym, description: r['Description'],
            amount: parseFloat(r['Amount']), type: type,
        });
    }
    return out;
}

function parseWHT(rows) {
    const raw = parseIBKRSection(rows, 'Withholding Tax');
    const out = [];
    for (const r of raw) {
        const d = r['Date'] || '';
        if (d.length !== 10) continue;
        const m = (r['Description'] || '').match(/^([A-Z][A-Z0-9 .]*?)\(/);
        const sym = m ? m[1].trim() : '';
        out.push({
            date: d, symbol: sym, description: r['Description'],
            amount: parseFloat(r['Amount']),
        });
    }
    return out;
}

// ============================================================
// BNM RATES
// ============================================================
function parseBNMRates(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
    const rates = {};
    for (const sname of wb.SheetNames) {
        const sheet = wb.Sheets[sname];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
        for (const row of data) {
            if (!row || row.length < 2) continue;
            const dateStr = normalizeDate(row[0]);
            if (!dateStr) continue;
            const rate = parseFloat(row[1]);
            if (isNaN(rate) || rate <= 0) continue;
            rates[dateStr] = rate;
        }
    }
    return rates;
}

function normalizeDate(cell) {
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    if (typeof cell === 'number') {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        const d = new Date(epoch.getTime() + cell * 86400000);
        return d.toISOString().slice(0, 10);
    }
    if (typeof cell !== 'string') return null;
    const s = cell.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
}

function getRate(rates, date) {
    if (rates[date]) return rates[date];
    let candidate = null;
    for (const d in rates) {
        if (d <= date && (candidate === null || d > candidate)) candidate = d;
    }
    if (candidate) return rates[candidate];
    throw new Error(`No BNM rate for ${date}`);
}
