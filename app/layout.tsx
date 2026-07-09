import type { Metadata } from 'next';
import { Space_Grotesk, DM_Sans, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'OmniFlow',
  description: 'AI-powered Pinterest content generation platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster
          richColors
          position="bottom-right"
          toastOptions={{ className: 'text-sm' }}
          visibleToasts={3}
        />
      </body>
    </html>
  );
}
