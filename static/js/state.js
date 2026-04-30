"use strict";

const state = {
    bnm: null,                  // ArrayBuffer
    bnmFilename: null,
    activities: [],             // [{id, filename, csvText, year, nTrades}]
    result: null,
    activeYear: null,
};

let _nextId = 1;
