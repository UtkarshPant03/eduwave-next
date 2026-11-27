import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getActiveUser } from "@/lib/auth/dal";
import { listNotifications, unreadCount } from "@/lib/data/shared";

/**
 * Notifications for the bell.
 * - `?summary=1` (the 30 s poll): unread count + newest id only. Two small indexed
 *   queries; the bell fetches the full list only when one of them changed.
 * - no parameter: the 15 latest notifications (when the panel opens or something changed).
 */
export async function GET(request: Request) {
  const user = await getActiveUser();
  if (!user) return Response.json({ unread: 0, items: [] }, { status: 401 });
  const headers = { "Cache-Control": "no-store" };
  if (new URL(request.url).searchParams.has("summary")) {
    const n = schema.notifications;
    const [unread, [newest]] = await Promise.all([
      unreadCount(user.id),
      db.select({ id: n.id }).from(n).where(eq(n.userId, user.id)).orderBy(desc(n.createdAt)).limit(1),
    ]);
    return Response.json({ unread, latest: newest?.id ?? null }, { headers });
  }
  const [unread, items] = await Promise.all([unreadCount(user.id), listNotifications(user.id, 15)]);
  return Response.json({ unread, items }, { headers });
}
