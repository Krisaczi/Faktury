import { OnboardingForm } from '@/components/onboarding/onboarding-form';

export default function OnboardingPage() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="mb-2 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome to KSeFApp
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Let's get your company set up in under 2 minutes.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
