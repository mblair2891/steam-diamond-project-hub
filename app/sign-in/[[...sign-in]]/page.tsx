import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-amber-400/50 bg-surface-800 text-lg font-bold text-amber-400">
          S×D
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Steam × Diamond</h1>
        <p className="mt-1.5 text-sm font-medium text-ink-muted">Project Hub</p>
        <p className="mt-3 text-xs text-ink-dim">Sign in with your phone number</p>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'border border-surface-600 bg-surface-800 shadow-panel'
          }
        }}
      />
    </div>
  );
}
