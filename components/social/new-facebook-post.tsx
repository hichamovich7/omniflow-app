'use client';

import { useRouter } from 'next/navigation';
import { NewMediumSummary } from '@/components/social/new-medium-summary';
import { FacebookPostPanel } from '@/components/social/facebook-post-panel';
import type { MediumArticleOption, MediumPinterestOption, MediumSiteOption } from '@/lib/queries/social-content';

interface NewFacebookPostProps {
  articles: MediumArticleOption[];
  sites: MediumSiteOption[];
  pinterest: MediumPinterestOption[];
}

/**
 * "New Facebook post" on /facebook (TASK-068): the same three sources as
 * Medium (OmniFlow article, existing WordPress post, Pins made from an
 * article), picked in place, then the Facebook generator. Nothing is
 * generated before the button, nothing is published from here.
 */
export function NewFacebookPost({ articles, sites, pinterest }: NewFacebookPostProps) {
  const router = useRouter();
  return (
    <NewMediumSummary
      articles={articles}
      sites={sites}
      pinterest={pinterest}
      heading="New Facebook post"
      intro="Choose the article to turn into a Facebook Page post. It is only read — never modified — and nothing is published until you confirm it."
      testId="new-facebook-post"
      renderPanel={(source) => <FacebookPostPanel source={source} onGenerated={() => router.refresh()} />}
    />
  );
}
