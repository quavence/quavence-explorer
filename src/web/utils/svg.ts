/**
 * Utility to sanitize SVG content against Stored XSS and isolate
 * SVG gradient/filter IDs to prevent DOM collisions.
 * Complies with OWASP API Security and RFC 2119 Zero-Trust specifications.
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safe URI component decoder that never throws URIError on malformed strings.
 * Falls back to returning the raw input intact.
 */
export function safeDecodeUriComponent(str?: string | null): string {
  if (!str) return '';
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Safely extracts vector SVG content from data URI or raw string without throwing.
 * Returns null if the resource is a raster image (PNG, JPEG, etc.).
 */
export function extractSvgContent(svgOrImg?: string | null): string | null {
  if (!svgOrImg || typeof svgOrImg !== 'string') return null;
  const trimmed = svgOrImg.trim();
  if (trimmed.startsWith('data:image/svg+xml')) {
    if (trimmed.includes(';base64,')) {
      try {
        const b64 = trimmed.split(';base64,')[1];
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(b64, 'base64').toString('utf8');
        } else if (typeof atob === 'function') {
          return atob(b64);
        }
      } catch {
        return trimmed;
      }
    }
    const raw = trimmed.replace(/^data:image\/svg\+xml(?:;utf8)?,/, '');
    return safeDecodeUriComponent(raw);
  }
  if (trimmed.includes('<svg')) {
    return trimmed;
  }
  return null;
}

/**
 * Strict SVG Sanitizer to prevent Stored XSS attacks via vector graphics.
 * Completely strips executable tags, event handlers, and dangerous URIs.
 */
