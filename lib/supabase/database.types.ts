export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_consents: {
        Row: {
          accepted_at: string
          id: string
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          privacy_version?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      duplicate_groups: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      duplicate_pairs: {
        Row: {
          created_at: string
          decided_at: string | null
          decision: Database["public"]["Enums"]["duplicate_decision"]
          id: string
          left_job_id: string
          reasons: Json
          right_job_id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["duplicate_decision"]
          id?: string
          left_job_id: string
          reasons?: Json
          right_job_id: string
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["duplicate_decision"]
          id?: string
          left_job_id?: string
          reasons?: Json
          right_job_id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_pairs_left_job_id_fkey"
            columns: ["left_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_pairs_right_job_id_fkey"
            columns: ["right_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_revisions: {
        Row: {
          change_kind: string
          changed_at: string
          device_id: string
          id: string
          job_id: string
          restored_from_revision_id: string | null
          snapshot: Json
          user_id: string
        }
        Insert: {
          change_kind: string
          changed_at?: string
          device_id?: string
          id?: string
          job_id: string
          restored_from_revision_id?: string | null
          snapshot: Json
          user_id: string
        }
        Update: {
          change_kind?: string
          changed_at?: string
          device_id?: string
          id?: string
          job_id?: string
          restored_from_revision_id?: string | null
          snapshot?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_revisions_restored_from_revision_id_fkey"
            columns: ["restored_from_revision_id"]
            isOneToOne: false
            referencedRelation: "job_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sources: {
        Row: {
          connector_mode: Database["public"]["Enums"]["connector_mode"]
          created_at: string
          external_id: string | null
          first_observed_at: string
          id: string
          job_id: string
          last_checked_at: string | null
          last_error_code: string | null
          last_success_at: string | null
          normalized_url: string
          original_url: string
          provider: Database["public"]["Enums"]["source_provider"]
          source_values: Json
          status: Database["public"]["Enums"]["source_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          connector_mode?: Database["public"]["Enums"]["connector_mode"]
          created_at?: string
          external_id?: string | null
          first_observed_at?: string
          id?: string
          job_id: string
          last_checked_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          normalized_url: string
          original_url: string
          provider?: Database["public"]["Enums"]["source_provider"]
          source_values?: Json
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          connector_mode?: Database["public"]["Enums"]["connector_mode"]
          created_at?: string
          external_id?: string | null
          first_observed_at?: string
          id?: string
          job_id?: string
          last_checked_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          normalized_url?: string
          original_url?: string
          provider?: Database["public"]["Enums"]["source_provider"]
          source_values?: Json
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sources_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          application_status: Database["public"]["Enums"]["application_status"]
          career_max_years: number | null
          career_min_years: number | null
          company_name: string
          created_at: string
          deadline_at: string | null
          deadline_kind: Database["public"]["Enums"]["deadline_kind"]
          duplicate_group_id: string | null
          education_text: string | null
          employment_types: string[]
          field_provenance: Json
          id: string
          locations: string[]
          memo: string
          next_action_at: string | null
          posted_at: string | null
          preferred_qualifications: string[]
          qualifications: string[]
          responsibilities: string[]
          role_name: string | null
          salary_text: string | null
          search_document: unknown
          skills: string[]
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_status?: Database["public"]["Enums"]["application_status"]
          career_max_years?: number | null
          career_min_years?: number | null
          company_name: string
          created_at?: string
          deadline_at?: string | null
          deadline_kind?: Database["public"]["Enums"]["deadline_kind"]
          duplicate_group_id?: string | null
          education_text?: string | null
          employment_types?: string[]
          field_provenance?: Json
          id?: string
          locations?: string[]
          memo?: string
          next_action_at?: string | null
          posted_at?: string | null
          preferred_qualifications?: string[]
          qualifications?: string[]
          responsibilities?: string[]
          role_name?: string | null
          salary_text?: string | null
          search_document?: unknown
          skills?: string[]
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_status?: Database["public"]["Enums"]["application_status"]
          career_max_years?: number | null
          career_min_years?: number | null
          company_name?: string
          created_at?: string
          deadline_at?: string | null
          deadline_kind?: Database["public"]["Enums"]["deadline_kind"]
          duplicate_group_id?: string | null
          education_text?: string | null
          employment_types?: string[]
          field_provenance?: Json
          id?: string
          locations?: string[]
          memo?: string
          next_action_at?: string | null
          posted_at?: string | null
          preferred_qualifications?: string[]
          qualifications?: string[]
          responsibilities?: string[]
          role_name?: string | null
          salary_text?: string | null
          search_document?: unknown
          skills?: string[]
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_duplicate_group_id_fkey"
            columns: ["duplicate_group_id"]
            isOneToOne: false
            referencedRelation: "duplicate_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      request_usage: {
        Row: {
          action: Database["public"]["Enums"]["rate_limit_action"]
          bucket_start: string
          request_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["rate_limit_action"]
          bucket_start: string
          request_count: number
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["rate_limit_action"]
          bucket_start?: string
          request_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      source_checks: {
        Row: {
          checked_at: string
          error_code: string | null
          fields_changed: string[]
          id: string
          result_status: Database["public"]["Enums"]["source_status"]
          source_id: string
          user_id: string
        }
        Insert: {
          checked_at?: string
          error_code?: string | null
          fields_changed?: string[]
          id?: string
          result_status: Database["public"]["Enums"]["source_status"]
          source_id: string
          user_id: string
        }
        Update: {
          checked_at?: string
          error_code?: string | null
          fields_changed?: string[]
          id?: string
          result_status?: Database["public"]["Enums"]["source_status"]
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_checks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "job_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_backup_restore: {
        Args: { target_device: string; target_payload: Json }
        Returns: Json
      }
      consume_rate_limit: {
        Args: {
          target_action: Database["public"]["Enums"]["rate_limit_action"]
        }
        Returns: {
          allowed: boolean
          limit_value: number
          remaining: number
          reset_at: string
          retry_after_seconds: number
        }[]
      }
      decide_duplicate: {
        Args: {
          target_decision: Database["public"]["Enums"]["duplicate_decision"]
          target_pair_id: string
        }
        Returns: undefined
      }
      delete_job: {
        Args: { target_device: string; target_job_id: string }
        Returns: undefined
      }
      preview_backup_restore: { Args: { target_payload: Json }; Returns: Json }
      preview_backup_restore_unchecked: {
        Args: { target_payload: Json }
        Returns: Json
      }
      record_source_refresh: {
        Args: {
          target_error_code: string
          target_fields_changed: string[]
          target_job_patch: Json
          target_source_id: string
          target_source_values: Json
          target_status: Database["public"]["Enums"]["source_status"]
        }
        Returns: undefined
      }
      restore_job_revision: {
        Args: {
          target_device: string
          target_job_id: string
          target_revision_id: string
        }
        Returns: undefined
      }
      update_job_tracking: {
        Args: {
          target_device: string
          target_job_id: string
          target_memo: string
          target_next_action: string
          target_status: Database["public"]["Enums"]["application_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      application_status:
        | "unreviewed"
        | "interested"
        | "planned"
        | "applied"
        | "interviewing"
        | "accepted"
        | "rejected"
        | "excluded"
      connector_mode: "manual" | "approved_api"
      deadline_kind: "fixed" | "rolling" | "until_hired" | "unknown"
      duplicate_decision: "suggested" | "confirmed" | "rejected"
      rate_limit_action:
        | "source_preview"
        | "source_refresh"
        | "import_validate"
        | "import_commit"
        | "consent_write"
        | "account_delete"
        | "mutation_write"
      source_provider: "manual" | "saramin" | "jobkorea" | "other"
      source_status:
        | "active"
        | "closed"
        | "unreachable"
        | "unsupported"
        | "unknown"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      application_status: [
        "unreviewed",
        "interested",
        "planned",
        "applied",
        "interviewing",
        "accepted",
        "rejected",
        "excluded",
      ],
      connector_mode: ["manual", "approved_api"],
      deadline_kind: ["fixed", "rolling", "until_hired", "unknown"],
      duplicate_decision: ["suggested", "confirmed", "rejected"],
      rate_limit_action: [
        "source_preview",
        "source_refresh",
        "import_validate",
        "import_commit",
        "consent_write",
        "account_delete",
        "mutation_write",
      ],
      source_provider: ["manual", "saramin", "jobkorea", "other"],
      source_status: [
        "active",
        "closed",
        "unreachable",
        "unsupported",
        "unknown",
      ],
    },
  },
} as const
