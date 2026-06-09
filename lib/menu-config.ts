import {
  LayoutDashboard,
  Upload,
  FileText,
  ChartBar,
  Building2,
  Settings,
} from 'lucide-react';
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
  {
    href:  '/dashboard',
    label: 'Dashboard',
    icon:  LayoutDashboard,
  },
  {
    href:      '/upload',
    label:     'Upload',
    icon:      Upload,
    visibleTo: ['admin', 'accountant'],
  },
  {
    href:  '/invoice',
    label: 'Invoices',
    icon:  FileText,
  },
  {
    href:      '/risk-report',
    label:     'Risk Report',
    icon:      ChartBar,
    visibleTo: ['admin', 'accountant'],
  },
  {
    href:      '/vendors',
    label:     'Vendors',
    icon:      Building2,
    visibleTo: ['admin', 'accountant'],
  },
  {
    href:  '/settings',
    label: 'Settings',
    icon:  Settings,
  },
];

/** Returns only the items visible for the given role. */
export function getVisibleNavItems(role: AppRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.visibleTo || (role && item.visibleTo.includes(role))
  );
}
