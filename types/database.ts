export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          company: string | null;
          role: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          company?: string | null;
          role?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          company?: string | null;
          role?: string | null;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          user_id: string;
          invoice_number: string;
          vendor_id: string | null;
          amount: number;
          currency: string;
          status: 'pending' | 'paid' | 'overdue' | 'cancelled';
          issue_date: string | null;
          due_date: string | null;
          paid_date: string | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          invoice_number: string;
          vendor_id?: string | null;
          amount?: number;
          currency?: string;
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
          issue_date?: string | null;
          due_date?: string | null;
          paid_date?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          invoice_number?: string;
          vendor_id?: string | null;
          amount?: number;
          currency?: string;
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
          issue_date?: string | null;
          due_date?: string | null;
          paid_date?: string | null;
          description?: string | null;
          updated_at?: string;
        };
      };
      vendors: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          tax_id: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          status: 'active' | 'inactive' | 'blocked';
          risk_score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          tax_id?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          status?: 'active' | 'inactive' | 'blocked';
          risk_score?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          tax_id?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          status?: 'active' | 'inactive' | 'blocked';
          risk_score?: number;
          updated_at?: string;
        };
      };
      risk_reports: {
        Row: {
          id: string;
          user_id: string;
          vendor_id: string | null;
          report_type: 'financial' | 'compliance' | 'operational';
          score: number;
          findings: Json;
          status: 'draft' | 'completed' | 'reviewed';
          generated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          vendor_id?: string | null;
          report_type?: 'financial' | 'compliance' | 'operational';
          score?: number;
          findings?: Json;
          status?: 'draft' | 'completed' | 'reviewed';
          generated_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vendor_id?: string | null;
          report_type?: 'financial' | 'compliance' | 'operational';
          score?: number;
          findings?: Json;
          status?: 'draft' | 'completed' | 'reviewed';
          updated_at?: string;
        };
      };
      companies: {
        Row: {
          id: string;
          name: string;
          nip: string;
          currency: string;
          ksef_token: string;
          ksef_token_created_at: string | null;
          subscription_status: string;
          trial_start: string | null;
          trial_end: string | null;
          is_trial_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          nip?: string;
          currency?: string;
          ksef_token?: string;
          ksef_token_created_at?: string | null;
          subscription_status?: string;
          trial_start?: string | null;
          trial_end?: string | null;
          is_trial_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          nip?: string;
          currency?: string;
          ksef_token?: string;
          ksef_token_created_at?: string | null;
          subscription_status?: string;
          trial_start?: string | null;
          trial_end?: string | null;
          is_trial_active?: boolean;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          email: string;
          company_id: string | null;
          role: string;
          onboarded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string;
          company_id?: string | null;
          role?: string;
          onboarded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          company_id?: string | null;
          role?: string;
          onboarded?: boolean;
          updated_at?: string;
        };
      };
      company_vendors: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          nip: string;
          bank_accounts: string[];
          avg_amount: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name?: string;
          nip?: string;
          bank_accounts?: string[];
          avg_amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          nip?: string;
          bank_accounts?: string[];
          avg_amount?: number;
          updated_at?: string;
        };
      };
      company_invoices: {
        Row: {
          id: string;
          company_id: string;
          vendor_id: string | null;
          ksef_reference: string;
          invoice_number: string;
          amount: number;
          currency: string;
          issue_date: string | null;
          due_date: string | null;
          bank_account: string;
          xml_raw: string;
          overall_risk: string;
          seller_nip: string;
          buyer_nip: string;
          seller_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          vendor_id?: string | null;
          ksef_reference?: string;
          invoice_number?: string;
          amount?: number;
          currency?: string;
          issue_date?: string | null;
          due_date?: string | null;
          bank_account?: string;
          xml_raw?: string;
          overall_risk?: string;
          seller_nip?: string;
          buyer_nip?: string;
          seller_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vendor_id?: string | null;
          ksef_reference?: string;
          invoice_number?: string;
          amount?: number;
          currency?: string;
          issue_date?: string | null;
          due_date?: string | null;
          bank_account?: string;
          xml_raw?: string;
          overall_risk?: string;
          seller_nip?: string;
          buyer_nip?: string;
          seller_name?: string;
          updated_at?: string;
        };
      };
    };
  };
}
