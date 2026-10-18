import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/legal-document';
import { getLegalPage } from '@/lib/legal/content';

const page = getLegalPage('legal-notice');

export const metadata: Metadata = { title: `${page.title} — OmniFlow`, description: page.description };

export default function Page() {
  return <LegalDocument page={page} />;
}
