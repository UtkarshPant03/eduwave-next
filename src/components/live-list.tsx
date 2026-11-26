import { CalendarClock, Video } from "lucide-react";
import { cancelLive } from "@/app/actions/teacher";
import { Badge, buttonClass, Empty } from "./ui";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { listLiveSessions } from "@/lib/data";

type Row = Awaited<ReturnType<typeof listLiveSessions>>[number];

/**
 * Live classes run on Jitsi Meet (free, open-source), opened in a new tab.
 * Embedding meet.jit.si in an iframe is time-limited for third-party sites, so we link
 * out instead; a school can self-host Jitsi and set JITSI_DOMAIN for full control.
 */
export function LiveList({ sessions, now, manage, displayName }: { sessions: Row[]; now: number; manage?: boolean; displayName: string }) {
  const domain = process.env.JITSI_DOMAIN ?? "meet.jit.si";
  if (sessions.length === 0) return <Empty icon={<Video />}>No live classes scheduled.</Empty>;

  return (
    <ul className="grid gap-3">
      {sessions.map((s) => {
        const start = s.startsAt.getTime();
        const isLive = start <= now;
        const joinable = start - now < 15 * 60_000; // join opens 15 minutes early
        // Display name is passed in the URL fragment (never sent to any server).
        const url = `https://${domain}/${s.room}#userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}`;
        return (
          <li key={s.id} className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${isLive ? "border-danger/40 bg-danger/5" : "border-border"}`}>
            <span className={`grid size-11 place-items-center rounded-xl ${isLive ? "bg-danger/15 text-danger" : "bg-accent/10 text-accent"}`}>
              {isLive ? <Video className="size-5" /> : <CalendarClock className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {s.title} {isLive && <Badge tone="danger">● Live now</Badge>}
              </p>
              <p className="text-sm text-muted">
                {s.className} · {formatDateTime(s.startsAt)} · {s.durationMinutes} min {!isLive && `· ${formatRelative(s.startsAt, now)}`}
              </p>
            </div>
            <div className="flex gap-2">
              {joinable ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass()}>
                  <Video className="size-4" /> {manage ? "Start" : "Join"}
                </a>
              ) : (
                <span className="text-xs text-muted">Join opens 15 min before</span>
              )}
              {manage && (
                <form action={cancelLive}>
                  <input type="hidden" name="liveId" value={s.id} />
                  <button className={buttonClass("ghost")}>Cancel</button>
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
