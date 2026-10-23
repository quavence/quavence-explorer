/**
 * Automated test suite for SVG extraction and URI malformed guards.
 * Verifies that malformed percent characters or unescaped SVGs never
 * throw URIError or crash the UI rendering layer.
 */
import assert from 'assert';
import {
  safeDecodeUriComponent,
  extractSvgContent,
  sanitizeSvgContent,
  isolateSvgGradients,
} from '../src/web/utils/svg';

console.log('--- STARTING URI MALFORMED AND SVG GUARDS SUITE ---');

// Test 1: safeDecodeUriComponent with malformed inputs
console.log('Test 1: safeDecodeUriComponent resilience');
assert.strictEqual(safeDecodeUriComponent(null), '');
assert.strictEqual(safeDecodeUriComponent(undefined), '');
assert.strictEqual(safeDecodeUriComponent(''), '');
// Normal decoding
assert.strictEqual(safeDecodeUriComponent('hello%20world'), 'hello world');
assert.strictEqual(safeDecodeUriComponent('valid%2Fpath'), 'valid/path');
// Malformed sequences that would normally throw URIError: URI malformed
assert.strictEqual(safeDecodeUriComponent('address%'), 'address%');
assert.strictEqual(safeDecodeUriComponent('100%'), '100%');
assert.strictEqual(safeDecodeUriComponent('%ZZ'), '%ZZ');
assert.strictEqual(safeDecodeUriComponent('%E0%A4%A'), '%E0%A4%A');
assert.strictEqual(safeDecodeUriComponent('foo%bar%baz'), 'foo%bar%baz');
console.log('✓ Test 1 passed: safeDecodeUriComponent never throws on malformed inputs');

// Test 2: extractSvgContent with raw SVG
console.log('Test 2: extractSvgContent with raw SVG');
const rawSvg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
assert.strictEqual(extractSvgContent(rawSvg), rawSvg);
console.log('✓ Test 2 passed: raw SVG preserved');

// Test 3: extractSvgContent with unescaped SVG data URI containing raw '%'
console.log('Test 3: extractSvgContent with raw percentage in utf8 data URI (reproduction of Explorer UI Error)');
const unescapedDataUri = 'data:image/svg+xml;utf8,<svg width="100%" height="100%"><stop offset="50%" stop-opacity="25%"/></svg>';
// In standard JS, decodeURIComponent(unescapedDataUri.replace(...)) THROWS URIError: URI malformed!
let extracted = '';
assert.doesNotThrow(() => {
  extracted = extractSvgContent(unescapedDataUri)!;
}, 'extractSvgContent must not throw on raw percentage strings');
assert.ok(extracted.includes('width="100%"'), 'Extracted SVG must contain width="100%"');
assert.ok(extracted.includes('offset="50%"'), 'Extracted SVG must contain offset="50%"');
console.log('✓ Test 3 passed: unescaped SVG with % characters extracted cleanly without throwing');

// Test 4: extractSvgContent with base64 encoded SVG
console.log('Test 4: extractSvgContent with base64 encoded SVG');
const b64DataUri = 'data:image/svg+xml;base64,' + Buffer.from('<svg id="test"></svg>').toString('base64');
const extractedB64 = extractSvgContent(b64DataUri);
assert.strictEqual(extractedB64, '<svg id="test"></svg>');
console.log('✓ Test 4 passed: base64 encoded SVG extracted cleanly');

// Test 5: extractSvgContent with raster image
console.log('Test 5: extractSvgContent returns null for raster images');
assert.strictEqual(extractSvgContent('https://example.com/logo.png'), null);
assert.strictEqual(extractSvgContent('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='), null);
assert.strictEqual(extractSvgContent(null), null);
assert.strictEqual(extractSvgContent(undefined), null);
console.log('✓ Test 5 passed: raster images return null for fallback <img> tag rendering');

// Test 6: isolateSvgGradients with malformed data URI
console.log('Test 6: isolateSvgGradients resilience on malformed percent URI');
assert.doesNotThrow(() => {
  const result = isolateSvgGradients(unescapedDataUri, 'test-key-1');
  assert.ok(result.length > 0, 'isolateSvgGradients must return valid SVG');
});
console.log('✓ Test 6 passed: isolateSvgGradients processes malformed data URI cleanly');

console.log('====================================================');
console.log('ALL URI MALFORMED AND SVG GUARD TESTS PASSED (6/6) ✓');
console.log('====================================================');
