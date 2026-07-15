export function formatUserStatus(
  statusEmoji?: string | null,
  statusText?: string | null,
  emptyLabel = ""
): string {
  const parts: string[] = [];
  if (statusEmoji?.trim()) parts.push(statusEmoji.trim());
  if (statusText?.trim()) parts.push(statusText.trim());
  return parts.length ? parts.join(" ") : emptyLabel;
}

export function isAdminUser(user: {
  role?: string;
  has_admin_panel?: boolean;
  is_admin?: boolean;
}): boolean {
  if (user.is_admin) return true;
  if (user.has_admin_panel) return true;
  return user.role === "admin" || user.role === "superadmin";
}
