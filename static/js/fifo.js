"use strict";

// ============================================================
// FIFO ENGINE
// ============================================================
function runFIFO(trades, corpActions, grants, rates) {
    const events = [];
    for (const t of trades) {
        events.push({
            datetime: t.datetime, date: t.date, symbol: t.symbol,
            kind: t.qty > 0 ? 'BUY' : 'SELL',
            qty: Math.abs(t.qty), price: t.price,
            proceedsUSD: t.proceeds, commissionUSD: t.commission,
        });
    }
    // Dedup splits (IBKR reports two rows for one split sometimes)
    const seenSplits = new Set();
    for (const c of corpActions) {
        const m = c.description.match(/Split\s+(\d+)\s+for\s+(\d+)/);
        if (!m) continue;
        const key = `${c.datetime}|${c.symbol}`;
        if (seenSplits.has(key)) continue;
        seenSplits.add(key);
        const x = parseInt(m[1]), y = parseInt(m[2]);
        events.push({
            datetime: c.datetime, date: c.date, symbol: c.symbol,
            kind: 'SPLIT', ratio: x / y, description: c.description,
        });
    }
    for (const g of grants) {
        if (g.description.includes('Vesting')) {
            events.push({
                datetime: g.reportDate + 'T00:00:00', date: g.reportDate, symbol: g.symbol,
                kind: 'GRANT_VEST', qty: g.qty, price: g.price, valueUSD: g.value,
                description: g.description,
            });
        } else if (g.description.includes('Withholding')) {
            events.push({
                datetime: g.reportDate + 'T00:00:00', date: g.reportDate, symbol: g.symbol,
                kind: 'GRANT_WITHHOLD', qty: Math.abs(g.qty), description: g.description,
            });
        }
    }
    events.sort((a, b) => a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0);

    const lots = {};
    const matches = [];
    let sellEventCounter = 0;
    function getLots(sym) { if (!lots[sym]) lots[sym] = []; return lots[sym]; }

    for (const e of events) {
        const ll = getLots(e.symbol);
        if (e.kind === 'BUY') {
            const rate = getRate(rates, e.date);
            const fee = Math.abs(e.commissionUSD);
            ll.push({
                date: e.date, qtyRemaining: e.qty, qtyOrig: e.qty, price: e.price,
                commissionOrig: fee, costUSD: e.qty * e.price + fee, rate: rate, kind: 'BUY'
            });
        } else if (e.kind === 'GRANT_VEST') {
            const rate = getRate(rates, e.date);
            ll.push({
                date: e.date, qtyRemaining: e.qty, qtyOrig: e.qty, price: e.price,
                commissionOrig: 0, costUSD: e.valueUSD, rate: rate, kind: 'GRANT_VEST'
            });
        } else if (e.kind === 'GRANT_WITHHOLD') {
            let qtyLeft = e.qty;
            for (let i = ll.length - 1; i >= 0 && qtyLeft > 1e-9; i--) {
                const lot = ll[i];
                if (lot.kind === 'GRANT_VEST' && lot.qtyRemaining > 1e-9) {
                    const take = Math.min(lot.qtyRemaining, qtyLeft);
                    const frac = take / lot.qtyRemaining;
                    lot.costUSD *= (1 - frac);
                    lot.qtyRemaining -= take;
                    qtyLeft -= take;
                }
            }
            lots[e.symbol] = ll.filter(l => l.qtyRemaining > 1e-9);
        } else if (e.kind === 'SPLIT') {
            for (const lot of ll) {
                lot.qtyRemaining *= e.ratio;
                lot.qtyOrig *= e.ratio;
                if (lot.qtyOrig > 0) lot.price = (lot.costUSD - lot.commissionOrig) / lot.qtyOrig;
            }
        } else if (e.kind === 'SELL') {
            const sellEventId = ++sellEventCounter;
            const rate = getRate(rates, e.date);
            const sellCommission = Math.abs(e.commissionUSD);
            const originalQty = e.qty;
            const sellPrice = e.price;
            let qtyLeft = e.qty;
            while (qtyLeft > 1e-9 && ll.length > 0) {
                const lot = ll[0];
                const take = Math.min(lot.qtyRemaining, qtyLeft);
                const fracOfSell = take / originalQty;
                const fracOfLot = take / lot.qtyOrig;
                const buyFee = lot.commissionOrig * fracOfLot;
                const buyTotalUSD = take * lot.price - buyFee;
                const buyTotalMDL = buyTotalUSD * lot.rate;
                const sellFee = sellCommission * fracOfSell;
                const sellTotalUSD = take * sellPrice + sellFee;
                const sellTotalMDL = sellTotalUSD * rate;
                const npUSD = sellTotalUSD - buyTotalUSD;
                const npMDL = sellTotalMDL - buyTotalMDL;
                matches.push({
                    sellEventId,
                    symbol: e.symbol, sellYear: parseInt(e.date.slice(0, 4)),
                    buyDate: lot.date, sellDate: e.date,
                    buyQty: take, buyPrice: lot.price, buyFee, buyRate: lot.rate,
                    buyTotalUSD, buyTotalMDL, buyKind: lot.kind,
                    sellQty: take, sellPrice, sellFee, sellRate: rate,
                    sellTotalUSD, sellTotalMDL,
                    netProfitUSD: npUSD, netProfitMDL: npMDL,
                    taxUSD: npUSD * 0.06, taxMDL: npMDL * 0.06,
                });
                lot.qtyRemaining -= take;
                qtyLeft -= take;
                if (lot.qtyRemaining < 1e-9) ll.shift();
            }
        }
    }
    return matches;
}
