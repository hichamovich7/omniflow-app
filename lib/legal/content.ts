/**
 * Legal pages content (TASK-069) — Terms, Privacy, GDPR, Cookies, Data
 * Deletion, Legal Notice. Rendered by components/legal/legal-document.tsx.
 *
 * Every statement describes what OmniFlow actually does today (see
 * docs/DATABASE.md, docs/DEPLOYMENT.md). When a feature that touches personal
 * data ships or changes (new provider, payments, new platform connection),
 * update the matching page and LEGAL_LAST_UPDATED.
 *
 * Inline links use `[label](/path)` or `[label](https://…)`.
 */

/**
 * Operator details. The `[…]` values are placeholders the founder must
 * replace before production — tests/renderer/legal-pages.spec.ts lists them.
 */
export const legalOperator = {
  name: '[YOUR FULL NAME]',
  status: 'Individual entrepreneur (sole trader)',
  address: '[STREET ADDRESS, POSTCODE, CITY, COUNTRY]',
  registration: '[BUSINESS REGISTRATION NUMBER — or remove if not registered]',
  vat: '[VAT NUMBER — or "Not subject to VAT"]',
  email: '[CONTACT EMAIL]',
  country: '[COUNTRY]',
} as const;

export const LEGAL_LAST_UPDATED = 'October 18, 2026';

/** Operator fields still holding a `[…]` placeholder. */
export function legalPlaceholdersRemaining(): string[] {
  return Object.entries(legalOperator)
    .filter(([, value]) => value.startsWith('['))
    .map(([key]) => key);
}

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  /** Optional paragraphs rendered after the list. */
  after?: string[];
}

export interface LegalPage {
  slug: 'terms' | 'privacy' | 'gdpr' | 'cookies' | 'data-deletion' | 'legal-notice';
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
}

const op = legalOperator;
const contactLine = `By email: ${op.email}. Postal address: ${op.name}, ${op.address}.`;

