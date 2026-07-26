import {
  FolderOpen,
  Search,
  Sparkle,
  Sparkles,
  ListChecks,
  ImageIcon,
  LayoutGrid,
  CalendarClock,
  Download,
  Clock,
  FileText,
} from 'lucide-react';

export interface GuideSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  points: string[];
}

export const guideSections: GuideSection[] = [
  {
    id: 'projects',
    title: 'Projects & Brand Profile',
    icon: FolderOpen,
    summary: 'Everything you generate belongs to a Project. A Project also holds your Brand Profile, which every generator uses as context.',
    points: [
      'Create a Project before generating any content.',
      'The Brand Profile field (in the Project form) describes your brand, tone, and audience — it is automatically injected into every AI generation for that project. Up to 10,000 characters.',
      'One Project can be marked as default, used to pre-fill the Project selector across the app.',
      'Niche (optional) is a free-text label for the project — pick from suggestions or type your own. It\'s stored for your own organization only; it doesn\'t change how content is generated yet.',
      'Default Language (optional) pre-fills the Language field on the Pinterest and WordPress generation forms when this project is selected — you can always change it before generating.',
    ],
  },
  {
    id: 'research',
    title: 'Research',
    icon: Search,
    summary: 'Research a topic before generating content — from a keyword, a website, or a blog post.',
    points: [
      'Choose a Source: Keyword (web search), Website URL, or Blog URL.',
      'Results are saved to your Research History for the selected Project.',
      'If a research fails, you\'ll see exactly why (e.g. the site blocked access, or timed out) — use the Retry action on that row to try again.',
      'Research on its own does not change what the AI generates — that happens in the Analyze step.',
    ],
  },
  {
    id: 'analyze',
    title: 'Analyze',
    icon: Sparkle,
    summary: 'Turn raw research into a structured summary the AI can use: theme, audience, tone, category, and keywords.',
    points: [
      'Click "Analyze" on a completed research result to see its structured breakdown.',
      'Re-analyzing the same research result is instant — it reuses the existing analysis instead of calling the AI again.',
      '"Continue to Generate" carries the analysis forward, so your next generation is grounded in real research instead of a bare keyword.',
    ],
  },
  {
    id: 'generate',
    title: 'Generate (Pinterest)',
    icon: Sparkles,
    summary: 'The core feature: turn a keyword into a batch of SEO-optimized Pinterest pins with titles, descriptions, keywords, and image prompts.',
    points: [
      'Enter a keyword, choose a language and how many pins to generate (1 to 30).',
      'Optionally set a Board — leave it blank to let the AI suggest a board per pin.',
      'If you arrived from Research → Analyze, you\'ll see a "Using content analysis from Research" indicator confirming that context is active.',
    ],
  },
  {
    id: 'editorial',
    title: 'Editorial Review',
    icon: ListChecks,
    summary: 'After generation, review your pins and select exactly which ones to act on before moving further down the pipeline.',
    points: [
      'Use Select All / Select None / Invert to build a selection, or click individual pins.',
      'Actions like Regenerate, Export, and Schedule apply only to your selection — or to everything if nothing is selected.',
      'Click anywhere on a pin card (outside the checkbox and image actions) to open its full details — untruncated title and description, keywords, and the image prompt used for generation, with a Copy button to reuse it elsewhere.',
    ],
  },
  {
    id: 'images',
    title: 'AI Images',
    icon: ImageIcon,
    summary: 'Generate a photorealistic image for each pin from its AI-written image prompt.',
    points: [
      'Generate images for all pins at once, or just your selected pins.',
      'Regenerating a pin\'s image keeps every previous version — open "Versions" on a pin to compare and switch the active one.',
      'Regenerated images are intentionally varied (angle, props, lighting) so you never get the same shot twice.',
    ],
  },
  {
    id: 'boards',
    title: 'Boards',
    icon: LayoutGrid,
    summary: 'Pins are automatically organized into Boards based on the AI\'s suggestion (or the Board you set at generation time).',
    points: [
      'Boards are created automatically the first time their name is used for a Project — no manual setup required.',
      'Open a Board to see every pin generated for it and export just that board\'s pins as CSV.',
    ],
  },
  {
    id: 'scheduling',
    title: 'Scheduling',
    icon: CalendarClock,
    summary: 'Assign publish dates to your pins so your CSV export is ready to schedule in bulk.',
    points: [
      'Auto-Schedule spreads your pins across days or hours starting from a date and time you choose.',
      'Clear Schedule removes all publish dates in one click if you want to start over.',
    ],
  },
  {
    id: 'export',
    title: 'Export',
    icon: Download,
    summary: 'Every batch of pins can be exported as a CSV file formatted for Pinterest\'s Bulk Upload tool.',
    points: [
      'Export from the Results page, a Board page, or directly from History.',
      'Exports respect your Editorial selection — export just the pins you\'ve selected, or everything.',
    ],
  },
  {
    id: 'history',
    title: 'History',
    icon: Clock,
    summary: 'Every generation you\'ve run lives here, searchable and filterable.',
    points: [
      'Filter by keyword, Project, Board, language, or status.',
      'Results are paginated 20 at a time — use Previous / Next at the bottom of the list.',
      'From here you can revisit results, export CSV, or delete a generation.',
    ],
  },
  {
    id: 'wordpress',
    title: 'WordPress Generator',
    icon: FileText,
    summary: 'Turn a keyword — or a set of selected Pinterest pins — into a full SEO article: an outline is planned first, then the article is written from it, with a featured image and internal images.',
    points: [
      'Enter a keyword, choose a Project and a language — the same Brand Profile used by Pinterest generation is reused here.',
      'Or generate from pins: select 1 or more pins on a Pinterest generation page and use "Generate WordPress Article" in the selection toolbar. AI identifies the pins\' common theme and writes one unified article — Project and language are taken from the pins automatically. Fewer than 3 pins still works, with a warning that the result may be thin.',
      'From pins, the featured image is always freshly generated for the article\'s unified theme; internal images (up to 3) reuse the pins\' own already-generated images instead of creating new ones.',
      'Generation runs in one request and can take up to a minute (outline, full article, then all images).',
      'Optionally assign a Category (scoped to the Project) on either flow — this is always a manual choice, never AI-suggested. Pick "+ New Category" in the selector to create one inline, or use the small gear icon next to it to rename or delete existing categories. Leaving it unset files the article under "Uncategorized". WordPress History lets you filter by category and shows a category badge on each article.',
      'The article is stored as Markdown — use Copy Markdown, Copy HTML, or Download .md to take it to WordPress or anywhere else. There is no direct WordPress publishing yet.',
    ],
  },
];
