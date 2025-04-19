import process from 'node:process'
import { z } from 'zod'

const schema = z.object({
  GPP_APP_BASE_URL: z.string().min(1),
  GPP_PUBLICATIEBANK_BASE_URL: z.string().min(1),
  DEFAULT_EMAIL: z.string().email(),
  DEFAULT_PASSWORD: z.string().min(1),
  DEFAULT_OTP_SECRET: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(1),
  ADMIN_OTP_SECRET: z.string().min(1),
})

export default schema.parse(process.env)