const terms: LegalPage = {
  slug: 'terms',
  title: 'Terms of Service',
  description: 'The rules for using OmniFlow.',
  intro: `These Terms of Service ("Terms") govern your use of OmniFlow, an AI content platform operated by ${op.name} ("OmniFlow", "we", "us"). By creating an account or using OmniFlow, you agree to these Terms. If you do not agree, do not use OmniFlow.`,
  sections: [
    {
      heading: '1. The service',
      paragraphs: [
        'OmniFlow helps content creators and niche site owners plan and produce content: Pinterest Pins and boards, WordPress articles, Medium summaries and Facebook Page posts, generated with artificial intelligence from the information you provide. OmniFlow can publish to services you connect (your WordPress site, your Facebook Page) — only when you confirm a publication.',
        'OmniFlow is under active development. Features may be added, changed or removed. We will tell you in advance, where reasonably possible, about changes that significantly reduce what you can do.',
      ],
    },
    {
      heading: '2. Eligibility and account',
      items: [
        'You must be at least 18 years old (or the age of majority where you live) and use OmniFlow mainly for your professional or business activity.',
        'You must give accurate information and keep your password secret. You are responsible for everything done with your account.',
        'Tell us immediately at ' + op.email + ' if you think your account has been accessed without your permission.',
        'One person per account. Do not share, sell or transfer your account.',
      ],
    },
    {
      heading: '3. Free trial, credits and pricing',
      paragraphs: [
        'OmniFlow currently offers a limited number of free trial generations. Credits displayed in the app are informational: generations do not consume them yet.',
        'If paid plans or credit packs are introduced, their prices, billing terms and any right of withdrawal will be shown to you before purchase, and you will never be charged without your explicit agreement.',
      ],
    },
    {
      heading: '4. Acceptable use',
      paragraphs: ['You agree not to use OmniFlow to:'],
      items: [
        'Break any law or infringe anyone\'s rights, including copyright, trademark, privacy and image rights.',
        'Create or publish content that is illegal, hateful, harassing, defamatory, sexually explicit involving minors, deceptive (including fake reviews or impersonation), or that promotes violence.',
        'Send spam or publish content that violates the rules of the platforms you publish to (Meta, Pinterest, WordPress hosts, Medium).',
        'Upload content you do not have the right to use, or personal data of other people without a lawful basis.',
        'Attack, overload, scrape, reverse engineer or bypass the limits or security of OmniFlow.',
        'Resell or provide OmniFlow to third parties without our written agreement.',
      ],
    },
    {
      heading: '5. Your content',
      paragraphs: [
        'You keep all rights to the content you provide (texts, images, article URLs, settings) and, to the extent the law allows, to the content OmniFlow generates for you ("Outputs").',
        'You give us a limited, non-exclusive licence to host, process, transmit and display your content only to operate OmniFlow for you — including sending it to the AI providers and platforms described in the [Privacy Policy](/privacy). This licence ends when you delete the content or your account, except for copies kept for a limited time in backups.',
        'We do not use your content to train AI models and we do not sell it.',
      ],
    },
    {
      heading: '6. AI-generated content',
      items: [
        'Outputs are produced automatically and may be inaccurate, incomplete, or similar to content produced for other users. OmniFlow checks some outputs against your source article, but cannot guarantee they are correct.',
        'You must review every Output before using or publishing it. You are solely responsible for what you publish, including safety instructions, claims, and compliance with advertising and disclosure rules.',
        'Outputs are not professional advice (legal, medical, financial or otherwise).',
      ],
    },
    {
      heading: '7. Connected platforms',
      paragraphs: [
        'When you connect a WordPress site or a Facebook Page, you authorise OmniFlow to act on it on your behalf, within the permissions you grant and only when you ask it to. You must have the right to manage that site or Page, and you remain bound by the terms of those platforms (for Facebook: the Meta Terms and Pages, Groups and Events Policies).',
        'Those platforms are operated by third parties. We are not responsible for their availability, their decisions (for example the restriction of a Page or a site) or changes to their APIs that may limit OmniFlow features. Content already published on a platform stays there until you delete it on that platform.',
      ],
    },
    {
      heading: '8. Availability',
      paragraphs: [
        'We work to keep OmniFlow available and secure, but it is provided without a guaranteed level of service. It may be interrupted for maintenance, updates, or reasons beyond our control. Keep your own copies of important content.',
      ],
    },
    {
      heading: '9. Intellectual property',
      paragraphs: [
        'OmniFlow, its software, design, prompts, templates and brand belong to us or our licensors. These Terms do not transfer any of these rights to you, apart from the right to use OmniFlow as described here.',
      ],
    },
    {
      heading: '10. Suspension and termination',
      items: [
        'You can stop using OmniFlow at any time and ask for your account to be deleted (see [Data Deletion](/data-deletion)).',
        'We may suspend or close your account, with notice where reasonably possible, if you seriously or repeatedly break these Terms, if required by law, or to protect OmniFlow, its users or third parties.',
        'On termination, your access ends and your data is deleted as described in the [Privacy Policy](/privacy).',
      ],
    },
    {
      heading: '11. Liability',
      paragraphs: [
        'To the maximum extent permitted by law, OmniFlow is provided "as is". We are not liable for indirect losses such as loss of profit, revenue, traffic, data or reputation, nor for content you publish or decisions taken by third-party platforms. Our total liability for any claim relating to OmniFlow is limited to the amounts you paid us in the 12 months before the claim (or EUR 100 if you paid nothing).',
        'Nothing in these Terms limits liability that cannot be limited by law, such as liability for gross negligence, wilful misconduct, or death and personal injury, nor any mandatory rights you have as a consumer.',
      ],
    },
    {
      heading: '12. Indemnity',
      paragraphs: [
        'You agree to compensate us for reasonable costs and claims from third parties caused by content you publish with OmniFlow or by your breach of these Terms, to the extent permitted by law.',
      ],
    },
    {
      heading: '13. Changes to these Terms',
      paragraphs: [
        'We may update these Terms. For significant changes we will notify you in the app or by email at least 15 days before they apply. If you keep using OmniFlow after that date, you accept the new Terms; if you do not agree, you can close your account.',
      ],
    },
    {
      heading: '14. Governing law and disputes',
      paragraphs: [
        `These Terms are governed by the laws of ${op.country}. Before going to court, please contact us so we can try to resolve the issue amicably. If you are a consumer, you also keep the protection of the mandatory laws of your country of residence and may use the courts of that country.`,
      ],
    },
    {
      heading: '15. Contact',
      paragraphs: [contactLine],
    },
  ],
};

