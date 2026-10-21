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
                    "created_at": string,"id": string,"name": string,"sort_order": number,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"sort_order"?: number,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"version"?: number
                  }
                  Relationships: [

                  ]
                },"characters": {
                  Row: {
                    "avatar_asset_id": string | null,"bio": string,"created_at": string,"id": string,"name": string,"status": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_asset_id"?: string | null,"bio"?: string,"created_at"?: string,"id"?: string,"name": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "avatar_asset_id"?: string | null,"bio"?: string,"created_at"?: string,"id"?: string,"name"?: string,"status"?: string,"updated_at"?: string,"version"?: number
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
            "browse_posts":
{ Args: { "category_filter"?: string,"character_filter"?: string,"cursor"?: Json,"notice_only"?: boolean,"query_text"?: string,"type_filter"?: string }; Returns: Json
                           },
"change_comment":
{ Args: { "comment_body"?: string,"expected_version": number,"remove"?: boolean,"target_id": string }; Returns: undefined
                           },
"change_member_role":
{ Args: { "new_role": string,"reason": string,"target_user_id": string }; Returns: undefined
                           },
"change_member_status":
{ Args: { "new_status": string,"reason": string,"target_user_id": string }; Returns: undefined
                           },
"claim_unused_assets":
{ Args: { "apply_changes"?: boolean }; Returns: {
              "id": string,"storage_path": string,"temporary_path": string,"thumbnail_path": string
            }[]
                           },
"close_poll":
{ Args: { "target_id": string }; Returns: undefined
                           },
"create_character":
{ Args: { "avatar_id"?: string,"character_bio"?: string,"character_name": string,"request_id"?: string }; Returns: string
                           },
"create_comment":
{ Args: { "character_id": string,"comment_body": string,"parent_comment"?: string,"request_id": string,"target_post": string }; Returns: string
                           },
"create_poll_post":
{ Args: { "category_id": string,"character_id": string,"document": Json,"image_ids"?: (string)[],"post_title": string,"request_id": string,"settings": Json }; Returns: string
                           },
"create_post":
{ Args: { "category_id": string,"character_id": string,"document": Json,"image_ids"?: (string)[],"post_title": string,"request_id": string }; Returns: string
                           },
"current_membership":
{ Args: Record<PropertyKey, never>; Returns: {
              "role": string,"status": string
            }[]
                           },
"delete_category":
{ Args: { "expected_version": number,"move_to"?: string,"target_id": string }; Returns: undefined
                           },
"delete_post":
{ Args: { "expected_version": number,"target_id": string }; Returns: undefined
                           },
"export_batch":
{ Args: { "post_ids": (string)[],"with_comments"?: boolean,"with_images"?: boolean }; Returns: Json
                           },
"export_manifest":
{ Args: { "after_id"?: string,"after_time"?: string,"category_filter"?: string,"from_time"?: string,"snapshot_time"?: string,"until_time"?: string }; Returns: Json
                           },
"finalize_post_asset":
{ Args: { "accepted": boolean,"owner_id": string,"stored_bytes": number,"target_id": string }; Returns: undefined
                           },
"finalize_profile_asset":
{ Args: { "accepted": boolean,"owner_id": string,"stored_bytes": number,"target_id": string }; Returns: undefined
                           },
"finish_asset_cleanup":
{ Args: { "target_id": string }; Returns: undefined
                           },
"get_asset_paths":
{ Args: { "asset_ids": (string)[] }; Returns: {
              "id": string,"storage_path": string,"thumbnail_path": string
            }[]
                           },
"get_moderation_logs":
{ Args: { "before_id"?: number,"page_size"?: number }; Returns: {
              "action": string,"actor_user_id": string,"created_at": string,"id": number,"reason": string,"target_user_id": string
            }[]
                           },
"get_poll":
{ Args: { "target_id": string }; Returns: Json
                           },
"get_post":
{ Args: { "target_id": string }; Returns: Json
                           },
"issue_invite":
{ Args: { "use_limit"?: number,"valid_days"?: number }; Returns: {
              "code": string,"invite_id": string
            }[]
                           },
"list_activity_characters":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_admin_logs":
{ Args: { "before_id"?: number }; Returns: Json
                           },
"list_comments":
{ Args: { "after_id"?: string,"after_time"?: string,"target_post": string }; Returns: {
              "author_avatar_asset_id": string,"author_character_id": string,"author_name_snapshot": string,"body": string,"can_edit": boolean,"created_at": string,"deleted": boolean,"id": string,"parent_id": string,"updated_at": string,"version": number
            }[]
                           },
"list_hidden_content":
{ Args: { "before_id"?: string,"before_time"?: string,"kind_filter"?: string }; Returns: Json
                           },
"list_invites":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"expires_at": string,"id": string,"max_uses": number,"revoked_at": string,"used_count": number
            }[]
                           },
"list_members":
{ Args: { "before_id"?: string,"before_time"?: string }; Returns: Json
                           },
"list_my_activity":
{ Args: { "before_id"?: string,"before_time"?: string,"character_filter"?: string,"kind_filter"?: string }; Returns: Json
                           },
"list_my_characters":
{ Args: { "page_offset"?: number }; Returns: {
              "avatar_asset_id": string | null,
"bio": string,
"created_at": string,
"id": string,
"name": string,
"status": string,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "characters"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_posts":
{ Args: { "before_id"?: string,"before_time"?: string,"category_filter"?: string }; Returns: {
              "author_avatar_asset_id": string,"author_character_id": string,"author_name_snapshot": string,"category_id": string,"comment_count": number,"created_at": string,"excerpt": string,"id": string,"image_id": string,"title": string,"updated_at": string,"version": number
            }[]
                           },
"moderate_content":
{ Args: { "expected_version": number,"kind": string,"new_status": string,"reason": string,"target_id": string }; Returns: undefined
                           },
"move_post_category":
{ Args: { "category_id": string,"expected_version": number,"target_id": string }; Returns: undefined
                           },
"redeem_invite":
{ Args: { "invite_code": string }; Returns: string
                           },
"reserve_post_asset":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"reserve_profile_asset":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"save_category":
{ Args: { "category_name": string,"expected_version"?: number,"position_value": number,"target_id"?: string }; Returns: string
                           },
"set_character_status":
{ Args: { "expected_version": number,"new_status": string,"target_id": string }; Returns: undefined
                           },
"set_post_notice":
{ Args: { "expected_version": number,"is_notice": boolean,"pin_position": number,"reason": string,"scope": string,"target_id": string }; Returns: undefined
                           },
"submit_vote":
{ Args: { "character_id": string,"option_ids": (string)[],"target_id": string }; Returns: undefined
                           },
"update_character":
{ Args: { "avatar_id"?: string,"character_bio": string,"character_name": string,"expected_version": number,"target_id": string }; Returns: undefined
                           },
"update_invite":
{ Args: { "expiry": string,"revoke_code"?: boolean,"target_id": string,"use_limit": number }; Returns: undefined
                           },
"update_poll":
{ Args: { "expected_version": number,"settings": Json,"target_id": string }; Returns: undefined
                           },
"update_post":
{ Args: { "category_id": string,"document": Json,"expected_version": number,"image_ids"?: (string)[],"post_title": string,"target_id": string }; Returns: undefined
                           },
"validate_export":
{ Args: { "expected": Json,"with_comments"?: boolean,"with_images"?: boolean }; Returns: undefined
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
