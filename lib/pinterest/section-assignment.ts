import type { ArticleSection, WordPressArticleContext } from '@/lib/wordpress/article-context';
import type { PinterestStrategyIssue } from '@/lib/pinterest/strategy';

/**
 * Deterministic section assignment for project galleries (TASK-FIX-096).
 * For a `project_listicle` article, OmniFlow decides which project section
 * each Pin is built from before any AI call: one distinct section per Pin,
 * never the introduction, a FAQ, general advice, a related-posts block or a
 * heading outside the numbered list. The model writes titles, descriptions,
 * angles and keywords; it only echoes the assignment (id, list number,
 * title), and any echo that differs from the slot is rejected. Pure, offline.
 */

export const INSUFFICIENT_ARTICLE_SECTIONS_CODE = 'insufficient_article_sections';

// Same shape as the extractor's numbered heading ("3. Neapolitan Scarf").
const NUMBERED_HEADING = /^\s*#?\s*(\d{1,3})\s*[.):\-–—]\s*(?=\S)/;

export interface ArticleSectionAssignment {
  /** 0-based Pin slot. */
  pinIndex: number;
  /** Stable extraction id ("s3"). */
  sourceSectionId: string;
  /** The project's number in the article's list (1-based), else its position among the eligible sections. */
  sourceSectionIndex: number;
  /** The section heading without its list number (article text, data only). */
  sourceSectionTitle: string;
}

export type SectionAssignmentPlan =
  | { ok: true; assignments: ArticleSectionAssignment[]; available: number }
  | { ok: false; requested: number; available: number };

function listNumber(section: ArticleSection): number | null {
  const match = NUMBERED_HEADING.exec(section.heading);
  return match ? Number(match[1]) : null;
}

/**
 * The real project sections of a gallery, in article order. Only `subject`
 * sections count (the extractor already drops related-post blocks and marks
 * FAQ / advice as `faq` / `support`); the introduction never counts, even
 * when the extractor fell back to it. When the article has a numbered list,
 * only its numbered items at the list's own heading level are kept, so a
 * numbered sub-step inside a project ("1. Materials") never becomes a project.
 */
export function listicleProjectSections(context: WordPressArticleContext): ArticleSection[] {
  const subjects = context.sections.filter((section) => section.kind === 'subject' && section.id !== 's0');
  const numbered = subjects.filter((section) => listNumber(section) !== null);
  if (numbered.length === 0) return subjects;
  const byLevel = new Map<number, number>();
  for (const section of numbered) byLevel.set(section.level, (byLevel.get(section.level) ?? 0) + 1);
  // Most numbered headings wins; on a tie, the higher heading (H2 before H3).
  const listLevel = [...byLevel.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  return numbered.filter((section) => section.level === listLevel);
}

/**
 * One distinct section per Pin. With fewer Pins than projects the picks are
 * spread over the list (same rule as planArticlePinSections: 10 of 12 →
 * 1–5, 7–11); more Pins than projects is refused (`ok: false`) instead of
 * reusing a section. Same article and count → same plan.
 */
export function planListicleSectionAssignments(context: WordPressArticleContext, pinsRequested: number): SectionAssignmentPlan {
  const sections = listicleProjectSections(context);
  const requested = Math.max(0, Math.floor(pinsRequested));
  if (requested > sections.length || sections.length === 0) return { ok: false, requested, available: sections.length };
  const assignments = Array.from({ length: requested }, (_, pinIndex) => {
    const position = Math.floor((pinIndex * sections.length) / requested);
    const section = sections[position];
    return {
      pinIndex,
      sourceSectionId: section.id,
      sourceSectionIndex: listNumber(section) ?? position + 1,
      sourceSectionTitle: section.subject,
    };
  });
  return { ok: true, assignments, available: sections.length };
}

/** User-facing 422 text — counts only. */
export function insufficientSectionsMessage(requested: number, available: number): string {
  return available === 0
    ? `This article has no project section a Pin can be built from, so ${requested} Pin${requested === 1 ? '' : 's'} cannot be generated. Nothing was generated and no credit was used.`
    : `This article lists ${available} project${available === 1 ? '' : 's'}, but ${requested} Pins were requested. Each Pin of a project list is built from a different project: request ${available} Pin${available === 1 ? '' : 's'} or fewer. Nothing was generated and no credit was used.`;
}

export interface AssignedPinCandidate {
  sourceSectionId?: string;
  sourceSectionIndex?: number;
  sourceSectionTitle?: string;
}

/**
 * The echo check: Pin i must carry the id OmniFlow assigned to slot i
 * (`sectionPlan[i]`), and, when it echoes a list number, the number of that
 * same section. A Pin naming no planned section is left to
 * MISSING_SOURCE_SECTION; the title echo is informative only (a Pin in
 * another language may translate it) and is never trusted or stored.
 */
export function validateSectionAssignments(
  pins: AssignedPinCandidate[],
  sectionPlan: readonly string[],
  assignments: readonly ArticleSectionAssignment[]
): PinterestStrategyIssue[] {
  const indexById = new Map(assignments.map((assignment) => [assignment.sourceSectionId, assignment.sourceSectionIndex]));
  const planned = new Set(sectionPlan);
  const issues: PinterestStrategyIssue[] = [];
  pins.forEach((pin, index) => {
    const sectionId = pin.sourceSectionId?.trim();
    if (!sectionId || !planned.has(sectionId)) return;
    const expectedId = sectionPlan[index];
    const expectedIndex = expectedId !== undefined ? indexById.get(expectedId) : undefined;
    const idMismatch = sectionId !== expectedId;
    const indexMismatch = pin.sourceSectionIndex !== undefined && pin.sourceSectionIndex !== indexById.get(sectionId);
    if (!idMismatch && !indexMismatch) return;
    issues.push({
      code: 'unsupported-claim',
      message: `Pin ${index + 1} does not keep the article section OmniFlow assigned to it (expected ${JSON.stringify(expectedId ?? null)}, got ${JSON.stringify(sectionId)})`,
      reason: 'SOURCE_SECTION_MISMATCH',
      pinIndex: index,
      field: 'sourceSectionId',
      // Digits only: the expected list number.
      details: expectedIndex !== undefined ? [String(expectedIndex)] : [],
    });
  });
  return issues;
}

/** One log line: section ids and counts only — no heading, no article text. */
export function sectionAssignmentLogLine(
  stage: 'planned' | 'verified',
  sectionIds: readonly (string | undefined)[],
  available?: number
): string {
  const ids = sectionIds.map((id) => id?.trim() ?? null);
  return JSON.stringify({
    stage,
    pins: ids.length,
    ...(available !== undefined ? { eligibleSections: available } : {}),
    sections: ids,
    distinct: new Set(ids).size === ids.length && ids.every(Boolean),
  });
}
