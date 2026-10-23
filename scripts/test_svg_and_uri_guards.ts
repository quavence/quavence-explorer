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

// Test 7 (Red Team Adversarial): Stored XSS injection through malformed data URI with raw %
console.log('Test 7 (Adversarial): Stored XSS injection via data URI with raw % characters');
const hostileDataUri = 'data:image/svg+xml;utf8,<svg width="100%" onload="alert(document.cookie)"><script>window.location="http://evil.com"</script><circle cx="50" cy="50" r="10"/></svg>';
const extractedHostile = extractSvgContent(hostileDataUri);
assert.ok(extractedHostile, 'Hostile SVG should be extracted for downstream sanitization');
const sanitizedHostile = isolateSvgGradients(extractedHostile, 'hostile-1');

// Verify that all attack vectors were stripped
assert.strictEqual(sanitizedHostile.includes('<script'), false, 'All <script> tags must be completely stripped');
assert.strictEqual(sanitizedHostile.includes('onload'), false, 'All inline event handlers (onload) must be completely stripped');
assert.strictEqual(sanitizedHostile.includes('evil.com'), false, 'All external exploit payloads must be completely stripped');
assert.ok(sanitizedHostile.includes('<circle'), 'Benign SVG elements (<circle>) must remain intact');
console.log('✓ Test 7 passed: Stored XSS vectors inside data URI with % strictly eradicated');

// Test 8 (Adversarial): Multi-vector XSS payloads in extractSvgContent + isolateSvgGradients
console.log('Test 8 (Adversarial): Complex XSS payloads (foreignObject, javascript: href, dangerous style)');
const complexPayloads = [
  '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>',
  '<svg><a xlink:href="javascript:alert(1)"><text>Click</text></a></svg>',
  '<svg><a href="javascript:alert(1)"><text>Click</text></a></svg>',
  '<svg style="background: url(javascript:alert(1))"><rect width="10" height="10"/></svg>',
  '<svg><style>@import "http://evil.com/xss.css";</style></svg>',
  '<svg><animate href="#x" attributeName="href" values="javascript:alert(1)" /></svg>',
];

for (let i = 0; i < complexPayloads.length; i++) {
  const payload = complexPayloads[i];
  const cleaned = isolateSvgGradients(extractSvgContent(payload), `complex-${i}`);
  assert.strictEqual(cleaned.includes('<script'), false, `Payload #${i + 1}: <script> must be stripped`);
  assert.strictEqual(cleaned.includes('foreignObject'), false, `Payload #${i + 1}: foreignObject must be stripped`);
  assert.strictEqual(cleaned.includes('javascript:'), false, `Payload #${i + 1}: javascript: scheme must be stripped`);
  assert.strictEqual(cleaned.includes('@import'), false, `Payload #${i + 1}: @import must be stripped`);
  assert.strictEqual(cleaned.includes('<animate'), false, `Payload #${i + 1}: <animate> must be stripped`);
}
console.log('✓ Test 8 passed: All complex XSS vectors eradicated by sanitizer pipeline');

console.log('====================================================');
console.log('ALL URI MALFORMED AND SECURITY XSS TESTS PASSED (8/8) ✓');
console.log('====================================================');

