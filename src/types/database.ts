export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "assets": {
                  Row: {
                    "created_at": string,"id": string,"mime_type": string,"size_bytes": number,"status": string,"storage_path": string,"thumbnail_path": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"mime_type": string,"size_bytes": number,"status"?: string,"storage_path": string,"thumbnail_path"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"mime_type"?: string,"size_bytes"?: number,"status"?: string,"storage_path"?: string,"thumbnail_path"?: string | null
                  }
                  Relationships: [

                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [

                  ]
                },"characters": {
                  Row: {
                    "avatar_asset_id": string | null,"bio": string,"created_at": string,"id": string,"name": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_asset_id"?: string | null,"bio"?: string,"created_at"?: string,"id"?: string,"name": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_asset_id"?: string | null,"bio"?: string,"created_at"?: string,"id"?: string,"name"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "characters_avatar_asset_id_fkey"
      columns: ["avatar_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_avatar_asset_id": string | null,"author_character_id": string,"author_name_snapshot": string,"body": string,"created_at": string,"id": string,"parent_id": string | null,"post_id": string,"status": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "author_avatar_asset_id"?: string | null,"author_character_id": string,"author_name_snapshot": string,"body": string,"created_at"?: string,"id"?: string,"parent_id"?: string | null,"post_id": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "author_avatar_asset_id"?: string | null,"author_character_id"?: string,"author_name_snapshot"?: string,"body"?: string,"created_at"?: string,"id"?: string,"parent_id"?: string | null,"post_id"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_avatar_asset_id_fkey"
      columns: ["author_avatar_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_author_character_id_fkey"
      columns: ["author_character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_parent_id_post_id_fkey"
      columns: ["parent_id","post_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id","post_id"]
    },{
      foreignKeyName: "comments_parent_id_post_id_fkey"
      columns: ["parent_id","post_id"]
isOneToOne: false
      referencedRelation: "visible_comments"
      referencedColumns: ["id","post_id"]
    },{
      foreignKeyName: "comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "feed_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"poll_options": {
                  Row: {
                    "id": string,"poll_id": string,"position": number,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"poll_id": string,"position": number,"text": string
                  }
                  Update: {
                    "id"?: string,"poll_id"?: string,"position"?: number,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "poll_options_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "polls"
      referencedColumns: ["post_id"]
    }
                  ]
                },"polls": {
                  Row: {
                    "anonymous": boolean,"closed_at": string | null,"closes_at": string | null,"created_at": string,"multiple": boolean,"post_id": string,"question": string,"results_policy": string,"revote_allowed": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymous"?: boolean,"closed_at"?: string | null,"closes_at"?: string | null,"created_at"?: string,"multiple"?: boolean,"post_id": string,"question": string,"results_policy"?: string,"revote_allowed"?: boolean
                  }
                  Update: {
                    "anonymous"?: boolean,"closed_at"?: string | null,"closes_at"?: string | null,"created_at"?: string,"multiple"?: boolean,"post_id"?: string,"question"?: string,"results_policy"?: string,"revote_allowed"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "polls_post_id_fkey"
      columns: ["post_id"]
isOneToOne: true
      referencedRelation: "feed_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "polls_post_id_fkey"
      columns: ["post_id"]
isOneToOne: true
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_images": {
                  Row: {
                    "asset_id": string,"position": number,"post_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id": string,"position": number,"post_id": string
                  }
                  Update: {
                    "asset_id"?: string,"position"?: number,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_images_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_images_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "feed_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_images_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "author_avatar_asset_id": string | null,"author_character_id": string,"author_name_snapshot": string,"body_json": NonNullable<Json>,"body_text": string,"category_id": string,"created_at": string,"id": string,"notice": boolean,"pin_order": number,"pin_scope": string,"status": string,"title": string,"type": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "author_avatar_asset_id"?: string | null,"author_character_id": string,"author_name_snapshot": string,"body_json"?: NonNullable<Json>,"body_text"?: string,"category_id": string,"created_at"?: string,"id"?: string,"notice"?: boolean,"pin_order"?: number,"pin_scope"?: string,"status"?: string,"title": string,"type": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "author_avatar_asset_id"?: string | null,"author_character_id"?: string,"author_name_snapshot"?: string,"body_json"?: NonNullable<Json>,"body_text"?: string,"category_id"?: string,"created_at"?: string,"id"?: string,"notice"?: boolean,"pin_order"?: number,"pin_scope"?: string,"status"?: string,"title"?: string,"type"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_author_avatar_asset_id_fkey"
      columns: ["author_avatar_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_author_character_id_fkey"
      columns: ["author_character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "feed_posts": {
                  Row: {
                    "author_avatar_asset_id": string | null,"author_character_id": string | null,"author_name_snapshot": string | null,"body_json": Json | null,"body_text": string | null,"category_id": string | null,"created_at": string | null,"id": string | null,"notice": boolean | null,"pin_order": number | null,"pin_scope": string | null,"title": string | null,"type": string | null,"updated_at": string | null,"version": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "author_avatar_asset_id"?: string | null,"author_character_id"?: string | null,"author_name_snapshot"?: string | null,"body_json"?: Json | null,"body_text"?: string | null,"category_id"?: string | null,"created_at"?: string | null,"id"?: string | null,"notice"?: boolean | null,"pin_order"?: number | null,"pin_scope"?: string | null,"title"?: string | null,"type"?: string | null,"updated_at"?: string | null,"version"?: number | null
                         }
                        Update: {
                           "author_avatar_asset_id"?: string | null,"author_character_id"?: string | null,"author_name_snapshot"?: string | null,"body_json"?: Json | null,"body_text"?: string | null,"category_id"?: string | null,"created_at"?: string | null,"id"?: string | null,"notice"?: boolean | null,"pin_order"?: number | null,"pin_scope"?: string | null,"title"?: string | null,"type"?: string | null,"updated_at"?: string | null,"version"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "posts_author_avatar_asset_id_fkey"
      columns: ["author_avatar_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_author_character_id_fkey"
      columns: ["author_character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"visible_comments": {
                  Row: {
                    "author_avatar_asset_id": string | null,"author_character_id": string | null,"author_name_snapshot": string | null,"body": string | null,"created_at": string | null,"id": string | null,"parent_id": string | null,"post_id": string | null,"updated_at": string | null,"version": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "author_avatar_asset_id"?: string | null,"author_character_id"?: string | null,"author_name_snapshot"?: string | null,"body"?: string | null,"created_at"?: string | null,"id"?: string | null,"parent_id"?: string | null,"post_id"?: string | null,"updated_at"?: string | null,"version"?: number | null
                         }
                        Update: {
                           "author_avatar_asset_id"?: string | null,"author_character_id"?: string | null,"author_name_snapshot"?: string | null,"body"?: string | null,"created_at"?: string | null,"id"?: string | null,"parent_id"?: string | null,"post_id"?: string | null,"updated_at"?: string | null,"version"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "comments_author_avatar_asset_id_fkey"
      columns: ["author_avatar_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_author_character_id_fkey"
      columns: ["author_character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_parent_id_post_id_fkey"
      columns: ["parent_id","post_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id","post_id"]
    },{
      foreignKeyName: "comments_parent_id_post_id_fkey"
      columns: ["parent_id","post_id"]
isOneToOne: false
      referencedRelation: "visible_comments"
      referencedColumns: ["id","post_id"]
    },{
      foreignKeyName: "comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "feed_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "change_member_role":
{ Args: { "new_role": string,"reason": string,"target_user_id": string }; Returns: undefined
                           },
"change_member_status":
{ Args: { "new_status": string,"reason": string,"target_user_id": string }; Returns: undefined
                           },
"current_membership":
{ Args: Record<PropertyKey, never>; Returns: {
              "role": string,"status": string
            }[]
                           },
"get_moderation_logs":
{ Args: { "before_id"?: number,"page_size"?: number }; Returns: {
              "action": string,"actor_user_id": string,"created_at": string,"id": number,"reason": string,"target_user_id": string
            }[]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {

          }
        }
} as const
