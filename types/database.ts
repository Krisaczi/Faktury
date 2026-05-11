export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          nip: string;
          currency: string;
          ingestion_email: string | null;
          subscription_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          nip?: string | null;
          currency?: string;
          ingestion_email?: string | null;
          subscription_status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          nip?: string;
          currency?: string;
          ingestion_email?: string | null;
          subscription_status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string;
          company_id: string | null;
          role: 'owner' | 'admin' | 'member';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          company_id?: string | null;
          role?: 'owner' | 'admin' | 'member';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          role?: 'owner' | 'admin' | 'member';
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: 'user' | 'admin' | 'owner';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'user' | 'admin' | 'owner';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'user' | 'admin' | 'owner';
          updated_at?: string;
        };
        Relationships: [];
      };
      vendors: {
        Row: {
          id: string;
          user_id: string;
          company_id: string | null;
          name: string;
          category: string | null;
          risk_score: number | null;
          status: 'active' | 'inactive' | 'under_review';
          contact_email: string | null;
          nip: string | null;
          bank_accounts: Json;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id?: string | null;
          name: string;
          category?: string | null;
          risk_score?: number | null;
          status?: 'active' | 'inactive' | 'under_review';
          contact_email?: string | null;
          nip?: string | null;
          bank_accounts?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          category?: string | null;
          risk_score?: number | null;
          status?: 'active' | 'inactive' | 'under_review';
          contact_email?: string | null;
          nip?: string | null;
          bank_accounts?: Json;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      risk_reports: {
        Row: {
          id: string;
          user_id: string;
          vendor_id: string | null;
          title: string;
          summary: string | null;
          risk_level: 'low' | 'medium' | 'high' | 'critical';
          status: 'draft' | 'published' | 'archived';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          vendor_id?: string | null;
          title: string;
          summary?: string | null;
          risk_level?: 'low' | 'medium' | 'high' | 'critical';
          status?: 'draft' | 'published' | 'archived';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          summary?: string | null;
          risk_level?: 'low' | 'medium' | 'high' | 'critical';
          status?: 'draft' | 'published' | 'archived';
          updated_at?: string;
        };
        Relationships: [];
      };
      uploads: {
        Row: {
          id: string;
          user_id: string;
          filename: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          filename: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          created_at?: string;
        };
        Update: {
          status?: 'pending' | 'processing' | 'completed' | 'failed';
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          company_id: string;
          vendor_id: string | null;
          invoice_number: string | null;
          invoice_date: string | null;
          issue_date: string | null;
          due_date: string | null;
          amount: number | null;
          total_amount: number | null;
          tax_amount: number | null;
          currency: string;
          seller_nip: string | null;
          buyer_nip: string | null;
          bank_account: string | null;
          file_url: string | null;
          raw_file_url: string | null;
          upload_session_id: string | null;
          overall_risk: 'low' | 'medium' | 'high' | 'critical' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          vendor_id?: string | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          issue_date?: string | null;
          due_date?: string | null;
          amount?: number | null;
          total_amount?: number | null;
          tax_amount?: number | null;
          currency?: string;
          seller_nip?: string | null;
          buyer_nip?: string | null;
          bank_account?: string | null;
          file_url?: string | null;
          raw_file_url?: string | null;
          upload_session_id?: string | null;
          overall_risk?: 'low' | 'medium' | 'high' | 'critical' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vendor_id?: string | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          issue_date?: string | null;
          due_date?: string | null;
          amount?: number | null;
          total_amount?: number | null;
          tax_amount?: number | null;
          currency?: string;
          seller_nip?: string | null;
          buyer_nip?: string | null;
          bank_account?: string | null;
          raw_file_url?: string | null;
          upload_session_id?: string | null;
          overall_risk?: 'low' | 'medium' | 'high' | 'critical' | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      risk_flags: {
        Row: {
          id: string;
          invoice_id: string;
          type: string;
          severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
          message: string;
          status: 'open' | 'acknowledged' | 'dismissed';
          acknowledged_by: string | null;
          acknowledged_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          type: string;
          severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
          message: string;
          status?: 'open' | 'acknowledged' | 'dismissed';
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
          created_at?: string;
        };
        Update: {
          type?: string;
          severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
          message?: string;
          status?: 'open' | 'acknowledged' | 'dismissed';
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
        };
        Relationships: [];
      };
      upload_sessions: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          source: string;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          file_count: number;
          invoices_created: number;
          flags_created: number;
          error_count: number;
          storage_path: string | null;
          error_detail: Json;
          filename: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          source?: string;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          file_count?: number;
          invoices_created?: number;
          flags_created?: number;
          error_count?: number;
          storage_path?: string | null;
          error_detail?: Json;
          filename?: string | null;
          created_at?: string;
        };
        Update: {
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          file_count?: number;
          invoices_created?: number;
          flags_created?: number;
          error_count?: number;
          error_detail?: Json;
        };
        Relationships: [];
      };
      ksef_credentials: {
        Row: {
          id: string;
          company_id: string;
          token: string;
          environment: 'test' | 'prod';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          token: string;
          environment?: 'test' | 'prod';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          token?: string;
          environment?: 'test' | 'prod';
          updated_at?: string;
        };
        Relationships: [];
      };
      parse_jobs: {
        Row: {
          id: string;
          upload_session_id: string;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          progress: number;
          result: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          upload_session_id: string;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          progress?: number;
          result?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          progress?: number;
          result?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      exports_audit: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          export_type: string;
          filters: Json;
          row_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          export_type?: string;
          filters?: Json;
          row_count?: number;
          created_at?: string;
        };
        Update: {
          row_count?: number;
        };
        Relationships: [];
      };
      invoice_reviews: {
        Row: {
          id: string;
          invoice_id: string;
          reviewer_id: string;
          status: 'reviewed' | 'approved' | 'flagged_for_follow_up';
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          reviewer_id: string;
          status?: 'reviewed' | 'approved' | 'flagged_for_follow_up';
          note?: string | null;
          created_at?: string;
        };
        Update: {
          status?: 'reviewed' | 'approved' | 'flagged_for_follow_up';
          note?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          invoice_id: string | null;
          action: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          invoice_id?: string | null;
          action: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          metadata?: Json;
        };
        Relationships: [];
      };
      billing_metadata: {
        Row: {
          id: string;
          company_id: string;
          ls_subscription_id: string | null;
          ls_customer_id: string | null;
          plan_name: string;
          status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'paused';
          renews_at: string | null;
          ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          ls_subscription_id?: string | null;
          ls_customer_id?: string | null;
          plan_name?: string;
          status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'paused';
          renews_at?: string | null;
          ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          ls_subscription_id?: string | null;
          ls_customer_id?: string | null;
          plan_name?: string;
          status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'paused';
          renews_at?: string | null;
          ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings_audit: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          action: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          action: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          metadata?: Json;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_dashboard_metrics: {
        Args: Record<string, never>;
        Returns: {
          total_invoices_30d: number;
          high_risk_count: number;
          flagged_amount_sum: number;
        }[];
      };
      get_invoice_timeseries: {
        Args: Record<string, never>;
        Returns: {
          day: string;
          total: number;
          flagged: number;
        }[];
      };
      get_recent_activity: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          kind: string;
          label: string;
          created_at: string;
        }[];
      };
      get_user_company_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      get_risk_report_page: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
          p_vendor_id?: string | null;
          p_risk_level?: string | null;
          p_search?: string | null;
          p_page?: number;
          p_page_size?: number;
          p_sort_by?: string;
          p_sort_dir?: string;
        };
        Returns: {
          rows: Json;
          total_count: number;
          high_risk_count: number;
          total_flagged_amount: number;
        }[];
      };
      get_risk_report_filters: {
        Args: Record<string, never>;
        Returns: {
          vendors: Json;
          risk_levels: Json;
        }[];
      };
      get_invoice_detail: {
        Args: { p_invoice_id: string };
        Returns: {
          invoice: Json;
          flags: Json;
          reviews: Json;
          vendor: Json | null;
        }[];
      };
      get_vendor_summary: {
        Args: { p_vendor_id: string };
        Returns: {
          vendor: Json;
          stats: Json;
          recent_invoices: Json;
        }[];
      };
      get_vendor_detail: {
        Args: { p_vendor_id: string };
        Returns: {
          vendor: Json;
          stats: Json;
          last_activity: Json;
        }[];
      };
      get_vendor_invoices_page: {
        Args: {
          p_vendor_id: string;
          p_from?: string | null;
          p_to?: string | null;
          p_risk_level?: string | null;
          p_search?: string | null;
          p_page?: number;
          p_page_size?: number;
          p_sort_by?: string;
          p_sort_dir?: string;
        };
        Returns: {
          rows: Json;
          total_count: number;
        }[];
      };
      get_vendor_trend: {
        Args: {
          p_vendor_id: string;
          p_from?: string | null;
          p_to?: string | null;
          p_granularity?: string;
        };
        Returns: {
          period: string;
          total: number;
          flagged: number;
          high_risk: number;
        }[];
      };
    };
    Enums: {
      user_role: 'user' | 'admin' | 'owner';
      vendor_status: 'active' | 'inactive' | 'under_review';
      risk_level: 'low' | 'medium' | 'high' | 'critical';
      report_status: 'draft' | 'published' | 'archived';
      upload_status: 'pending' | 'processing' | 'completed' | 'failed';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type UserRole = Database['public']['Enums']['user_role'];
