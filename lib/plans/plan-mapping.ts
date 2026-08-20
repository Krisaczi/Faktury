// Pure plan mapping utilities — no database imports, safe for unit testing.

const PLAN_LABEL_MAP: Record<string, string> = {
  starter:       'Starter',
  professional:  'Professional',
  pro:           'Professional',
  individual:    'Indywidualny',
};

export function getPlanLabel(planId: string | null | undefined): string {
  if (!planId) return 'Starter';
  const normalized = planId.trim().toLowerCase();
  return PLAN_LABEL_MAP[normalized] ?? PLAN_LABEL_MAP[planId] ?? planId;
}

export function normalizePlanId(raw: string | null | undefined): string {
  if (!raw) return 'starter';
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'pro') return 'professional';
  return trimmed;
}
