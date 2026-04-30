"use strict";

// ============================================================
// RENDERING
// ============================================================
function renderResults() {
    const { summary, divsAggregated, years } = state.result;
    document.getElementById('results').classList.add('shown');

    // Top-level stats
    const totalTaxMDL = years.reduce((s, y) => s + summary[y].totalTaxMDL, 0);
    const totalTaxUSD = years.reduce((s, y) => s + summary[y].totalTaxUSD, 0);
    const totalCgMDL = years.reduce((s, y) => s + summary[y].cgMDL, 0);
    const totalCgUSD = years.reduce((s, y) => s + summary[y].cgUSD, 0);
    const totalDivMDL = years.reduce((s, y) => s + summary[y].divMDL, 0);
    const totalMatches = years.reduce((s, y) => s + summary[y].nMatches, 0);

    document.getElementById('results-meta').textContent =
        `${years.length} year${years.length > 1 ? 's' : ''} · ${totalMatches} FIFO matches`;

    const sg = document.getElementById('stats-grid');
    sg.innerHTML = `
    <div class="stat-card highlight">
      <div class="stat-label">Total Tax Liability</div>
      <div class="stat-value">${fmt(totalTaxMDL, 0)}<sub>MDL</sub></div>
      <div class="stat-sub">${fmt(totalTaxUSD, 2)} USD</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Capital Gains (all years)</div>
      <div class="stat-value ${plClass(totalCgMDL)}">${fmtSign(totalCgMDL, 0)}<sub>MDL</sub></div>
      <div class="stat-sub">${fmtSign(totalCgUSD, 2)} USD</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Dividends (all years)</div>
      <div class="stat-value">${fmt(totalDivMDL, 0)}<sub>MDL</sub></div>
      <div class="stat-sub">${fmt(years.reduce((s, y) => s + summary[y].divUSD, 0), 2)} USD</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Years Processed</div>
      <div class="stat-value">${years.length}<sub>${years[0]}–${years[years.length - 1]}</sub></div>
      <div class="stat-sub">${totalMatches} matches across ${new Set(state.result.matches.map(m => m.symbol)).size} symbols</div>
    </div>
  `;

    // Year tabs
    const tabsEl = document.getElementById('year-tabs');
    tabsEl.innerHTML = '';
    state.activeYear = state.activeYear && years.includes(state.activeYear) ? state.activeYear : years[years.length - 1];
    for (const y of years) {
        const s = summary[y];
        const tab = document.createElement('button');
        tab.className = 'year-tab' + (y === state.activeYear ? ' active' : '');
        const cls = plClass(s.cgMDL);
        tab.innerHTML = `<span>${y}</span><span class="pl-pill ${cls}">${fmtSign(s.cgMDL, 0)}</span>`;
        tab.addEventListener('click', () => switchYear(y));
        tabsEl.appendChild(tab);
    }

    // Year contents
    const wrap = document.getElementById('year-contents');
    wrap.innerHTML = '';
    for (const y of years) {
        const div = document.createElement('div');
        div.className = 'year-content' + (y === state.activeYear ? ' active' : '');
        div.id = `year-${y}`;
        div.appendChild(renderYearContent(y, divsAggregated[y], summary[y]));
        wrap.appendChild(div);
    }

    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function switchYear(y) {
    state.activeYear = y;
    document.querySelectorAll('.year-tab').forEach((el, i) => {
        el.classList.toggle('active', state.result.years[i] === y);
    });
    document.querySelectorAll('.year-content').forEach(el => {
        el.classList.toggle('active', el.id === `year-${y}`);
    });
}

function renderYearContent(year, divs, s) {
    const frag = document.createDocumentFragment();

    // Year summary strip
    const ys = document.createElement('div');
    ys.className = 'year-summary';
    ys.innerHTML = `
    <div class="ys-item">
      <div class="ys-label">Cap. Gains Net Profit</div>
      <div class="ys-value ${plClass(s.cgMDL)}">${fmtSign(s.cgMDL, 0)} MDL</div>
      <div class="ys-sub">${fmtSign(s.cgUSD, 2)} USD</div>
    </div>
    <div class="ys-item">
      <div class="ys-label">Tax 6% (floored at 0)</div>
      <div class="ys-value">${fmt(s.cgTaxMDL, 0)} MDL</div>
      <div class="ys-sub">${fmt(s.cgTaxUSD, 2)} USD</div>
    </div>
    <div class="ys-item">
      <div class="ys-label">Dividends Gross</div>
      <div class="ys-value">${fmt(s.divMDL, 0)} MDL</div>
      <div class="ys-sub">${fmt(s.divUSD, 2)} USD · ${s.nDivs} events</div>
    </div>
    <div class="ys-item">
      <div class="ys-label">Tax 12% on Dividends</div>
      <div class="ys-value">${fmt(s.divTaxMDL, 0)} MDL</div>
      <div class="ys-sub">${fmt(s.divTaxUSD, 2)} USD</div>
    </div>
  `;
    frag.appendChild(ys);

    // Group matches by symbol
    const bySym = {};
    for (const m of s.matches) {
        if (!bySym[m.symbol]) bySym[m.symbol] = [];
        bySym[m.symbol].push(m);
    }

    if (Object.keys(bySym).length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<h3>No closed positions in ' + year + '</h3><p>Stock sales matched against earlier buys would appear here.</p>';
        frag.appendChild(empty);
    } else {
        // Sort symbols by absolute MDL P/L descending (biggest impact first)
        const syms = Object.keys(bySym).sort((a, b) => {
            const ma = bySym[a].reduce((s, m) => s + m.netProfitMDL, 0);
            const mb = bySym[b].reduce((s, m) => s + m.netProfitMDL, 0);
            return Math.abs(mb) - Math.abs(ma);
        });

        for (const sym of syms) {
            const ms = bySym[sym];
            // Group FIFO matches by sell event so each block represents one sell transaction
            const byEvent = {};
            for (const m of ms) {
                if (!byEvent[m.sellEventId]) byEvent[m.sellEventId] = [];
                byEvent[m.sellEventId].push(m);
            }
            for (const id in byEvent) {
                byEvent[id].sort((a, b) => a.buyDate < b.buyDate ? -1 : 1);
            }
            const groups = Object.values(byEvent).sort((a, b) => a[0].sellDate < b[0].sellDate ? -1 : 1);

            const totalMDL = ms.reduce((sum, m) => sum + m.netProfitMDL, 0);
            const totalUSD = ms.reduce((sum, m) => sum + m.netProfitUSD, 0);
            const earliestBuy = ms.map(m => m.buyDate).reduce((a, d) => d < a ? d : a);
            const latestSell = ms.map(m => m.sellDate).reduce((a, d) => d > a ? d : a);
            const block = document.createElement('div');
            block.className = 'symbol-block';
            const cls = plClass(totalMDL);
            block.innerHTML = `
        <div class="symbol-header">
          <span class="symbol-ticker">${sym}</span>
          <span class="symbol-meta">${groups.length} sale${groups.length > 1 ? 's' : ''}</span>
          <span class="symbol-meta">${earliestBuy.slice(0, 7)} → ${latestSell.slice(0, 7)}</span>
          <span class="symbol-numbers">
            <div class="pl-mdl ${cls}">${fmtSign(totalMDL, 0)} MDL</div>
            <div class="pl-usd">${fmtSign(totalUSD, 2)} USD</div>
          </span>
          <span class="symbol-toggle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
          </span>
        </div>
        <div class="matches-container"></div>
      `;
            block.querySelector('.symbol-header').addEventListener('click', () => {
                block.classList.toggle('expanded');
            });
            const mc = block.querySelector('.matches-container');
            for (const grp of groups) mc.appendChild(renderMatchGroup(grp));
            frag.appendChild(block);
        }
    }

    // Dividends card
    if (divs.length > 0) {
        const dc = document.createElement('div');
        dc.className = 'dividends-card';
        let rowsHtml = divs.map(d => `
      <tr>
        <td>${d.symbol}</td>
        <td>${formatDate(d.date)}</td>
        <td style="color: var(--text-3);">${d.type}</td>
        <td class="num">${fmt(d.rate, 4)}</td>
        <td class="num">${fmt(d.usd, 2)}</td>
        <td class="num" style="color: var(--neg);">${fmt(d.whtUSD, 2)}</td>
        <td class="num">${fmt(d.mdl, 2)}</td>
        <td class="num" style="color: var(--neg);">${fmt(d.whtMDL, 2)}</td>
      </tr>
    `).join('');
        dc.innerHTML = `
      <div class="div-header">
        <h3>Dividends ${year}</h3>
        <span class="count-pill">${divs.length} events</span>
      </div>
      <table class="div-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Date</th>
            <th>Type</th>
            <th class="num">BNM Rate</th>
            <th class="num">Gross USD</th>
            <th class="num">WHT USD</th>
            <th class="num">Gross MDL</th>
            <th class="num">WHT MDL</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row">
            <td colspan="4">Total</td>
            <td class="num">${fmt(s.divUSD, 2)}</td>
            <td class="num">${fmt(s.whtUSD, 2)}</td>
            <td class="num">${fmt(s.divMDL, 2)}</td>
            <td class="num">${fmt(s.whtMDL, 2)}</td>
          </tr>
          <tr class="tax-row">
            <td colspan="4">Tax 12% on gross dividend</td>
            <td class="num">${fmt(s.divTaxUSD, 2)}</td>
            <td>—</td>
            <td class="num">${fmt(s.divTaxMDL, 2)}</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    `;
        frag.appendChild(dc);
    }

    return frag;
}

function renderMatchGroup(group) {
    const wrap = document.createElement('div');
    wrap.className = 'match-block';

    const sellQty = group.reduce((s, m) => s + m.sellQty, 0);
    const sellFee = group.reduce((s, m) => s + m.sellFee, 0);
    const sellTotalUSD = group.reduce((s, m) => s + m.sellTotalUSD, 0);
    const sellTotalMDL = group.reduce((s, m) => s + m.sellTotalMDL, 0);
    const netProfitUSD = group.reduce((s, m) => s + m.netProfitUSD, 0);
    const netProfitMDL = group.reduce((s, m) => s + m.netProfitMDL, 0);
    const taxUSD = group.reduce((s, m) => s + m.taxUSD, 0);
    const taxMDL = group.reduce((s, m) => s + m.taxMDL, 0);
    const first = group[0];

    const cls = plClass(netProfitMDL);
    const wrapClass = netProfitMDL >= 0 ? 'profit' : 'loss';

    const buyLegsHtml = group.map(m => {
        const grantStar = m.buyKind === 'GRANT_VEST' ? ' <span style="color: var(--warn);" title="From RSU vesting">★</span>' : '';
        return `
      <div class="leg buy">
        <div class="leg-header">
          <span class="leg-tag">Buy${grantStar}</span>
          <span class="leg-date">${formatDate(m.buyDate)}</span>
        </div>
        <div class="leg-row"><span class="key">Quantity</span><span class="val">${fmt(m.buyQty, 4)}</span></div>
        <div class="leg-row"><span class="key">Price</span><span class="val">$${fmt(m.buyPrice, 4)}</span></div>
        <div class="leg-row"><span class="key">Commission</span><span class="val">$${fmt(m.buyFee, 4)}</span></div>
        <div class="leg-row"><span class="key">BNM Rate</span><span class="val">${fmt(m.buyRate, 4)}</span></div>
        <div class="leg-row totals"><span class="key">Total USD</span><span class="val">$${fmt(m.buyTotalUSD, 2)}</span></div>
        <div class="leg-row totals"><span class="key">Total MDL</span><span class="val">${fmt(m.buyTotalMDL, 2)}</span></div>
      </div>
    `;
    }).join('');

    wrap.innerHTML = `
    <div class="match-flow">
      <div class="buy-stack">${buyLegsHtml}</div>
      <div class="flow-arrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </div>
      <div class="leg sell">
        <div class="leg-header">
          <span class="leg-tag">Sell</span>
          <span class="leg-date">${formatDate(first.sellDate)}</span>
        </div>
        <div class="leg-row"><span class="key">Quantity</span><span class="val">${fmt(sellQty, 4)}</span></div>
        <div class="leg-row"><span class="key">Price</span><span class="val">$${fmt(first.sellPrice, 4)}</span></div>
        <div class="leg-row"><span class="key">Commission</span><span class="val">$${fmt(sellFee, 4)}</span></div>
        <div class="leg-row"><span class="key">BNM Rate</span><span class="val">${fmt(first.sellRate, 4)}</span></div>
        <div class="leg-row totals"><span class="key">Total USD</span><span class="val">$${fmt(sellTotalUSD, 2)}</span></div>
        <div class="leg-row totals"><span class="key">Total MDL</span><span class="val">${fmt(sellTotalMDL, 2)}</span></div>
      </div>
    </div>
    <div class="match-totals ${wrapClass}">
      <div class="total-item">
        <span class="total-label">Net Profit</span>
        <span class="total-value ${cls}">${fmtSign(netProfitMDL, 2)} MDL <span style="color: var(--text-3); font-weight: 500; font-size: 11px; margin-left: 8px;">(${fmtSign(netProfitUSD, 2)} USD)</span></span>
      </div>
      <div class="total-item">
        <span class="total-label">Tax 6%</span>
        <span class="total-value ${taxMDL >= 0 ? '' : 'neg'}">${fmtSign(taxMDL, 2)} MDL <span style="color: var(--text-3); font-weight: 500; font-size: 11px; margin-left: 8px;">(${fmtSign(taxUSD, 2)} USD)</span></span>
      </div>
    </div>
  `;
    return wrap;
}
