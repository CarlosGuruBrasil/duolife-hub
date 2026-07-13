import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header transparent />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
