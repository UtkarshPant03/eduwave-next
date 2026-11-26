import { getCurrentUser } from "@/lib/auth/dal";
import { listNotifications, unreadCount } from "@/lib/data/shared";

/** Polled by the notification bell (every 30 s while the tab is visible). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ unread: 0, items: [] }, { status: 401 });
  const [unread, items] = await Promise.all([unreadCount(user.id), listNotifications(user.id, 15)]);
  return Response.json({ unread, items }, { headers: { "Cache-Control": "no-store" } });
}
