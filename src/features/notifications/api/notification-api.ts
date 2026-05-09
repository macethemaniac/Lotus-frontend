import { apiRequest } from "@/lib/api/http-client";

export type UserNotification = {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  severity: "info" | "success" | "warning" | "error";
  targetKind: string | null;
  targetId: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  generatedAt: string;
  items: UserNotification[];
  nextCursor: string | null;
};

export function getNotifications(token: string, input: { limit?: number; cursor?: string } = {}) {
  const params = new URLSearchParams();
  if (input.limit) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  const query = params.toString();
  return apiRequest<NotificationsResponse>(`/notifications${query ? `?${query}` : ""}`, { token });
}

export function markNotificationRead(token: string, notificationId: string) {
  return apiRequest<{ notification: UserNotification }>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "POST", token, body: {} }
  );
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<{ updatedCount: number }>("/notifications/read-all", { method: "POST", token, body: {} });
}
