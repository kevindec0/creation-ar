import { hash, verify } from "@node-rs/argon2";

// Parámetros recomendados por OWASP para Argon2id.
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, options);

export async function verifyPassword(hashed: string, password: string) {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}
