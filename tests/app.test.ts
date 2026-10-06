import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIND, MP4, PNG, TEXT, createWork, csrf, makeApp, register, setupAdmin, uploadRef } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => {
  ctx = await makeApp();
});
afterEach(async () => {
  await ctx.close();
});

describe("configuración inicial y sesiones", () => {
  it("lleva al asistente cuando no hay cuentas y luego lo bloquea", async () => {
    const agent = request.agent(ctx.app);
    await agent.get("/").expect(302).expect("location", "/setup");
    await setupAdmin(agent);
    await agent.get("/studio").expect(200);
    await request(ctx.app).get("/setup").expect(302).expect("location", "/login");
  });

  it("rechaza formularios sin token CSRF", async () => {
    const agent = request.agent(ctx.app);
    await agent.get("/setup");
    const res = await agent
      .post("/setup")
      .type("form")
      .send({ name: "X", email: "x@example.com", password: "clave-segura-123", confirm: "clave-segura-123" });
    expect(res.status).toBe(403);
  });

  it("valida el login y no revela si el correo existe", async () => {
    await setupAdmin(request.agent(ctx.app));
    const agent = request.agent(ctx.app);
    let token = await csrf(agent);
    const wrong = await agent.post("/login").type("form").send({ _csrf: token, email: "ana@example.com", password: "mala" });
    expect(wrong.status).toBe(401);
    expect(wrong.text).toContain("no coinciden");
    const unknown = await agent.post("/login").type("form").send({ _csrf: token, email: "nadie@example.com", password: "mala" });
    expect(unknown.status).toBe(401);

    token = await csrf(agent);
    await agent
      .post("/login")
      .type("form")
      .send({ _csrf: token, email: "ANA@example.com", password: "clave-segura-123", next: "//evil.com" })
      .expect(302)
      .expect("location", "/studio");
  });

  it("protege el estudio para visitantes", async () => {
    await setupAdmin(request.agent(ctx.app));
    await request(ctx.app).get("/studio").expect(302).expect("location", "/login?next=%2Fstudio");
  });
});

