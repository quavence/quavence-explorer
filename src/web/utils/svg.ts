/**
 * Utility to isolate SVG gradient and filter IDs to prevent DOM ID collisions
 * when multiple SVGs are rendered into the same document.
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isolateSvgGradients(rawSvg?: string | null, key?: string | number): string {
  if (!rawSvg) return '';
  let svg = rawSvg.trim();
  if (svg.startsWith('data:image/svg+xml')) {
    try {
      svg = decodeURIComponent(svg.replace(/^data:image\/svg\+xml;utf8,/, ''));
    } catch {
      // keep raw
    }
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
