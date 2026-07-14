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
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          industry: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          industry: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          industry?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_members: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          role: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      business_profiles: {
        Row: {
          id: string;
          tenant_id: string;
          business_name: string;
          phone: string | null;
          email: string | null;
          website: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          country: string | null;
          timezone: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          business_name: string;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          country?: string | null;
          timezone?: string | null;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          business_name?: string;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          country?: string | null;
          timezone?: string | null;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      policy_settings: {
        Row: {
          id: string;
          tenant_id: string;
          recording_enabled: boolean;
          recording_consent_required: boolean;
          hipaa_mode: boolean;
          max_call_duration_seconds: number;
          allow_outbound: boolean;
          require_caller_id: boolean;
          pii_redaction_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          recording_enabled?: boolean;
          recording_consent_required?: boolean;
          hipaa_mode?: boolean;
          max_call_duration_seconds?: number;
          allow_outbound?: boolean;
          require_caller_id?: boolean;
          pii_redaction_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          recording_enabled?: boolean;
          recording_consent_required?: boolean;
          hipaa_mode?: boolean;
          max_call_duration_seconds?: number;
          allow_outbound?: boolean;
          require_caller_id?: boolean;
          pii_redaction_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "policy_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      voice_profiles: {
        Row: {
          id: string;
          tenant_id: string;
          provider: string;
          voice_id: string | null;
          speed: number;
          greeting: string | null;
          language: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          provider?: string;
          voice_id?: string | null;
          speed?: number;
          greeting?: string | null;
          language?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          provider?: string;
          voice_id?: string | null;
          speed?: number;
          greeting?: string | null;
          language?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voice_profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          id: string;
          auth_id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      calls: {
        Row: {
          id: string;
          tenant_id: string;
          provider_call_id: string | null;
          direction: string;
          status: string;
          caller_number: string | null;
          called_number: string | null;
          duration_seconds: number | null;
          started_at: string;
          ended_at: string | null;
          recording_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          provider_call_id?: string | null;
          direction: string;
          status: string;
          caller_number?: string | null;
          called_number?: string | null;
          duration_seconds?: number | null;
          started_at?: string;
          ended_at?: string | null;
          recording_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          provider_call_id?: string | null;
          direction?: string;
          status?: string;
          caller_number?: string | null;
          called_number?: string | null;
          duration_seconds?: number | null;
          started_at?: string;
          ended_at?: string | null;
          recording_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calls_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_numbers: {
        Row: {
          id: string;
          tenant_id: string;
          number: string;
          provider: string;
          provider_sid: string;
          capabilities: string[];
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          number: string;
          provider: string;
          provider_sid: string;
          capabilities?: string[];
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          number?: string;
          provider?: string;
          provider_sid?: string;
          capabilities?: string[];
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "phone_numbers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_flags: {
        Row: {
          id: string;
          tenant_id: string;
          flag_name: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          flag_name: string;
          enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          flag_name?: string;
          enabled?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feature_flags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          id: string;
          tenant_id: string;
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          actor_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          actor_id?: string | null;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          role: string;
          token: string;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          email: string;
          role: string;
          token?: string;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          email?: string;
          role?: string;
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
