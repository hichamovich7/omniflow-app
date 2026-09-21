import {
  FolderOpen,
  Search,
  Sparkle,
  Sparkles,
  ListChecks,
  ImageIcon,
  LayoutGrid,
  LayoutDashboard,
  CalendarClock,
  Download,
  Clock,
  FileText,
  UploadCloud,
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
    id: 'command-center',
    title: 'Command Center',
    icon: LayoutDashboard,
    summary: 'The Dashboard opens on a Command Center overview: your priorities, active projects, and results at a glance.',
    points: [
      'A greeting header shows today\'s date, a short summary of your day, and your Credits balance.',
      'KPI cards combine real numbers — Pins Created, Articles Generated, Projects, Generations — with a few goals not tracked yet (Monthly Revenue, Tasks Completed, Digital Products, marked "Preview"). Pins Created, Articles Generated, and Projects are clickable and open their respective page; Generations is real but not linked yet.',
      'Today\'s Priorities lists up to 3 focus items — click a priority to mark it done, or use "+ Add priority" to add one. These changes are local to your current visit and are not saved yet.',
      'Active Projects shows a card per project with its status, progress bar, main KPI, and next action — a card only links to a real project page when one of your projects actually matches that name.',
      'Weekly Progress summarizes articles published, pins created, products launched, and revenue progress against their weekly targets.',
      'The goal KPIs, Today\'s Priorities, and Weekly Progress are still previews — placeholder data not yet connected to a real goals/tasks system. It does not affect Pinterest or WordPress generation.',
    ],
  },
  {
    id: 'projects',
    title: 'Projects & Brand Profile',
    icon: FolderOpen,
    summary: 'Everything you generate belongs to a Project. A Project also holds your Brand Profile, which every generator uses as context.',
    points: [
      'Create a Project before generating any content.',
      'The Brand Profile field (in the Project form) describes your brand, tone, and audience — it is automatically injected into every AI generation for that project. Up to 10,000 characters.',
      'One Project can be marked as default, used to pre-fill the Project selector across the app.',
      'Niche (optional) is a free-text label for the project — pick from suggestions or type your own. For a handful of supported niches (Home Organization & Decor, Personal Finance / Budgeting, Food & Recipes, Travel) it also sets the visual convention AI images follow for that project — framing (full scene vs. close-up object) and, for niches where it fits, whether pin images can include on-image text. Any other niche (or none) keeps the previous conservative default.',
      'Default Language (optional) pre-fills the Language field on the Pinterest and WordPress generation forms when this project is selected — you can always change it before generating.',
      'Click a Project card to open its detail page: Brand Profile, WordPress connection status, quick stats (Pinterest generations, WordPress articles), and shortcuts to that Project\'s Pinterest History, WordPress History, and Categories. The "..." menu on the card still opens Edit/Delete directly, without navigating to the detail page.',
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
      'Choose a Generation mode. "AI Integrated" (recommended, the default) has the AI create the final image with its headline, subtitle, and call-to-action already designed into it. "Photo Only" gives you a clean photograph with no text. "Legacy Composite" keeps the original workflow where the text and banners are added on top of the photo afterwards.',
      'In AI Integrated mode you can pick a Creative format (Hero Pin, Pattern Guide, Editorial Story, or let the AI choose), a Pinterest strategy (AI recommends, Balanced angles, or a Manual angle), and for the Headline, Subtitle, and CTA either let the AI write them or type the exact text you want (Subtitle and CTA can also be left out). You can also set the maximum number of text lines and how prominent each text is.',
      'AI Integrated always writes in the language of your Project — the "Effective language" field shows which one — and the image model is chosen by OmniFlow, not by you.',
      'For Projects whose Niche supports it (e.g. Personal Finance / Budgeting), a "Text in Images" selector appears in Legacy Composite mode: Auto lets the AI decide per pin whether its image should carry a short text overlay or stay a plain photo, Always/Never force one or the other for the whole batch.',
      'In Legacy Composite mode you can optionally upload a Reference Image (JPG/PNG/WebP, 5MB max) to steer the visual style (AI Integrated will support reference images soon — for now the image would not be sent to its image model, so the option is not offered there): the AI analyzes only its color palette, materials, mood, and lighting — never its composition or layout — and applies those as style guidance on top of (not instead of) your Project\'s Niche convention.',
      'In Legacy Composite mode every generated pin image includes a small "Save the Pin!" call-to-action banner near the bottom edge, in the pin\'s own language — this is always on and not configurable per pin. AI Integrated and Photo Only images never get that extra banner.',
      'Titles and descriptions are written to earn the click: each title uses one of five proven angles (curiosity, problem/solution, listicle, discovery, or a direct promise) and varies across the batch, while descriptions build interest without giving away the full answer — so there\'s still a reason to click through.',
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
    summary: 'Turn a keyword, an external source used as research context, or a set of selected Pinterest pins into a full SEO article: an outline is planned first, then the article is written from it, with a featured image and internal images.',
    points: [
      'The WordPress section opens on a home screen with a few generator cards — today only "1-Click Blog Post" is active, the rest (Bulk Article Generation, Super Page, Rewriter Tool) are coming later.',
      'Enter a keyword, choose a Project and a language — the same Brand Profile used by Pinterest generation is reused here.',
      'Optional Core Settings (Keyword mode only): Article Type (How-to guide, Listicle, Product review, News, Comparison), Article Size (Small/Medium/Large, controlling both length and section count), Tone of Voice, Point of View, and Target Country. All default to "None" — leaving them alone generates exactly as before.',
      'Optional Structure block (Keyword mode only): an Introductory Hook Brief textarea (with 5 one-click presets — Question, Statistical or Fact, Quotation, Anecdotal or Story, Personal or Emotional — still editable after picking one) plus 9 three-state toggles (Conclusion, Tables, H3, Lists, Italics, Quotes, Key Takeaways, FAQ, Bold), each "Non défini" (default) / "Oui" (force it in) / "Non" (force it out). Leaving everything on "Non défini" generates exactly as before.',
      'Optional SEO Keywords block (Keyword mode only): add up to 15 keywords/phrases (type + Enter, or the "Générer avec l\'IA" button for AI-suggested related terms — an honest language-model brainstorm, not a real SERP/NLP tool) that the article is instructed to naturally include at least once each. Empty by default — leaving it untouched generates exactly as before.',
      'Optional External Linking block (Keyword mode only): a comma-separated "Manual URLs" field (up to 10) for specific sources the article should link to. This is additive — every article already gets one automatic, web-search-verified external link regardless of this field. Empty by default — leaving it untouched generates exactly as before.',
      'Or use an external source: switch the Source selector to "External Source", then provide a link to scrape or paste text directly. The source is used only as research context — the topics, angles, and key points it covers, extracted by AI into a short summary — never reproduced or paraphrased closely. The generated article gets its own outline and its own wording. A confirmation checkbox is required before generating.',
      'Or generate from pins: select 1 or more pins on a Pinterest generation page and use "Generate WordPress Article" in the selection toolbar. AI identifies the pins\' common theme and writes one unified article — Project and language are taken from the pins automatically. Fewer than 3 pins still works, with a warning that the result may be thin.',
      'From pins, the featured image is always freshly generated for the article\'s unified theme; internal images reuse every selected pin\'s own already-generated image instead of creating new ones — no fixed cap, select as many pins as the article should draw on.',
      'Generation runs in one request and can take up to a minute (outline, full article, then all images).',
      'Optionally assign a Category (scoped to the Project) on any of the three flows — this is always a manual choice, never AI-suggested. Pick "+ New Category" in the selector to create one inline, or use the small gear icon next to it to rename or delete existing categories. Leaving it unset files the article under "Uncategorized". WordPress History lets you filter by category and shows a category badge on each article. The category can also be changed afterward, from the article page itself — useful for articles generated before a category existed yet.',
      'The article is stored as Markdown. If the Project has no WordPress connection, use Copy Markdown, Copy HTML, or Download .md to take it anywhere else. If it does, a Publish control replaces those buttons — see "WordPress Publishing" below.',
    ],
  },
  {
    id: 'wordpress-publish',
    title: 'WordPress Publishing',
    icon: UploadCloud,
    summary: 'Connect a Project to a real WordPress site and publish generated articles directly, without leaving OmniFlow.',
    points: [
      'Connect a site from the Project form (Projects → Edit): Site URL, WP Username, and an Application Password — generate one in WordPress under Users → Profile → Application Passwords, it is not your regular login password.',
      'Use "Test Connection" before saving — the credentials are validated against your site before anything is stored. The Application Password is encrypted and never shown again after saving; to change it, use "Change connection" and re-enter it (WordPress credentials are always replaced as a whole, not edited field by field).',
      'One WordPress connection per Project. Disconnecting reverts that project\'s scheduled or published articles back to Draft in OmniFlow — nothing changes on the WordPress site itself.',
      'Once connected, map your OmniFlow categories to real WordPress categories on the WordPress Categories page — matching names are suggested automatically, and you can change any of them. Use "Import from WordPress" to pull your site\'s existing categories in directly instead of creating them by hand first — pick which ones to bring in, and each is created already mapped.',
      'On an article page, use the Publish control: Save as Draft (default), Publish Now, or Schedule (pick a date and time). Featured and internal images are uploaded to your WordPress media library as part of publishing.',
      'A scheduled post is handed to WordPress itself to publish automatically at the chosen time (via WordPress\'s own cron system) — OmniFlow does not need to be open, but the exact timing depends on your site receiving traffic around that time, so it is not always publish-to-the-second.',
      'If a publish attempt fails (e.g. revoked credentials, unreachable site), the exact reason is always shown on the article page — never a silent failure. Republishing after fixing the issue updates the same WordPress post rather than creating a duplicate.',
      'A status badge at the top of every article page — and a compact version on each WordPress History row — always shows whether it has been sent yet: "Not sent to WordPress", "Sent as Draft", "Published" (with a direct link to the live post), or "Scheduled for [date]". If you click Publish/Save as Draft/Schedule on an article that was already sent, a confirmation step reminds you when and warns that it will update the existing WordPress post rather than create a duplicate — informational, not a hard block.',
      'Changing an article\'s category from its own page never re-publishes it automatically — if it was already sent to WordPress, the new category only takes effect the next time you publish or update it there.',
    ],
  },
];
