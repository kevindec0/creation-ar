import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { csrf, makeApp, setupAdmin } from "./helpers.js";

// Con un token de Blob la app entra en modo "subida directa" (como en Vercel).
// La generación del permiso de subida se calcula localmente, sin conectarse a Vercel.
let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  ctx = await makeApp({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_teststore123_secretsecretsecret" });
});
afterAll(async () => {
  await ctx.close();
});

describe("subida directa a Vercel Blob", () => {
  it("autoriza subidas solo en la carpeta del usuario y con tipos permitidos", async () => {
    const agent = request.agent(ctx.app);
    await setupAdmin(agent);
    const page = await agent.get("/studio/works/new");
    expect(page.text).toContain('name="upload-mode" content="blob"');
    const userId = page.text.match(/data-user-id="(\d+)"/)![1];
    const token = await csrf(agent, "/studio");

    const ask = (pathname: string, kind: string) =>
      agent
        .post("/studio/uploads/blob")
        .set("X-CSRF-Token", token)
        .send({ type: "blob.generate-client-token", payload: { pathname, multipart: false, clientPayload: JSON.stringify({ kind }) } });

    const ok = await ask(`u${userId}/abc123.jpg`, "image");
    expect(ok.status).toBe(200);
    expect(ok.body.clientToken).toMatch(/^vercel_blob_client_/);

    expect((await ask(`u999/abc123.jpg`, "image")).status).toBe(400);
    expect((await ask(`u${userId}/abc123.jpg`, "exe")).status).toBe(400);

    // Sin token CSRF no hay permiso
    const noCsrf = await agent
      .post("/studio/uploads/blob")
      .send({ type: "blob.generate-client-token", payload: { pathname: `u${userId}/a.jpg`, multipart: false, clientPayload: '{"kind":"image"}' } });
    expect(noCsrf.status).toBe(403);

    // La subida a través del servidor está desactivada en este modo
    const viaServer = await agent.post("/studio/uploads").set("X-CSRF-Token", token).field("kind", "image");
    expect(viaServer.status).toBe(404);
  });

  it("permite los dominios de Blob en la política de seguridad", async () => {
    const res = await request(ctx.app).get("/login");
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("https://*.public.blob.vercel-storage.com");
    expect(csp).toContain("https://vercel.com");
  });
});
