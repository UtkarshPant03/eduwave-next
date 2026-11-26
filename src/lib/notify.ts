/**
 * Notifications: always stored in-app (free, no setup). Optionally also emailed
 * when SMTP is configured (any SMTP account works, e.g. a Gmail App Password).
 *
 * Emails are sent with after(), i.e. once the response has been sent, so a slow or
 * failing mail server never delays or breaks the teacher's action.
 */
import "server-only";
import { after } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db, schema } from "@/db";

type Message = { title: string; body?: string; link?: string };

let transport: nodemailer.Transporter | null | undefined;
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

/** Notifies every student in a class. */
export async function notifyClass(classId: string, msg: Message) {
  const students = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(and(eq(schema.users.classId, classId), eq(schema.users.role, "student")));
  if (students.length === 0) return;

  await db.insert(schema.notifications).values(students.map((s) => ({ userId: s.id, ...msg })));

  const mailer = getTransport();
  const recipients = students.map((s) => s.email).filter((e): e is string => Boolean(e));
  if (mailer && recipients.length > 0) {
    after(async () => {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      try {
        await mailer.sendMail({
          from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
          // BCC so students don't see each other's addresses.
          bcc: recipients,
          subject: `[eduWave] ${msg.title}`,
          // Plain text only: no HTML means no injection of teacher-entered text into markup.
          text: [msg.title, msg.body, msg.link ? `${appUrl}${msg.link}` : ""].filter(Boolean).join("\n\n"),
        });
      } catch (err) {
        console.error("email notification failed", err);
      }
    });
  }
}

/** Students who have an email on file (for the "emails enabled" hint). */
export async function classEmailCount(classId: string) {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.classId, classId), isNotNull(schema.users.email)));
  return rows.length;
}
