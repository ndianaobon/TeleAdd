// Phase 1 UI prototype data. Replaced by live API calls as backend phases land.
// None of this is used for real migration results — the backend records only Telegram's actual responses.
import type { TelegramAccount, TelegramChat, TelegramMember, Migration, MigrationEvent } from '../types';

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

export const mockAccounts: TelegramAccount[] = [
  {
    id: 'acc-1',
    telegram_user_id: 123456789,
    username: 'alex_migrator',
    first_name: 'Alex',
    last_name: 'Rivera',
    status: 'connected',
    last_synced_at: ago(2 * 60_000),
    created_at: ago(30 * 86_400_000),
  },
];

export const mockChats: TelegramChat[] = [
  { id: 'c1', telegram_chat_id: -1001111111111, title: 'Crypto Alpha Community', username: 'cryptoalpha', chat_type: 'supergroup', member_count: 14240, is_admin: true, can_invite_users: true, is_favorite: true, last_synced_at: ago(5 * 60_000) },
  { id: 'c2', telegram_chat_id: -1001222222222, title: 'Synapse Core Devs', username: null, chat_type: 'supergroup', member_count: 870, is_admin: true, can_invite_users: true, is_favorite: false, last_synced_at: ago(10 * 60_000) },
  { id: 'c3', telegram_chat_id: -1001333333333, title: 'Growth Hacking Hub', username: 'growthhub', chat_type: 'channel', member_count: 4105, is_admin: false, can_invite_users: false, is_favorite: false, last_synced_at: ago(60 * 60_000) },
  { id: 'c4', telegram_chat_id: -1001444444444, title: 'Marketing Masters Channel', username: 'mktmasters', chat_type: 'channel', member_count: 12500, is_admin: true, can_invite_users: true, is_favorite: false, last_synced_at: ago(3 * 3_600_000) },
  { id: 'c5', telegram_chat_id: -1001555555555, title: 'DeFi Traders Group', username: 'defitraders', chat_type: 'supergroup', member_count: 24500, is_admin: true, can_invite_users: true, is_favorite: true, last_synced_at: ago(86_400_000) },
];

const firstNames = ['Vlad', 'Satoshi', 'Daniel', 'Ayo', 'Marcus', 'Mina', 'Sarah', 'Chen', 'Lucas', 'Amara', 'Tomas', 'Priya', 'Noah', 'Zara', 'Ivan'];
const lastNames = ['Dracul', 'Sol', 'K.', 'Fowler', 'Vance', 'Kosugi', 'Chen', 'Wu', 'Moreau', 'Okafor', 'Novak', 'Rao', 'Lund', 'Haddad', 'Petrov'];
const handles = ['cryptowarlock', 'solanamania', 'danithedev', 'nft_whaler', 'alpha_trader', 'luna_sol', 'dev_genius', 'privacy_lord', 'tg_migrator', 'moon_boi', 'defi_queen', 'chain_link', 'hodl_king', 'gas_saver', 'block_head'];
const buckets: TelegramMember['last_seen_bucket'][] = ['online', 'recently', 'within_week', 'within_month', 'long_ago', 'hidden'];

export const mockMembers: TelegramMember[] = Array.from({ length: 120 }, (_, i) => {
  const isBot = i % 23 === 0;
  const isDeleted = i % 37 === 0;
  const isAdmin = i % 17 === 0;
  const restricted = i % 9 === 0;
  const already = i % 13 === 0;
  let eligibility: TelegramMember['eligibility'] = 'eligible';
  if (isDeleted) eligibility = 'deleted';
  else if (isBot) eligibility = 'bot';
  else if (isAdmin) eligibility = 'admin';
  else if (already) eligibility = 'already_member';
  else if (restricted) eligibility = 'restricted';
  return {
    id: `m-${i}`,
    telegram_user_id: 100_000_000 + i * 7919,
    username: i % 5 === 4 ? null : `${handles[i % handles.length]}${i > 14 ? i : ''}`,
    first_name: isDeleted ? 'Deleted' : firstNames[i % firstNames.length],
    last_name: isDeleted ? 'Account' : lastNames[(i * 3) % lastNames.length],
    is_bot: isBot,
    is_deleted: isDeleted,
    is_admin: isAdmin,
    is_premium: i % 11 === 0,
    last_seen_bucket: buckets[i % buckets.length],
    eligibility,
  };
});

