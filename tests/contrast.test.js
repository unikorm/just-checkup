// Checks WCAG 2.x contrast for the color pairs the UI actually uses, in both
// themes, straight from styles/tokens.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

/** @param {string} block */
function vars(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}

const lightBlock = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)'));
const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
const light = vars(lightBlock);
const dark = { ...light, ...vars(darkBlock) };

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} a @param {string} b */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TEXT = 4.5;
const GRAPHIC = 3;
const pastels = ['mustard', 'coral', 'mint', 'lavender'];

/** [foreground, background, minimum] */
const pairs = [
  ['color-ink', 'color-bg', TEXT],
  ['color-ink', 'color-surface', TEXT],
  ['color-ink-muted', 'color-bg', TEXT],
  ['color-ink-muted', 'color-surface', TEXT],
  ['color-pill-fg', 'color-pill-bg', TEXT],
  ['color-danger', 'color-bg', TEXT],
  ['color-danger', 'color-surface', TEXT],
  ['color-ink', 'color-danger-bg', TEXT],
  ['color-card-ink', 'color-accent', TEXT],
  ...pastels.flatMap((p) => [
    ['color-card-ink', `color-${p}`, TEXT],
    ['color-card-ink-muted', `color-${p}`, TEXT],
    ['color-card-danger', `color-${p}`, TEXT],
  ]),
  ['color-due-marker', 'color-surface', GRAPHIC],
  ['color-outline', 'color-bg', GRAPHIC],
  ['color-focus', 'color-bg', GRAPHIC],
  ['color-focus', 'color-surface', GRAPHIC],
];

for (const [theme, tokens] of [['light', light], ['dark', dark]]) {
  test(`contrast meets WCAG AA in ${theme} mode`, () => {
    const failures = [];
    for (const [fg, bg, min] of pairs) {
      assert.ok(tokens[fg] && tokens[bg], `missing token ${fg} or ${bg}`);
      const ratio = contrast(tokens[fg], tokens[bg]);
      if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
    }
    assert.deepEqual(failures, []);
  });
}
