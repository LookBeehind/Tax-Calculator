# Tax-Calculator

**fifo.md** — a stock tax calculator for the Republic of Moldova. Drop in any number of IBKR Activity Statements plus a BNM exchange-rate file and get FIFO-matched capital gains, dividend totals, and a downloadable Excel workbook. Everything runs in your browser — no data leaves your machine.

---

## Features

- **FIFO matching across years.** Lots persist from one calendar year into the next; sales close against the oldest unsold buy lots of the same security.
- **MDL tax base.** Both legs of every trade are converted to MDL using the BNM official rate on the trade date — the MDL tax base is independent of your USD result.
- **Corporate actions.** Stock splits, reverse splits, and RSU vesting (with proportional tax-withholding) are handled.
- **Multi-year input.** Upload one IBKR Activity Statement per year; the calculator merges them and produces per-year breakdowns.
- **Per-sale grouping.** A single sell transaction that consumes multiple FIFO buy lots renders as one block with several buy legs and one sell leg — matching the layout typical Moldovan tax filings expect.
- **Excel export.** Generates a workbook with a summary sheet, per-year tax sheets, and per-year BNM rate sheets.
- **Local-only.** All processing is in-browser. No uploads, no tracking, no backend.
- **Built-in help.** Click the `?` button in the upload section for screenshot walkthroughs of both the IBKR and BNM downloads.

---

## Quick start

The simplest way is to open `index.html` directly in a browser via `file:///path/to/Tax-Calculator/index.html`. Most desktop browsers will load the relative assets in `static/` just fine.

If your browser refuses (sandboxed Flatpak builds open files through the XDG document portal, which only exposes the single chosen file — its sibling `static/` directory stays invisible) or if you'd rather avoid the issue altogether, serve the directory over HTTP:

```bash
cd Tax-Calculator
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Any other static-file server works just as well (`npx serve`, `caddy file-server`, nginx, GitHub Pages, etc.).

---

## Inputs

| File                    | Format       | Where to get it                                                                                                  |
| ----------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| IBKR Activity Statement | CSV          | Client Portal → **Performance & Reports → Statements → Activity Statement → Annual → Download CSV** (per year)   |
| BNM exchange rates      | XLS / XLSX   | <https://www.bnm.md> → *Baza de date interactivă* → uncheck every currency except **USD (Dolar S.U.A.)** → XLSX  |

The in-app **Help** modal walks through both flows with screenshots.

---

## Methodology

### Capital gains

- Cost basis: **FIFO** across all uploaded years
- Currency conversion: **BNM official USD→MDL** rate on each trade date
- Buy total: `qty × price − fee`
- Sell total: `qty × price + fee`
- Net profit (per FIFO match): `sellTotal − buyTotal`, computed independently in USD and MDL
- Annual capital-gains tax: **6%** on the year's net positive capital gains, floored at zero (loss years yield zero tax)

The 6% effective rate comes from Art. 40 al. 7 of the Moldovan Tax Code: 12% PIT applied to 50% of the gain.

### Dividends

- Gross dividend tax: **12%** on USD/MDL gross dividend income
- Foreign withholding tax (US 30%, etc.) is **reported but not applied** as a credit — discuss with your accountant whether to claim it

### Special lot events

- **Splits / reverse splits**: quantity and per-share basis adjust; total cost is preserved.
- **RSU vesting**: a new lot is added at vesting-date FMV (BNM-converted to MDL).
- **Tax-withholding at vesting**: withheld shares reduce the most recently vested grant lot's quantity and cost proportionally.

### Output

For each calendar year covered by your statements, the app reports:

- Net capital gains (USD + MDL)
- 6% capital-gains tax
- Gross dividends and 12% dividend tax
- Per-symbol, per-sale FIFO matches with both legs and totals
- A dividends table grouped by symbol/date

The Excel export carries the same structure plus a methodology summary and per-year BNM rate sheets.

---

## Project structure

```
Tax-Calculator/
├── index.html              Markup
├── assets/help/            Screenshots used by the in-app Help modal
│   ├── ibkr/               (1.png … 3.png — IBKR walkthrough)
│   └── bnm/                (1.png … 3.png — BNM walkthrough)
└── static/
    ├── styles/
    │   ├── base.css        Design tokens, reset, typography, animations
    │   ├── layout.css      Header / hero / sections / footer
    │   ├── upload.css      Upload zone, drop targets, action buttons
    │   ├── results.css     Results section, stats grid, year tabs
    │   ├── details.css     Symbol blocks, match cards, dividends table
    │   └── help.css        Help button + modal
    └── js/
        ├── state.js        Shared state object
        ├── parsers.js      CSV + IBKR sections + BNM rates
        ├── fifo.js         FIFO matcher (tags each match with a sellEventId)
        ├── formatters.js   Number / date formatters
        ├── compute.js      Top-level compute orchestration + aggregation
        ├── render.js       Results rendering
        ├── export.js       XLSX workbook export
        └── app.js          File-input wiring, modal wiring, init
```

**External dependency:** [SheetJS (xlsx)](https://sheetjs.com/) loaded from a CDN — used to parse the BNM workbook and write the exported workbook.

---

## Caveats

- **This is a calculation aid, not tax advice.** Verify with [fisc.md](https://fisc.md) or a Moldovan tax advisor before filing.
- **Loss years yield zero tax** — there is no offset against dividend income and no carryforward for individuals under current law.
- **Foreign withholding tax** is reported but not applied as a credit.
- Rates and rules reflect the current reading of the Moldovan Tax Code; confirm the version applicable to your tax year.
- The fee convention used here (buy total subtracts the fee, sell total adds it) is configurable in [`static/js/fifo.js`](static/js/fifo.js); the standard cost-basis convention (buy `+ fee`, sell `− fee`) flips the two signs.

---

## License

No license declared yet — treat as "all rights reserved" until one is added.
