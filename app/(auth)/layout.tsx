import { SiteFooter } from '@/components/layout/site-footer';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">{children}</div>
      <SiteFooter />
    </div>
  );
}
