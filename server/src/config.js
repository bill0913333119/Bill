// 所有設定皆由環境變數提供，未設定的整合功能（S3、LINE）會自動停用。
const env = process.env

export const config = {
  port: Number(env.PORT ?? 3000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://defect:defect@localhost:5432/defect',
  // 對外網址，用於產生廠商回報連結與 LINE 卡片連結，例：https://defect.example.com
  // 未設定時採用 Render 自動提供的 RENDER_EXTERNAL_URL（https://<服務名稱>.onrender.com）
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, ''),
  // 設定後，工程師端 API 需帶 Authorization: Bearer <APP_TOKEN>
  appToken: env.APP_TOKEN || '',
  // 照片儲存：設定 S3_* 時用 S3／R2；STORAGE=db 存資料庫；否則存本機 UPLOAD_DIR
  storage: env.STORAGE || 'local',
  uploadDir: env.UPLOAD_DIR ?? new URL('../uploads/', import.meta.url).pathname,
  s3: env.S3_BUCKET
    ? {
        bucket: env.S3_BUCKET,
        region: env.S3_REGION ?? 'auto',
        endpoint: env.S3_ENDPOINT, // Cloudflare R2：https://<account>.r2.cloudflarestorage.com
        publicUrl: (env.S3_PUBLIC_URL ?? '').replace(/\/$/, ''),
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      }
    : null,
  line: {
    channelSecret: env.LINE_CHANNEL_SECRET ?? '',
    channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
    liffId: env.LIFF_ID ?? '',
  },
  staticDir: env.STATIC_DIR ?? new URL('../../dist/', import.meta.url).pathname,
}
