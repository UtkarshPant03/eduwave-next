/**
 * Live classes run on Jitsi Meet (free, open-source), opened in a new tab.
 * Embedding meet.jit.si in an iframe is time-limited for third-party sites, so we link
 * out instead; a university can self-host Jitsi and set JITSI_DOMAIN for full control.
 */
export const JOIN_EARLY_MS = 15 * 60_000;

/** Join link, or null outside the window (15 min before start → end). */
export function jitsiLink(s: { room: string; startsAt: Date; durationMinutes: number }, displayName: string, now: number) {
  const start = s.startsAt.getTime();
  if (now < start - JOIN_EARLY_MS || now > start + s.durationMinutes * 60_000) return null;
  const domain = process.env.JITSI_DOMAIN ?? "meet.jit.si";
  // Display name goes in the URL fragment, which browsers never send to any server.
  return `https://${domain}/${s.room}#userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}`;
}
