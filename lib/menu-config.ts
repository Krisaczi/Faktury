import { LayoutDashboard, Upload, FileText, ChartBar, Building2, Settings, Users } from 'lucide-react';
import type { AppRole } from '@/lib/permissions';

export interface NavItem {
  href:       string;
  label:      string;
  icon:       React.ElementType;
  /**
   * Roles that can see this item.
   * Omit (or pass `undefined`) to show to every authenticated role.
   */
  visibleTo?: AppRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Pulpit', icon: LayoutDashboard },
  { href: '/upload',    label: 'Wczytwanie faktur',    icon: Upload,    visibleTo: ['accountant'] },
  { href: '/invoice',   label: 'Faktury',  icon: FileText },
  { href: '/customers', label: 'Klienci',  icon: Users,    visibleTo: ['accountant'] },
  { href: '/risk-report', label: 'Raporty ryzyka', icon: ChartBar, visibleTo: ['accountant'] },
  { href: '/vendors',   label: 'Dostawcy',   icon: Building2,   visibleTo: ['accountant'] },
  { href: '/settings',  label: 'Ustawienia',  icon: Settings },
];

/** Returns only the items visible for the given role. */
export function getVisibleNavItems(role: AppRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.visibleTo || (role && item.visibleTo.includes(role))
  );
}
