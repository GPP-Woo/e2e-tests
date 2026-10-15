/**
 * Prints a fresh Keycloak TOTP code for a local test user.
 *
 *   npm run otp        # ADMIN_OTP_SECRET
 *   npm run otp:user   # DEFAULT_OTP_SECRET
 */
import process from 'node:process'
import { Secret, TOTP } from 'otpauth'
import 'dotenv/config'

const role = process.argv[2] === 'user' ? 'DEFAULT' : 'ADMIN'
const secret = process.env[`${role}_OTP_SECRET`]

if (!secret) {
  console.error(`${role}_OTP_SECRET is not set — copy .env.example to .env first.`)
  process.exit(1)
}

// Keycloak stores the realm's secretData.value as a raw string (our seeds aren't
// valid Base32), so decode as UTF-8 — same as bdd/_core/keycloak.ts.
console.log(new TOTP({ secret: Secret.fromUTF8(secret) }).generate())
