/**
 * Dependency-free walk over WordPress post HTML (rendered `content`) that
 * keeps only what an article says and shows: headings, text blocks, images
 * and their captions. Chrome (scripts, styles, menus, forms, share / ad /
 * related-post blocks) and hidden elements are dropped with everything they
 * contain. Never executes, fetches or writes anything.
 */

export type HtmlEvent =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'caption'; text: string };

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const DROPPED_TAGS = new Set([
  'script', 'style', 'noscript', 'iframe', 'svg', 'math', 'canvas', 'object', 'video', 'audio',
  'form', 'nav', 'header', 'footer', 'aside', 'button', 'select', 'textarea', 'template', 'dialog',
]);

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main', 'blockquote', 'figure', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'br', 'hr', 'h4', 'h5', 'h6',
]);

// Class / id fragments of non-editorial blocks (ads, share bars, related
// posts, newsletter boxes, tables of contents, buttons, cookie banners…).
const DROPPED_CLASS_PATTERN =
  /(?:^|[\s_-])(?:ads?|adsbygoogle|advert\w*|sponsor\w*|promo|share\w*|sharedaddy|sharing|social\w*|jp-relatedposts|related\w*|yarpp\w*|newsletter|subscribe\w*|comments?|breadcrumbs?|toc|ez-toc\w*|table-of-contents|wp-block-buttons|wp-block-button|author-box|cookie\w*|popup|modal|menu|navigation|sidebar|widget\w*)(?:$|[\s_-])/i;

const HIDDEN_STYLE_PATTERN = /(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|em|rem)?\s*(?:;|$)|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$))/i;

// Inline formatting never separates words (`self-<em>striping</em>`).
const INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'cite', 'code', 'del', 'em', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  times: '×', deg: '°', middot: '·', bull: '•', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç',
  uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ntilde: 'ñ', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function attribute(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

function hasBooleanAttribute(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`, 'i').test(attrs);
}

function isDropped(name: string, attrs: string): boolean {
  if (DROPPED_TAGS.has(name)) return true;
  if (hasBooleanAttribute(attrs, 'hidden')) return true;
  if ((attribute(attrs, 'aria-hidden') ?? '').toLowerCase() === 'true') return true;
  const style = attribute(attrs, 'style');
  if (style && HIDDEN_STYLE_PATTERN.test(style)) return true;
  const classes = `${attribute(attrs, 'class') ?? ''} ${attribute(attrs, 'id') ?? ''}`.trim();
  return classes.length > 0 && DROPPED_CLASS_PATTERN.test(classes);
}

/** The real image URL, lazy-loading attributes first; data: URIs are ignored. */
function imageSource(attrs: string): string | null {
  for (const name of ['data-src', 'data-lazy-src', 'data-original', 'src']) {
    const value = attribute(attrs, name)?.trim();
    if (value && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

const TOKEN_PATTERN = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;

/**
 * Turns HTML into an ordered list of events. Dropped elements are skipped
 * with their whole subtree (nested tags of the same name are counted, so a
 * nested `<div>` cannot end the skip early).
 */
export function htmlToEvents(html: string): HtmlEvent[] {
  const source = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ' ')
    .replace(/<!doctype[^>]*>/gi, ' ');

  const events: HtmlEvent[] = [];
  let buffer = '';
  let heading: 1 | 2 | 3 | null = null;
  let inCaption = false;
  let skip: { name: string; depth: number } | null = null;

  const flush = () => {
    const text = decodeEntities(buffer).replace(/\s+/g, ' ').trim();
    buffer = '';
    if (!text) return;
    if (heading) events.push({ kind: 'heading', level: heading, text });
    else if (inCaption) events.push({ kind: 'caption', text });
    else events.push({ kind: 'text', text });
  };

  let cursor = 0;
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    // Anything tag-like the tokenizer could not read is never kept as text.
    if (!skip) buffer += source.slice(cursor, index).replace(/<[^>]*>?/g, ' ');
    cursor = index + match[0].length;

    const closing = match[1] === '/';
    const name = match[2].toLowerCase();
    const attrs = match[3] ?? '';
    const selfClosing = match[4] === '/' || VOID_TAGS.has(name);

    if (skip) {
      if (name === skip.name && !selfClosing) {
        skip.depth += closing ? -1 : 1;
        if (skip.depth === 0) skip = null;
      }
      continue;
    }

    if (!closing && isDropped(name, attrs)) {
      if (!selfClosing) {
        flush();
        skip = { name, depth: 1 };
      }
      continue;
    }

    if (name === 'h1' || name === 'h2' || name === 'h3') {
      flush();
      heading = closing ? null : (Number(name[1]) as 1 | 2 | 3);
      continue;
    }

    if (name === 'figcaption') {
      flush();
      inCaption = !closing;
      continue;
    }

    if (name === 'img' && !closing) {
      const src = imageSource(attrs);
      if (src) {
        flush();
        events.push({ kind: 'image', src, alt: (attribute(attrs, 'alt') ?? '').replace(/\s+/g, ' ').trim() });
      }
      continue;
    }

    if (BLOCK_TAGS.has(name)) {
      flush();
    } else if (!INLINE_TAGS.has(name)) {
      buffer += ' ';
    }
  }
  if (!skip) buffer += source.slice(cursor).replace(/<[^>]*>?/g, ' ');
  flush();

  return events;
}
