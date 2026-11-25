// Loads the browser scripts (plain IIFEs attaching to `PM`) into Node, in index.html order.
const path = require('node:path');

const SCRIPTS = ['constants', 'color', 'mixer', 'solver', 'format', 'coach', 'storage', 'palette'];
for (const name of SCRIPTS) require(path.join(__dirname, '..', 'src', `${name}.js`));

module.exports = globalThis.PM;
