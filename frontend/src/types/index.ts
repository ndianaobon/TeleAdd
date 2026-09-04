export type UUID = string;

export interface User {
  id: UUID;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  is_verified: boolean;
  created_at: string;
}

export type TelegramAccountStatus = 'connected' | 'disconnected' | 'pending' | 'restricted';

export interface TelegramAccount {
  id: UUID;
  telegram_user_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  status: TelegramAccountStatus;
  last_synced_at: string | null;
  created_at: string;
}

export type ChatType = 'group' | 'supergroup' | 'channel';

export interface TelegramChat {
  id: UUID;
  telegram_chat_id: number;
  title: string;
  username: string | null;
  chat_type: ChatType;
  member_count: number | null;
  is_admin: boolean;
  can_invite_users: boolean;
  is_favorite: boolean;
  last_synced_at: string | null;
}

export type MemberEligibility = 'eligible' | 'restricted' | 'already_member' | 'admin' | 'bot' | 'deleted';

export interface TelegramMember {
  id: UUID;
  telegram_user_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  is_bot: boolean;
  is_deleted: boolean;
  is_admin: boolean;
  is_premium: boolean;
  last_seen_bucket: 'online' | 'recently' | 'within_week' | 'within_month' | 'long_ago' | 'hidden';
  eligibility: MemberEligibility;
}

export type MigrationStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface Migration {
  id: UUID;
  name: string;
  status: MigrationStatus;
  source_chat: Pick<TelegramChat, 'id' | 'title' | 'username'>;
  destination_chat: Pick<TelegramChat, 'id' | 'title' | 'username'>;
  telegram_account: Pick<TelegramAccount, 'id' | 'username'>;
  total_selected: number;
  processed: number;
  successful: number;
  already_member: number;
  privacy_restricted: number;
  failed: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export type MigrationMemberResult =
  | 'pending'
  | 'success'
  | 'already_member'
  | 'privacy_restricted'
  | 'permission_denied'
  | 'flood_wait'
  | 'invalid_user'
  | 'failed'
  | 'skipped';

export interface MigrationMember {
  id: UUID;
  member: TelegramMember;
  result: MigrationMemberResult;
  telegram_error: string | null;
  processed_at: string | null;
}

export interface MigrationEvent {
  id: UUID;
  migration_id: UUID;
  type: 'member_result' | 'status_change' | 'flood_wait' | 'info';
  message: string;
  result?: MigrationMemberResult;
  username?: string | null;
  created_at: string;
}
