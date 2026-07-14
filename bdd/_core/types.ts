import process from 'node:process'
import { z } from 'zod'
import 'dotenv/config'

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  otpSecret: z.string().min(1),
})
export type User = z.infer<typeof userSchema>

const envSchema = z.object({
  apps: z.object({
    gppApp: z.string().url(),
    publicatiebank: z.string().url(),
    burgerportaal: z.string().url(),
  }),
  users: z.record(z.string(), userSchema),
  /**
   * GPP-publicatiebank (ODRC) REST API — the create/read/delete backend the
   * suite uses to own `organisaties`, `publicaties` and `documenten` test data
   * portably (no container access). The API needs a token plus the audit
   * headers woo-publications enforces; see `@publicatiebank/support/odrc.ts`.
   */
  odrc: z.object({
    baseUrl: z.string().url(),
    apiKey: z.string().min(1),
  }),
})
export type Env = z.infer<typeof envSchema>
export type AppName = keyof Env['apps']

/** User signed in by the `@auth` hook when no explicit user is set. */
export const DEFAULT_USER = 'regular'

export const ENV = envSchema.parse({
  apps: {
    gppApp: process.env.GPP_APP_BASE_URL,
    publicatiebank: process.env.GPP_PUBLICATIEBANK_BASE_URL,
    burgerportaal: process.env.GPP_BURGERPORTAAL_BASE_URL,
  },
  users: {
    regular: {
      email: process.env.DEFAULT_EMAIL,
      password: process.env.DEFAULT_PASSWORD,
      otpSecret: process.env.DEFAULT_OTP_SECRET,
    },
    admin: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      otpSecret: process.env.ADMIN_OTP_SECRET,
    },
  },
  odrc: {
    // Defaults to the publicatiebank host: the ODRC API lives there under /api/v2.
    baseUrl: process.env.ODRC_BASE_URL ?? process.env.GPP_PUBLICATIEBANK_BASE_URL,
    apiKey: process.env.ODRC_API_KEY,
  },
} satisfies Env)
