import { ProjectProvider } from '@/components/ProjectProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { UploadManagerProvider } from '@/components/UploadManager';
import AppShell from '@/components/AppShell';
import GlobalUploadPanel from '@/components/GlobalUploadPanel';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <ToastProvider>
        <UploadManagerProvider>
          <AppShell>{children}</AppShell>
          <GlobalUploadPanel />
        </UploadManagerProvider>
      </ToastProvider>
    </ProjectProvider>
  );
}
