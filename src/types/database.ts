export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AssetType = 'STOCKS' | 'FUNDS' | 'CASH';
export type TransactionType = 'BUY' | 'SELL';

export interface Database {
  public: {
    Tables: {
      assets: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          asset_type: AssetType;
          current_price: number;
          tax_rate: number;
          sector?: string;
          currency?: 'THB' | 'USD';
          last_split_date?: string | null;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          symbol: string;
          asset_type: AssetType;
          current_price?: number;
          tax_rate?: number;
          sector?: string;
          currency?: 'THB' | 'USD';
          last_split_date?: string | null;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          asset_type?: AssetType;
          current_price?: number;
          tax_rate?: number;
          sector?: string;
          currency?: 'THB' | 'USD';
          last_split_date?: string | null;
          is_archived?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      transactions: {
        Row: {
          id: string;
          asset_id: string;
          type: TransactionType;
          shares: number;
          price_per_share: number;
          transaction_date: string;
          exchange_rate?: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          asset_id: string;
          type: TransactionType;
          shares: number;
          price_per_share: number;
          transaction_date?: string;
          exchange_rate?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          asset_id?: string;
          type?: TransactionType;
          shares?: number;
          price_per_share?: number;
          transaction_date?: string;
          exchange_rate?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'assets';
            referencedColumns: ['id'];
          }
        ];
      };
      dividend_schedules: {
        Row: {
          id: string;
          asset_id: string;
          dpu: number;
          xd_date: string;
          payment_date: string | null;
          is_projected: boolean;
          is_special?: boolean;
          received_fx_rate?: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          asset_id: string;
          dpu?: number;
          xd_date: string;
          payment_date?: string | null;
          is_projected?: boolean;
          is_special?: boolean;
          received_fx_rate?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          asset_id?: string;
          dpu?: number;
          xd_date?: string;
          payment_date?: string | null;
          is_projected?: boolean;
          is_special?: boolean;
          received_fx_rate?: number | null;
          created_at?: string;
        };

        Relationships: [
          {
            foreignKeyName: 'dividend_schedules_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'assets';
            referencedColumns: ['id'];
          }
        ];
      };
      thai_funds_catalog: {
        Row: {
          id: string;
          symbol: string;
          name_th: string | null;
          name_en: string | null;
          amc_name: string | null;
          exchange: string | null;
          proj_id: string | null;
          category: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          name_th?: string | null;
          name_en?: string | null;
          amc_name?: string | null;
          exchange?: string | null;
          proj_id?: string | null;
          category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          name_th?: string | null;
          name_en?: string | null;
          amc_name?: string | null;
          exchange?: string | null;
          proj_id?: string | null;
          category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      portfolio_snapshots: {
        Row: {
          id: string;
          user_id: string;
          snapshot_date: string;
          total_market_value: number;
          total_cost: number;
          unrealized_pl: number;
          unrealized_pl_percent: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          snapshot_date: string;
          total_market_value?: number;
          total_cost?: number;
          unrealized_pl?: number;
          unrealized_pl_percent?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          snapshot_date?: string;
          total_market_value?: number;
          total_cost?: number;
          unrealized_pl?: number;
          unrealized_pl_percent?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'portfolio_snapshots_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      view_asset_summary: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          asset_type: AssetType;
          current_price: number;
          tax_rate: number;
          sector?: string;
          currency?: 'THB' | 'USD';
          last_split_date?: string | null;
          is_archived: boolean;
          created_at: string;
          net_shares: number;
          net_holdings: number;
          avg_cost: number;
          weighted_average_cost: number;
          total_cost: number;
          market_value: number;
          unrealized_pl: number;
          unrealized_pl_percent: number;
        };
        Relationships: [
          {
            foreignKeyName: 'assets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      asset_type: AssetType;
      transaction_type: TransactionType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Asset = Database['public']['Tables']['assets']['Row'];
export type AssetInsert = Database['public']['Tables']['assets']['Insert'];
export type AssetUpdate = Database['public']['Tables']['assets']['Update'];

export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
export type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];

export type DividendSchedule = Database['public']['Tables']['dividend_schedules']['Row'];
export type DividendScheduleInsert = Database['public']['Tables']['dividend_schedules']['Insert'];
export type DividendScheduleUpdate = Database['public']['Tables']['dividend_schedules']['Update'];

export type AssetSummary = Database['public']['Views']['view_asset_summary']['Row'];
