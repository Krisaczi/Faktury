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

/**
 * Central menu configuration.
 *
 * To change which roles see which items, edit the `visibleTo` array.
 * - Omitting `visibleTo` = visible to all roles.
 * - `visibleTo: ['admin', 'accountant', 'viewer']` = hidden for 'owner' and 'member'.
 *
 * Roles available: 'owner' | 'admin' | 'accountant' | 'viewer' | 'member'
 */
export const NAV_ITEMS: NavItem[] = [
  {
    href:  '/dashboard',
    label: 'Dashboard',
    icon:  LayoutDashboard,
    // visible to all roles
  },
  {
    href:      '/upload',
    label:     'Upload',
    icon:      Upload,
    visibleTo: ['admin', 'accountant', 'viewer', 'member'],
  },
  {
    href:  '/invoice',
    label: 'Invoices',
    icon:  FileText,
    // visible to all roles
  },
  {
    href:      '/risk-report',
    label:     'Risk Report',
    icon:      ChartBar,
    visibleTo: ['admin', 'accountant', 'viewer', 'member'],
  },
  {
    href:      '/vendors',
    label:     'Vendors',
    icon:      Building2,
    visibleTo: ['admin', 'accountant', 'viewer', 'member'],
  },
  {
    href:  '/settings',
    label: 'Settings',
    icon:  Settings,
    // visible to all roles
  },
];

/** Returns only the items visible for the given role. */
export function getVisibleNavItems(role: AppRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.visibleTo || (role && item.visibleTo.includes(role))
  );
}
