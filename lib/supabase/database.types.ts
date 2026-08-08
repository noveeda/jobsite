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
      canonical_jobs: {
        Row: {
          career_max_years: number | null
          career_min_years: number | null
          company_name: string
          created_at: string
          deadline_at: string | null
          deadline_kind: string
          education_text: string | null
          employment_types: string[]
          experience_text: string | null
          field_provenance: Json
          id: string
          industry: string | null
          job_categories: string[]
          last_observed_at: string
          lifecycle_status: string
          locations: string[]
          posted_at: string | null
          role_name: string | null
          salary_text: string | null
          title: string
          updated_at: string
        }
        Insert: {
          career_max_years?: number | null
          career_min_years?: number | null
          company_name: string
          created_at?: string
          deadline_at?: string | null
          deadline_kind?: string
          education_text?: string | null
          employment_types?: string[]
          experience_text?: string | null
          field_provenance?: Json
          id?: string
          industry?: string | null
          job_categories?: string[]
          last_observed_at: string
          lifecycle_status?: string
          locations?: string[]
          posted_at?: string | null
          role_name?: string | null
          salary_text?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          career_max_years?: number | null
          career_min_years?: number | null
          company_name?: string
          created_at?: string
          deadline_at?: string | null
          deadline_kind?: string
          education_text?: string | null
          employment_types?: string[]
          experience_text?: string | null
          field_provenance?: Json
          id?: string
          industry?: string | null
          job_categories?: string[]
          last_observed_at?: string
          lifecycle_status?: string
          locations?: string[]
          posted_at?: string | null
          role_name?: string | null
          salary_text?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_duplicate_candidates: {
        Row: {
          created_at: string
          evidence_revision: number
          id: string
          left_canonical_job_id: string
          left_generation_id: string
          left_source_posting_id: string
          reasons: Json
          right_canonical_job_id: string
          right_generation_id: string
          right_source_posting_id: string
          score: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_revision?: number
          id?: string
          left_canonical_job_id: string
          left_generation_id: string
          left_source_posting_id: string
          reasons: Json
          right_canonical_job_id: string
          right_generation_id: string
          right_source_posting_id: string
          score: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_revision?: number
          id?: string
          left_canonical_job_id?: string
          left_generation_id?: string
          left_source_posting_id?: string
          reasons?: Json
          right_canonical_job_id?: string
          right_generation_id?: string
          right_source_posting_id?: string
          score?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_duplicate_candidates_left_canonical_job_id_fkey"
            columns: ["left_canonical_job_id"]
            isOneToOne: false
            referencedRelation: "canonical_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_duplicate_candidates_left_generation_id_fkey"
            columns: ["left_generation_id"]
            isOneToOne: false
            referencedRelation: "collection_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_duplicate_candidates_left_source_posting_id_fkey"
            columns: ["left_source_posting_id"]
            isOneToOne: false
            referencedRelation: "source_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_duplicate_candidates_right_canonical_job_id_fkey"
            columns: ["right_canonical_job_id"]
            isOneToOne: false
            referencedRelation: "canonical_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_duplicate_candidates_right_generation_id_fkey"
            columns: ["right_generation_id"]
            isOneToOne: false
            referencedRelation: "collection_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_duplicate_candidates_right_source_posting_id_fkey"
            columns: ["right_source_posting_id"]
            isOneToOne: false
            referencedRelation: "source_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_duplicate_decision_events: {
        Row: {
          action: string
          after_decision: string | null
          before_decision: string | null
          candidate_id: string
          created_at: string
          effective_revision: number
          expected_revision: number
          id: string
          operation_id: string
          payload_fingerprint: string
          portable_endpoints: Json
          result: Json
          user_id: string
        }
        Insert: {
          action: string
          after_decision?: string | null
          before_decision?: string | null
          candidate_id: string
          created_at?: string
          effective_revision: number
          expected_revision: number
          id?: string
          operation_id: string
          payload_fingerprint: string
          portable_endpoints: Json
          result: Json
          user_id: string
        }
        Update: {
          action?: string
          after_decision?: string | null
          before_decision?: string | null
          candidate_id?: string
          created_at?: string
          effective_revision?: number
          expected_revision?: number
          id?: string
          operation_id?: string
          payload_fingerprint?: string
          portable_endpoints?: Json
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_duplicate_decision_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "catalog_duplicate_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_duplicate_decisions: {
        Row: {
          candidate_id: string
          created_at: string
          decision: string | null
          effective_revision: number
          portable_endpoints: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          decision?: string | null
          effective_revision?: number
          portable_endpoints: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          decision?: string | null
          effective_revision?: number
          portable_endpoints?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_duplicate_decisions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "catalog_duplicate_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_duplicate_graph_locks: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalog_duplicate_issue_reports: {
        Row: {
          candidate_id: string
          category: string
          created_at: string
          id: string
          message: string
          operation_id: string
          payload_fingerprint: string
          portable_endpoints: Json
          user_id: string
        }
        Insert: {
          candidate_id: string
          category: string
          created_at?: string
          id?: string
          message: string
          operation_id: string
          payload_fingerprint: string
          portable_endpoints: Json
          user_id: string
        }
        Update: {
          candidate_id?: string
          category?: string
          created_at?: string
          id?: string
          message?: string
          operation_id?: string
          payload_fingerprint?: string
          portable_endpoints?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_duplicate_issue_reports_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "catalog_duplicate_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_runs: {
        Row: {
          attempt_count: number
          closed_count: number
          created_at: string
          cursor: Json | null
          error_code: string | null
          error_summary: string | null
          fetched_count: number
          finished_at: string | null
          id: string
          lease_until: string | null
          next_retry_at: string | null
          provider_code: string
          quota_used: number
          run_kind: string
          schedule_bucket: string
          snapshot_complete: boolean
          started_at: string | null
          status: string
          upserted_count: number
        }
        Insert: {
          attempt_count?: number
          closed_count?: number
          created_at?: string
          cursor?: Json | null
          error_code?: string | null
          error_summary?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          lease_until?: string | null
          next_retry_at?: string | null
          provider_code: string
          quota_used?: number
          run_kind: string
          schedule_bucket: string
          snapshot_complete?: boolean
          started_at?: string | null
          status?: string
          upserted_count?: number
        }
        Update: {
          attempt_count?: number
          closed_count?: number
          created_at?: string
          cursor?: Json | null
          error_code?: string | null
          error_summary?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          lease_until?: string | null
          next_retry_at?: string | null
          provider_code?: string
          quota_used?: number
          run_kind?: string
          schedule_bucket?: string
          snapshot_complete?: boolean
          started_at?: string | null
          status?: string
          upserted_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_runs_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "source_providers"
            referencedColumns: ["code"]
          },
        ]
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
      personal_job_states: {
        Row: {
          application_status: string
          canonical_job_id: string
          created_at: string
          excluded: boolean
          memo: string
          next_action_at: string | null
          saved: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          application_status?: string
          canonical_job_id: string
          created_at?: string
          excluded?: boolean
          memo?: string
          next_action_at?: string | null
          saved?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          application_status?: string
          canonical_job_id?: string
          created_at?: string
          excluded?: boolean
          memo?: string
          next_action_at?: string | null
          saved?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_job_states_canonical_job_id_fkey"
            columns: ["canonical_job_id"]
            isOneToOne: false
            referencedRelation: "canonical_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_daily_usage: {
        Row: {
          provider_code: string
          reserve_calls: number
          scheduled_calls: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          provider_code: string
          reserve_calls?: number
          scheduled_calls?: number
          updated_at?: string
          usage_date: string
        }
        Update: {
          provider_code?: string
          reserve_calls?: number
          scheduled_calls?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_daily_usage_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "source_providers"
            referencedColumns: ["code"]
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
      source_postings: {
        Row: {
          canonical_job_id: string
          content_fingerprint: string
          created_at: string
          external_id: string
          first_observed_at: string
          id: string
          last_collection_run_id: string | null
          last_observed_at: string
          missing_complete_runs: number
          normalized_url: string
          original_url: string
          provider_code: string
          source_status: string
          source_values: Json
          updated_at: string
        }
        Insert: {
          canonical_job_id: string
          content_fingerprint: string
          created_at?: string
          external_id: string
          first_observed_at: string
          id?: string
          last_collection_run_id?: string | null
          last_observed_at: string
          missing_complete_runs?: number
          normalized_url: string
          original_url: string
          provider_code: string
          source_status?: string
          source_values?: Json
          updated_at?: string
        }
        Update: {
          canonical_job_id?: string
          content_fingerprint?: string
          created_at?: string
          external_id?: string
          first_observed_at?: string
          id?: string
          last_collection_run_id?: string | null
          last_observed_at?: string
          missing_complete_runs?: number
          normalized_url?: string
          original_url?: string
          provider_code?: string
          source_status?: string
          source_values?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_postings_canonical_job_id_fkey"
            columns: ["canonical_job_id"]
            isOneToOne: false
            referencedRelation: "canonical_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_postings_last_collection_run_id_fkey"
            columns: ["last_collection_run_id"]
            isOneToOne: false
            referencedRelation: "collection_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_postings_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "source_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      source_providers: {
        Row: {
          access_mode: string | null
          activation_required: boolean
          approval_reference: string | null
          approval_expires_at: string | null
          approval_status: string
          attribution: Json
          capabilities: Json
          code: string
          created_at: string
          daily_limit: number | null
          disabled_reason: string | null
          display_name: string
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          last_error_code: string | null
          last_success_at: string | null
          page_limit: number | null
          refresh_interval_minutes: number
          retention_policy: Json
          staging_smoke_reference: string | null
          terms_url: string | null
          updated_at: string
        }
        Insert: {
          access_mode?: string | null
          activation_required?: boolean
          approval_reference?: string | null
          approval_expires_at?: string | null
          approval_status?: string
          attribution?: Json
          capabilities?: Json
          code: string
          created_at?: string
          daily_limit?: number | null
          disabled_reason?: string | null
          display_name: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          page_limit?: number | null
          refresh_interval_minutes?: number
          retention_policy?: Json
          staging_smoke_reference?: string | null
          terms_url?: string | null
          updated_at?: string
        }
        Update: {
          access_mode?: string | null
          activation_required?: boolean
          approval_reference?: string | null
          approval_expires_at?: string | null
          approval_status?: string
          attribution?: Json
          capabilities?: Json
          code?: string
          created_at?: string
          daily_limit?: number | null
          disabled_reason?: string | null
          display_name?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          page_limit?: number | null
          refresh_interval_minutes?: number
          retention_policy?: Json
          staging_smoke_reference?: string | null
          terms_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      catalog_duplicate_component: {
        Args: {
          target_excluded_candidate_id: string
          target_start_id: string
          target_user_id: string
        }
        Returns: string[]
      }
      catalog_duplicate_has_current_consent: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      catalog_duplicate_is_currently_eligible: {
        Args: { target_candidate_id: string }
        Returns: boolean
      }
      catalog_duplicate_portable_endpoints: {
        Args: { target_candidate_id: string }
        Returns: Json
      }
      claim_collection_run: {
        Args: {
          target_lease_seconds?: number
          target_provider_code: string
          target_run_kind?: string
          target_schedule_bucket: string
        }
        Returns: {
          attempt_count: number
          closed_count: number
          created_at: string
          cursor: Json | null
          error_code: string | null
          error_summary: string | null
          fetched_count: number
          finished_at: string | null
          id: string
          lease_until: string | null
          next_retry_at: string | null
          provider_code: string
          quota_used: number
          run_kind: string
          schedule_bucket: string
          snapshot_complete: boolean
          started_at: string | null
          status: string
          upserted_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "collection_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_request_usage: { Args: never; Returns: number }
      commit_backup_restore: {
        Args: { target_device: string; target_payload: Json }
        Returns: Json
      }
      consume_provider_quota: {
        Args: {
          target_amount?: number
          target_bucket?: string
          target_provider_code: string
          target_usage_date?: string
        }
        Returns: {
          allowed: boolean
          hard_limit: number
          reserve_calls: number
          scheduled_calls: number
        }[]
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
      disable_source_provider: {
        Args: { target_provider_code: string; target_reason: string }
        Returns: boolean
      }
      export_backup_v2_overlays: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_catalog_feed: {
        Args: { target_filters?: Json; target_take?: number }
        Returns: Json
      }
      get_catalog_feed_common: {
        Args: { target_filters?: Json; target_take?: number }
        Returns: Json
      }
      get_catalog_job_detail: { Args: { target_id: string }; Returns: Json }
      get_catalog_job_detail_common: {
        Args: { target_id: string }
        Returns: Json
      }
      get_catalog_duplicate_detail: { Args: { target_id: string }; Returns: Json }
      ingest_source_postings: {
        Args: {
          target_finalize?: boolean
          target_postings: Json
          target_provider_code: string
          target_run_id: string
          target_snapshot_complete?: boolean
        }
        Returns: {
          closed_count: number
          upserted_count: number
        }[]
      }
      is_source_provider_enabled: {
        Args: { target_provider_code: string }
        Returns: boolean
      }
      preview_backup_restore: { Args: { target_payload: Json }; Returns: Json }
      preview_backup_restore_unchecked: {
        Args: { target_payload: Json }
        Returns: Json
      }
      purge_source_provider_data: {
        Args: { target_provider_code: string; target_reason: string }
        Returns: number
      }
      purge_source_provider_data_unchecked: {
        Args: { target_provider_code: string; target_reason: string }
        Returns: number
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
      set_catalog_duplicate_decision: {
        Args: {
          target_action: string
          target_candidate_id: string
          target_expected_revision: number
          target_operation_id: string
          target_payload?: Json
        }
        Returns: Json
      }
      submit_catalog_duplicate_issue_report: {
        Args: {
          target_candidate_id: string
          target_category: string
          target_message: string
          target_operation_id: string
          target_payload?: Json
        }
        Returns: Json
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