export function sanitizeSvgContent(rawSvg?: string | null): string {
  if (!rawSvg) return '';
  let svg = rawSvg.trim().replace(/\0/g, '');

  // If encoded data URI, decode it (supporting both base64 and utf8)
  if (svg.startsWith('data:image/svg+xml')) {
    if (svg.includes(';base64,')) {
      try {
        const b64 = svg.split(';base64,')[1];
        if (typeof Buffer !== 'undefined') {
          svg = Buffer.from(b64, 'base64').toString('utf8');
        } else if (typeof atob === 'function') {
          svg = atob(b64);
        }
      } catch {
        // keep raw
      }
    } else {
      svg = safeDecodeUriComponent(svg.replace(/^data:image\/svg\+xml(?:;utf8)?,/, ''));
    }
  }

  // Strip XML/HTML comments first to prevent comment-splitting tag bypasses (e.g. <script <!-- > --> >)
  svg = svg.replace(/<!--[\s\S]*?-->/g, '');

  // 1. Strip disallowed/executable elements and their contents
  const dangerousTags = [
    'script',
    'foreignObject',
    'iframe',
    'embed',
    'object',
    'applet',
    'base',
    'link',
    'meta',
    'audio',
    'video',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'animate',
    'set',
    'animateMotion',
    'animateTransform',
    'discard',
    'handler',
    'listener'
  ];

  for (const tag of dangerousTags) {
    // Repeatedly strip paired tags with optional XML namespace prefix to prevent tricks like <x:script> or <scr<script>ipt>
    const pairedRegex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:[a-zA-Z0-9_-]+:)?${tag}\\s*>`, 'gi');
    let prev = '';
    while (prev !== svg) {
      prev = svg;
      svg = svg.replace(pairedRegex, '');
    }

    // Strip self-closing or lone opening tags with optional namespace prefix
    const selfClosingRegex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}\\b[^>]*\\/?>`, 'gi');
    prev = '';
    while (prev !== svg) {
      prev = svg;
      svg = svg.replace(selfClosingRegex, '');
    }
  }

  // 2. Strip inline event handlers: onload, onerror, onclick, onmouseover, onfocus, etc.
  // Uses \b to catch both <svg onload=...> and <svg/onload=...>
  svg = svg.replace(/\bon[a-zA-Z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 3. Strip dangerous protocol schemes in href, xlink:href, src, action, etc.
  // Allowed raster data URIs: data:image/(png|jpeg|jpg|webp|gif);base64,...
  // Blocks javascript:, vbscript:, external http://, https://, and protocol-relative //
  // Supports quoted ("...", '...') and unquoted attribute values (e.g. href=javascript:...)
  svg = svg.replace(
    /(\b(?:xlink:)?(?:href|src|action|data)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, _attrPrefix, doubleQuoted, singleQuoted, unquoted) => {
      const rawValue = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      const normalized = rawValue
        .replace(/&#[xX]([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#([0-9]+);/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&colon;/gi, ':')
        .replace(/[\x00-\x20\s]+/g, '')
        .toLowerCase();

      if (
        normalized.startsWith('javascript:') ||
        normalized.startsWith('vbscript:') ||
        normalized.startsWith('http://') ||
        normalized.startsWith('https://') ||
        normalized.startsWith('//')
      ) {
        return '';
      }

      if (normalized.startsWith('data:')) {
        const isAllowedRaster = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(rawValue.trim());
        if (!isAllowedRaster) {
          return '';
        }
      }

      return match;
    }
  );

  // 4. Sanitize style attributes if they contain javascript:, expression, behavior, or external url()
  svg = svg.replace(/(\bstyle\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (match, _prefix, doubleQuoted, singleQuoted, unquoted) => {
    const val = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
    const norm = val.toLowerCase();
    if (
      norm.includes('javascript:') ||
      norm.includes('expression(') ||
      norm.includes('behavior:') ||
      /url\s*\(\s*['"]?https?:/i.test(norm) ||
      /url\s*\(\s*['"]?\/\//i.test(norm)
    ) {
      return '';
    }
    return match;
  });

  // 5. Sanitize <style> blocks against dangerous CSS functions (@import, javascript:, expression, -moz-binding, behavior, external url())
  svg = svg.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (match, css) => {
    const lower = css.toLowerCase();
    if (
      lower.includes('javascript:') ||
      lower.includes('expression') ||
      lower.includes('behavior') ||
      lower.includes('@import') ||
      lower.includes('-moz-binding') ||
      /url\s*\(\s*['"]?https?:/i.test(lower) ||
      /url\s*\(\s*['"]?\/\//i.test(lower)
    ) {
      return '';
    }
    return match;
  });

  return svg.trim();
}

export function isolateSvgGradients(rawSvg?: string | null, key?: string | number): string {
  if (!rawSvg) return '';
  let svg = sanitizeSvgContent(rawSvg);
  if (!svg) return '';
  if (svg.startsWith('data:image/svg+xml')) {
    svg = safeDecodeUriComponent(svg.replace(/^data:image\/svg\+xml(?:;utf8)?,/, ''));
  }

  // Derive a deterministic or unique prefix
  let hashStr = '';
  if (key !== undefined && key !== null && String(key).trim() !== '') {
    hashStr = String(key).replace(/[^a-zA-Z0-9_-]/g, '_');
  } else {
    // Fast string hash of svg contents
    let h = 5381;
    for (let i = 0; i < svg.length; i++) {
      h = ((h << 5) + h) + svg.charCodeAt(i);
      h |= 0;
    }
    hashStr = 's' + Math.abs(h).toString(36);
  }
  const prefix = `q_${hashStr}_`;

  // Avoid re-prefixing if already isolated with this prefix
  if (svg.includes(`id="${prefix}`) || svg.includes(`id='${prefix}`)) {
    return svg;
  }

  // 1. Collect all declared IDs and Filter Results in <defs>
  const idRegex = /\b(id|result)=["']([^"']+)["']/g;
  const declaredIds = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = idRegex.exec(svg)) !== null) {
    const id = match[2];
    if (!['SourceGraphic', 'SourceAlpha', 'BackgroundImage', 'BackgroundAlpha'].includes(id)) {
      declaredIds.add(id);
    }
  }

  if (declaredIds.size === 0) {
    return svg;
  }

  // 2. Replace each declared ID and all references to it
  for (const id of declaredIds) {
    const newId = `${prefix}${id}`;
    const defRegex = new RegExp(`\\b(id|result)=(['"])${escapeRegex(id)}\\2`, 'g');
    svg = svg.replace(defRegex, `$1=$2${newId}$2`);

    const urlRegex = new RegExp(`url\\((['"]?)#${escapeRegex(id)}\\1\\)`, 'g');
    svg = svg.replace(urlRegex, `url($1#${newId}$1)`);

    const hrefRegex = new RegExp(`(\\b(?:xlink:)?href=['"])#${escapeRegex(id)}(['"])`, 'g');
    svg = svg.replace(hrefRegex, `$1#${newId}$2`);

    const inRegex = new RegExp(`(\\bin2?=['"])${escapeRegex(id)}(['"])`, 'g');
    svg = svg.replace(inRegex, `$1${newId}$2`);
  }

  return svg;
}
