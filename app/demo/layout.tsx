import { DemoSidebar } from '@/components/demo/demo-sidebar';
import { DemoBanner } from '@/components/demo/demo-banner';

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:flex md:shrink-0">
        <DemoSidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <DemoBanner />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
