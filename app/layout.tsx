import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Steam × Diamond Project Hub',
  description: 'Steam Distillery × Diamond House BBQ partnership project management'
};

export const viewport: Viewport = {
  themeColor: '#0f1115'
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = (
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    ''
  ).trim();

  if (!publishableKey) {
    return (
      <html lang="en" className={`h-full ${inter.variable}`}>
        <body className="flex min-h-screen items-center justify-center bg-surface-950 p-6 font-sans text-ink antialiased">
          <div className="max-w-lg rounded-xl border border-surface-600 bg-surface-800 p-6 shadow-panel">
            <h1 className="mb-2 text-xl font-bold">Clerk keys required</h1>
            <p className="mb-4 text-sm leading-relaxed text-ink-muted">
              Add keys to <code className="text-amber-300">.env.local</code> then restart{' '}
              <code className="text-amber-300">npm run dev</code>.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-surface-600 bg-surface-950/70 p-3 text-xs text-amber-300">
{`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...`}
            </pre>
          </div>
        </body>
      </html>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        variables: {
          colorPrimary: '#e8b84a',
          colorBackground: '#1a1f28',
          colorText: '#eef1f6',
          colorTextSecondary: '#a8b0c0',
          colorInputBackground: '#0f1115',
          colorInputText: '#eef1f6',
          borderRadius: '0.75rem'
        }
      }}
    >
      <html lang="en" className={`h-full ${inter.variable}`}>
        <body className="h-full min-h-screen font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