const privacy: LegalPage = {
  slug: 'privacy',
  title: 'Privacy Policy',
  description: 'What personal data OmniFlow collects, why, and your rights.',
  intro: `This Privacy Policy explains how OmniFlow handles your personal data when you use the OmniFlow web app. We follow the EU General Data Protection Regulation (GDPR). We collect only what we need to run OmniFlow, we do not sell your data, and we do not use advertising or analytics trackers.`,
  sections: [
    {
      heading: '1. Data controller',
      paragraphs: [
        `The data controller is ${op.name}, ${op.status}, ${op.address}. Contact for any privacy question: ${op.email}.`,
      ],
    },
    {
      heading: '2. Data we collect',
      items: [
        'Account data: your email address and password. Passwords are handled by our authentication provider and stored only in hashed form — we never see them.',
        'Workspace data: projects (names, niches, settings, brand profile), research and analyses, boards, content streams, tasks and priorities, and the content you create or generate — Pins, images, WordPress articles, Medium summaries, Facebook posts — with their history.',
        'Files you upload, such as reference images.',
        'WordPress connection: your site URL, WordPress username and Application Password. The Application Password is encrypted (AES-256-GCM) before it is stored.',
        'Facebook Page connection (only if you connect a Page): the Page ID and name, the Page access token (encrypted with AES-256-GCM, never readable from your browser), the permissions you granted, and the status of each publication (post and comment IDs, dates, error codes).',
        'Technical data: authentication cookies, usage counters used to apply generation limits, and the server logs of our hosting provider (IP address, browser, date and time of requests).',
      ],
      after: [
        'We do not collect payment data: OmniFlow does not take payments at this time. We do not ask for sensitive data. Please do not include other people\'s personal data in your content unless you have the right to.',
      ],
    },
    {
      heading: '3. Why we use your data and legal bases',
      items: [
        'To provide OmniFlow — your account, content generation, history, publishing to the services you connect, and support (performance of our contract with you, GDPR Art. 6(1)(b)).',
        'To keep OmniFlow secure, prevent abuse and apply usage limits (our legitimate interest, Art. 6(1)(f)).',
        'To connect and publish to your Facebook Page or WordPress site, which you start yourself and can stop at any time by disconnecting (performance of contract, and your consent where required, Art. 6(1)(a)).',
        'To comply with legal obligations, such as answering lawful requests from authorities (Art. 6(1)(c)).',
      ],
      after: [
        'We do not send marketing emails, we do not profile you for advertising, and we do not make decisions about you based solely on automated processing that have legal or similarly significant effects.',
      ],
    },
    {
      heading: '4. Artificial intelligence',
      paragraphs: [
        'To generate content, OmniFlow sends the relevant parts of your workspace (for example an article, a keyword, your niche settings or a reference image) to AI model providers through their APIs. They return text or images that we save in your account.',
        'We do not use your content to train AI models. Providers process it under their API terms. Avoid putting confidential information or other people\'s personal data in what you ask OmniFlow to generate.',
      ],
    },
    {
      heading: '5. Facebook Pages',
      paragraphs: [
        'If you choose to connect a Facebook Page, you log in on Facebook and grant OmniFlow these permissions: pages_show_list (list the Pages you manage so you can pick one), pages_manage_posts (publish the post you confirm), pages_manage_engagement (add the article link as the first comment, if you choose this option), pages_read_engagement and pages_read_user_content (read the Page\'s recent posts and comments, only to avoid publishing the same content twice). business_management is requested only if Meta requires it for your Page, and only after you ask.',
        'OmniFlow publishes only when you click "Publish to Facebook" and confirm. It never accesses your personal profile, friends, groups or messages, and never publishes on a personal profile or a group. We use Facebook data only to provide this feature, never for advertising, and we do not share it with anyone else.',
        'You can disconnect a Page in OmniFlow at any time (Facebook → Disconnect Page): the connection and its encrypted token are deleted. You can also remove OmniFlow in your Facebook settings (Settings & privacy → Settings → Business integrations). To delete all your data, see [Data Deletion](/data-deletion).',
      ],
    },
    {
      heading: '6. WordPress and Pinterest',
      paragraphs: [
        'Your WordPress credentials are used only to read articles from your site and publish the articles you choose, when you ask. OmniFlow does not connect to your Pinterest account: you export Pins as CSV files and upload them to Pinterest yourself.',
      ],
    },
    {
      heading: '7. Service providers (processors)',
      paragraphs: [
        'We use the following providers to run OmniFlow. They process data only on our instructions or, for publishing platforms, as independent services you chose to connect:',
      ],
      items: [
        'Supabase — database, authentication and file storage.',
        'Vercel — hosting of the OmniFlow application.',
        'Cloudflare (R2) — storage and delivery of generated images. Generated images are served from public, hard-to-guess URLs so they can be shown in the app and published.',
        'OpenRouter and OpenAI — AI models used to generate text and images.',
        'Meta Platforms — only if you connect a Facebook Page, to publish on it.',
        'Your WordPress host — only if you connect your site.',
      ],
      after: [
        'We share data with authorities only when legally required.',
      ],
    },
    {
      heading: '8. International transfers',
      paragraphs: [
        'Some providers are located, or may access data, outside the European Economic Area (in particular in the United States). In that case, transfers rely on an adequacy decision (such as the EU-US Data Privacy Framework, for certified providers) or on the European Commission\'s Standard Contractual Clauses, with additional safeguards where needed.',
      ],
    },
    {
      heading: '9. How long we keep data',
      items: [
        'Account and workspace data: as long as your account exists. Content you delete is removed from the active database.',
        'Facebook Page connection: until you disconnect the Page or delete your account.',
        'After an account deletion request: your data is deleted within 30 days. Residual copies in our providers\' backups are overwritten during their normal backup cycle.',
        'Hosting logs: for the limited period set by our hosting provider.',
      ],
    },
    {
      heading: '10. Security',
      paragraphs: [
        'Data travels over HTTPS. Each user can access only their own data (row-level security in the database). WordPress Application Passwords and Facebook Page tokens are encrypted with separate keys and are never sent to your browser. Access to production systems is limited to the operator. No system is perfectly secure; if a data breach is likely to put your rights at risk, we will inform you and the competent authority as required by law.',
      ],
    },
    {
      heading: '11. Your rights',
      paragraphs: [
        'You can access, correct, delete or export your data, object to or restrict some processing, and withdraw your consent at any time. See [Your GDPR rights](/gdpr) for how to exercise them, and how to complain to a data protection authority.',
      ],
    },
    {
      heading: '12. Cookies',
      paragraphs: [
        'OmniFlow uses only strictly necessary cookies and a few browser storage entries for preferences. No advertising or analytics cookies. Details in the [Cookie Policy](/cookies).',
      ],
    },
    {
      heading: '13. Children',
      paragraphs: [
        'OmniFlow is not intended for people under 18. We do not knowingly collect data from children.',
      ],
    },
    {
      heading: '14. Changes',
      paragraphs: [
        'We will update this policy when our practices change and show the new date at the top. For significant changes, we will notify you in the app or by email.',
      ],
    },
    {
      heading: '15. Contact',
      paragraphs: [contactLine],
    },
  ],
};

