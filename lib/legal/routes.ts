/**
 * Public legal pages (TASK-069). Kept free of React / icon imports: the
 * session proxy (lib/supabase/middleware.ts) imports this to let signed-out
 * visitors — and Meta's App Review — open these pages.
 */
export interface LegalRoute {
  href: string;
  label: string;
}

export const legalRoutes: LegalRoute[] = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/gdpr', label: 'GDPR' },
  { href: '/cookies', label: 'Cookie Policy' },
  { href: '/data-deletion', label: 'Data Deletion' },
  { href: '/legal-notice', label: 'Legal Notice' },
];

export function isLegalPath(pathname: string): boolean {
  return legalRoutes.some((route) => pathname === route.href || pathname === route.href + '/');
}
