import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { z } from 'zod';
import {
  ARTICLE_KEYWORD_REQUIRED_MESSAGE,
  ARTICLE_LANGUAGE_REQUIRED_MESSAGE,
  ARTICLE_PROJECT_REQUIRED_MESSAGE,
  generateArticleFromPinsSchema,
  generateArticleFromUrlSchema,
  generateArticleSchema,
  normalizeManualExternalUrls,
} from '@/lib/validations/wordpress';
import {
  ADVANCED_ARTICLE_FORM_FIELDS,
  ARTICLE_FORM_FIELD_IDS,
  formatArticleValidationError,
  getArticleFormFieldErrors,
  getFirstInvalidField,
  toFriendlyIssueMessage,
} from '@/lib/wordpress/article-form-validation';

/**
 * TASK-FIX-056 — "Invalid input: expected string, received array" on
 * /wordpress/blog-post. Offline: pure Zod + helper checks and source
 * assertions; no Supabase, no AI call, no browser session.
 */

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const RAW_ZOD = /Invalid input|expected string|received array/;

const VALID_KEYWORD_FORM = {
  projectId: PROJECT_ID,
  keyword: '10 Ideen für eine Küche',
  language: 'de',
  categoryId: CATEGORY_ID,
  articleSize: 'medium',
  toneOfVoice: 'friendly',
  seoKeywords: ['küchen ideen', 'kleine küche'],
  manualExternalUrls: 'https://example.org/a, https://example.org/b',
};

test.describe('root cause: client → server double parse of manualExternalUrls', () => {
  test('reproduces the original error with the previous string-only schema', () => {
    // Exact shape of the pre-fix schema: string in, string[] out.
    const legacy = z.object({
      manualExternalUrls: z
        .string()
        .trim()
        .optional()
        .transform((val) => (val ? val.split(',').map((u) => u.trim()).filter(Boolean) : [])),
    });
    const clientParsed = legacy.parse({ manualExternalUrls: undefined });
    expect(clientParsed.manualExternalUrls).toEqual([]);
    // The client sent parsed.data; the server re-parsed it with the same schema.
    const serverParsed = legacy.safeParse(JSON.parse(JSON.stringify(clientParsed)));
    expect(serverParsed.success).toBe(false);
    expect(serverParsed.error?.issues[0].message).toBe('Invalid input: expected string, received array');
  });

  test('the fixed schema survives the client → JSON → server round trip', () => {
    const client = generateArticleSchema.safeParse(VALID_KEYWORD_FORM);
    expect(client.success).toBe(true);
    const server = generateArticleSchema.safeParse(JSON.parse(JSON.stringify(client.data)));
    expect(server.success).toBe(true);
    expect(server.data).toEqual(client.data);
  });

  test('round trip with no manual URL at all (the default form) also passes', () => {
    const { manualExternalUrls: _omit, ...withoutUrls } = VALID_KEYWORD_FORM;
    void _omit;
    const client = generateArticleSchema.parse(withoutUrls);
    expect(client.manualExternalUrls).toEqual([]);
    expect(generateArticleSchema.safeParse(JSON.parse(JSON.stringify(client))).success).toBe(true);
  });
});

test.describe('manualExternalUrls accepts a string or an array', () => {
  test('comma-separated string payload', () => {
    const parsed = generateArticleSchema.parse({ ...VALID_KEYWORD_FORM, manualExternalUrls: ' https://a.example/x ,https://b.example/y, ' });
    expect(parsed.manualExternalUrls).toEqual(['https://a.example/x', 'https://b.example/y']);
  });

  test('array payload', () => {
    const parsed = generateArticleSchema.parse({ ...VALID_KEYWORD_FORM, manualExternalUrls: [' https://a.example/x', '', 'https://b.example/y'] });
    expect(parsed.manualExternalUrls).toEqual(['https://a.example/x', 'https://b.example/y']);
  });

  test('empty string, empty array and undefined all mean "no URL"', () => {
    for (const value of ['', '   ', [], undefined]) {
      expect(generateArticleSchema.parse({ ...VALID_KEYWORD_FORM, manualExternalUrls: value }).manualExternalUrls).toEqual([]);
    }
  });

  test('invalid URL rejected in both shapes with a readable message', () => {
    for (const value of ['https://ok.example, not a url', ['https://ok.example', 'not a url']]) {
      const parsed = generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, manualExternalUrls: value });
      expect(parsed.success).toBe(false);
      expect(formatArticleValidationError(parsed.error!.issues)).toBe('One of the URLs is not a valid URL');
    }
  });

  test('more than 10 URLs rejected in both shapes', () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://e.example/${i}`);
    expect(generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, manualExternalUrls: urls }).success).toBe(false);
    expect(generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, manualExternalUrls: urls.join(',') }).success).toBe(false);
  });

  test('a wrong type (number, object) gets a readable message, never the raw Zod text', () => {
    for (const value of [42, { url: 'https://a.example' }]) {
      const parsed = generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, manualExternalUrls: value });
      expect(parsed.success).toBe(false);
      const message = formatArticleValidationError(parsed.error!.issues);
      expect(message).not.toMatch(RAW_ZOD);
      expect(message).toBe('Manual URLs must be a comma-separated list of URLs');
    }
  });

  test('normalizeManualExternalUrls is idempotent', () => {
    const once = normalizeManualExternalUrls('https://a.example, https://b.example');
    expect(normalizeManualExternalUrls(once)).toEqual(once);
  });

  test('the other multi-value / free-text fields keep their shapes', () => {
    // seoKeywords stays an array; researchNotes and hookBrief stay strings.
    expect(generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, seoKeywords: 'a, b' }).success).toBe(false);
    expect(generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, researchNotes: ['a'] }).success).toBe(false);
    expect(generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, researchNotes: 'Intent: inspiration' }).success).toBe(true);
    expect(generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, hookBrief: ['x'] }).success).toBe(false);
  });
});