const gdpr: LegalPage = {
  slug: 'gdpr',
  title: 'Your GDPR Rights',
  description: 'How to exercise your data protection rights with OmniFlow.',
  intro: `Under the EU General Data Protection Regulation (GDPR), you have rights over your personal data. This page explains them and how to use them with OmniFlow. The data controller is ${op.name} (${op.email}). What data we process and why is described in the [Privacy Policy](/privacy).`,
  sections: [
    {
      heading: 'Your rights',
      items: [
        'Access (Art. 15): get a copy of the personal data we hold about you.',
        'Rectification (Art. 16): correct inaccurate data. You can edit most data yourself in OmniFlow (projects, content, settings).',
        'Erasure (Art. 17): ask us to delete your data. See [Data Deletion](/data-deletion).',
        'Restriction (Art. 18): ask us to limit how we use your data, for example while a correction is checked.',
        'Portability (Art. 20): receive the data you provided in a structured, machine-readable format (JSON or CSV).',
        'Objection (Art. 21): object to processing based on our legitimate interest.',
        'Withdraw consent (Art. 7): at any time, for example by disconnecting your Facebook Page or WordPress site. This does not affect what was done before.',
        'Complaint: lodge a complaint with a data protection authority, in particular in the EU country where you live, work, or where you think the infringement happened.',
      ],
    },
    {
      heading: 'What you can do yourself in OmniFlow',
      items: [
        'Edit or delete projects, boards, generations, Pins, articles and social posts.',
        'Export Pins as CSV files and copy any generated content.',
        'Disconnect a Facebook Page (Facebook → Disconnect Page) — its encrypted token is deleted immediately.',
        'Revoke the Application Password you created for OmniFlow in WordPress (Users → Profile → Application Passwords): OmniFlow can then no longer access your site.',
      ],
    },
    {
      heading: 'How to make a request',
      items: [
        `Email ${op.email} from the address linked to your OmniFlow account, and say which right you want to exercise.`,
        'If we cannot confirm the request comes from you, we may ask for more information — never more than needed.',
        'We answer within one month. This can be extended by two more months for complex requests; we will tell you why.',
        'Requests are free, unless they are clearly unfounded or excessive.',
      ],
    },
    {
      heading: 'Processors and transfers',
      paragraphs: [
        'The providers that process data for OmniFlow, and the safeguards for transfers outside the EEA, are listed in the [Privacy Policy](/privacy) (sections 7 and 8).',
      ],
    },
  ],
};

