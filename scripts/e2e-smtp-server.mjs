import { appendFileSync } from "node:fs";
import { createServer } from "node:net";

const output = process.env.SMTP_OUTPUT ?? "/data/messages.eml";

createServer((socket) => {
  let buffer = "";
  let message = "";
  let dataMode = false;
  let authStep = 0;
  socket.setEncoding("utf8");
  socket.write("220 star-api-e2e ESMTP\r\n");
  socket.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\r\n")) {
      const index = buffer.indexOf("\r\n");
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (dataMode) {
        if (line === ".") {
          appendFileSync(output, `${message}\n---MESSAGE-END---\n`, "utf8");
          message = "";
          dataMode = false;
          socket.write("250 2.0.0 queued\r\n");
        } else {
          message += `${line}\n`;
        }
        continue;
      }
      if (authStep === 1) { authStep = 2; socket.write("334 UGFzc3dvcmQ6\r\n"); continue; }
      if (authStep === 2) { authStep = 0; socket.write("235 2.7.0 authenticated\r\n"); continue; }
      const command = line.toUpperCase();
      if (command.startsWith("EHLO") || command.startsWith("HELO")) socket.write("250-star-api-e2e\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n");
      else if (command.startsWith("AUTH PLAIN")) socket.write("235 2.7.0 authenticated\r\n");
      else if (command === "AUTH LOGIN") { authStep = 1; socket.write("334 VXNlcm5hbWU6\r\n"); }
      else if (command.startsWith("MAIL FROM") || command.startsWith("RCPT TO") || command === "RSET") socket.write("250 2.1.0 ok\r\n");
      else if (command === "DATA") { dataMode = true; socket.write("354 End data with <CR><LF>.<CR><LF>\r\n"); }
      else if (command === "QUIT") { socket.write("221 2.0.0 bye\r\n"); socket.end(); }
      else socket.write("250 2.0.0 ok\r\n");
    }
  });
}).listen(2525, "0.0.0.0", () => console.log("SMTP e2e receiver listening on 2525"));