test.describe('required fields — keyword method', () => {
  test('primary keyword: blank, whitespace or missing', () => {
    for (const keyword of ['', '   ', undefined]) {
      const parsed = generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, keyword });
      expect(parsed.success).toBe(false);
      expect(getArticleFormFieldErrors(parsed.error!.issues).keyword).toBe(ARTICLE_KEYWORD_REQUIRED_MESSAGE);
    }
  });

  test('language: missing or unsupported', () => {
    for (const language of [undefined, '', 'it']) {
      const parsed = generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, language });
      expect(parsed.success).toBe(false);
      expect(getArticleFormFieldErrors(parsed.error!.issues).language).toBe(ARTICLE_LANGUAGE_REQUIRED_MESSAGE);
    }
  });

  test('project: missing or not a uuid', () => {
    for (const projectId of [undefined, '', 'abc']) {
      const parsed = generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, projectId });
      expect(parsed.success).toBe(false);
      expect(getArticleFormFieldErrors(parsed.error!.issues).projectId).toBe(ARTICLE_PROJECT_REQUIRED_MESSAGE);
    }
  });

  test('every required field empty → one inline error each, first is Project', () => {
    const parsed = generateArticleSchema.safeParse({ projectId: '', keyword: '', language: '' });
    expect(parsed.success).toBe(false);
    const errors = getArticleFormFieldErrors(parsed.error!.issues);
    expect(errors).toEqual({
      projectId: ARTICLE_PROJECT_REQUIRED_MESSAGE,
      keyword: ARTICLE_KEYWORD_REQUIRED_MESSAGE,
      language: ARTICLE_LANGUAGE_REQUIRED_MESSAGE,
    });
    expect(getFirstInvalidField(errors)).toBe('projectId');
    expect(formatArticleValidationError(parsed.error!.issues)).toBe(ARTICLE_PROJECT_REQUIRED_MESSAGE);
  });

  test('first invalid field follows page order (language before keyword)', () => {
    const parsed = generateArticleSchema.safeParse({ ...VALID_KEYWORD_FORM, keyword: '', language: 'xx' });
    expect(getFirstInvalidField(getArticleFormFieldErrors(parsed.error!.issues))).toBe('language');
  });

  test('optional fields stay optional (article size, research notes, tone…)', () => {
    const parsed = generateArticleSchema.safeParse({ projectId: PROJECT_ID, keyword: 'kitchen ideas', language: 'en' });
    expect(parsed.success).toBe(true);
  });

  test('a fully filled, valid form parses', () => {
    expect(generateArticleSchema.safeParse({
      ...VALID_KEYWORD_FORM,
      researchNotes: 'Search intent: inspiration',
      articleType: 'listicle',
      pointOfView: 'second',
      targetCountry: 'Germany',
      hookBrief: 'Open with a relatable problem',
      includeFaq: true,
      includeTables: false,
    }).success).toBe(true);
  });
});

