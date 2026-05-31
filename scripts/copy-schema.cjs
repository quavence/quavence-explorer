const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'src', 'db', 'schema.sql');
const targetDir = path.join(projectRoot, 'dist', 'db');
const target = path.join(targetDir, 'schema.sql');

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`Copied ${path.relative(projectRoot, source)} to ${path.relative(projectRoot, target)}`);
