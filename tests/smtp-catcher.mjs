/**
 * A tiny fake SMTP server for tests: accepts any login, stores every message in memory
 * and never delivers anything. Lets us verify email notifications without a real mail
 * account. Speaks just enough SMTP for Nodemailer (EHLO, AUTH PLAIN/LOGIN, MAIL, RCPT, DATA).
 *
 *   const catcher = await startSmtpCatcher(2525);
 *   ... catcher.messages → [{ from, to: [...], data }]
 *   await catcher.close();
 */
import { createServer } from "node:net";

export function startSmtpCatcher(port = 2525) {
  const messages = [];
  const server = createServer((socket) => {
    let buffer = "";
    let mode = "command"; // "command" | "data" | "auth-user" | "auth-pass"
    let current = { from: "", to: [], data: "" };
    const reply = (line) => socket.write(`${line}\r\n`);

    reply("220 eduwave-test-catcher ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (true) {
        if (mode === "data") {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          current.data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          messages.push(current);
          current = { from: "", to: [], data: "" };
          mode = "command";
          reply("250 OK: message stored");
          continue;
        }
        const nl = buffer.indexOf("\r\n");
        if (nl === -1) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        if (mode === "auth-user") { mode = "auth-pass"; reply("334 UGFzc3dvcmQ6"); continue; }
        if (mode === "auth-pass") { mode = "command"; reply("235 Authentication successful"); continue; }

        const verb = line.slice(0, 4).toUpperCase();
        if (verb === "EHLO") socket.write("250-eduwave-test-catcher\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
        else if (verb === "HELO") reply("250 eduwave-test-catcher");
        else if (verb === "AUTH") {
          if (/^AUTH LOGIN/i.test(line)) { mode = "auth-user"; reply("334 VXNlcm5hbWU6"); }
          else reply("235 Authentication successful");
        } else if (verb === "MAIL") { current.from = line; reply("250 OK"); }
        else if (verb === "RCPT") { current.to.push(line); reply("250 OK"); }
        else if (verb === "DATA") { mode = "data"; reply("354 End data with <CR><LF>.<CR><LF>"); }
        else if (verb === "RSET") { current = { from: "", to: [], data: "" }; reply("250 OK"); }
        else if (verb === "QUIT") { reply("221 Bye"); socket.end(); }
        else reply("250 OK");
      }
    });
    socket.on("error", () => {});
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({ messages, close: () => new Promise((r) => server.close(() => r())) }),
    );
  });
}
