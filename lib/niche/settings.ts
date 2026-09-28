import { z } from 'zod';
import type { NicheSections } from './types';

// Per-project niche settings (Phase 2, migration 041 `projects.niche_settings`).
// Only the user's customizations are stored — recommended values always come
// from the niche profiles (lib/niche/profiles.ts), so a profile update never
// overwrites a custom value. NULL / invalid / unknown version = defaults.

export const NICHE_SETTINGS_VERSION = 1;

/** The seven customizable fields (sub-niches handled apart: Content Streams). */
export const NICHE_SETTINGS_LIST_FIELDS = ['tone', 'audience', 'keywords', 'pinterestAngles', 'visualStyle', 'cta'] as const;
export type NicheSettingsListField = (typeof NICHE_SETTINGS_LIST_FIELDS)[number];

export const MAX_CUSTOM_VALUES = 20;
export const MAX_CUSTOM_VALUE_LENGTH = 200;
const MAX_DISABLED_VALUES = 50;

// Custom values reach the prompts: no links (Pins never get a destination
// URL automatically, and the models must never be handed a URL to reuse).
const LINK_PATTERN = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|de|fr|es|uk|info|blog|shop|site)\b/i;

const customValueSchema = z
  .string()
  .trim()
  .min(1, 'A custom value cannot be empty')
  .max(MAX_CUSTOM_VALUE_LENGTH, `A custom value must be ${MAX_CUSTOM_VALUE_LENGTH} characters or less`)
  .refine((value) => !LINK_PATTERN.test(value), 'Custom values cannot contain links or domain names');

/** Same check as the schema, for the editor's inline feedback. */
export function customValueError(value: string): string | null {
  const parsed = customValueSchema.safeParse(value);
  return parsed.success ? null : parsed.error.issues[0].message;
}

const listFieldSchema = z
  .object({
    /** Values added by the user (always active). */
    custom: z.array(customValueSchema).max(MAX_CUSTOM_VALUES, `At most ${MAX_CUSTOM_VALUES} custom values per field`).default([]),
    /** Recommended values the user switched off (matched by normalized text). */
    disabled: z.array(z.string().trim().min(1).max(500)).max(MAX_DISABLED_VALUES).default([]),
  })
  .strict();

const subNichesFieldSchema = z
  .object({
    /** Slugs of recommended sub-niches the user switched off. New sub-niches are Content Streams. */
    disabled: z.array(z.string().trim().min(1).max(100)).max(MAX_DISABLED_VALUES).default([]),
  })
  .strict();