describe("obras", () => {
  it("crea, completa y publica una obra", async () => {
    const agent = request.agent(ctx.app);
    await setupAdmin(agent);
    const id = await createWork(agent);

    const page = await agent.get(`/studio/works/${id}`).expect(200);
    expect(page.text).toContain("Girasoles");
    expect(page.text).toContain("Fácil de reconocer");
    expect(page.text).toContain("Publica la obra para obtener su enlace");

    let csrfToken = await csrf(agent, `/studio/works/${id}`);
    await agent.post(`/studio/works/${id}/publish`).type("form").send({ _csrf: csrfToken }).expect(302);
    const published = await agent.get(`/studio/works/${id}`);
    const token = published.text.match(/\/v\/([\w-]+)\/qr\.svg/)?.[1];
    expect(token).toBeTruthy();
    await request(ctx.app).get(`/v/${token}`).expect(200);

    // De vuelta a borrador: el enlace público deja de funcionar
    await agent.post(`/studio/works/${id}/unpublish`).type("form").send({ _csrf: csrfToken }).expect(302);
    await request(ctx.app).get(`/v/${token}`).expect(404);

    const video = await uploadRef(agent, csrfToken, "video", MP4, "clip.mp4");
    expect(video.status).toBe(201);
    await agent
      .post(`/studio/works/${id}/assets`)
      .set("X-CSRF-Token", csrfToken)
      .send({ role: "overlay", kind: "video", title: "", ref: video.body.ref })
      .expect(201);
    await agent
      .post(`/studio/works/${id}/assets`)
      .set("X-CSRF-Token", csrfToken)
      .send({ role: "extra", kind: "link", title: "Sitio del artista", url: "https://example.com" })
      .expect(201);
    await agent.post(`/studio/works/${id}/publish`).type("form").send({ _csrf: csrfToken }).expect(302);

    const pub = await request(ctx.app).get(`/v/${token}`).expect(200);
    expect(pub.text).toContain("Sitio del artista");
    const ar = await request(ctx.app).get(`/v/${token}/ar`).expect(200);
    expect(ar.text).toContain(`imageTargetSrc: /v/${token}/target.mind`);
    const mind = await request(ctx.app).get(`/v/${token}/target.mind`).redirects(1).expect(200);
    expect(mind.body[0]).toBe(0x82);
    expect(ar.text).toContain('id="ov-video"');

    await request(ctx.app).post(`/api/v/${token}/scan`).expect(204);
    const qr = await request(ctx.app).get(`/v/${token}/qr.svg`).expect(200);
    expect(qr.headers["content-type"]).toContain("image/svg+xml");
    expect(String(qr.body ?? qr.text)).toContain("<svg");

    const after = await agent.get(`/studio/works/${id}`);
    expect(after.text).toMatch(/<strong>2<\/strong><span>visitas a la página/);
    expect(after.text).toMatch(/<strong>1<\/strong><span>veces reconocida/);

    // Los archivos subidos se sirven desde /media
    const mediaPath = ar.text.match(/src="(\/media\/[^"]+\.mp4)"/)?.[1];
    await request(ctx.app).get(mediaPath!).expect(200);

    csrfToken = await csrf(agent, `/studio/works/${id}`);
    await agent.post(`/studio/works/${id}/delete`).type("form").send({ _csrf: csrfToken }).expect(302);
    await request(ctx.app).get(`/v/${token}`).expect(404);
    await request(ctx.app).get(mediaPath!).expect(404);
  });

  it("rechaza archivos que no son lo que dicen ser", async () => {
    const agent = request.agent(ctx.app);
    await setupAdmin(agent);
    const token = await csrf(agent, "/studio/works/new");

    const badImage = await uploadRef(agent, token, "image", TEXT, "obra.png");
    expect(badImage.status).toBe(400);
    expect(badImage.body.error).toContain("no es un imagen válido");
    const badMind = await uploadRef(agent, token, "mind", TEXT, "obra.mind");
    expect(badMind.status).toBe(400);
    const fakeVideo = await uploadRef(agent, token, "video", PNG, "falso.mp4");
    expect(fakeVideo.body.error).toContain("no es un video válido");

    // Un archivo válido como imagen no sirve como video al asociarlo
    const id = await createWork(agent);
    const image = await uploadRef(agent, token, "image", PNG, "foto.png");
    const res = await agent
      .post(`/studio/works/${id}/assets`)
      .set("X-CSRF-Token", token)
      .send({ role: "overlay", kind: "video", title: "", ref: image.body.ref });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("no es un video válido");
  });

  it("no deja usar archivos de otra cuenta", async () => {
    await setupAdmin(request.agent(ctx.app));
    const ana = request.agent(ctx.app);
    await register(ana, "Ana", "ana2@example.com");
    const anaToken = await csrf(ana, "/studio");
    const anaFile = await uploadRef(ana, anaToken, "video", MP4, "clip.mp4");

    const luis = request.agent(ctx.app);
    await register(luis, "Luis", "luis2@example.com");
    const id = await createWork(luis);
    const token = await csrf(luis, "/studio");
    const res = await luis
      .post(`/studio/works/${id}/assets`)
      .set("X-CSRF-Token", token)
      .send({ role: "overlay", kind: "video", title: "", ref: anaFile.body.ref });
    expect(res.status).toBe(400);
    const traversal = await luis
      .post(`/studio/works/${id}/assets`)
      .set("X-CSRF-Token", token)
      .send({ role: "overlay", kind: "video", title: "", ref: "../../etc/passwd" });
    expect(traversal.status).toBe(400);
  });

  it("impide editar obras ajenas", async () => {
    const admin = request.agent(ctx.app);
    await setupAdmin(admin);
    const ana = request.agent(ctx.app);
    await register(ana, "Ana Pintora", "pintora@example.com");
    const id = await createWork(ana);

    const luis = request.agent(ctx.app);
    await register(luis, "Luis", "luis@example.com");
    await luis.get(`/studio/works/${id}`).expect(403);
    const token = await csrf(luis, "/studio");
    await luis.post(`/studio/works/${id}/delete`).type("form").send({ _csrf: token }).expect(403);

    // La administración sí puede
    await admin.get(`/studio/works/${id}`).expect(200);
  });
});

describe("administración", () => {
  it("desactiva cuentas, cierra sus sesiones y oculta sus obras", async () => {
    const admin = request.agent(ctx.app);
    await setupAdmin(admin);
    const artist = request.agent(ctx.app);
    await register(artist, "Carla", "carla@example.com");
    const id = await createWork(artist);
    const t = await csrf(artist, `/studio/works/${id}`);
    await artist.post(`/studio/works/${id}/publish`).type("form").send({ _csrf: t }).expect(302);
    const page = await artist.get(`/studio/works/${id}`);
    const shareToken = page.text.match(/\/v\/([\w-]+)/)![1];
    await request(ctx.app).get(`/v/${shareToken}`).expect(200);

    const adminPage = await admin.get("/admin").expect(200);
    const userId = adminPage.text.match(/\/admin\/users\/(\d+)\/active/)![1];
    const token = await csrf(admin, "/admin");
    await admin.post(`/admin/users/${userId}/active`).type("form").send({ _csrf: token }).expect(302);

    await artist.get("/studio").expect(302);
    await request(ctx.app).get(`/v/${shareToken}`).expect(404);
  });

  it("solo la administración entra al panel", async () => {
    await setupAdmin(request.agent(ctx.app));
    const artist = request.agent(ctx.app);
    await register(artist, "Pedro", "pedro@example.com");
    await artist.get("/admin").expect(403);
  });
});

describe("registro", () => {
  it("se puede desactivar el registro público", async () => {
    const closed = await makeApp({ ALLOW_REGISTRATION: "false" });
    await setupAdmin(request.agent(closed.app));
    await request(closed.app).get("/register").expect(404);
    await closed.close();
  });
});
