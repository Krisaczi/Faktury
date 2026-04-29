import type { Database } from './database';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Invoice = Database['public']['Tables']['invoices']['Row'];
export type Vendor = Database['public']['Tables']['vendors']['Row'];
export type RiskReport = Database['public']['Tables']['risk_reports']['Row'];

export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
export type VendorInsert = Database['public']['Tables']['vendors']['Insert'];
export type RiskReportInsert = Database['public']['Tables']['risk_reports']['Insert'];

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type VendorStatus = 'active' | 'inactive' | 'blocked';
export type ReportStatus = 'draft' | 'completed' | 'reviewed';
export type ReportType = 'financial' | 'compliance' | 'operational';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface DashboardStats {
  totalInvoices: number;
  pendingAmount: number;
  totalVendors: number;
  avgRiskScore: number;
}
