const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  csrf_token: string;
}

export interface UserMe {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  profile_visibility: string;
  theme_mode: string;
  theme_primary: string | null;
  theme_accent: string | null;
  status_text: string | null;
  status_emoji: string | null;
  is_verified: boolean;
  is_official_verified: boolean;
  totp_enabled: boolean;
  activity_points: number;
  level: number;
  wallet_balance: number;
  locale: string;
  role: string;
  has_admin_panel: boolean;
  notify_messages?: boolean;
  notify_calls?: boolean;
  notify_channels?: boolean;
  notify_sound?: boolean;
  chat_auto_clear_hours?: number | null;
  chat_appearance?: string;
  prefer_encrypted_chats?: boolean;
  calls_audio_enabled?: boolean;
  calls_video_enabled?: boolean;
}

export interface Profile extends UserMe {
  birth_date: string | null;
  status_emoji: string | null;
  is_anonymous: boolean;
  anonymous_mask_face: boolean;
  anonymous_mask_voice: boolean;
  invisible_until?: string | null;
  invisible_fake_last_seen?: string | null;
}

export interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  status_text: string | null;
  status_emoji: string | null;
  is_verified: boolean;
  is_official_verified: boolean;
  is_admin: boolean;
  is_anonymous: boolean;
  profile_visibility: string;
}

export interface Story {
  id: string;
  media_url: string | null;
  media_type: string;
  text: string | null;
  expires_at: string;
  created_at: string;
}

export interface ProfilePost {
  id: string;
  media_url: string | null;
  media_type: string;
  text: string | null;
  comments_count?: number;
  created_at: string;
}

export interface ProfilePostComment {
  id: string;
  post_id: string;
  author_id: string;
  author_username: string;
  author_display_name: string | null;
  author_avatar_url: string | null;
  is_official_verified: boolean;
  content: string;
  created_at: string;
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  username?: string | null;
  applicant_type: string;
  first_name: string | null;
  last_name: string | null;
  patronymic: string | null;
  birth_date: string | null;
  legal_entity_name: string | null;
  legal_inn: string | null;
  legal_ogrn: string | null;
  legal_address: string | null;
  reason: string;
  link_vk_group: string | null;
  link_vk_page: string | null;
  link_instagram: string | null;
  link_telegram: string | null;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

export interface BlockedUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  blocked_at: string;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
  earned_at: string | null;
}

export interface Gamification {
  activity_points: number;
  level: number;
  next_level_at: number;
  progress_percent: number;
  achievements: Achievement[];
}

