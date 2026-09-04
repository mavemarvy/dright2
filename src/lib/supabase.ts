import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!import.meta.env.VITE_SUPABASE_URL || (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY && !import.meta.env.VITE_SUPABASE_ANON_KEY)) {
  console.warn('Supabase environment variables are missing — database features will not work.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          phone: string | null;
          full_name: string | null;
          account_number: string | null;
          role: string;
          is_admin: boolean;
          admin_status: string;
          balance: number;
          marketer_level: number;
          advertiser_grade: string | null;
          weekly_sales_count: number;
          total_sales_count: number;
          consecutive_weeks_streak: number;
          social_media_links: string[] | null;
          marketer_status: string;
          advertiser_status: string;
          locked_balance: number;
          available_balance: number;
          downgraded_at: string | null;
          last_weekly_reset_at: string | null;
          referral_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          phone?: string | null;
          full_name?: string | null;
          account_number?: string | null;
          role?: string;
          is_admin?: boolean;
          admin_status?: string;
          balance?: number;
          marketer_level?: number;
          advertiser_grade?: string | null;
          weekly_sales_count?: number;
          total_sales_count?: number;
          consecutive_weeks_streak?: number;
          social_media_links?: string[] | null;
          marketer_status?: string;
          advertiser_status?: string;
          locked_balance?: number;
          available_balance?: number;
          downgraded_at?: string | null;
          last_weekly_reset_at?: string | null;
          referral_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          phone?: string | null;
          full_name?: string | null;
          account_number?: string | null;
          role?: string;
          is_admin?: boolean;
          admin_status?: string;
          balance?: number;
          marketer_level?: number;
          advertiser_grade?: string | null;
          weekly_sales_count?: number;
          total_sales_count?: number;
          consecutive_weeks_streak?: number;
          social_media_links?: string[] | null;
          marketer_status?: string;
          advertiser_status?: string;
          locked_balance?: number;
          available_balance?: number;
          downgraded_at?: string | null;
          last_weekly_reset_at?: string | null;
          referral_code?: string | null;
          created_at?: string;
        };
      };
      referral_links: {
        Row: {
          id: string;
          user_id: string;
          unique_code: string;
          total_clicks: number;
          total_conversions: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          unique_code?: string;
          total_clicks?: number;
          total_conversions?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          unique_code?: string;
          total_clicks?: number;
          total_conversions?: number;
          created_at?: string;
        };
      };
      sales_records: {
        Row: {
          id: string;
          promoter_id: string;
          buyer_name: string;
          product_name: string;
          commission_amount: number;
          status: string;
          sale_date: string;
          created_at: string;
          referrer_id: string | null;
          referrer_role: string | null;
          product_id: string | null;
          sale_amount: number;
        };
        Insert: {
          id?: string;
          promoter_id: string;
          buyer_name: string;
          product_name: string;
          commission_amount: number;
          status?: string;
          sale_date?: string;
          created_at?: string;
          referrer_id?: string | null;
          referrer_role?: string | null;
          product_id?: string | null;
          sale_amount?: number;
        };
        Update: {
          id?: string;
          promoter_id?: string;
          buyer_name?: string;
          product_name?: string;
          commission_amount?: number;
          status?: string;
          sale_date?: string;
          created_at?: string;
          referrer_id?: string | null;
          referrer_role?: string | null;
          product_id?: string | null;
          sale_amount?: number;
        };
      };
      verifications: {
        Row: {
          id: string;
          promoter_id: string;
          screenshot_url: string;
          transaction_details: string;
          status: string;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          promoter_id: string;
          screenshot_url: string;
          transaction_details: string;
          status?: string;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          promoter_id?: string;
          screenshot_url?: string;
          transaction_details?: string;
          status?: string;
          submitted_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          uploaded_by: string;
          name: string;
          description: string | null;
          price: number;
          commission_rate: number;
          image_url: string | null;
          category: string;
          is_active: boolean;
          approval_status: string;
          rejection_reason: string | null;
          created_at: string;
          admin_task_percent: number;
          sales_team_task_percent: number;
          affiliate_commission_percent: number;
          sales_team_tier: string | null;
        };
        Insert: {
          id?: string;
          uploaded_by?: string;
          name: string;
          description?: string | null;
          price: number;
          commission_rate?: number;
          image_url?: string | null;
          category?: string;
          is_active?: boolean;
          approval_status?: string;
          rejection_reason?: string | null;
          created_at?: string;
          admin_task_percent?: number;
          sales_team_task_percent?: number;
          affiliate_commission_percent?: number;
          sales_team_tier?: string | null;
        };
        Update: {
          id?: string;
          uploaded_by?: string;
          name?: string;
          description?: string | null;
          price?: number;
          commission_rate?: number;
          image_url?: string | null;
          category?: string;
          is_active?: boolean;
          approval_status?: string;
          rejection_reason?: string | null;
          created_at?: string;
          admin_task_percent?: number;
          sales_team_task_percent?: number;
          affiliate_commission_percent?: number;
          sales_team_tier?: string | null;
        };
      };
      payout_records: {
        Row: {
          id: string;
          user_id: string;
          sales_record_id: string | null;
          verification_id: string | null;
          product_id: string | null;
          amount: number;
          payout_type: string;
          status: string;
          admin_approval_percentage: number;
          notes: string | null;
          processed_by: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sales_record_id?: string | null;
          verification_id?: string | null;
          product_id?: string | null;
          amount: number;
          payout_type: string;
          status?: string;
          admin_approval_percentage?: number;
          notes?: string | null;
          processed_by?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sales_record_id?: string | null;
          verification_id?: string | null;
          product_id?: string | null;
          amount?: number;
          payout_type?: string;
          status?: string;
          admin_approval_percentage?: number;
          notes?: string | null;
          processed_by?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
      };
      withdrawal_requests: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          payment_method: string | null;
          account_details: string;
          status: string;
          admin_notes: string | null;
          processed_by: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          payment_method?: string | null;
          account_details: string;
          status?: string;
          admin_notes?: string | null;
          processed_by?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          payment_method?: string | null;
          account_details?: string;
          status?: string;
          admin_notes?: string | null;
          processed_by?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          notification_type: string;
          related_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          notification_type: string;
          related_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          notification_type?: string;
          related_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
      };
      admin_logs: {
        Row: {
          id: string;
          admin_id: string;
          action_type: string;
          target_id: string | null;
          target_type: string | null;
          details: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action_type: string;
          target_id?: string | null;
          target_type?: string | null;
          details?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action_type?: string;
          target_id?: string | null;
          target_type?: string | null;
          details?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
      sales_team_contracts: {
        Row: {
          id: string;
          seller_id: string;
          sales_team_id: string;
          product_id: string | null;
          duration: string;
          total_amount: number;
          status: string;
          admin_cut_applied: boolean;
          starts_at: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          sales_team_id: string;
          product_id?: string | null;
          duration?: string;
          total_amount: number;
          status?: string;
          admin_cut_applied?: boolean;
          starts_at?: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          seller_id?: string;
          sales_team_id?: string;
          product_id?: string | null;
          duration?: string;
          total_amount?: number;
          status?: string;
          admin_cut_applied?: boolean;
          starts_at?: string;
          expires_at?: string;
          created_at?: string;
        };
      };
      system_config: {
        Row: {
          id: string;
          singleton: boolean;
          admin_task_percent: number;
          marketer_task_pcts: Record<string, number>;
          advertiser_task_pcts: Record<string, number>;
          marketer_sub_prices: Record<string, number>;
          advertiser_sub_prices: Record<string, number>;
          admin_cut_percent: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          singleton?: boolean;
          admin_task_percent?: number;
          marketer_task_pcts?: Record<string, number>;
          advertiser_task_pcts?: Record<string, number>;
          marketer_sub_prices?: Record<string, number>;
          advertiser_sub_prices?: Record<string, number>;
          admin_cut_percent?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          singleton?: boolean;
          admin_task_percent?: number;
          marketer_task_pcts?: Record<string, number>;
          advertiser_task_pcts?: Record<string, number>;
          marketer_sub_prices?: Record<string, number>;
          advertiser_sub_prices?: Record<string, number>;
          admin_cut_percent?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
      };
      product_messages: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          product_id: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          product_id: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          product_id?: string;
          message?: string;
          created_at?: string;
        };
      };
      guest_orders: {
        Row: {
          id: string;
          product_id: string;
          buyer_email: string;
          buyer_name: string;
          shipping_address: string | null;
          quantity: number;
          total_amount: number;
          status: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          buyer_email: string;
          buyer_name: string;
          shipping_address?: string | null;
          quantity?: number;
          total_amount?: number;
          status?: string;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          buyer_email?: string;
          buyer_name?: string;
          shipping_address?: string | null;
          quantity?: number;
          total_amount?: number;
          status?: string;
          user_id?: string | null;
          created_at?: string;
        };
      };
      feedback: {
        Row: {
          id: string;
          user_id: string;
          category: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          category?: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category?: string;
          message?: string;
          created_at?: string;
        };
      };
      referrals: {
        Row: {
          id: string;
          referrer_id: string;
          referred_user_id: string;
          referral_code: string;
          is_successful: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          referrer_id: string;
          referred_user_id: string;
          referral_code: string;
          is_successful?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          referrer_id?: string;
          referred_user_id?: string;
          referral_code?: string;
          is_successful?: boolean;
          created_at?: string;
        };
      };
      business_settings: {
        Row: {
          id: string;
          is_singleton: boolean;
          business_name: string;
          tagline: string | null;
          description: string | null;
          street_address: string | null;
          address_line_2: string | null;
          city: string | null;
          region: string | null;
          postal_code: string | null;
          country: string | null;
          latitude: number | null;
          longitude: number | null;
          phone: string | null;
          email: string | null;
          website_url: string | null;
          logo_url: string | null;
          hours_json: Record<string, unknown> | null;
          service_area: string[];
          social_profiles: Record<string, string> | null;
          google_business_profile_url: string | null;
          google_place_id: string | null;
          google_maps_embed_url: string | null;
          price_range: string;
          service_categories: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          is_singleton?: boolean;
          business_name?: string;
          tagline?: string | null;
          description?: string | null;
          street_address?: string | null;
          address_line_2?: string | null;
          city?: string | null;
          region?: string | null;
          postal_code?: string | null;
          country?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          phone?: string | null;
          email?: string | null;
          website_url?: string | null;
          logo_url?: string | null;
          hours_json?: Record<string, unknown> | null;
          service_area?: string[];
          social_profiles?: Record<string, string> | null;
          google_business_profile_url?: string | null;
          google_place_id?: string | null;
          google_maps_embed_url?: string | null;
          price_range?: string;
          service_categories?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          is_singleton?: boolean;
          business_name?: string;
          tagline?: string | null;
          description?: string | null;
          street_address?: string | null;
          address_line_2?: string | null;
          city?: string | null;
          region?: string | null;
          postal_code?: string | null;
          country?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          phone?: string | null;
          email?: string | null;
          website_url?: string | null;
          logo_url?: string | null;
          hours_json?: Record<string, unknown> | null;
          service_area?: string[];
          social_profiles?: Record<string, string> | null;
          google_business_profile_url?: string | null;
          google_place_id?: string | null;
          google_maps_embed_url?: string | null;
          price_range?: string;
          service_categories?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
