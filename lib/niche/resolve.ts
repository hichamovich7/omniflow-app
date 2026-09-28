import { GENERIC_NICHE_SECTIONS, NICHE_PROFILES } from './profiles';
import { applyNicheSettings, hasNicheCustomizations, type NicheSettings } from './settings';
import type { NicheProfile, NicheSections, ResolvedNicheContext, SubNicheProfile } from './types';

/**
 * Matching key for niche labels, aliases and Content Stream names:
 * case-, accent- and punctuation-insensitive, "&" read as "and".
 * "Clay Crafts & DIY", "clay crafts and diy" and "clay-crafts-diy" share one key.
 */
export function normalizeNicheKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function profileKeys(profile: { label: string; slug: string; aliases: string[] }): string[] {
  return [profile.label, profile.slug, ...profile.aliases].map(normalizeNicheKey);
}

/** The dedicated profile for a niche label or alias, or null (free text / unknown niche). */
export function findNicheProfile(niche: string | null | undefined): NicheProfile | null {
  if (!niche?.trim()) return null;
  const key = normalizeNicheKey(niche);
  if (!key) return null;
  return NICHE_PROFILES.find((profile) => profileKeys(profile).includes(key)) ?? null;
}

/**
 * The sub-niche a Content Stream name matches: exact key first, then a stream
 * name that contains a sub-niche label/alias as whole words
 * ("Polymer Clay Earrings" → Polymer Clay).
 */
export function findSubNiche(
  profile: NicheProfile | null,
  streamName: string,
  disabledSlugs: string[] = []
): SubNicheProfile | null {
  if (!profile) return null;
  const key = normalizeNicheKey(streamName);
  if (!key) return null;
  const subNiches = profile.subNiches.filter((sub) => !disabledSlugs.includes(sub.slug));
  const exact = subNiches.find((sub) => profileKeys(sub).includes(key));
  if (exact) return exact;
  const padded = ` ${key} `;
  return subNiches.find((sub) => profileKeys(sub).some((alias) => alias && padded.includes(` ${alias} `))) ?? null;
}

function mergeSections(base: NicheSections, override: Partial<{ [K in keyof NicheSections]: Partial<NicheSections[K]> }>): NicheSections {
  return {
    shared: { ...base.shared, ...override.shared },
    wordpress: { ...base.wordpress, ...override.wordpress },
    pinterest: { ...base.pinterest, ...override.pinterest },
    visual: { ...base.visual, ...override.visual },
  };
}

export interface ResolveNicheContextInput {
  /** projects.niche — free text, any value accepted. */
  niche: string | null | undefined;
  /**
   * Names of the live Content Streams linked to what is being generated
   * (explicit category or board first). The first one matching a sub-niche
   * wins; otherwise the first one is kept as a plain label.
   */
  contentStreams?: (string | null | undefined)[];
  /** projects.niche_settings, already parsed (parseNicheSettings) — null = OmniFlow defaults. */
  settings?: NicheSettings | null;
}

/**
 * Niche context for prompt builders. Layers, most specific last:
 * generic fallback → project niche profile → Content Stream sub-niche →
 * project niche settings (Phase 2 customizations win over everything above).
 * Returns null only when there is no niche, no Content Stream and no
 * customization, so such projects keep their prompts byte-for-byte unchanged.
 * An unknown or free-text niche is never rejected: it gets the generic
 * profile, with its own label.
 */
export function resolveNicheContext(input: ResolveNicheContextInput): ResolvedNicheContext | null {
  const nicheLabel = input.niche?.trim() || null;
  const streams = [...new Set((input.contentStreams ?? []).map((s) => s?.trim()).filter((s): s is string => !!s))];
  const customized = hasNicheCustomizations(input.settings);
  if (!nicheLabel && streams.length === 0 && !customized) return null;
  const disabledSubNiches = input.settings?.fields.subNiches?.disabled ?? [];

  const profile = findNicheProfile(nicheLabel);
  let contentStream: string | null = streams[0] ?? null;
  let subNiche: SubNicheProfile | null = null;
  for (const stream of streams) {
    const match = findSubNiche(profile, stream, disabledSubNiches);
    if (match) {
      contentStream = stream;
      subNiche = match;
      break;
    }
  }

  let sections: NicheSections = GENERIC_NICHE_SECTIONS;
  if (profile) sections = mergeSections(sections, profile);
  if (subNiche) sections = mergeSections(sections, subNiche);
  if (customized) sections = applyNicheSettings(sections, input.settings);

  return {
    ...sections,
    nicheLabel,
    profileSlug: profile?.slug ?? 'generic',
    profileLabel: profile?.label ?? 'Generic',
    isGeneric: !profile,
    contentStream,
    subNiche: subNiche ? { slug: subNiche.slug, label: subNiche.label } : null,
    customized,
  };
}

/**
 * Recommended values for a project's niche (generic → niche profile), before
 * any Content Stream or project customization — what the niche settings
 * editor pre-fills. Works for free-text, unknown and empty niches.
 */
export function recommendedNicheSections(niche: string | null | undefined): { profile: NicheProfile | null; sections: NicheSections } {
  const profile = findNicheProfile(niche);
  return { profile, sections: profile ? mergeSections(GENERIC_NICHE_SECTIONS, profile) : GENERIC_NICHE_SECTIONS };
}
