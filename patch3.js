const fs = require('fs');

let content = fs.readFileSync('src/app/(dashboard)/coaches-corner/page.tsx', 'utf8');

// I'll skip node and use sed or perl because node isn't there
