/**
 * Generator-agnostic SEO writing rules for long-form content (articles, blog posts).
 * Import this into any future content-generation prompt that produces a full
 * article — not specific to WordPress.
 */
export function buildSeoGuidelines(primaryKeyword: string): string {
  return `SEO writing rules — follow all of them:
- Heading structure: exactly one H1 (the title, handled separately). Body headings use H2 for main sections and H3 for subsections nested under an H2. Never skip a level (no H3 without a parent H2).
- Primary keyword "${primaryKeyword}" placement: in the title, within the first 100 words of the body, in at least one H2, in the meta description, in the slug, and in at least one image alt text. Never force it where it reads unnaturally.
- Meta description: 150-160 characters, includes the primary keyword, written as a compelling summary that encourages clicks.
- Paragraphs: short, 2-4 sentences each. Break up long ideas into multiple paragraphs rather than one dense block.
- Voice: active voice throughout. Avoid passive constructions.
- Keyword usage: natural density, never keyword-stuffed. Use synonyms and related terms instead of repeating the exact phrase.

AEO (Answer Engine Optimization) structure — standard editorial layout for long-form articles. Optimized to be citable by featured snippets and AI Overviews, not just read top-to-bottom by a human:
1. H1 title.
2. Introduction (3-4 paragraphs).
3. Quick Answer — a direct, self-contained answer to the core question, 40-60 words, phrased so it can be quoted verbatim by a featured snippet or an AI answer engine. No "as mentioned above" or other dependency on surrounding context.
4. Key Takeaways — 4-6 bullets, scannable, each a complete standalone fact rather than a teaser for a section below.
5. Main Content — 8-10 H2 sections, each fully developed (150-200+ words), covering the topic in depth.
6. Comparison Table — only when the topic naturally involves comparing materials, methods, products, or options. Never force one onto a topic that doesn't call for it; omit the whole block instead.
7. Common Mistakes — 3-5 real, specific mistakes people make on this topic, each with concrete editorial value, not generic filler.
8. FAQ — 4-6 real, distinct questions (not generic "what is X" filler), each with a complete standalone answer. Always captured as structured question/answer pairs, never written as free-form prose in the body, so it can back a FAQPage rich result later.
9. Conclusion.
10. Soft CTA — a low-pressure invitation to a next action (read a related article, subscribe), never a hard sales pitch. Its tone must match the Brand Profile rather than read as a fixed generic phrase reused across every article.

Target length: 1800-2500 words for the full body content (Quick Answer, Key Takeaways, Main Content, optional Comparison Table, Common Mistakes, Conclusion, Soft CTA — the FAQ answers are captured separately and are not part of this count).

External linking — one real, verified source, never a guess:
- Exactly one external link per article, to a genuinely authoritative source (a reputable publication, official documentation, a government/industry body, or similarly credible site) that backs a factual claim already in the article.
- The link must be found and verified via live web search, never invented or guessed from training data — a plausible-looking URL that hasn't been checked is worse than no link at all.
- The link is woven into an existing sentence with relevant anchor text (never "click here" or "this article") — it never gets its own sentence or paragraph just to hold it.
- If no genuinely relevant, verifiable source exists for this topic, skip the external link entirely rather than forcing an unrelated or low-quality one.
- Internal links (to other pages on the target site) are out of scope until the site is actually connected — do not invent internal links.`;
}