export interface ChatFolder {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface DialogParticipant {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  e2e_public_key: string | null;
  last_read_at?: string | null;
  is_online?: boolean;
  last_seen_at?: string | null;
  is_official_verified?: boolean;
}

export interface DialogListItem {
  id: string;
  dialog_type: string;
  is_secret: boolean;
  is_group: boolean;
  title: string | null;
  member_count: number | null;
  folder_id: string | null;
  unread_count: number;
  pinned_message_id: string | null;
  auto_delete_seconds: number | null;
  last_message_at: string | null;
  other_user: DialogParticipant | null;
  last_message_preview: string | null;
}

export interface ChannelInfo {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  visibility: string;
  is_verified: boolean;
  subscriber_count: number;
  subscription_price: number;
  is_member: boolean;
  is_owner?: boolean;
  my_role?: string | null;
  can_post?: boolean;
  can_manage_members?: boolean;
  created_at: string;
}

export interface ChannelMember {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  is_official_verified: boolean;
  joined_at: string;
}

export interface ChannelVerificationRequest {
  id: string;
  channel_id: string;
  channel_slug?: string | null;
  channel_title?: string | null;
  requested_by_id: string;
  reason: string;
  link_website: string | null;
  link_social: string | null;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ChannelPost {
  id: string;
  channel_id: string;
  author_id: string;
  author_username: string;
  post_type: string;
  content: string | null;
  content_locked: boolean;
  price: number;
  media_url: string | null;
  media_type: string | null;
  is_pinned: boolean;
  is_announcement: boolean;
  views_count: number;
  poll_options: { id: string; text: string; votes_count: number; is_correct?: boolean }[];
  my_vote_option_id?: string | null;
  event: { starts_at: string; ends_at: string | null; location: string | null } | null;
  reactions: { emoji: string; user_id: string }[];
  comments_count: number;
  created_at: string;
}

export interface GroupInfo {
  id: string;
  title: string | null;
  description: string | null;
  avatar_url: string | null;
  owner_id: string | null;
  member_count: number;
  member_limit: number;
  is_paid_extended: boolean;
  is_public?: boolean;
  is_member?: boolean;
  is_owner?: boolean;
  created_at: string;
}

export interface WalletPayment {
  id: string;
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface WalletTransaction {
  id: string;
  amount: number;
  balance_after: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
}

export interface WalletHistory {
  balance: number;
  payments: WalletPayment[];
  transactions: WalletTransaction[];
}

export interface TopUpResult {
  payment_id: string;
  confirmation_url: string | null;
  status: string;
  amount: number;
}

export interface AdminStats {
  users_total: number;
  users_active: number;
  users_banned: number;
  channels_total: number;
  messages_total: number;
  complaints_pending: number;
  revenue_total: number;
}

export interface AdminUserList {
  users: AdminUserItem[];
  total: number;
}

export interface AdminUserItem {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  role: string;
  is_verified: boolean;
  is_banned: boolean;
  is_active: boolean;
  wallet_balance: number;
  created_at: string;
}

export interface AdminUserDetail extends AdminUserItem {
  ip_logs: { ip_address: string; action: string; created_at: string }[];
}

export interface AdminLogItem {
  id: string;
  admin_username: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface ComplaintItem {
  id: string;
  reporter_username: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface PlatformSettings {
  project_enabled: boolean;
  registration_enabled: boolean;
  ip_lockout_enabled: boolean;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface AdminChannelItem {
  id: string;
  slug: string;
  title: string;
  owner_username: string;
  is_verified: boolean;
  subscriber_count: number;
}

export interface DialogDetail {
  id: string;
  dialog_type: string;
  is_secret: boolean;
  is_group: boolean;
  title: string | null;
  member_count: number | null;
  folder_id: string | null;
  pinned_message_id: string | null;
  auto_delete_seconds: number | null;
  participants: DialogParticipant[];
  unread_count: number;
}

export interface ChatMessage {
  id: string;
  dialog_id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string | null;
  message_type: string;
  content: string | null;
  content_e2e: string | null;
  media_url: string | null;
  media_type: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to: { id: string; sender_id: string; content_preview: string | null; message_type: string; is_deleted: boolean } | null;
  forward_from_message_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  auto_delete_at: string | null;
  reactions: { emoji: string; user_id: string; username: string }[];
  created_at: string;
}

export interface MessagesPage {
  messages: ChatMessage[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface CallParticipantInfo {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  mask_face: boolean;
  mask_voice: boolean;
  joined_at: string | null;
}

export interface CallInfo {
  id: string;
  dialog_id: string;
  room_name: string;
  call_type: string;
  status: string;
  initiator_id: string;
  is_group: boolean;
  max_participants: number;
  is_recording: boolean;
  recording_started_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  participants: CallParticipantInfo[];
}

export interface JoinCallInfo {
  token: string;
  livekit_url: string;
  room_name: string;
  call: CallInfo;
}

export interface TwoFASetup {
  secret: string;
  provisioning_uri: string;
}


function authHeaders(json = true): HeadersInit {
  const headers: HeadersInit = {};
  if (typeof window !== "undefined") {
    const lang = localStorage.getItem("vortexm_locale") || "ru";
    headers["Accept-Language"] = lang;
    const token = localStorage.getItem("access_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const csrf = localStorage.getItem("csrf_token");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function parseError(data: Record<string, unknown>, status?: number): string {
  const detail = data.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object" && "msg" in detail[0]) {
    return String((detail[0] as { msg: string }).msg);
  }
  if (typeof data.message === "string") return data.message;
  if (status === 502 || status === 503) return "Server unavailable";
  if (status && status >= 500) return "Server error — try again or contact support";
  return "Request failed";
}

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}, auth = false): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...(auth ? authHeaders() : authHeaders()), ...options.headers },
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(parseError(data as Record<string, unknown>, res.status));
    }
    return data as T;
  }

