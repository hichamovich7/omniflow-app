/**
 * Field-level validation helpers for the /wordpress/blog-post form
 * (TASK-FIX-056). Pure functions over Zod issues — shared by the client form
 * (inline errors, focus on the first invalid field) and the generation
 * routes (a readable `error.message` instead of the raw Zod text).
 */

export interface ValidationIssueLike {
  code: string;
  path: PropertyKey[];
  message: string;
}

export type ArticleFormFieldErrors = Partial<Record<string, string>>;

/** Top-to-bottom order of the fields as rendered on the page. */
export const ARTICLE_FORM_FIELD_ORDER = [
  'projectId',
  'language',
  'categoryId',
  'keyword',
  'researchNotes',
  'sourceType',
  'sourceUrl',
  'pastedContent',
  'articleType',
  'articleSize',
  'toneOfVoice',
  'pointOfView',
  'targetCountry',
  'hookBrief',
  'seoKeywords',
  'manualExternalUrls',
] as const;

/** DOM id of each field's control, used to focus the first invalid one. */
export const ARTICLE_FORM_FIELD_IDS: Record<string, string> = {
  projectId: 'project',
  language: 'language',
  keyword: 'keyword',
  researchNotes: 'research-notes',
  sourceType: 'url-source-type',
  sourceUrl: 'source-url',
  pastedContent: 'pasted-content',
  articleType: 'article-type',
  articleSize: 'article-size',
  toneOfVoice: 'tone-of-voice',
  pointOfView: 'point-of-view',
  targetCountry: 'target-country',
  hookBrief: 'hook-brief',
  seoKeywords: 'seo-keywords',
  manualExternalUrls: 'manual-external-urls',
};

/** Fields rendered inside the collapsed-by-default Advanced Options block. */
export const ADVANCED_ARTICLE_FORM_FIELDS: ReadonlySet<string> = new Set([
  'pointOfView',
  'targetCountry',
  'hookBrief',
  'seoKeywords',
  'manualExternalUrls',
]);

const ARTICLE_FORM_FIELD_LABELS: Record<string, string> = {
  projectId: 'Project',
  language: 'Language',
  categoryId: 'Category',
  keyword: 'Primary keyword',
  researchNotes: 'Research notes',
  sourceType: 'Input type',
  sourceUrl: 'Source URL',
  pastedContent: 'Pasted text',
  articleType: 'Article type',
  articleSize: 'Article size',
  toneOfVoice: 'Tone of voice',
  pointOfView: 'Point of view',
  targetCountry: 'Target country',
  hookBrief: 'Hook brief',
  seoKeywords: 'SEO keywords',
  manualExternalUrls: 'Manual URLs',
};

// Zod v4's built-in messages all start with "Invalid input" / "Invalid option"
// / "Too small" / "Too big" — never shown as-is to the user.
const RAW_ZOD_MESSAGE = /^(Invalid input|Invalid option|Invalid string|Invalid element|Too small|Too big|Expected|Required)\b/;

function fieldKey(issue: ValidationIssueLike): string {
  const head = issue.path[0];
  return typeof head === 'string' ? head : 'form';
}

/** The issue's own message when it's a schema-authored one, else a generic per-field message. */
export function toFriendlyIssueMessage(issue: ValidationIssueLike): string {
  if (!RAW_ZOD_MESSAGE.test(issue.message)) return issue.message;
  const label = ARTICLE_FORM_FIELD_LABELS[fieldKey(issue)];
  return label ? `${label} has an invalid value` : 'Some fields are invalid. Check the form and try again.';
}

/** First friendly message per top-level field. */
export function getArticleFormFieldErrors(issues: readonly ValidationIssueLike[]): ArticleFormFieldErrors {
  const errors: ArticleFormFieldErrors = {};
  for (const issue of issues) {
    const key = fieldKey(issue);
    if (!errors[key]) errors[key] = toFriendlyIssueMessage(issue);
  }
  return errors;
}

/** The invalid field that comes first on the page, or null. */
export function getFirstInvalidField(errors: ArticleFormFieldErrors): string | null {
  const ordered = ARTICLE_FORM_FIELD_ORDER.find((field) => errors[field]);
  if (ordered) return ordered;
  return Object.keys(errors).find((field) => errors[field]) ?? null;
}

/** Single readable message for an API `error.message`: the first invalid field in page order. */
export function formatArticleValidationError(issues: readonly ValidationIssueLike[]): string {
  const errors = getArticleFormFieldErrors(issues);
  const first = getFirstInvalidField(errors);
  return (first && errors[first]) || 'Some fields are invalid. Check the form and try again.';
}
