import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Config } from "../../config.js";
import { keyPattern, type Storage } from "./types.js";

/** Compatible con Cloudflare R2, Backblaze B2, MinIO o Amazon S3. */
export function s3Storage(cfg: Config): Storage {
  const client = new S3Client({
    region: cfg.S3_REGION,
    endpoint: cfg.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.S3_ACCESS_KEY_ID!, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY! },
  });
  const bucket = cfg.S3_BUCKET!;
  const publicUrl = cfg.S3_PUBLIC_URL!;
  const origin = new URL(publicUrl).origin;
  return {
    driver: "s3",
    directUpload: false,
    origins: { media: [origin], connect: [origin] },
    async put(tempPath, key, contentType) {
      const { size } = await stat(tempPath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: createReadStream(tempPath),
          ContentLength: size,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      await unlink(tempPath).catch(() => {});
      return key;
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    url: (key) => `${publicUrl}/${key}`,
    async readHead(key, bytes) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      const head = Buffer.from((await res.Body?.transformToByteArray()) ?? []);
      const total = Number(res.ContentRange?.split("/")[1]);
      return { head, size: Number.isFinite(total) ? total : null };
    },
    ownsRef: (key, userId) => keyPattern(userId).test(key),
  };
}
