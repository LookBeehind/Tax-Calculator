"use strict";

// ============================================================
// EXPORT XLSX
// ============================================================
function exportXLSX() {
    if (!state.result) return;
    const { summary, divsAggregated, rates, years } = state.result;
    const wb = XLSX.utils.book_new();

    // Summary
    const sumData = [
        ['Moldova Personal Income Tax — Stock Activity Summary'],
        [`Calendar years: ${years.join(', ')}`],
        [],
        ['Methodology'],
        ['  • Cost basis: FIFO across all years'],
        ['  • Currency: BNM official USD→MDL rate on each trade date'],
        ['  • Buy USD = qty × price + commission'],
        ['  • Sell USD = qty × price − commission'],
        ['  • Capital gains: 6% on net profit (floored at 0 for loss years)'],
        ['  • Dividends: 12% on gross dividend USD/MDL'],
        ['  • Capital losses do NOT offset dividend tax'],
        ['  • Splits / reverse splits / RSU grants accounted for'],
        [],
        ['Year', 'USD', 'MDL'],
    ];
    for (const y of years) {
        const s = summary[y];
        sumData.push([`—— ${y} ——`]);
        sumData.push(['Capital gains net profit', s.cgUSD, s.cgMDL]);
        sumData.push(['Capital gains tax (6%, floored at 0)', s.cgTaxUSD, s.cgTaxMDL]);
        sumData.push(['Dividends gross', s.divUSD, s.divMDL]);
        sumData.push(['Dividend tax (12%)', s.divTaxUSD, s.divTaxMDL]);
        sumData.push([`TOTAL ${y} Tax Liability`, s.totalTaxUSD, s.totalTaxMDL]);
        sumData.push([]);
    }
    const totalTaxUSD = years.reduce((s, y) => s + summary[y].totalTaxUSD, 0);
    const totalTaxMDL = years.reduce((s, y) => s + summary[y].totalTaxMDL, 0);
    sumData.push(['GRAND TOTAL (all years)', totalTaxUSD, totalTaxMDL]);
    sumData.push([]);
    sumData.push(['Caveats']);
    sumData.push(['  • Calculation aid only — verify with fisc.md or a Moldovan tax advisor before filing']);
    sumData.push(['  • Foreign withholding tax may be claimable as credit — not applied here']);

    const wsSum = XLSX.utils.aoa_to_sheet(sumData);
    wsSum['!cols'] = [{ wch: 50 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');

    // Exchange rates per year
    const yearsWithRates = new Set();
    for (const d in rates) yearsWithRates.add(d.slice(0, 4));
    for (const yStr of [...yearsWithRates].sort()) {
        const data = [];
        Object.keys(rates).sort().forEach(d => {
            if (d.slice(0, 4) === yStr) {
                data.push([formatDate(d), rates[d]]);
            }
        });
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 14 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, `Exchange Rate ${yStr}`);
    }

    // Tax sheet per year
    for (const y of years) {
        const ws = buildTaxSheet(y, summary[y].matches, divsAggregated[y], summary[y]);
        XLSX.utils.book_append_sheet(wb, ws, `Taxes ${y}`);
    }

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tax_Calculations_${years[0]}-${years[years.length - 1]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function buildTaxSheet(year, yearMatches, divs, sumYear) {
    const data = [[]];
    const bySym = {};
    for (const m of yearMatches) {
        if (!bySym[m.symbol]) bySym[m.symbol] = [];
        bySym[m.symbol].push(m);
    }
    for (const sym of Object.keys(bySym).sort()) {
        const symMatches = bySym[sym];
        // Group by sell event so one table = one sell transaction (may include multiple buy lots)
        const byEvent = {};
        for (const m of symMatches) {
            if (!byEvent[m.sellEventId]) byEvent[m.sellEventId] = [];
            byEvent[m.sellEventId].push(m);
        }
        for (const id in byEvent) {
            byEvent[id].sort((a, b) => a.buyDate < b.buyDate ? -1 : 1);
        }
        const events = Object.values(byEvent).sort((a, b) => a[0].sellDate < b[0].sellDate ? -1 : 1);

        data.push(['', sym]);
        data.push([]);
        for (const evt of events) {
            const first = evt[0];
            const buyTotalUSD = evt.reduce((s, m) => s + m.buyTotalUSD, 0);
            const buyTotalMDL = evt.reduce((s, m) => s + m.buyTotalMDL, 0);
            const sellQty = evt.reduce((s, m) => s + m.sellQty, 0);
            const sellFee = evt.reduce((s, m) => s + m.sellFee, 0);
            const sellTotalUSD = evt.reduce((s, m) => s + m.sellTotalUSD, 0);
            const sellTotalMDL = evt.reduce((s, m) => s + m.sellTotalMDL, 0);
            const netProfitUSD = evt.reduce((s, m) => s + m.netProfitUSD, 0);
            const netProfitMDL = evt.reduce((s, m) => s + m.netProfitMDL, 0);
            const taxUSD = evt.reduce((s, m) => s + m.taxUSD, 0);
            const taxMDL = evt.reduce((s, m) => s + m.taxMDL, 0);

            data.push(['', 'Symbol', 'Date', 'Quantity', 'Price per unit', 'Comm/Fee', 'BNM Rate', 'Total USD', 'Total MDL']);
            for (const m of evt) {
                data.push(['', `${m.symbol} (buy)`, formatDate(m.buyDate), m.buyQty, m.buyPrice, m.buyFee, m.buyRate, m.buyTotalUSD, m.buyTotalMDL]);
            }
            data.push(['', `${first.symbol} (sell)`, formatDate(first.sellDate), sellQty, first.sellPrice, sellFee, first.sellRate, sellTotalUSD, sellTotalMDL]);
            data.push(['', 'Amount of expense for deduction', '', '', '', '', '', buyTotalUSD, buyTotalMDL]);
            data.push(['', 'Profit', '', '', '', '', '', sellTotalUSD, sellTotalMDL]);
            data.push(['', 'Net profit', '', '', '', '', '', netProfitUSD, netProfitMDL]);
            data.push(['', 'Tax 6%', '', '', '', '', '', taxUSD, taxMDL]);
            data.push([]);
        }
    }
    data.push([]);
    data.push(['', '', '', '', '', '', '', 'USD', 'MDL']);
    data.push(['', 'Total Net Profit (capital gains)', '', '', '', '', '', sumYear.cgUSD, sumYear.cgMDL]);
    data.push(['', 'Total Tax 6% (floored at 0)', '', '', '', '', '', sumYear.cgTaxUSD, sumYear.cgTaxMDL]);
    data.push([]);
    if (divs.length) {
        data.push(['', 'Dividends']);
        data.push([]);
        data.push(['', 'Symbol', 'Date', 'Type', 'BNM Rate', 'Gross USD', 'WHT USD', 'Gross MDL', 'WHT MDL']);
        for (const d of divs) {
            data.push(['', d.symbol, formatDate(d.date), d.type, d.rate, d.usd, d.whtUSD, d.mdl, d.whtMDL]);
        }
        data.push(['', 'Total', '', '', '', sumYear.divUSD, sumYear.whtUSD, sumYear.divMDL, sumYear.whtMDL]);
        data.push(['', 'Tax 12%', '', '', '', sumYear.divTaxUSD, '', sumYear.divTaxMDL, '']);
    }
    data.push([]);
    data.push(['', '', '', '', '', '', '', 'USD', 'MDL']);
    data.push(['', `GRAND TOTAL Tax (capital gains 6% + dividends 12%) — ${year}`, '', '', '', '', '', sumYear.totalTaxUSD, sumYear.totalTaxMDL]);
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 1 }, { wch: 35 }, { wch: 14 }, { wch: 11 }, { wch: 14 }, { wch: 11 }, { wch: 13 }, { wch: 14 }, { wch: 14 }];
    return ws;
}