const cookies: LegalPage = {
  slug: 'cookies',
  title: 'Cookie Policy',
  description: 'The cookies and browser storage OmniFlow uses.',
  intro: 'OmniFlow uses only what is strictly necessary to work. We do not use advertising, analytics, tracking or social media cookies, which is why OmniFlow does not show a cookie consent banner.',
  sections: [
    {
      heading: 'Strictly necessary cookies',
      items: [
        'Authentication cookies (named sb-…-auth-token), set by our authentication provider Supabase: keep you signed in and secure your session. They last as long as your session and are removed when you sign out.',
        'omniflow_meta_oauth and omniflow_meta_pending: set only while you connect a Facebook Page, to protect the connection against forgery and hold the Page list until you pick one. Encrypted, HTTP-only, limited to the Facebook connection addresses, and expire after 10 minutes.',
      ],
    },
    {
      heading: 'Browser storage (preferences)',
      paragraphs: [
        'OmniFlow also saves a few preferences in your browser\'s local storage. They never leave your device:',
      ],
      items: [
        'theme — light, dark or system theme.',
        'omniflow:sidebar-groups — which sidebar sections are open.',
        'omniflow:dashboard-streams-status-sort — the sort order of the Content streams table.',
      ],
    },
    {
      heading: 'Third-party sites',
      paragraphs: [
        'When you connect a Facebook Page, you log in on facebook.com. Facebook\'s own cookies are governed by Meta\'s cookie policy, not by OmniFlow.',
      ],
    },
    {
      heading: 'Managing cookies',
      paragraphs: [
        'You can delete or block cookies in your browser settings. If you block the authentication cookies, you will not be able to sign in to OmniFlow. If we ever add non-essential cookies, we will ask for your consent first and update this page.',
      ],
    },
  ],
};

