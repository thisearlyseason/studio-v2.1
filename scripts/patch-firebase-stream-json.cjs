// Firebase CLI 15 uses stream-json 1.x names. Adapt its imports to the secure
// upstream 3.5 Node stream APIs; do not modify the parser or suppress advisories.
const fs = require('node:fs');
const path = require('node:path');
let pkg;
try { pkg = require.resolve('firebase-tools/package.json'); }
catch (error) { if (error.code === 'MODULE_NOT_FOUND') process.exit(0); throw error; }
let parserDir = path.dirname(require.resolve('stream-json'));
while (!fs.existsSync(path.join(parserDir, 'package.json'))) {
  const parent = path.dirname(parserDir);
  if (parent === parserDir) throw new Error('Cannot verify stream-json version');
  parserDir = parent;
}
if (JSON.parse(fs.readFileSync(path.join(parserDir, 'package.json'), 'utf8')).version !== '3.5.0') {
  throw new Error('Expected stream-json 3.5.0; install from the project directory with its lockfile');
}
const version = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
if (version !== '15.30.2') throw new Error('Review Firebase parser compatibility for ' + version);
const replacements = {
  'lib/commands/auth-import.js': [
    ['const Pick = require("stream-json/filters/Pick");', 'const Pick = { withParser: require("stream-json/filters/pick.js").default.withParserAsStream };'],
    ['const StreamArray = require("stream-json/streamers/StreamArray");', 'const StreamArray = { streamArray: require("stream-json/streamers/stream-array.js").default.asStream };'],
  ],
  'lib/database/import.js': [
    ['const Filter = require("stream-json/filters/Filter");', 'const Filter = { withParser: require("stream-json/filters/filter.js").default.withParserAsStream };'],
    ['const StreamObject = require("stream-json/streamers/StreamObject");', 'const StreamObject = { streamObject: require("stream-json/streamers/stream-object.js").default.asStream };'],
  ],
  'lib/frameworks/next/index.js': [
    ['const stream_json_1 = require("stream-json");', 'const stream_json_1 = { parser: require("stream-json").parserStream };'],
    ['const Pick_1 = require("stream-json/filters/Pick");', 'const Pick_1 = { pick: require("stream-json/filters/pick.js").default.asStream };'],
    ['const StreamObject_1 = require("stream-json/streamers/StreamObject");', 'const StreamObject_1 = { streamObject: require("stream-json/streamers/stream-object.js").default.asStream };'],
  ],
};
// Check all anchors before writing anything. Repeated installs are idempotent.
const edits = [];
for (const [relative, pairs] of Object.entries(replacements)) {
  const file = path.join(path.dirname(pkg), relative);
  let source = fs.readFileSync(file, 'utf8');
  for (const [before, after] of pairs) {
    if (source.includes(after)) continue;
    if (source.split(before).length !== 2) throw new Error('Unexpected Firebase source: ' + relative);
    source = source.replace(before, after);
  }
  edits.push([file, source]);
}
for (const [file, source] of edits) fs.writeFileSync(file, source);
console.log('Firebase CLI stream-json 3.5 compatibility verified');