export const mockMigrations: Migration[] = [
  {
    id: 'mig-1',
    name: 'Crypto Alpha to Core Devs',
    status: 'completed',
    source_chat: { id: 'c1', title: 'Crypto Alpha Community', username: 'cryptoalpha' },
    destination_chat: { id: 'c2', title: 'Synapse Core Devs', username: null },
    telegram_account: { id: 'acc-1', username: 'alex_migrator' },
    total_selected: 1500,
    processed: 1500,
    successful: 1142,
    already_member: 0,
    privacy_restricted: 273,
    failed: 85,
    created_at: ago(2 * 86_400_000),
    started_at: ago(2 * 86_400_000),
    finished_at: ago(2 * 86_400_000 - 6_000_000),
  },
  {
    id: 'mig-2',
    name: 'Growth Hub to Marketing Masters',
    status: 'running',
    source_chat: { id: 'c3', title: 'Growth Hacking Hub', username: 'growthhub' },
    destination_chat: { id: 'c4', title: 'Marketing Masters Channel', username: 'mktmasters' },
    telegram_account: { id: 'acc-1', username: 'alex_migrator' },
    total_selected: 1200,
    processed: 601,
    successful: 512,
    already_member: 31,
    privacy_restricted: 42,
    failed: 16,
    created_at: ago(3_600_000),
    started_at: ago(3_400_000),
    finished_at: null,
  },
  {
    id: 'mig-3',
    name: 'News Feed to Announcements',
    status: 'failed',
    source_chat: { id: 'c6', title: 'Telegram News Feed', username: 'tgnews' },
    destination_chat: { id: 'c7', title: 'Broadcast Announcements', username: null },
    telegram_account: { id: 'acc-1', username: 'alex_migrator' },
    total_selected: 800,
    processed: 120,
    successful: 88,
    already_member: 4,
    privacy_restricted: 20,
    failed: 8,
    created_at: ago(3 * 86_400_000),
    started_at: ago(3 * 86_400_000),
    finished_at: ago(3 * 86_400_000 - 900_000),
  },
  {
    id: 'mig-4',
    name: 'DeFi Traders to Ape Capital',
    status: 'completed',
    source_chat: { id: 'c5', title: 'DeFi Traders Group', username: 'defitraders' },
    destination_chat: { id: 'c8', title: 'Ape Capital', username: 'apecapital' },
    telegram_account: { id: 'acc-1', username: 'alex_migrator' },
    total_selected: 3800,
    processed: 3800,
    successful: 3421,
    already_member: 112,
    privacy_restricted: 201,
    failed: 66,
    created_at: ago(6 * 86_400_000),
    started_at: ago(6 * 86_400_000),
    finished_at: ago(6 * 86_400_000 - 14_400_000),
  },
];

export const mockEvents: MigrationEvent[] = [
  { id: 'e1', migration_id: 'mig-2', type: 'member_result', result: 'success', username: 'cryptowarlock', message: 'Added successfully', created_at: ago(4_000) },
  { id: 'e2', migration_id: 'mig-2', type: 'member_result', result: 'success', username: 'solanamania', message: 'Added successfully', created_at: ago(9_000) },
  { id: 'e3', migration_id: 'mig-2', type: 'member_result', result: 'privacy_restricted', username: 'danithedev', message: 'Invitation failed: privacy settings restrict user addition', created_at: ago(14_000) },
  { id: 'e4', migration_id: 'mig-2', type: 'member_result', result: 'success', username: 'nft_whaler', message: 'Added successfully', created_at: ago(20_000) },
  { id: 'e5', migration_id: 'mig-2', type: 'member_result', result: 'already_member', username: 'alpha_trader', message: 'Already a member of the destination', created_at: ago(26_000) },
];
