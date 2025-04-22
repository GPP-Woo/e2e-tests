import type { Page } from '@playwright/test'
import type { LoginParams } from './types'
import { Secret, TOTP } from 'otpauth'
import environment from '../environment'

function createUser({
  email,
  password,
  otpSecret,
}: {
  email: string
  password: string
  otpSecret: string
}) {
  const totp = new TOTP({
    secret: Secret.fromBase32(otpSecret),
  })

  return Object.freeze({
    email,
    password,
    getOtp: () => totp.generate(),
  })
}

const users = Object.freeze({
  default: createUser({
    email: environment.DEFAULT_EMAIL,
    password: environment.DEFAULT_PASSWORD,
    otpSecret: environment.DEFAULT_OTP_SECRET,
  }),
  admin: createUser({
    email: environment.ADMIN_EMAIL,
    password: environment.ADMIN_PASSWORD,
    otpSecret: environment.ADMIN_OTP_SECRET,
  }),
})

export async function loginToAzureEntraId(
  page: Page,
  loginParams: LoginParams | undefined,
) {
  const { email, password, getOtp } = loginParams?.asAdmin
    ? users.admin
    : users.default
  await page.getByRole('textbox', { name: 'email' }).fill(email)
  await page.getByRole('button', { name: 'next' }).click()
  await page.getByRole('textbox', { name: 'password' }).fill(password)
  await page.getByRole('button', { name: 'sign in' }).click()
  const code = page.getByRole('textbox', { name: 'code' })
  const dontShow = page.getByRole('checkbox', { name: `don't show this again` })
  await code.or(dontShow).waitFor()
  if (await code.isVisible()) {
    await code.fill(getOtp())
    await page.getByRole('button', { name: 'verify' }).click()
  }
  await dontShow.check()
  await page.getByRole('button', { name: 'no' }).click()
}
