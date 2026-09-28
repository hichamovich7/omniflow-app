// Niche profiles — Shared Core + Niche-Specific Configuration (Phase 1).
// A profile only carries configuration: generation, validation, Quality Gate,
// FAQ, links, images, publishing, credits and history stay in the shared core.
// See docs/DECISIONS.md "Shared Core + Niche-Specific Configuration".

/** Identity shared by WordPress and Pinterest. */
export interface NicheSharedProfile {
  audience: string;
  positioning: string;
  /** Voice descriptors — never factual claims (see buildNicheUsageRules). */
  tone: string[];
  expertiseLevel: string;
  recommendedVocabulary: string[];
  avoidVocabulary: string[];
  priorityTopics: string[];
  antiInventionRules: string[];
}

/** Long-form article rules (WordPress only — never sent to Pinterest). */
export interface NicheWordPressRules {
  searchIntents: string[];
  articleStructures: string[];
  seoRules: string[];
  detailLevel: string;
  faqRules: string[];
  linkRules: string[];
  cta: string;
}

/** Pin rules (Pinterest only — never sent to WordPress). */
export interface NichePinterestRules {
  angles: string[];
  titleRules: string[];
  descriptionRules: string[];
  keywordRules: string[];
  saveStrategy: string;
  diversityRules: string[];
  boards: string[];
  overlayRules: string[];
  cta: string;
}

/** Descriptive art direction for image prompts (both platforms). */
export interface NicheVisualRules {
  style: string;
  framing: string;
  lighting: string;
  materials: string[];
  colors: string[];
  props: string[];
  textInImage: string;
}

export interface NicheSections {
  shared: NicheSharedProfile;
  wordpress: NicheWordPressRules;
  pinterest: NichePinterestRules;
  visual: NicheVisualRules;
}

/**
 * A sub-niche, matched against Content Stream names. Its fields replace the
 * parent niche's field by field (a sub-niche is more specific).
 */
export interface SubNicheProfile {
  slug: string;
  label: string;
  aliases: string[];
  shared?: Partial<NicheSharedProfile>;
  wordpress?: Partial<NicheWordPressRules>;
  pinterest?: Partial<NichePinterestRules>;
  visual?: Partial<NicheVisualRules>;
}

export interface NicheProfile extends NicheSections {
  /** Stable identifier (documentary — projects.niche stores the label). */
  slug: string;
  /** Canonical label, exactly as stored in projects.niche by the niche suggestions. */
  label: string;
  /** Other labels that resolve to this profile (matched case/accent/punctuation-insensitively). */
  aliases: string[];
  subNiches: SubNicheProfile[];
}

/** The context handed to prompt builders — never null-checked field by field. */
export interface ResolvedNicheContext extends NicheSections {
  /** The project's niche exactly as typed (trimmed), or null when the project has none. */
  nicheLabel: string | null;
  /** The profile used: a dedicated one, or the generic fallback. */
  profileSlug: string;
  profileLabel: string;
  isGeneric: boolean;
  /** The Content Stream used as sub-niche context (first live one), or null. */
  contentStream: string | null;
  /** The sub-niche profile the Content Stream matched, if any. */
  subNiche: { slug: string; label: string } | null;
  /** True when project niche settings (Phase 2) changed at least one value. */
  customized: boolean;
}
