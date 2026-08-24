const { parentPort, workerData } = require('worker_threads');
const { renderPage } = require('./core');
parentPort.postMessage({ html: renderPage(workerData) });