const dataDeletion: LegalPage = {
  slug: 'data-deletion',
  title: 'Data Deletion',
  description: 'How to delete your OmniFlow data, including data received from Facebook.',
  intro: 'You can delete your data from OmniFlow at any time. This page explains how, including for the data OmniFlow receives when you connect a Facebook Page.',
  sections: [
    {
      heading: 'Remove only your Facebook data',
      items: [
        'In OmniFlow, open Facebook in the sidebar and click "Disconnect Page" next to the project. The Page connection and its encrypted access token are deleted immediately.',
        'On Facebook, go to Settings & privacy → Settings → Business integrations, select OmniFlow and click Remove. This revokes OmniFlow\'s access to your Pages.',
        'The records of posts you published (post IDs and status) stay in your OmniFlow history until you delete those posts in OmniFlow or ask for full deletion below.',
      ],
    },
    {
      heading: 'Delete your whole account',
      items: [
        `Send an email to ${op.email} from the address of your OmniFlow account, with the subject "Data deletion request".`,
        'We confirm receipt and delete your account and all associated data within 30 days: projects, generated content, images, uploaded files, history, WordPress credentials, Facebook Page connections and publication records.',
        'We send you a confirmation when the deletion is complete.',
      ],
    },
    {
      heading: 'What is not deleted by OmniFlow',
      items: [
        'Content already published on your Facebook Page or WordPress site stays there. Delete it directly on Facebook or WordPress if you want it removed.',
        'Pins you uploaded to Pinterest yourself.',
        'Residual copies in our providers\' backups, which are overwritten during their normal backup cycle.',
        'Data we must keep to comply with a legal obligation, if any — only for the required period.',
      ],
    },
    {
      heading: 'Questions',
      paragraphs: [`Contact ${op.email}. More information in the [Privacy Policy](/privacy) and [Your GDPR rights](/gdpr).`],
    },
  ],
};

const legalNotice: LegalPage = {
  slug: 'legal-notice',
  title: 'Legal Notice',
  description: 'Who publishes and hosts OmniFlow.',
  intro: 'Information about the publisher and host of the OmniFlow web app.',
  sections: [
    {
      heading: 'Publisher',
      items: [
        `Name: ${op.name}`,
        `Status: ${op.status}`,
        `Address: ${op.address}`,
        `Registration: ${op.registration}`,
        `VAT: ${op.vat}`,
        `Email: ${op.email}`,
        `Publication director: ${op.name}`,
      ],
    },
    {
      heading: 'Hosting',
      items: [
        'Application: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States — vercel.com',
        'Database, authentication and files: Supabase Inc., 970 Toa Payoh North #07-04, Singapore 318992 — supabase.com',
        'Images: Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, United States — cloudflare.com',
      ],
    },
    {
      heading: 'Intellectual property',
      paragraphs: [
        'The OmniFlow name, software, design and texts are protected. Any reproduction without permission is prohibited. Content created by users belongs to them, as described in the [Terms of Service](/terms).',
      ],
    },
    {
      heading: 'Trademarks',
      paragraphs: [
        'Facebook and Meta are trademarks of Meta Platforms, Inc.; Pinterest is a trademark of Pinterest, Inc.; WordPress is a trademark of the WordPress Foundation; Medium is a trademark of A Medium Corporation. OmniFlow is not affiliated with, endorsed or sponsored by these companies.',
      ],
    },
  ],
};

export const legalPages: LegalPage[] = [terms, privacy, gdpr, cookies, dataDeletion, legalNotice];

export function getLegalPage(slug: LegalPage['slug']): LegalPage {
  const page = legalPages.find((p) => p.slug === slug);
  if (!page) throw new Error(`Unknown legal page: ${slug}`);
  return page;
}
