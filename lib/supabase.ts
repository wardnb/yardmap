import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      properties: {
        Row: {
          id: string;
          name: string;
          address: string;
          boundary_geojson: object | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["properties"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
      };
      zones: {
        Row: {
          id: string;
          property_id: string;
          name: string;
          type: string;
          color: string;
          geojson: object | null;
          notes: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["zones"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["zones"]["Insert"]>;
      };
      plants: {
        Row: {
          id: string;
          zone_id: string | null;
          name: string;
          species: string | null;
          common_name: string | null;
          date_planted: string | null;
          source: string | null;
          cost: number | null;
          location_geojson: object | null;
          status: "healthy" | "needs_attention" | "dead";
          notes: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["plants"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["plants"]["Insert"]>;
      };
      health_logs: {
        Row: {
          id: string;
          plant_id: string;
          date: string;
          status: string;
          notes: string | null;
          photo_url: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["health_logs"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["health_logs"]["Insert"]>;
      };
      tasks: {
        Row: {
          id: string;
          property_id: string | null;
          zone_id: string | null;
          plant_id: string | null;
          title: string;
          due_date: string;
          category: string;
          recurrence: string | null;
          completed: boolean;
          completed_at: string | null;
          notes: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["tasks"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
      };
      inventory: {
        Row: {
          id: string;
          property_id: string | null;
          name: string;
          category: string;
          quantity: number;
          unit: string;
          expiry_date: string | null;
          cost: number | null;
          notes: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["inventory"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["inventory"]["Insert"]>;
      };
    };
  };
};
