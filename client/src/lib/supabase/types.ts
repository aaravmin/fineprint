export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      approvals: {
        Row: {
          approved_by: string;
          at: string;
          id: number;
          note: string;
          owner: string;
          task_id: number;
          verdict: string;
        };
        Insert: {
          approved_by: string;
          at?: string;
          id?: never;
          note?: string;
          owner: string;
          task_id: number;
          verdict: string;
        };
        Update: {
          approved_by?: string;
          at?: string;
          id?: never;
          note?: string;
          owner?: string;
          task_id?: number;
          verdict?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approvals_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      binder_events: {
        Row: {
          at: string;
          building_id: number;
          id: number;
          kind: string;
          law_id: string;
          obligation_id: number | null;
          owner: string;
          summary: string;
        };
        Insert: {
          at?: string;
          building_id: number;
          id?: never;
          kind: string;
          law_id: string;
          obligation_id?: number | null;
          owner: string;
          summary: string;
        };
        Update: {
          at?: string;
          building_id?: number;
          id?: never;
          kind?: string;
          law_id?: string;
          obligation_id?: number | null;
          owner?: string;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "binder_events_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      buildings: {
        Row: {
          address: string;
          annual_emissions_tco2e: number | null;
          bbl: string | null;
          bin: string | null;
          community_district: number | null;
          compliance_plan_json: Json | null;
          created_at: string;
          energy_star_score: number | null;
          id: number;
          is_affordable: boolean;
          ll97_covered: boolean | null;
          num_floors: number | null;
          owner: string;
          provenance_json: Json | null;
          sqft: number;
          units_residential: number | null;
          uses_json: Json | null;
        };
        Insert: {
          address: string;
          annual_emissions_tco2e?: number | null;
          bbl?: string | null;
          bin?: string | null;
          community_district?: number | null;
          compliance_plan_json?: Json | null;
          created_at?: string;
          energy_star_score?: number | null;
          id?: never;
          is_affordable: boolean;
          ll97_covered?: boolean | null;
          num_floors?: number | null;
          owner: string;
          provenance_json?: Json | null;
          sqft: number;
          units_residential?: number | null;
          uses_json?: Json | null;
        };
        Update: {
          address?: string;
          annual_emissions_tco2e?: number | null;
          bbl?: string | null;
          bin?: string | null;
          community_district?: number | null;
          compliance_plan_json?: Json | null;
          created_at?: string;
          energy_star_score?: number | null;
          id?: never;
          is_affordable?: boolean;
          ll97_covered?: boolean | null;
          num_floors?: number | null;
          owner?: string;
          provenance_json?: Json | null;
          sqft?: number;
          units_residential?: number | null;
          uses_json?: Json | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          at: string;
          id: number;
          kind: string;
          owner: string;
          payload: string;
          task_id: number | null;
        };
        Insert: {
          at?: string;
          id?: never;
          kind: string;
          owner: string;
          payload?: string;
          task_id?: number | null;
        };
        Update: {
          at?: string;
          id?: never;
          kind?: string;
          owner?: string;
          payload?: string;
          task_id?: number | null;
        };
        Relationships: [];
      };
      evidence: {
        Row: {
          building_id: number;
          document_date: string | null;
          expiration_date: string | null;
          file_name: string;
          file_type: string;
          filing_reference_number: string;
          id: number;
          issuer: string;
          law_id: string;
          notes: string;
          obligation_id: number;
          owner: string;
          storage_path: string;
          uploaded_at: string;
          uploaded_by: string;
          vendor_id: number | null;
          verification_status: string;
        };
        Insert: {
          building_id: number;
          document_date?: string | null;
          expiration_date?: string | null;
          file_name: string;
          file_type?: string;
          filing_reference_number?: string;
          id?: never;
          issuer?: string;
          law_id: string;
          notes?: string;
          obligation_id: number;
          owner: string;
          storage_path?: string;
          uploaded_at?: string;
          uploaded_by?: string;
          vendor_id?: number | null;
          verification_status?: string;
        };
        Update: {
          building_id?: number;
          document_date?: string | null;
          expiration_date?: string | null;
          file_name?: string;
          file_type?: string;
          filing_reference_number?: string;
          id?: never;
          issuer?: string;
          law_id?: string;
          notes?: string;
          obligation_id?: number;
          owner?: string;
          storage_path?: string;
          uploaded_at?: string;
          uploaded_by?: string;
          vendor_id?: number | null;
          verification_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_obligation_id_fkey";
            columns: ["obligation_id"];
            isOneToOne: false;
            referencedRelation: "obligations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      building_documents: {
        Row: {
          building_id: number;
          doc_type: string;
          document_date: string | null;
          file_name: string;
          id: number;
          note: string;
          owner: string;
          reference_number: string;
          storage_path: string;
          uploaded_at: string;
        };
        Insert: {
          building_id: number;
          doc_type?: string;
          document_date?: string | null;
          file_name: string;
          id?: never;
          note?: string;
          owner: string;
          reference_number?: string;
          storage_path: string;
          uploaded_at?: string;
        };
        Update: {
          building_id?: number;
          doc_type?: string;
          document_date?: string | null;
          file_name?: string;
          id?: never;
          note?: string;
          owner?: string;
          reference_number?: string;
          storage_path?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "building_documents_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      obligations: {
        Row: {
          building_id: number;
          completed_at: string | null;
          created_at: string;
          due_date: string | null;
          filing_reference_number: string;
          id: number;
          law_id: string;
          notes: string;
          owner: string;
          responsible_party: string;
          status: string;
          title: string;
          updated_at: string;
          vendor_id: number | null;
        };
        Insert: {
          building_id: number;
          completed_at?: string | null;
          created_at?: string;
          due_date?: string | null;
          filing_reference_number?: string;
          id?: never;
          law_id: string;
          notes?: string;
          owner: string;
          responsible_party?: string;
          status?: string;
          title: string;
          updated_at?: string;
          vendor_id?: number | null;
        };
        Update: {
          building_id?: number;
          completed_at?: string | null;
          created_at?: string;
          due_date?: string | null;
          filing_reference_number?: string;
          id?: never;
          law_id?: string;
          notes?: string;
          owner?: string;
          responsible_party?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          vendor_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "obligations_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "obligations_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          owner: string;
          primary_address: string | null;
          review_mode: string;
        };
        Insert: {
          owner: string;
          primary_address?: string | null;
          review_mode?: string;
        };
        Update: {
          owner?: string;
          primary_address?: string | null;
          review_mode?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          agent_name: string;
          body: string;
          id: number;
          owner: string;
          payload_json: Json | null;
          submitted_at: string;
          task_id: number;
        };
        Insert: {
          agent_name?: string;
          body: string;
          id?: never;
          owner: string;
          payload_json?: Json | null;
          submitted_at?: string;
          task_id: number;
        };
        Update: {
          agent_name?: string;
          body?: string;
          id?: never;
          owner?: string;
          payload_json?: Json | null;
          submitted_at?: string;
          task_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          building_id: number | null;
          category: string;
          created_at: string;
          deadline: string;
          fine_estimate_usd: number | null;
          id: number;
          intake_address: string | null;
          kind: string;
          law_id: string;
          owner: string;
          sla_breached: boolean;
          status: string;
          title: string;
          trigger_run_id: string | null;
        };
        Insert: {
          building_id?: number | null;
          category?: string;
          created_at?: string;
          deadline: string;
          fine_estimate_usd?: number | null;
          id?: never;
          intake_address?: string | null;
          kind: string;
          law_id: string;
          owner: string;
          sla_breached?: boolean;
          status?: string;
          title: string;
          trigger_run_id?: string | null;
        };
        Update: {
          building_id?: number | null;
          category?: string;
          created_at?: string;
          deadline?: string;
          fine_estimate_usd?: number | null;
          id?: never;
          intake_address?: string | null;
          kind?: string;
          law_id?: string;
          owner?: string;
          sla_breached?: boolean;
          status?: string;
          title?: string;
          trigger_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      vendors: {
        Row: {
          company: string;
          created_at: string;
          email: string;
          id: number;
          license_number: string;
          license_type: string;
          name: string;
          notes: string;
          owner: string;
          phone: string;
          role_type: string;
        };
        Insert: {
          company?: string;
          created_at?: string;
          email?: string;
          id?: never;
          license_number?: string;
          license_type?: string;
          name: string;
          notes?: string;
          owner: string;
          phone?: string;
          role_type: string;
        };
        Update: {
          company?: string;
          created_at?: string;
          email?: string;
          id?: never;
          license_number?: string;
          license_type?: string;
          name?: string;
          notes?: string;
          owner?: string;
          phone?: string;
          role_type?: string;
        };
        Relationships: [];
      };
      category_preferences: {
        Row: {
          category: string;
          enabled: boolean;
          id: number;
          owner: string;
        };
        Insert: {
          category: string;
          enabled?: boolean;
          id?: never;
          owner: string;
        };
        Update: {
          category?: string;
          enabled?: boolean;
          id?: never;
          owner?: string;
        };
        Relationships: [];
      };
      user_records: {
        Row: {
          building_id: number;
          file_name: string;
          file_type: string;
          id: number;
          notes: string;
          owner: string;
          record_type: string;
          storage_path: string;
          system_key: string | null;
          uploaded_at: string;
          uploaded_by: string;
        };
        Insert: {
          building_id: number;
          file_name: string;
          file_type?: string;
          id?: never;
          notes?: string;
          owner: string;
          record_type: string;
          storage_path: string;
          system_key?: string | null;
          uploaded_at?: string;
          uploaded_by?: string;
        };
        Update: {
          building_id?: number;
          file_name?: string;
          file_type?: string;
          id?: never;
          notes?: string;
          owner?: string;
          record_type?: string;
          storage_path?: string;
          system_key?: string | null;
          uploaded_at?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_records_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      building_overrides: {
        Row: {
          building_id: number;
          data: Json;
          owner: string;
          updated_at: string;
        };
        Insert: {
          building_id: number;
          data?: Json;
          owner: string;
          updated_at?: string;
        };
        Update: {
          building_id?: number;
          data?: Json;
          owner?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "building_overrides_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: true;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      system_deadlines: {
        Row: {
          act_by_date: string;
          basis: string;
          building_id: number;
          created_at: string;
          due_date: string;
          id: number;
          kind: string;
          owner: string;
          source_dataset: string;
          source_record_id: string;
          status: string;
          system_key: string;
          title: string;
        };
        Insert: {
          act_by_date: string;
          basis?: string;
          building_id: number;
          created_at?: string;
          due_date: string;
          id?: never;
          kind: string;
          owner: string;
          source_dataset?: string;
          source_record_id?: string;
          status?: string;
          system_key: string;
          title: string;
        };
        Update: {
          act_by_date?: string;
          basis?: string;
          building_id?: number;
          created_at?: string;
          due_date?: string;
          id?: never;
          kind?: string;
          owner?: string;
          source_dataset?: string;
          source_record_id?: string;
          status?: string;
          system_key?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "system_deadlines_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ingest_building: {
        Args: {
          p_building: Json;
          p_ll97_fine?: number;
          p_owner: string;
          p_tasks: Json;
        };
        Returns: number;
      };
      log_event: {
        Args: {
          p_kind: string;
          p_owner: string;
          p_payload: string;
          p_task_id?: number;
        };
        Returns: undefined;
      };
      requesting_owner: { Args: never; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
