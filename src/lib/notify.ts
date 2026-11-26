/**
 * Notifications: always stored in-app (free, no setup). Optionally also emailed
 * when SMTP is configured (any SMTP account works, e.g. a Gmail App Password).
 *
 * Emails are sent with after(), i.e. once the response has been sent, so a slow or
 * failing mail server never delays or breaks the teacher's action.
 */
import "server-only";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { db, schema } from "@/db";

type Message = { title: string; body?: string; link?: string };

let transport: Transporter | null | undefined;
function getTransport() {
  if (transport !== undefined) return transport;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  transport =
    SMTP_HOST && SMTP_USER && SMTP_PASS
      ? nodemailer.createTransport({
          host: SMTP_HOST,
          port: Number(SMTP_PORT ?? 465),
          secure: Number(SMTP_PORT ?? 465) === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
        })
      : null;
  return transport;
}

export const emailEnabled = () => getTransport() !== null;

async function sendMail(recipients: string[], msg: Message) {
  const mailer = getTransport();
  if (!mailer || recipients.length === 0) return;
  after(async () => {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        // BCC so recipients don't see each other's addresses.
        bcc: recipients,
        subject: `[eduWave] ${msg.title}`,
        // Plain text only: no HTML means no injection of user-entered text into markup.
        text: [msg.title, msg.body, msg.link ? `${appUrl}${msg.link}` : ""].filter(Boolean).join("\n\n"),
      });
    } catch (err) {
      console.error("email notification failed", err);
    }
  });
}

/** Notifies every student enrolled in a course (optionally excluding one user, e.g. the author). */
export async function notifyCourse(courseId: string, msg: Message, excludeUserId?: string) {
  const members = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.enrollments)
    .innerJoin(schema.users, eq(schema.users.id, schema.enrollments.userId))
    .where(and(eq(schema.enrollments.courseId, courseId), eq(schema.users.active, true)));
  const targets = members.filter((m) => m.id !== excludeUserId);
  if (targets.length === 0) return;
  await db.insert(schema.notifications).values(targets.map((m) => ({ userId: m.id, ...msg })));
  await sendMail(targets.map((m) => m.email), msg);
}

/** Notifies one user (e.g. "your assignment was graded"). */
export async function notifyUser(userId: string, msg: Message) {
  await db.insert(schema.notifications).values({ userId, ...msg });
  const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, userId), columns: { email: true } });
  if (user) await sendMail([user.email], msg);
}
