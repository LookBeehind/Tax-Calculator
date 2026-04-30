"use strict";

// ============================================================
// FORMATTERS
// ============================================================
function fmt(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    d = d == null ? 2 : d;
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: 6 });
}

function fmtSign(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const s = fmt(Math.abs(n), d);
    return (n > 0 ? '+' : (n < 0 ? '−' : '')) + s;
}

function plClass(n) {
    if (n > 0.005) return 'pos';
    if (n < -0.005) return 'neg';
    return '';
}

function formatDate(iso) {
    if (!iso || iso.length < 10) return iso || '';
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
