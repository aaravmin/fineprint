export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      approval: {
        Row: {
          approved_by: string
          at: string
          id: number
          note: string
          owner: string
          task_id: number
          verdict: string
        }
        Insert: {
          approved_by: string
          at?: string
          id?: never
          note: string
          owner: string
          task_id: number
          verdict: string
        }
        Update: {
          approved_by?: string
          at?: string
          id?: never
          note?: string
          owner?: string
          task_id?: number
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      binder_event: {
        Row: {
          at: string
          building_id: number
          id: number
          kind: string
          law_id: string
          obligation_id: number | null
          owner: string
          summary: string
        }
        Insert: {
          at?: string
          building_id: number
          id?: never
          kind: string
          law_id: string
          obligation_id?: number | null
          owner: string
          summary: string
        }
        Update: {
          at?: string
          building_id?: number
          id?: never
          kind?: string
          law_id?: string
          obligation_id?: number | null
          owner?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "binder_event_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "building"
            referencedColumns: ["id"]
          },
        ]
      }
      building: {
        Row: {
          address: string
          annual_emissions_tco2e: number | null
          bbl: string | null
          bin: string | null
          community_district: number | null
          compliance_plan_json: string | null
          created_at: string
          energy_star_score: number | null
          id: number
          is_affordable: boolean
          ll97_covered: boolean | null
          num_floors: number | null
          owner: string
          provenance_json: string | null
          sqft: number
          units_residential: number | null
          uses_json: string | null
        }
        Insert: {
          address: string
          annual_emissions_tco2e?: number | null
          bbl?: string | null
          bin?: string | null
          community_district?: number | null
          compliance_plan_json?: string | null
          created_at?: string
          energy_star_score?: number | null
          id?: never
          is_affordable: boolean
          ll97_covered?: boolean | null
          num_floors?: number | null
          owner: string
          provenance_json?: string | null
          sqft: number
          units_residential?: number | null
          uses_json?: string | null
        }
        Update: {
          address?: string
          annual_emissions_tco2e?: number | null
          bbl?: string | null
          bin?: string | null
          community_district?: number | null
          compliance_plan_json?: string | null
          created_at?: string
          energy_star_score?: number | null
          id?: never
          is_affordable?: boolean
          ll97_covered?: boolean | null
          num_floors?: number | null
          owner?: string
          provenance_json?: string | null
          sqft?: number
          units_residential?: number | null
          uses_json?: string | null
        }
        Relationships: []
      }
      event: {
        Row: {
          at: string
          id: number
          kind: string
          owner: string
          payload: string
          task_id: number | null
          worker_id: number | null
        }
        Insert: {
          at?: string
          id?: never
          kind: string
          owner: string
          payload: string
          task_id?: number | null
          worker_id?: number | null
        }
        Update: {
          at?: string
          id?: never
          kind?: string
          owner?: string
          payload?: string
          task_id?: number | null
          worker_id?: number | null
        }
        Relationships: []
      }
      evidence: {
        Row: {
          building_id: number
          document_date: string | null
          expiration_date: string | null
          file_name: string
          file_type: string
          file_url_or_key: string
          filing_reference_number: string
          id: number
          issuer: string
          law_id: string
          notes: string
          obligation_id: number
          owner: string
          uploaded_at: string
          uploaded_by: string
          vendor_id: number | null
          verification_status: string
        }
        Insert: {
          building_id: number
          document_date?: string | null
          expiration_date?: string | null
          file_name: string
          file_type?: string
          file_url_or_key?: string
          filing_reference_number?: string
          id?: never
          issuer?: string
          law_id: string
          notes?: string
          obligation_id: number
          owner: string
          uploaded_at?: string
          uploaded_by?: string
          vendor_id?: number | null
          verification_status?: string
        }
        Update: {
          building_id?: number
          document_date?: string | null
          expiration_date?: string | null
          file_name?: string
          file_type?: string
          file_url_or_key?: string
          filing_reference_number?: string
          id?: never
          issuer?: string
          law_id?: string
          notes?: string
          obligation_id?: number
          owner?: string
          uploaded_at?: string
          uploaded_by?: string
          vendor_id?: number | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "building"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor"
            referencedColumns: ["id"]
          },
        ]
      }
      obligation: {
        Row: {
          building_id: number
          completed_at: string | null
          created_at: string
          due_date: string | null
          filing_reference_number: string
          id: number
          law_id: string
          notes: string
          owner: string
          responsible_party: string
          status: string
          title: string
          updated_at: string
          vendor_id: number | null
        }
        Insert: {
          building_id: number
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          filing_reference_number?: string
          id?: never
          law_id: string
          notes?: string
          owner: string
          responsible_party?: string
          status?: string
          title: string
          updated_at?: string
          vendor_id?: number | null
        }
        Update: {
          building_id?: number
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          filing_reference_number?: string
          id?: never
          law_id?: string
          notes?: string
          owner?: string
          responsible_party?: string
          status?: string
          title?: string
          updated_at?: string
          vendor_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "obligation_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "building"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          owner: string
          review_mode: string
        }
        Insert: {
          owner: string
          review_mode: string
        }
        Update: {
          owner?: string
          review_mode?: string
        }
        Relationships: []
      }
      submission: {
        Row: {
          body: string
          id: number
          owner: string
          payload_json: string | null
          submitted_at: string
          task_id: number
          worker_id: number
        }
        Insert: {
          body: string
          id?: never
          owner: string
          payload_json?: string | null
          submitted_at?: string
          task_id: number
          worker_id: number
        }
        Update: {
          body?: string
          id?: never
          owner?: string
          payload_json?: string | null
          submitted_at?: string
          task_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "submission_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      task: {
        Row: {
          building_id: number | null
          claimed_by: number | null
          created_at: string
          deadline: string
          fine_estimate_usd: number | null
          id: number
          intake_address: string | null
          kind: string
          law_id: string
          owner: string
          sla_breached: boolean
          status: string
          title: string
        }
        Insert: {
          building_id?: number | null
          claimed_by?: number | null
          created_at?: string
          deadline: string
          fine_estimate_usd?: number | null
          id?: never
          intake_address?: string | null
          kind: string
          law_id: string
          owner: string
          sla_breached?: boolean
          status?: string
          title: string
        }
        Update: {
          building_id?: number | null
          claimed_by?: number | null
          created_at?: string
          deadline?: string
          fine_estimate_usd?: number | null
          id?: never
          intake_address?: string | null
          kind?: string
          law_id?: string
          owner?: string
          sla_breached?: boolean
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "building"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor: {
        Row: {
          company: string
          created_at: string
          email: string
          id: number
          license_number: string
          license_type: string
          name: string
          notes: string
          owner: string
          phone: string
          role_type: string
        }
        Insert: {
          company?: string
          created_at?: string
          email?: string
          id?: never
          license_number?: string
          license_type?: string
          name: string
          notes?: string
          owner: string
          phone?: string
          role_type: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: never
          license_number?: string
          license_type?: string
          name?: string
          notes?: string
          owner?: string
          phone?: string
          role_type?: string
        }
        Relationships: []
      }
      worker: {
        Row: {
          current_task_id: number | null
          id: number
          last_heartbeat: string
          last_task_owner: string | null
          name: string
          status: string
        }
        Insert: {
          current_task_id?: number | null
          id?: never
          last_heartbeat?: string
          last_task_owner?: string | null
          name: string
          status?: string
        }
        Update: {
          current_task_id?: number | null
          id?: never
          last_heartbeat?: string
          last_task_owner?: string | null
          name?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_binder_note: {
        Args: { p_note: string; p_obligation_id: number }
        Returns: undefined
      }
      add_building: {
        Args: {
          p_address: string
          p_is_affordable: boolean
          p_sqft: number
          p_task_specs: Json
        }
        Returns: number
      }
      add_evidence: {
        Args: {
          p_file_name: string
          p_file_type: string
          p_file_url_or_key: string
          p_filing_reference_number: string
          p_issuer: string
          p_notes: string
          p_obligation_id: number
          p_uploaded_by: string
        }
        Returns: number
      }
      add_vendor: {
        Args: {
          p_company: string
          p_email: string
          p_license_number: string
          p_license_type: string
          p_name: string
          p_notes: string
          p_phone: string
          p_role_type: string
        }
        Returns: number
      }
      approve: {
        Args: { p_note?: string; p_task_id: number }
        Returns: undefined
      }
      assign_vendor: {
        Args: { p_obligation_id: number; p_vendor_id: number }
        Returns: undefined
      }
      claim_task: {
        Args: { p_task_id: number; p_worker_id: number }
        Returns: undefined
      }
      fail_intake: {
        Args: { p_reason: string; p_task_id: number; p_worker_id: number }
        Returns: undefined
      }
      fp_check_len: {
        Args: { p_max: number; p_name: string; p_value: string }
        Returns: undefined
      }
      fp_check_text: {
        Args: { p_max: number; p_name: string; p_value: string }
        Returns: string
      }
      fp_ingest: { Args: { p: Json; p_owner: string }; Returns: number }
      fp_is_service: { Args: never; Returns: boolean }
      fp_log_binder_event: {
        Args: {
          p_building_id: number
          p_kind: string
          p_law_id: string
          p_obligation_id: number
          p_owner: string
          p_summary: string
        }
        Returns: undefined
      }
      fp_log_event: {
        Args: {
          p_kind: string
          p_owner: string
          p_payload: string
          p_task_id?: number
          p_worker_id?: number
        }
        Returns: undefined
      }
      fp_owner: { Args: never; Returns: string }
      fp_release_worker: {
        Args: { p_reason: string; p_worker_id: number }
        Returns: undefined
      }
      fp_require_human: { Args: never; Returns: string }
      fp_require_service: { Args: never; Returns: undefined }
      fp_spawn_tasks: {
        Args: {
          p_address: string
          p_building_id: number
          p_owner: string
          p_specs: Json
        }
        Returns: number
      }
      fp_validate_task_specs: { Args: { p_specs: Json }; Returns: Json }
      heartbeat: { Args: { p_worker_id: number }; Returns: undefined }
      ingest_building: { Args: { p: Json; p_owner?: string }; Returns: number }
      kill_worker: { Args: { p_worker_id: number }; Returns: undefined }
      mark_done: {
        Args: { p_note?: string; p_task_id: number }
        Returns: undefined
      }
      prune_dead_workers: { Args: never; Returns: undefined }
      reap: { Args: never; Returns: undefined }
      register_worker: {
        Args: { p_name: string; p_worker_id?: number }
        Returns: number
      }
      reject: {
        Args: { p_note?: string; p_task_id: number }
        Returns: undefined
      }
      request_building: { Args: { p_address: string }; Returns: number }
      seed_obligations: {
        Args: { p_building_id: number; p_specs: Json }
        Returns: undefined
      }
      set_evidence_verification: {
        Args: { p_evidence_id: number; p_status: string }
        Returns: undefined
      }
      set_obligation_status: {
        Args: { p_obligation_id: number; p_status: string }
        Returns: undefined
      }
      set_review_mode: { Args: { p_mode: string }; Returns: undefined }
      submit_work: {
        Args: {
          p_body: string
          p_payload_json?: string
          p_task_id: number
          p_worker_id: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const

