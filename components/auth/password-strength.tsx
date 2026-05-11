'use client';

import { getPasswordStrength } from '@/lib/validations/auth';
import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null;
  const { score, label, color } = getPasswordStrength(password);
  const bars = 6;

  return (
    <div className="space-y-1.5 mt-1">
      <div className="flex gap-1">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i < score ? color : 'bg-muted'
            )}
          />
        ))}
      </div>
      <p
        className={cn(
          'text-xs font-medium',
          score <= 2 && 'text-red-500',
          score > 2 && score <= 4 && 'text-yellow-500',
          score > 4 && score <= 5 && 'text-blue-500',
          score > 5 && 'text-green-500'
        )}
      >
        {label} password
      </p>
    </div>
  );
}
