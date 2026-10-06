import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pino } from "pino";
import request from "supertest";
import { createApp } from "../src/create-app.js";
import { loadConfig } from "../src/config.js";
import { connectDb } from "../src/db/client.js";
import { createStorage } from "../src/lib/storage/index.js";

export async function makeApp(env: Record<string, string> = {}) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "car-test-"));
  const cfg = loadConfig({ NODE_ENV: "test", DATA_DIR: dataDir, ...env });
  const handle = await connectDb(cfg, { memory: true });
  const storage = createStorage(cfg);
  const app = createApp({ cfg, db: handle.db, storage, log: pino({ level: "silent" }) });
  return { app, cfg, close: handle.close, dataDir };
}

export const csrfFrom = (html: string) => {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  if (!m) throw new Error("No se encontró el token CSRF en la página");
  return m[1]!;
};

export async function csrf(agent: request.Agent, url = "/login") {
  const res = await agent.get(url);
  return csrfFrom(res.text);
}

// Archivos mínimos con la "firma" correcta de cada formato
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
export const MIND = Buffer.concat([Buffer.from([0x82, 0xa1, 0x76, 0x02]), Buffer.alloc(64, 1)]);
export const MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypisom"),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from("isomiso2"),
  Buffer.alloc(64),
]);
export const TEXT = Buffer.from("esto no es una imagen");

export async function setupAdmin(agent: request.Agent) {
  const token = await csrf(agent, "/setup");
  await agent
    .post("/setup")
    .type("form")
    .send({ _csrf: token, name: "Ana Admin", email: "ana@example.com", password: "clave-segura-123", confirm: "clave-segura-123" })
    .expect(302);
}

export async function register(agent: request.Agent, name: string, email: string) {
  const token = await csrf(agent, "/register");
  await agent
    .post("/register")
    .type("form")
    .send({ _csrf: token, name, email, password: "otra-clave-segura", confirm: "otra-clave-segura" })
    .expect(302);
}

/** Sube un archivo como lo hace el navegador en modo local y devuelve su referencia. */
export async function uploadRef(agent: request.Agent, token: string, kind: string, file: Buffer, name: string) {
  const res = await agent
    .post("/studio/uploads")
    .set("X-CSRF-Token", token)
    .set("Accept", "application/json")
    .field("kind", kind)
    .attach("file", file, name);
  return res;
}

export async function createWork(agent: request.Agent, title = "Girasoles") {
  const token = await csrf(agent, "/studio/works/new");
  const image = await uploadRef(agent, token, "image", PNG, "obra.png");
  const mind = await uploadRef(agent, token, "mind", MIND, "obra.mind");
  const res = await agent
    .post("/studio/works")
    .set("X-CSRF-Token", token)
    .set("Accept", "application/json")
    .send({
      title,
      technique: "Óleo",
      year: "2024",
      description: "Una obra de prueba",
      targetWidth: 800,
      targetHeight: 1000,
      featurePoints: 1500,
      targetImage: image.body.ref,
      targetMind: mind.body.ref,
    })
    .expect(201);
  return Number(String(res.body.redirect).split("/").pop());
}
