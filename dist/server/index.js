import next from "next";
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
const hostname = "0.0.0.0";
const app = next({ dev: false, hostname, port, dir: process.cwd() });
const handle = app.getRequestHandler();

await app.prepare();

createServer((req, res) => {
  void handle(req, res);
}).listen(port, hostname);