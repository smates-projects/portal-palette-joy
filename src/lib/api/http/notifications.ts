// NotificationsRepository over the real API (notifications module: notifications.controller.ts). The API already
// answers the front's AppNotification and NotificationPreference shapes.
import type { NotificationsRepository } from "../repositories";
import type { AppNotification, NotificationPreference } from "../types";
import { listAllByCursor, type HttpClient } from "./client";

/** Biggest page the API serves; the helper walks the cursor until the end. */
const PAGE_LIMIT = 100;

export function createHttpNotificationsRepository(client: HttpClient): NotificationsRepository {
  return {
    list: () => listAllByCursor<AppNotification>(client, "/notifications", { limit: PAGE_LIMIT }),

    markRead: async (id) => {
      await client.post<void>(`/notifications/${encodeURIComponent(id)}/read`);
    },

    markAllRead: async () => {
      await client.post<void>("/notifications/read-all");
    },

    getPreferences: () => client.get<NotificationPreference[]>("/notifications/preferences"),

    setPreference: (kind, channel, enabled) =>
      client.patch<NotificationPreference[]>("/notifications/preferences", {
        kind,
        channel,
        enabled,
      }),
  };
}
