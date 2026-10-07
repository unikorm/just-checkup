import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory() ? walk(path) : [path];
  });
}

function appShell() {
  const source = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const block = /const APP_SHELL = \[([\s\S]*?)\];/.exec(source)?.[1] ?? '';
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('service worker precaches exactly the files the app needs', () => {
  const expected = [
    './',
    'index.html',
    'manifest.webmanifest',
    ...walk('assets/icons'),
    ...walk('styles'),
    ...['app', 'domain', 'reminders', 'storage', 'ui'].flatMap(walk).filter((f) => f.endsWith('.js')),
  ].map((f) => f.split('\\').join('/'));
  assert.deepEqual([...appShell()].sort(), [...expected].sort());
});

test('every relative import in app code points at a precached file', () => {
  const shell = new Set(appShell());
  for (const file of appShell().filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const [, spec] of source.matchAll(/(?:import|export)[^'"]*?from\s+'(\.[^']+)'/g)) {
      const resolved = relative(ROOT, fileURLToPath(new URL(spec, new URL(file, `file://${ROOT}/`)))).split('\\').join('/');
      assert.ok(shell.has(resolved), `${file} imports ${spec} (${resolved}), which is not precached`);
    }
  }
});

test('manifest icons and the HTML entry assets are precached', () => {
  const shell = new Set(appShell());
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(shell.has(icon.src), icon.src);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const [, ref] of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) assert.ok(shell.has(ref), ref);
});
