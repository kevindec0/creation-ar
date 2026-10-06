export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "La página") => new HttpError(404, `${what} no existe o ya no está disponible.`);
export const forbidden = () => new HttpError(403, "No tienes permiso para hacer esto.");
export const badRequest = (message: string) => new HttpError(400, message);
