'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isJeton = pathname === '/jeton';

  if (isJeton) {
    return <>{children}</>;
  }

  return (
    <>
      <Header transparent />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