export const nicheSettingsSchema = z
  .object({
    version: z.literal(NICHE_SETTINGS_VERSION),
    fields: z
      .object({
        tone: listFieldSchema.optional(),
        audience: listFieldSchema.optional(),
        keywords: listFieldSchema.optional(),
        pinterestAngles: listFieldSchema.optional(),
        visualStyle: listFieldSchema.optional(),
        cta: listFieldSchema.optional(),
        subNiches: subNichesFieldSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type NicheSettings = z.infer<typeof nicheSettingsSchema>;
export type NicheSettingsListValue = z.infer<typeof listFieldSchema>;

/** Body of PUT /api/projects/[id]/niche-settings — `null` resets to defaults. */
export const saveNicheSettingsSchema = z.object({ settings: nicheSettingsSchema.nullable() }).strict();

/**
 * Stored jsonb → settings, or null (= OmniFlow defaults). Never throws: an
 * invalid or future-version value must never block a generation.
 */
export function parseNicheSettings(raw: unknown): NicheSettings | null {
  if (raw === null || raw === undefined) return null;
  const parsed = nicheSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function valueKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = valueKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Canonical form before saving: trimmed, deduplicated, empty fields dropped;
 * nothing left → null (defaults). Custom values equal to a recommended value
 * are kept — they stay the user's even if the profile later changes.
 */
export function normalizeNicheSettings(settings: NicheSettings | null): NicheSettings | null {
  if (!settings) return null;
  const fields: NicheSettings['fields'] = {};
  for (const field of NICHE_SETTINGS_LIST_FIELDS) {
    const value = settings.fields[field];
    if (!value) continue;
    const custom = uniqueValues(value.custom.map((v) => v.trim()));
    const disabled = uniqueValues(value.disabled.map((v) => v.trim()));
    if (custom.length > 0 || disabled.length > 0) fields[field] = { custom, disabled };
  }
  const subDisabled = uniqueValues(settings.fields.subNiches?.disabled ?? []);
  if (subDisabled.length > 0) fields.subNiches = { disabled: subDisabled };
  return Object.keys(fields).length > 0 ? { version: NICHE_SETTINGS_VERSION, fields } : null;
}

export function hasNicheCustomizations(settings: NicheSettings | null | undefined): boolean {
  return normalizeNicheSettings(settings ?? null) !== null;
}

/** Recommended values of a field, read from the resolved profile sections. */
export function recommendedFieldValues(sections: NicheSections, field: NicheSettingsListField): string[] {
  switch (field) {
    case 'tone':
      return sections.shared.tone;
    case 'audience':
      return sections.shared.audience ? [sections.shared.audience] : [];
    case 'keywords':
      return sections.shared.priorityTopics;
    case 'pinterestAngles':
      return sections.pinterest.angles;
    case 'visualStyle':
      return sections.visual.style ? [sections.visual.style] : [];
    case 'cta':
      return sections.pinterest.cta ? [sections.pinterest.cta] : [];
  }
}

export type NicheValueSource = 'recommended' | 'custom';

export interface NicheFieldItem {
  value: string;
  source: NicheValueSource;
  /** Only recommended values can be disabled; custom values are removed instead. */
  disabled: boolean;
}

export interface ResolvedNicheField {
  items: NicheFieldItem[];
  /** What the prompts receive: enabled recommended values, then custom values. */
  active: string[];
}

export function resolveNicheField(recommended: string[], value: NicheSettingsListValue | undefined): ResolvedNicheField {
  const disabledKeys = new Set((value?.disabled ?? []).map(valueKey));
  const recommendedItems = uniqueValues(recommended).map((v) => ({
    value: v,
    source: 'recommended' as const,
    disabled: disabledKeys.has(valueKey(v)),
  }));
  const recommendedKeys = new Set(recommendedItems.map((item) => valueKey(item.value)));
  const customItems = uniqueValues(value?.custom ?? [])
    .filter((v) => !recommendedKeys.has(valueKey(v)) || disabledKeys.has(valueKey(v)))
    .map((v) => ({ value: v, source: 'custom' as const, disabled: false }));
  const items = [...recommendedItems, ...customItems];
  return { items, active: uniqueValues(items.filter((item) => !item.disabled).map((item) => item.value)) };
}

/**
 * Project customizations applied on top of the resolved sections (generic →
 * niche → sub-niche), so they win over both. Tone, audience and keywords
 * are shared; angles and CTA are Pinterest-only; visual style goes wherever
 * image prompts are written. Every other field is left untouched.
 */
export function applyNicheSettings(sections: NicheSections, settings: NicheSettings | null | undefined): NicheSections {
  if (!settings) return sections;
  const active = (field: NicheSettingsListField) =>
    resolveNicheField(recommendedFieldValues(sections, field), settings.fields[field]).active;
  return {
    shared: {
      ...sections.shared,
      tone: active('tone'),
      audience: active('audience').join('; '),
      priorityTopics: active('keywords'),
    },
    wordpress: sections.wordpress,
    pinterest: {
      ...sections.pinterest,
      angles: active('pinterestAngles'),
      cta: active('cta').join('; '),
    },
    visual: { ...sections.visual, style: active('visualStyle').join('; ') },
  };
}

// ------------------------------------------------------------ editing helpers (UI)

export function emptyNicheSettings(): NicheSettings {
  return { version: NICHE_SETTINGS_VERSION, fields: {} };
}

function withField(settings: NicheSettings | null, field: NicheSettingsListField, update: (value: NicheSettingsListValue) => NicheSettingsListValue): NicheSettings {
  const base = settings ?? emptyNicheSettings();
  const current = base.fields[field] ?? { custom: [], disabled: [] };
  return { ...base, fields: { ...base.fields, [field]: update(current) } };
}

export function addCustomValue(settings: NicheSettings | null, field: NicheSettingsListField, value: string): NicheSettings {
  const trimmed = value.trim();
  return withField(settings, field, (current) =>
    trimmed ? { ...current, custom: uniqueValues([...current.custom, trimmed]) } : current
  );
}

export function removeCustomValue(settings: NicheSettings | null, field: NicheSettingsListField, value: string): NicheSettings {
  return withField(settings, field, (current) => ({ ...current, custom: current.custom.filter((v) => valueKey(v) !== valueKey(value)) }));
}

export function setRecommendedDisabled(settings: NicheSettings | null, field: NicheSettingsListField, value: string, disabled: boolean): NicheSettings {
  return withField(settings, field, (current) => ({
    ...current,
    disabled: disabled
      ? uniqueValues([...current.disabled, value])
      : current.disabled.filter((v) => valueKey(v) !== valueKey(value)),
  }));
}

export function setSubNicheDisabled(settings: NicheSettings | null, slug: string, disabled: boolean): NicheSettings {
  const base = settings ?? emptyNicheSettings();
  const current = base.fields.subNiches?.disabled ?? [];
  const next = disabled ? uniqueValues([...current, slug]) : current.filter((s) => s !== slug);
  return { ...base, fields: { ...base.fields, subNiches: { disabled: next } } };
}

/** Reset one field (or everything with `field` omitted) to OmniFlow's recommended values. */
export function resetNicheSettings(settings: NicheSettings | null, field?: NicheSettingsListField | 'subNiches'): NicheSettings | null {
  if (!field || !settings) return null;
  const fields = { ...settings.fields };
  delete fields[field];
  return normalizeNicheSettings({ ...settings, fields });
}