test.describe('required fields — URL method (non-regression)', () => {
  const VALID_URL_FORM = { projectId: PROJECT_ID, language: 'en', sourceType: 'link', sourceUrl: 'https://example.com/post' };

  test('valid link and pasted payloads parse and survive the round trip', () => {
    for (const form of [VALID_URL_FORM, { projectId: PROJECT_ID, language: 'fr', sourceType: 'pasted', pastedContent: 'Some text' }]) {
      const client = generateArticleFromUrlSchema.parse(form);
      expect(generateArticleFromUrlSchema.safeParse(JSON.parse(JSON.stringify(client))).success).toBe(true);
    }
  });

  test('missing / invalid source URL', () => {
    const missing = generateArticleFromUrlSchema.safeParse({ ...VALID_URL_FORM, sourceUrl: undefined });
    expect(getArticleFormFieldErrors(missing.error!.issues).sourceUrl).toBe('Source URL is required');
    const invalid = generateArticleFromUrlSchema.safeParse({ ...VALID_URL_FORM, sourceUrl: '' });
    expect(getArticleFormFieldErrors(invalid.error!.issues).sourceUrl).toBe('Enter a valid source URL starting with http:// or https://');
  });

  test('missing pasted text', () => {
    const parsed = generateArticleFromUrlSchema.safeParse({ projectId: PROJECT_ID, language: 'en', sourceType: 'pasted', pastedContent: '   ' });
    expect(getArticleFormFieldErrors(parsed.error!.issues).pastedContent).toBe('Paste the source text to use as research context');
  });

  test('project and language share the keyword method messages', () => {
    const parsed = generateArticleFromUrlSchema.safeParse({ ...VALID_URL_FORM, projectId: '', language: '' });
    const errors = getArticleFormFieldErrors(parsed.error!.issues);
    expect(errors.projectId).toBe(ARTICLE_PROJECT_REQUIRED_MESSAGE);
    expect(errors.language).toBe(ARTICLE_LANGUAGE_REQUIRED_MESSAGE);
  });
});

test.describe('Pins method (non-regression)', () => {
  test('pins payload still parses and survives the round trip', () => {
    const client = generateArticleFromPinsSchema.parse({ pinIds: [PROJECT_ID], externalUrl: ' https://example.com/x ' });
    expect(client.externalUrl).toBe('https://example.com/x');
    expect(generateArticleFromPinsSchema.safeParse(JSON.parse(JSON.stringify(client))).success).toBe(true);
  });
});

test.describe('friendly messages', () => {
  test('raw Zod messages are replaced by a per-field message', () => {
    expect(toFriendlyIssueMessage({ code: 'invalid_type', path: ['researchNotes'], message: 'Invalid input: expected string, received array' }))
      .toBe('Research notes has an invalid value');
    expect(toFriendlyIssueMessage({ code: 'invalid_type', path: [], message: 'Invalid input: expected object, received null' }))
      .toBe('Some fields are invalid. Check the form and try again.');
  });

  test('schema-authored messages are kept as-is', () => {
    expect(toFriendlyIssueMessage({ code: 'too_big', path: ['hookBrief'], message: 'Hook brief is too long' })).toBe('Hook brief is too long');
  });

  test('every field that can fail has a focus target; advanced ones are flagged', () => {
    for (const field of ['projectId', 'language', 'keyword', 'researchNotes', 'sourceUrl', 'pastedContent', 'hookBrief', 'seoKeywords', 'manualExternalUrls']) {
      expect(ARTICLE_FORM_FIELD_IDS[field]).toBeTruthy();
    }
    expect(ADVANCED_ARTICLE_FORM_FIELDS.has('manualExternalUrls')).toBe(true);
    expect(ADVANCED_ARTICLE_FORM_FIELDS.has('keyword')).toBe(false);
  });
});

test.describe('form wiring (source assertions)', () => {
  test('routes return the formatted message, not issues[0].message', () => {
    for (const path of ['app/api/wordpress/generate/route.ts', 'app/api/wordpress/generate-from-url/route.ts']) {
      const source = read(path);
      expect(source).toContain('formatArticleValidationError(parsed.error.issues)');
      expect(source).not.toContain('parsed.error.issues[0].message');
    }
  });

  test('the form blocks the request on invalid input and shows inline errors', () => {
    const form = read('components/wordpress/article-form.tsx');
    expect(form).toContain('noValidate');
    expect(form).toContain('rejectInvalidForm(');
    expect(form).toContain('focusField(first)');
    expect(form).not.toContain('setError(parsed.error.issues[0].message)');
    expect(form).toContain('are required.');
  });

  test('required fields carry the * marker, aria-required and an inline error slot', () => {
    const context = read('components/wordpress/article-form-project-context.tsx');
    const source = read('components/wordpress/article-form-source.tsx');
    expect(context.match(/<RequiredMark \/>/g)?.length).toBe(2);
    expect(context).toContain('<FieldError fieldId="project"');
    expect(context).toContain('<FieldError fieldId="language"');
    // keyword, URL, pasted text, confirmation checkbox
    expect(source.match(/<RequiredMark \/>/g)?.length).toBe(4);
    for (const id of ['keyword', 'source-url', 'pasted-content', 'research-notes']) {
      expect(source).toContain(`<FieldError fieldId="${id}"`);
    }
    expect(source).toContain('Primary keyword');
    const advanced = read('components/wordpress/article-form-advanced.tsx');
    expect(advanced).toContain('<FieldError fieldId="manual-external-urls"');
    expect(advanced).not.toContain('<RequiredMark');
  });
});
