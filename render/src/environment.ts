export const environment = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  GCP_BUCKET: process.env.GCP_BUCKET ?? 'weather-display-output',
}
