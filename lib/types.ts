export type UserRole = "owner" | "admin" | "viewer";
export type TreeVisibility = "public" | "private";
export type MediaVisibility = "public" | "members";
export type MediaKind = "photo" | "video" | "document";
export type MediaProvider = "supabase_storage" | "object_storage" | "yandex_disk";
export type MediaVariantName = "thumb" | "small" | "medium";
export type InviteMethod = "link" | "email";
export type MembershipStatus = "active" | "revoked";
export type ViewerAccessSource = "membership" | "share_link" | "public" | "anonymous";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface TreeRecord {
  id: string;
  owner_user_id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: TreeVisibility;
  root_person_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRecord {
  id: string;
  tree_id: string;
  user_id: string;
  role: UserRole;
  status: MembershipStatus;
  created_at: string;
}

export interface PersonRecord {
  id: string;
  tree_id: string;
  full_name: string;
  gender: string | null;
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  death_place: string | null;
  bio: string | null;
  is_living: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParentLinkRecord {
  id: string;
  tree_id: string;
  parent_person_id: string;
  child_person_id: string;
  relation_type: string;
  created_at: string;
}

export interface PartnershipRecord {
  id: string;
  tree_id: string;
  person_a_id: string;
  person_b_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface MediaAssetRecord {
  id: string;
  tree_id: string;
  kind: MediaKind;
  provider: MediaProvider;
  visibility: MediaVisibility;
  storage_path: string | null;
  external_url: string | null;
  title: string;
  caption: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
}

export interface PersonMediaRecord {
  id: string;
  person_id: string;
  media_id: string;
  is_primary: boolean;
}

export interface MediaAssetVariantRecord {
  id: string;
  media_id: string;
  variant: MediaVariantName;
  storage_path: string;
  created_at: string;
}

export interface InviteRecord {
  id: string;
  tree_id: string;
  email: string | null;
  role: UserRole;
  invite_method: InviteMethod;
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ShareLinkRecord {
  id: string;
  tree_id: string;
  label: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  tree_id: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditEntryView {
  id: string;
  created_at: string;
  summary: string;
  details: string[];
  actor_label: string;
  event_tone: "create" | "update" | "delete" | "access" | "system";
  event_label: string;
}

export interface PaginatedAuditEntryView {
  entries: AuditEntryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ViewerActor {
  userId: string | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  accessSource: ViewerAccessSource;
  shareLinkId: string | null;
  canEdit: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
  canReadAudit: boolean;
}

export interface TreeSnapshot {
  tree: TreeRecord;
  actor: ViewerActor;
  people: PersonRecord[];
  parentLinks: ParentLinkRecord[];
  partnerships: PartnershipRecord[];
  media: MediaAssetRecord[];
  personMedia: PersonMediaRecord[];
}

export interface DisplayTreeNode {
  type: "person" | "couple";
  id?: string;
  primaryId?: string;
  partnershipId?: string | null;
  spouseId?: string | null;
  name?: string;
  spouseName?: string | null;
  gender?: string | null;
  spouseGender?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  spouseBirthDate?: string | null;
  spouseDeathDate?: string | null;
  children?: DisplayTreeNode[];
}

export type Database = any;
