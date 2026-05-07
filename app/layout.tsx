import type { Metadata } from 'next';
import './globals.css';
import { auth } from '@/auth';
import { SectionNav } from '@/components/section-nav';
import { SessionProvider } from 'next-auth/react';

export const metadata: Metadata = {
  title: 'ShipBots Dashboard',
  description: 'ShipBots internal operations dashboard',
  icons: {
    icon: '/shipbots-icon.png',
    apple: '/shipbots-icon.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const showNav = !!session?.user;

  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="icon" href="/shipbots-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full flex flex-col">
        <SessionProvider session={session}>
          {showNav && (
            <SectionNav
              userEmail={session.user?.email}
              userName={session.user?.name}
              userImage={session.user?.image}
            />
          )}
          <main className={showNav ? 'flex-1 overflow-hidden' : 'flex-1'}>
            {children}
          </main>
        </SessionProvider>
      </body>
    </html>
  );
}
