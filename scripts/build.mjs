// Bundles the engine into single self-contained HTML files:
//   index.html         - standalone page (open it directly, or serve it from anywhere)
//   dist/artifact.html - body fragment for hosts that supply their own document skeleton
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: process.argv.includes('--min'),
  write: false,
  target: 'es2020',
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const shell = readFileSync('src/shell.html', 'utf8');
const fragment = shell.replace('/*BUNDLE*/', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/artifact.html', fragment);
writeFileSync(
  'index.html',
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body style="margin:0">\n${fragment}\n</body>\n</html>\n`
);
console.log(`built: index.html ${(fragment.length / 1024).toFixed(0)} KB`);
