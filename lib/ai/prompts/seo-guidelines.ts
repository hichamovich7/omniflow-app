/**
 * Generator-agnostic SEO writing rules for long-form content (articles, blog posts).
 * Import this into any future content-generation prompt that produces a full
 * article — not specific to WordPress.
 */

export interface SeoGuidelinesOptions {
  /**
   * 'outline' (planning step) also carries the title/meta title/meta
   * description/slug/alt-text rules; 'article' (writing step) only carries
   * the rules that apply to the body the model is about to write.
   */
  stage: 'outline' | 'article';
  minWords: number;
  maxWords: number;
  /** Outline stage only — the article stage writes the sections the outline already fixed. */
  minSections?: number;
  maxSections?: number;
  /** H3 subheadings are only requested on an explicit true; false bans them. */
  includeH3?: boolean;
  /** Only an explicit false drops the block (same 3-state convention as the Structure toggles). */
  includeKeyTakeaways?: boolean;
  includeFaq?: boolean;
  includeConclusion?: boolean;
  /**
   * true: a table is planned/required, false: none allowed, undefined: the
   * outline decides from the topic.
   */
  includeComparisonTable?: boolean;
}

function buildHeadingRule(includeH3: boolean | undefined): string {
  if (includeH3 === true) {
    return '- Heading structure: exactly one H1 (the title, handled separately). Body headings use H2 for main sections and H3 for subsections nested under an H2. Never skip a level (no H3 without a parent H2).';
  }
  if (includeH3 === false) {
    return '- Heading structure: exactly one H1 (the title, handled separately). Body headings use H2 only — no H3 or deeper heading level anywhere.';
  }
  return '- Heading structure: exactly one H1 (the title, handled separately). Body headings use H2 for main sections. Never skip a level.';
}

export function buildSeoGuidelines(primaryKeyword: string, opts: SeoGuidelinesOptions): string {
  const isOutline = opts.stage === 'outline';

  const keywordPlacement = isOutline
    ? `- Primary keyword "${primaryKeyword}" placement: in the title, the meta title, the meta description, the slug, at least one planned H2, and at least one image alt text — and it will appear within the first 100 words of the body. Never force it where it reads unnaturally.`
    : `- Primary keyword "${primaryKeyword}": use it within the first 100 words of the body and naturally where it fits in the sections. Never force it where it reads unnaturally.`;

  const outlineOnlyRules = isOutline
    ? '\n- Meta description: 150-160 characters, includes the primary keyword, written as a compelling summary that encourages clicks.'
    : '';

  const sectionsRange =
    opts.minSections !== undefined && opts.maxSections !== undefined
      ? `${opts.minSections}-${opts.maxSections} H2 sections`
      : 'the planned H2 sections';

  // AEO block list, built from the toggles so a disabled block is never
  // requested (Key Takeaways, FAQ, Conclusion, Comparison Table).
  const blocks: string[] = ['H1 title.', 'Introduction (3-4 short paragraphs).'];
  blocks.push(
    'Quick Answer — a direct, self-contained answer to the core question, 40-60 words, phrased so it can be quoted verbatim by a featured snippet or an AI answer engine. No "as mentioned above" or other dependency on surrounding context.'
  );
  if (opts.includeKeyTakeaways !== false) {
    blocks.push('Key Takeaways — 4-6 bullets, scannable, each a complete standalone point rather than a teaser for a section below.');
  }
  blocks.push(`Main Content — ${sectionsRange}, each fully developed, covering the topic in depth.`);
  if (opts.includeComparisonTable === true) {
    blocks.push('Comparison Table — a genuine comparison of the options, methods, or criteria the topic involves.');
  } else if (opts.includeComparisonTable === undefined) {
    blocks.push(
      "Comparison Table — only when the topic naturally involves comparing materials, methods, products, or options. Never force one onto a topic that doesn't call for one; omit the whole block instead."
    );
  }
  blocks.push('Common Mistakes — 3-5 real, specific mistakes people make on this topic, each with concrete editorial value, not generic filler.');
  if (opts.includeFaq !== false) {
    blocks.push(
      'FAQ — 4-6 real, distinct questions (not generic "what is X" filler) that are not already answered by a Main Content section, each with a complete standalone answer.'
    );
  }
  if (opts.includeConclusion !== false) {
    blocks.push('Conclusion — a short synthesis that adds a final takeaway, not a repeat of the introduction.');
  }
  blocks.push(
    'Soft CTA — a low-pressure invitation to a next action (read a related article, subscribe), never a hard sales pitch. Its tone must match the Brand Profile rather than read as a fixed generic phrase reused across every article.'
  );

  return `SEO writing rules — follow all of them:
${buildHeadingRule(opts.includeH3)}
${keywordPlacement}${outlineOnlyRules}
- Paragraphs: short, 2-4 sentences each. Break up long ideas into multiple paragraphs rather than one dense block.
- Voice: active voice throughout. Avoid passive constructions.
- Keyword usage: natural density, never keyword-stuffed. Use synonyms and related terms instead of repeating the exact phrase.

AEO (Answer Engine Optimization) structure — standard editorial layout for long-form articles, optimized to be citable by featured snippets and AI Overviews:
${blocks.map((block, i) => `${i + 1}. ${block}`).join('\n')}

Target length: ${opts.minWords}-${opts.maxWords} words for the full body content (the FAQ answers are not part of this count).

Links — never invent a URL:
- Only use URLs that are explicitly provided in these instructions. Never invent, guess, or reconstruct a URL from memory, and never cite a source you were not given.
- If no URL is provided, do not add any external link.
- Internal links (to other pages on the target site) are out of scope — do not invent internal links.`;
}

/**
 * Anti-fabrication rules shared by every WordPress outline and article
 * prompt. Keeps the model from turning plausible-sounding guesses into
 * stated facts.
 */
export function buildFactualIntegrityRules(): string {
  return `Factual integrity — mandatory:
- Never invent statistics, percentages, or figures.
- Never invent studies, surveys, reports, experts, or sources.
- Never invent quotations or attribute words to a real person or organization.
- Never invent prices, dates, deadlines, measurements, or results (including customer or test results).
- Use only the information provided in these instructions (keyword, pins, research notes, brand profile, outline) plus widely established general knowledge. A precise figure, date, price, or named source is allowed only if it appears in the provided information.
- If a useful piece of information is missing, say so plainly (for example, that it varies or should be checked with an official source) instead of making it up.
- Never present an assumption, estimate, or opinion as a certainty — qualify it clearly.
- These rules override any other instruction, including a hook brief asking for a statistic or quotation: without one provided, open with a verifiable observation or a scenario instead.`;
}

/** Editorial quality rules shared by every WordPress outline and article prompt. */
export function buildEditorialQualityRules(): string {
  return `Editorial quality — mandatory:
- No generic introduction: never open with a platitude ("In today's world…", "X is more popular than ever…", "Whether you are a beginner or an expert…"). Start with something specific to this topic.
- No repetition: the Introduction, Quick Answer, Key Takeaways, sections, FAQ, and Conclusion must each add something new. Do not restate the same point in different words across them; the FAQ must not re-ask what a section already covers, and the Conclusion must not summarize the article sentence by sentence.
- No empty sentences: cut filler that carries no information ("It is important to note that…", "As we have seen…", "In conclusion, it is clear that…").
- No overly long paragraphs: never more than 4 sentences or about 90 words in a single paragraph.`;
}
