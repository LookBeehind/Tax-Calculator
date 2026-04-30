"use strict";

// ============================================================
// COMPUTE
// ============================================================
async function compute() {
    setStatus('Parsing exchange rates...', 'processing');
    await new Promise(r => setTimeout(r, 30));
    try {
        const rates = parseBNMRates(state.bnm);
        if (Object.keys(rates).length < 50) {
            throw new Error('BNM file appears empty or unreadable.');
        }

        setStatus('Reading IBKR statements...', 'processing');
        await new Promise(r => setTimeout(r, 30));

        let allTrades = [], allCorp = [], allGrants = [];
        const divsByYear = {};
        const whtByYear = {};
        const yearsSeen = new Set();

        for (const a of state.activities) {
            const rows = parseCSV(a.csvText);
            const trades = parseTrades(rows);
            const corp = parseCorpActions(rows);
            const grants = parseGrants(rows);
            const divs = parseDividends(rows);
            const wht = parseWHT(rows);

            allTrades.push(...trades);
            allCorp.push(...corp);
            allGrants.push(...grants);

            for (const d of divs) {
                const y = parseInt(d.date.slice(0, 4));
                yearsSeen.add(y);
                if (!divsByYear[y]) divsByYear[y] = [];
                divsByYear[y].push(d);
            }
            for (const w of wht) {
                const y = parseInt(w.date.slice(0, 4));
                if (!whtByYear[y]) whtByYear[y] = [];
                whtByYear[y].push(w);
            }
            for (const t of trades) yearsSeen.add(parseInt(t.date.slice(0, 4)));
        }

        if (allTrades.length === 0) {
            throw new Error('No stock trades found in any uploaded statement.');
        }

        setStatus('Running FIFO matcher...', 'processing');
        await new Promise(r => setTimeout(r, 30));

        const matches = runFIFO(allTrades, allCorp, allGrants, rates);

        // Add years from matches
        for (const m of matches) yearsSeen.add(m.sellYear);
        const years = [...yearsSeen].sort();

        // Aggregate dividends per year
        const divsAggregated = {};
        for (const y of years) {
            divsAggregated[y] = aggregateDivs(divsByYear[y] || [], whtByYear[y] || [], rates);
        }

        // Year summaries
        const summary = {};
        for (const y of years) {
            summary[y] = aggregateYear(matches, y, divsAggregated[y]);
        }

        state.result = { matches, divsAggregated, summary, rates, years };

        renderResults();
        setStatus('Done.', 'success');
    } catch (err) {
        console.error(err);
        setStatus('Error: ' + err.message, 'error');
    }
}

function aggregateDivs(divs, wht, rates) {
    const groups = {};
    for (const d of divs) {
        const k = `${d.date}|${d.symbol}|${d.type}`;
        if (!groups[k]) groups[k] = { date: d.date, symbol: d.symbol, type: d.type, amount: 0 };
        groups[k].amount += d.amount;
    }
    const whtMap = {};
    for (const w of wht) {
        const k = `${w.date}|${w.symbol}`;
        if (!whtMap[k]) whtMap[k] = 0;
        whtMap[k] += w.amount;
    }
    const out = [];
    for (const g of Object.values(groups)) {
        if (Math.abs(g.amount) < 0.001) continue;
        const rate = getRate(rates, g.date);
        const wht = whtMap[`${g.date}|${g.symbol}`] || 0;
        out.push({
            date: g.date, symbol: g.symbol, type: g.type,
            usd: g.amount, whtUSD: wht, rate,
            mdl: g.amount * rate, whtMDL: wht * rate,
        });
    }
    out.sort((a, b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : a.date < b.date ? -1 : 1);
    return out;
}

function aggregateYear(matches, year, divs) {
    const ym = matches.filter(m => m.sellYear === year);
    const cgUSD = ym.reduce((s, m) => s + m.netProfitUSD, 0);
    const cgMDL = ym.reduce((s, m) => s + m.netProfitMDL, 0);
    const divUSD = divs.reduce((s, d) => s + d.usd, 0);
    const divMDL = divs.reduce((s, d) => s + d.mdl, 0);
    const whtUSD = divs.reduce((s, d) => s + d.whtUSD, 0);
    const whtMDL = divs.reduce((s, d) => s + d.whtMDL, 0);
    const cgTaxUSD = Math.max(0, cgUSD) * 0.06;
    const cgTaxMDL = Math.max(0, cgMDL) * 0.06;
    const divTaxUSD = divUSD * 0.12;
    const divTaxMDL = divMDL * 0.12;
    return {
        matches: ym,
        cgUSD, cgMDL, cgTaxUSD, cgTaxMDL,
        divUSD, divMDL, divTaxUSD, divTaxMDL,
        whtUSD, whtMDL,
        totalTaxUSD: cgTaxUSD + divTaxUSD,
        totalTaxMDL: cgTaxMDL + divTaxMDL,
        nMatches: ym.length,
        nSymbols: new Set(ym.map(m => m.symbol)).size,
        nDivs: divs.length,
    };
}

function setStatus(text, kind) {
    const el = document.getElementById('status');
    el.className = 'status-bar' + (kind ? ' ' + kind : '');
    el.textContent = text || '';
}