  private async requestNullable<T>(path: string, options: RequestInit = {}, auth = false): Promise<T | null> {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...(auth ? authHeaders() : authHeaders()), ...options.headers },
      credentials: "include",
    });
    if (res.status === 204) return null;
    const text = await res.text();
    if (!res.ok) {
      const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      throw new Error(parseError(data, res.status));
    }
    if (!text || text === "null") return null;
    return JSON.parse(text) as T;
  }

  private async requestRaw(path: string, options: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...authHeaders(false), ...options.headers },
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(parseError(data as Record<string, unknown>, res.status));
    }
    return res;
  }

  register(body: Record<string, unknown>) {
    return this.request<{ message: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  login(email: string, password: string, totpCode?: string, captchaToken?: string | null) {
    return this.request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, totp_code: totpCode || null, captcha_token: captchaToken || null }),
    });
  }

  verifyEmail(token: string) {
    return this.request<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  refresh(refreshToken: string) {
    return this.request<TokenResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  logout(refreshToken: string) {
    return this.request<{ message: string }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  requestPasswordReset(email: string, captchaToken?: string | null) {
    return this.request<{ message: string }>("/auth/password-reset", {
      method: "POST",
      body: JSON.stringify({ email, captcha_token: captchaToken || null }),
    });
  }

  confirmPasswordReset(token: string, newPassword: string) {
    return this.request<{ message: string }>("/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  }

  getMe() {
    return this.request<UserMe>("/auth/me", {}, true);
  }

  setup2FA() {
    return this.request<TwoFASetup>("/auth/2fa/setup", { method: "POST" }, true);
  }

  enable2FA(totpCode: string) {
    return this.request<{ message: string }>(
      "/auth/2fa/enable",
      { method: "POST", body: JSON.stringify({ totp_code: totpCode }) },
      true
    );
  }

  disable2FA(totpCode: string) {
    return this.request<{ message: string }>(
      "/auth/2fa/disable",
      { method: "POST", body: JSON.stringify({ totp_code: totpCode }) },
      true
    );
  }

  getProfile() {
    return this.request<Profile>("/users/me/profile", {}, true);
  }

  getMyVerificationRequest() {
    return this.requestNullable<VerificationRequest>("/users/me/verification", {}, true);
  }

  submitVerificationRequest(body: {
    applicant_type: string;
    first_name?: string | null;
    last_name?: string | null;
    patronymic?: string | null;
    birth_date?: string | null;
    legal_entity_name?: string | null;
    legal_inn?: string | null;
    legal_ogrn?: string | null;
    legal_address?: string | null;
    reason: string;
    link_vk_group?: string | null;
    link_vk_page?: string | null;
    link_instagram?: string | null;
    link_telegram?: string | null;
  }) {
    return this.request<VerificationRequest>(
      "/users/me/verification",
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }

  updateProfile(body: {
    display_name?: string;
    bio?: string;
    birth_date?: string | null;
    profile_visibility?: string;
    locale?: string;
    notify_messages?: boolean;
    notify_calls?: boolean;
    notify_channels?: boolean;
    notify_sound?: boolean;
    chat_auto_clear_hours?: number | null;
    chat_appearance?: string;
    prefer_encrypted_chats?: boolean;
    calls_audio_enabled?: boolean;
    calls_video_enabled?: boolean;
  }) {
    return this.request<Profile>(
      "/users/me/profile",
      { method: "PATCH", body: JSON.stringify(body) },
      true
    );
  }

  updateTheme(body: { theme_mode?: string; theme_primary?: string; theme_accent?: string }) {
    return this.request<Profile>(
      "/users/me/theme",
      { method: "PATCH", body: JSON.stringify(body) },
      true
    );
  }

  updateStatus(statusText: string | null, statusEmoji: string | null) {
    return this.request<Profile>(
      "/users/me/status",
      { method: "PATCH", body: JSON.stringify({ status_text: statusText, status_emoji: statusEmoji }) },
      true
    );
  }

  async uploadAvatar(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await this.requestRaw("/users/me/avatar", { method: "POST", body: form });
    return res.json() as Promise<Profile>;
  }

  async getQrSvg(): Promise<string> {
    const res = await this.requestRaw("/users/me/qr");
    return res.text();
  }

  getGamification() {
    return this.request<Gamification>("/users/me/gamification", {}, true);
  }

  getBlocks() {
    return this.request<BlockedUser[]>("/users/me/blocks", {}, true);
  }

  blockUser(userId: string) {
    return this.request<{ message: string }>(
      "/users/me/blocks",
      { method: "POST", body: JSON.stringify({ user_id: userId }) },
      true
    );
  }

  unblockUser(userId: string) {
    return this.request<{ message: string }>(`/users/me/blocks/${userId}`, { method: "DELETE" }, true);
  }

  getMyStories() {
    return this.request<Story[]>("/users/me/stories", {}, true);
  }

  async createStory(text: string | null, file?: File) {
    const form = new FormData();
    if (text) form.append("text", text);
    if (file) form.append("file", file);
    const res = await this.requestRaw("/users/me/stories", { method: "POST", body: form });
    return res.json() as Promise<Story>;
  }

  deleteStory(storyId: string) {
    return this.request<{ message: string }>(`/users/me/stories/${storyId}`, { method: "DELETE" }, true);
  }

  getMyPosts() {
    return this.request<ProfilePost[]>("/users/me/posts", {}, true);
  }

  async createProfilePost(text: string | null, file?: File) {
    const form = new FormData();
    form.append("text", text?.trim() || "");
    if (file) form.append("file", file);
    const res = await this.requestRaw("/users/me/posts", { method: "POST", body: form });
    return res.json() as Promise<ProfilePost>;
  }

  deleteProfilePost(postId: string) {
    return this.request<{ message: string }>(`/users/me/posts/${postId}`, { method: "DELETE" }, true);
  }

  getPublicProfile(username: string) {
    return this.request<PublicProfile>(`/users/${encodeURIComponent(username)}`, {}, true);
  }

  getUserStories(username: string) {
    return this.request<Story[]>(`/users/${encodeURIComponent(username)}/stories`, {}, true);
  }

  getUserPosts(username: string) {
    return this.request<ProfilePost[]>(`/users/${encodeURIComponent(username)}/posts`, {}, true);
  }

  getProfilePostComments(postId: string) {
    return this.request<ProfilePostComment[]>(`/users/posts/${postId}/comments`, {}, true);
  }

  addProfilePostComment(postId: string, content: string) {
    return this.request<ProfilePostComment>(
      `/users/posts/${postId}/comments`,
      { method: "POST", body: JSON.stringify({ content }) },
      true
    );
  }

  getFolders() {
    return this.request<ChatFolder[]>("/chats/folders", {}, true);
  }

  createFolder(name: string) {
    return this.request<ChatFolder>("/chats/folders", { method: "POST", body: JSON.stringify({ name }) }, true);
  }

  deleteFolder(folderId: string) {
    return this.request<{ message: string }>(`/chats/folders/${folderId}`, { method: "DELETE" }, true);
  }

  getDialogs() {
    return this.request<DialogListItem[]>("/chats/dialogs", {}, true);
  }

  createDialog(username: string, isSecret = false, autoDeleteSeconds?: number | null) {
    return this.request<DialogDetail>(
      "/chats/dialogs",
      {
        method: "POST",
        body: JSON.stringify({
          username,
          is_secret: isSecret,
          auto_delete_seconds: autoDeleteSeconds ?? undefined,
        }),
      },
      true
    );
  }

  getDialog(dialogId: string) {
    return this.request<DialogDetail>(`/chats/dialogs/${dialogId}`, {}, true);
  }

  markDialogRead(dialogId: string) {
    return this.request<{ message: string }>(`/chats/dialogs/${dialogId}/read`, { method: "POST" }, true);
  }

  hideDialog(dialogId: string) {
    return this.request<{ message: string }>(`/chats/dialogs/${dialogId}`, { method: "DELETE" }, true);
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ message: string }>(
      "/auth/change-password",
      { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) },
      true
    );
  }

  changeUsername(username: string) {
    return this.request<Profile>("/users/me/username", { method: "PATCH", body: JSON.stringify({ username }) }, true);
  }

  updateInvisibleSettings(fakeLastSeen: string | null) {
    return this.request<Profile>(
      "/users/me/invisible",
      { method: "PATCH", body: JSON.stringify({ fake_last_seen: fakeLastSeen }) },
      true
    );
  }

  transferWallet(username: string, amount: number) {
    return this.request<{ balance: number; recipient: string; amount: number }>(
      "/wallet/transfer",
      { method: "POST", body: JSON.stringify({ username, amount }) },
      true
    );
  }

  purchaseInvisible() {
    return this.request<{ balance: number; invisible_until: string; invisible_fake_last_seen: string | null }>(
      "/wallet/invisible",
      { method: "POST" },
      true
    );
  }

  getWalletPrices() {
    return this.request<{ invisible_monthly: number; group_extension: number }>("/wallet/prices", {}, true);
  }

  setE2EKey(dialogId: string, publicKey: string) {
    return this.request<{ message: string }>(
      `/chats/dialogs/${dialogId}/e2e-key`,
      { method: "POST", body: JSON.stringify({ public_key: publicKey }) },
      true
    );
  }

  pinMessage(dialogId: string, messageId: string) {
    return this.request<{ message: string }>(`/chats/dialogs/${dialogId}/pin/${messageId}`, { method: "POST" }, true);
  }

  unpinMessage(dialogId: string) {
    return this.request<{ message: string }>(`/chats/dialogs/${dialogId}/pin`, { method: "DELETE" }, true);
  }

  getMessages(dialogId: string, cursor?: string) {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return this.request<MessagesPage>(`/chats/dialogs/${dialogId}/messages${q}`, {}, true);
  }

  async sendMessage(
    dialogId: string,
    opts: {
      message_type?: string;
      content?: string;
      content_e2e?: string;
      reply_to_id?: string;
      auto_delete_seconds?: number;
      file?: File;
    }
  ) {
    const form = new FormData();
    form.append("message_type", opts.message_type || "text");
    if (opts.content) form.append("content", opts.content);
    if (opts.content_e2e) form.append("content_e2e", opts.content_e2e);
    if (opts.reply_to_id) form.append("reply_to_id", opts.reply_to_id);
    if (opts.auto_delete_seconds) form.append("auto_delete_seconds", String(opts.auto_delete_seconds));
    if (opts.file) form.append("file", opts.file);
    const res = await this.requestRaw(`/chats/dialogs/${dialogId}/messages`, { method: "POST", body: form });
    return res.json() as Promise<ChatMessage>;
  }

  editMessage(messageId: string, content?: string, contentE2e?: string) {
    return this.request<ChatMessage>(
      `/chats/messages/${messageId}`,
      { method: "PATCH", body: JSON.stringify({ content, content_e2e: contentE2e }) },
      true
    );
  }

  deleteMessage(messageId: string) {
    return this.request<{ message: string }>(`/chats/messages/${messageId}`, { method: "DELETE" }, true);
  }

  addReaction(messageId: string, emoji: string) {
    return this.request<{ message: string }>(
      `/chats/messages/${messageId}/reactions`,
      { method: "POST", body: JSON.stringify({ emoji }) },
      true
    );
  }

  removeReaction(messageId: string, emoji: string) {
    return this.request<{ message: string }>(
      `/chats/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: "DELETE" },
      true
    );
  }

  searchMessages(q: string) {
    return this.request<{ results: { message: ChatMessage; dialog_id: string; other_username: string | null }[]; total: number }>(
      `/chats/search?q=${encodeURIComponent(q)}`,
      {},
      true
    );
  }

  createCall(dialogId: string, callType: "audio" | "video", isGroup = false) {
    return this.request<CallInfo>(
      "/calls",
      { method: "POST", body: JSON.stringify({ dialog_id: dialogId, call_type: callType, is_group: isGroup }) },
      true
    );
  }

  getCall(callId: string) {
    return this.request<CallInfo>(`/calls/${callId}`, {}, true);
  }

  getActiveCall(dialogId: string) {
    return this.request<CallInfo | null>(`/calls/dialog/${dialogId}/active`, {}, true);
  }

  joinCall(callId: string) {
    return this.request<JoinCallInfo>(`/calls/${callId}/join`, { method: "POST" }, true);
  }

  declineCall(callId: string) {
    return this.request<{ message: string }>(`/calls/${callId}/decline`, { method: "POST" }, true);
  }

  leaveCall(callId: string) {
    return this.request<{ message: string }>(`/calls/${callId}/leave`, { method: "POST" }, true);
  }

  startRecording(callId: string) {
    return this.request<{ id: string; call_id: string; started_at: string }>(
      `/calls/${callId}/recording/start`,
      { method: "POST" },
      true
    );
  }

  async stopRecording(callId: string, file?: File, durationSeconds?: number) {
    const form = new FormData();
    if (durationSeconds != null) form.append("duration_seconds", String(durationSeconds));
    if (file) form.append("file", file);
    const res = await this.requestRaw(`/calls/${callId}/recording/stop`, { method: "POST", body: form });
    return res.json() as Promise<{ id: string; storage_url: string | null }>;
  }

  getChannels(q?: string) {
    const query = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.request<ChannelInfo[]>(`/channels${query}`, {}, true);
  }

  createChannel(title: string, description: string, visibility: string, subscriptionPrice = 0) {
    return this.request<ChannelInfo>(
      "/channels",
      { method: "POST", body: JSON.stringify({ title, description, visibility, subscription_price: subscriptionPrice }) },
      true
    );
  }

  getChannel(slug: string) {
    return this.request<ChannelInfo>(`/channels/${encodeURIComponent(slug)}`, {}, true);
  }

  joinChannel(slug: string) {
    return this.request<ChannelInfo>(`/channels/${encodeURIComponent(slug)}/join`, { method: "POST" }, true);
  }

  updateChannel(
    slug: string,
    data: {
      title?: string;
      description?: string | null;
      visibility?: string;
      subscription_price?: number;
    }
  ) {
    return this.request<ChannelInfo>(
      `/channels/${encodeURIComponent(slug)}`,
      { method: "PATCH", body: JSON.stringify(data) },
      true
    );
  }

  async uploadChannelAvatar(slug: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await this.requestRaw(`/channels/${encodeURIComponent(slug)}/avatar`, {
      method: "POST",
      body: form,
    });
    return res.json() as Promise<ChannelInfo>;
  }

  leaveChannel(slug: string) {
    return this.request<{ message: string }>(`/channels/${encodeURIComponent(slug)}/leave`, { method: "POST" }, true);
  }

  getChannelPosts(slug: string) {
    return this.request<ChannelPost[]>(`/channels/${encodeURIComponent(slug)}/posts`, {}, true);
  }

  async createChannelPost(slug: string, form: FormData) {
    const res = await this.requestRaw(`/channels/${encodeURIComponent(slug)}/posts`, { method: "POST", body: form });
    return res.json() as Promise<ChannelPost>;
  }

  unlockPost(postId: string) {
    return this.request<ChannelPost>(`/channels/posts/${postId}/unlock`, { method: "POST" }, true);
  }

  votePoll(postId: string, optionId: string) {
    return this.request<ChannelPost>(
      `/channels/posts/${postId}/vote`,
      { method: "POST", body: JSON.stringify({ option_id: optionId }) },
      true
    );
  }

  getChannelMembers(slug: string) {
    return this.request<ChannelMember[]>(`/channels/${encodeURIComponent(slug)}/members`, {}, true);
  }

  updateChannelMember(slug: string, userId: string, role: string) {
    return this.request<{ message: string }>(
      `/channels/${encodeURIComponent(slug)}/members`,
      { method: "PATCH", body: JSON.stringify({ user_id: userId, role }) },
      true
    );
  }

  transferChannelOwnership(slug: string, userId: string) {
    return this.request<ChannelInfo>(
      `/channels/${encodeURIComponent(slug)}/transfer-ownership`,
      { method: "POST", body: JSON.stringify({ user_id: userId }) },
      true
    );
  }

  getChannelVerification(slug: string) {
    return this.requestNullable<ChannelVerificationRequest>(
      `/channels/${encodeURIComponent(slug)}/verification`,
      {},
      true
    );
  }

  submitChannelVerification(
    slug: string,
    data: { reason: string; link_website?: string; link_social?: string }
  ) {
    return this.request<ChannelVerificationRequest>(
      `/channels/${encodeURIComponent(slug)}/verification`,
      { method: "POST", body: JSON.stringify(data) },
      true
    );
  }

  sendBroadcast(slug: string, content: string, mentionAll = false) {
    return this.request<{ sent_count: number }>(
      `/channels/${encodeURIComponent(slug)}/broadcast`,
      { method: "POST", body: JSON.stringify({ content, mention_all: mentionAll }) },
      true
    );
  }

  getGroups() {
    return this.request<GroupInfo[]>("/groups", {}, true);
  }

  discoverGroups(q?: string) {
    const query = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.request<GroupInfo[]>(`/groups/discover${query}`, {}, true);
  }

  createGroup(title: string, description: string, members: string[], isPublic = true) {
    return this.request<GroupInfo>(
      "/groups",
      { method: "POST", body: JSON.stringify({ title, description, members, is_public: isPublic }) },
      true
    );
  }

  updateGroup(
    groupId: string,
    data: { title?: string; description?: string | null; is_public?: boolean }
  ) {
    return this.request<GroupInfo>(
      `/groups/${groupId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      true
    );
  }

  joinGroup(groupId: string) {
    return this.request<GroupInfo>(`/groups/${groupId}/join`, { method: "POST" }, true);
  }

  leaveGroup(groupId: string) {
    return this.request<{ message: string }>(`/groups/${groupId}/leave`, { method: "POST" }, true);
  }

  extendGroup(groupId: string) {
    return this.request<GroupInfo>(`/groups/${groupId}/extend`, { method: "POST" }, true);
  }

  getWalletBalance() {
    return this.request<{ balance: number }>("/wallet/balance", {}, true);
  }

  getWalletHistory() {
    return this.request<WalletHistory>("/wallet/history", {}, true);
  }

  topUpWallet(amount: number) {
    return this.request<TopUpResult>(
      "/wallet/topup",
      { method: "POST", body: JSON.stringify({ amount }) },
      true
    );
  }

  confirmWalletPayment(paymentId: string) {
    return this.request<WalletPayment & { balance: number }>(
      `/wallet/payments/${paymentId}/confirm`,
      { method: "POST" },
      true
    );
  }

  getAdminStats() {
    return this.request<AdminStats>("/admin/stats", {}, true);
  }

  getAdminUsers(q?: string, page = 1) {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    return this.request<AdminUserList>(`/admin/users?${params}`, {}, true);
  }

  getAdminUser(userId: string) {
    return this.request<AdminUserDetail>(`/admin/users/${userId}`, {}, true);
  }

  banUser(userId: string) {
    return this.request<{ message: string }>(`/admin/users/${userId}/ban`, { method: "POST" }, true);
  }

  unbanUser(userId: string) {
    return this.request<{ message: string }>(`/admin/users/${userId}/unban`, { method: "POST" }, true);
  }

  deleteAdminUser(userId: string) {
    return this.request<{ message: string }>(`/admin/users/${userId}`, { method: "DELETE" }, true);
  }

  updateAdminUser(userId: string, data: { role?: string; is_verified?: boolean; wallet_balance?: number }) {
    return this.request<AdminUserDetail>(
      `/admin/users/${userId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      true
    );
  }

  getAdminLogs() {
    return this.request<AdminLogItem[]>("/admin/logs", {}, true);
  }

  getAdminComplaints(status?: string) {
    const q = status ? `?status=${status}` : "";
    return this.request<ComplaintItem[]>(`/admin/complaints${q}`, {}, true);
  }

  resolveComplaint(id: string, status: string, adminNote?: string) {
    return this.request<ComplaintItem>(
      `/admin/complaints/${id}/resolve`,
      { method: "POST", body: JSON.stringify({ status, admin_note: adminNote }) },
      true
    );
  }

  getPlatformSettings() {
    return this.request<PlatformSettings>("/admin/settings", {}, true);
  }

  updatePlatformSettings(data: Partial<PlatformSettings>) {
    return this.request<PlatformSettings>(
      "/admin/settings",
      { method: "PATCH", body: JSON.stringify(data) },
      true
    );
  }

  getAdminAnnouncements() {
    return this.request<AnnouncementItem[]>("/admin/announcements", {}, true);
  }

  createAnnouncement(title: string, content: string) {
    return this.request<AnnouncementItem>(
      "/admin/announcements",
      { method: "POST", body: JSON.stringify({ title, content, is_active: true }) },
      true
    );
  }

  deleteAnnouncement(id: string) {
    return this.request<{ message: string }>(`/admin/announcements/${id}`, { method: "DELETE" }, true);
  }

  getAdminChannels(q?: string) {
    const query = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.request<AdminChannelItem[]>(`/admin/channels${query}`, {}, true);
  }

  verifyAdminChannel(slug: string, verified: boolean) {
    return this.request<{ message: string }>(
      `/admin/channels/${encodeURIComponent(slug)}/verify?verified=${verified}`,
      { method: "POST" },
      true
    );
  }

  createAnonymousUser(username: string, displayName: string, maskFace = true, maskVoice = true) {
    return this.request<Profile>(
      "/admin/anonymous-users",
      {
        method: "POST",
        body: JSON.stringify({
          username,
          display_name: displayName,
          mask_face: maskFace,
          mask_voice: maskVoice,
        }),
      },
      true
    );
  }

  submitComplaint(targetType: string, targetId: string, reason: string) {
    return this.request<ComplaintItem>(
      "/complaints",
      { method: "POST", body: JSON.stringify({ target_type: targetType, target_id: targetId, reason }) },
      true
    );
  }

  getActiveAnnouncements() {
    return this.request<AnnouncementItem[]>("/announcements/active");
  }

  getPublicPage(slug: string) {
    return this.request<{ slug: string; title: string; content_html: string }>(
      `/pages/${encodeURIComponent(slug)}`
    );
  }
}

export const api = new ApiClient();

export function saveTokens(tokens: TokenResponse) {
  localStorage.setItem("access_token", tokens.access_token);
  localStorage.setItem("refresh_token", tokens.refresh_token);
  localStorage.setItem("csrf_token", tokens.csrf_token);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("csrf_token");
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}
