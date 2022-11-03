import * as dotenv from 'dotenv'
dotenv.config()

export const environment = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  GCP_BUCKET: process.env.GCP_BUCKET ?? 'weather-display-output',
  API_KEY: process.env.API_KEY,
}
