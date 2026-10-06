/**
 * Punto de entrada para Vercel: exporta una app de Express.
 * La conexión a la base de datos se prepara en la primera petición y se reutiliza
 * mientras la instancia siga activa.
 */
import express, { type Express } from "express";
import { bootstrap } from "./bootstrap.js";

let ready: Promise<Express> | undefined;

function getApp() {
  ready ??= bootstrap()
    .then(({ app }) => app)
    .catch((err) => {
      ready = undefined; // la siguiente petición vuelve a intentarlo
      throw err;
    });
  return ready;
}

const app = express();
app.disable("x-powered-by");
app.use(async (req, res, next) => {
  try {
    const inner = await getApp();
    inner(req, res, next);
  } catch (err) {
    console.error("No se pudo iniciar CreationAR:", err);
    res
      .status(500)
      .type("text/plain; charset=utf-8")
      .send(`CreationAR no pudo arrancar.\n\n${err instanceof Error ? err.message : String(err)}`);
  }
});

export default app;
