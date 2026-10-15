import { check, sleep } from 'k6'
import http from 'k6/http'

export const options = {
  vus: 1,
  iterations: 1,
}

// Grab from browser DevTools → Network tab → any request → Cookie header
// Replace the value below with your actual cookie
const SESSION_COOKIE = '.AspNetCore.cookieScheme=CfDJ8L5bXls-isJIs5e4IW6rYjzwQ3fWMsrxLAQFBOSSKt9hskJpObf9NA79Nd_yEj06APD8bqPwJ4juL58DmxKIv_KifIBl3DIBBK0M38yeTeu2DvTTfSE8FLJKmcdcr1yyna3mIPIlVsRRmHHywiKKeDGMI2BqXE1zhliDItGICtAxYFnd970Oq0lYmJKJtisceEKPd-IVLusPhx556rqAXLqzl0i4MQsur4wGrj1PrsnUhbbowC8fU1SDZgkw5yCdmT0dKBPvG6v_H0-F26Odc4xsnGMci0W8TS9L7AlKbA_MtWHqhy9Ks60tYXkRuwPXyN15UGuh0eDPTDSoNnBo19ExrI2287yEdN4PkYvyMQmjB1L2pRae2RsCKm-OYk89gCr_3pvT7vMUlzexepFdualwgDLuT1DY_A1UB_vAxKeDoTQ33nGiGO-csWopKN-yFNYPaJ7N8FHAJB8696fsjwzpd_XKMcz3TdI1F3FqSFBtrQBDEWe4YGxiSt5ckHzlytG2_tVWsnfyN1Fy6nNnJmnx92WoMkYvYYbpPG78PXqmP-uQnY3vH_BVZC42h4iJ6zp7F4amQQ6zLOoYuv-sxtvbzGIbEI5YA0-roR7qGVSF7p--gXrixB0iA0YdXiH88agz2c7e6MQGUvQnFqmbrEL3AOPpTuQUnPagYQe10IbTgqzvDoRLUjsE0YilWtLayJU32-AcurqbHr5OA64Z_mx-aQtD4_Q_In7DsEWnG-60SdBn5MMcFAuT_j2xBKaihser6Hs8X9K09bRF8Y8BCB0IsFFSyvoHrAJXLbMUMDPHXdopcAV2yS7eqBN2QwF8ec2BLExWBKW5v9dD3TB3zxTgH4uI-a1VSXUMv4iRTG4-FpBnTIU25ZWT9jbVuyeuNbE_oL5LL68oFpPIhdZ1YFsXRdHAdfqErd0c_TRV6ob8n294A7ZLgnQZ_cQekCDZOoraGzo_bVXNvFd9ukF5PQU-31KbDSUWca6u4UWMeu-d9kEBAv_yg0r4GP-MwsjGA0AIrJfYm9oQfnJnYjSVuH1KVVE1O3A8lQBkU_vzKLdkYfcpGANtjg2lbzwPykQftLCULjD00Ixcvu71C4EN4VYihxchzAhDyMSmCmVCa2iOquf4FvHP_IBKPbhqUeXe4u8Y873xET0SChGKxOzqLbRPJv3ZD-y7ThDNkAjdNLft5znvCaU8YM53SEr9j6qFHpfuY4q0k-Goxc3_0Zzke6gxpPStlGBdBXqPRatAP2PltD0MGcDvUdcxeFq3uRH1OLH89jN8lNROFDjz8DTEyBk42Ev4eIEN8iupiZrvqLf4Yy4TWdjWDh4CkTSJwJqdekfJul9RnDaa8qggx8Q1uq_6jabTfddn47Kk3TD-e8_U4FXgL14uUwaG--NqPEYodThAzxMXxNDYUSpianbBYdxpJZW6sUdJ1yFXLM0BDZwX0AFuXFcpJiCC--Mztu2yB8tkbBlvOkurQ1VOktya0cUJcx1DXOF6e99ZTLhOM2O_MiISeivPWVn_3scU5LUoKBLAAqeTFmIy1GmRdHRlb0P1hQWIxlryODtp-MtxfwrU1lJn_GlwNgyEtx3HtAZo9ybSC3lb7LkDidqtCOcoY0dCTVf3vx-wQVBw2IUzfN2PvoLW8o2BsY4OyRnRvGpD6f9olvxyvWygxzv9-svCsudtwtJOgpMDU-ZluVS4zaIAcr3THPGoYTWZDjHbNbDzf5gWUm0raUJXyL6BAR6J43XSbzENTm46NGnT2MlfLIdQmOG0aNNMXux7rVDe85Iwe9FaeBCdTyDVazjn73boSBdIp61J3CJxfuQc32NdRdu54aQpVPaUQBG46BaOlvg8cZHQyvCXxJH71KP6_mLGefmmsJ0MeqWnGfOmMz63_oqYjEUxI4nAutQ9pgH4fEQyXtMo0piy8krgE_-ONzmzpV-hYcVlLNp56RQHqUL1BiOPMXW56_VhX7YFLhX18O8U53LwX2sFFbd2BJD8H9XouuOv-D39PTlAsMMjblhzwcShCbNn-t6lmPk8a1fqIyHMydD_YEgX1_xWqU6HDcSv0bBLsJVnWFzSRLQ-Zu8OIKJdNdqshkYUvsbdCABmrQ7hdq4gqGcLC_ODJ6BHOOp1HmQmSpj88A43moP1ZcgZBuKObnojGdsUwVL7hMGb48gI5q2Xaiq13JBzftB8RHcvJ_-D-ZARCq38GQ3f0qNE199e7jH-P5OvbmydqHqAzOAt_cZTYK1IsC0M5eQJMdfHBds8DeiT2rua4MSKVwjQ52KQfwNRtgfC2w79FNaHI8gpiG3v0iGqEFOBId8LmRZjhlgo0KL-10xrjztFFihSQqo8tBerH7xqvlV71nAzXYvCgBskvRPPDPA45IJA2gJeR9YcO5LPxSplJ76MaeuosdOM4gCxikvxEI2dcJ3czPpxKywyYyK2ns-hpdo6pKKtRrUMTJuTINzza9vX8virQMZUBFOwMsJ0hBpG0MAsQLiNTQHM-yCKGi4JVUTRWUruUsGO4O26SydRRtXKWjFpU8ZNy4xYdAukNiLeVLlWcfOixTWVuTUodr5TrQBQr8eqm_n63cUvyjgUQ_C-YBCSE2bAQ0QoEpKvt-grL-rJ8EBVOVuanKHI1eP2JdkFTmye422jTUT4WCOaRvd2Bde62Lcm-_0KQ5PB4Dod5Cw8e7GExwxxaCGWXzlOpDbav5_zrS4_W1WSYw6pMx4d5ZncnkghLmmuHsOvfvRA5d2wOiqUOf7DTrsCxOtggkNiMp4BhKURPh1x3fYlsHJNn8wrbZXlpG5DBv0mcalkTZwupfYoD-678JPLvwH4XpsgSTk4kNw'

export default function () {
  const payload = {
    publisher: 'd2974f4f-e00d-48bb-a91f-0220ba8bde22',
    verantwoordelijke: 'd2974f4f-e00d-48bb-a91f-0220ba8bde22',
    officieleTitel: `Performance Test ${Date.now()}`,
    verkorteTitel: '',
    omschrijving: '',
    publicatiestatus: 'gepubliceerd',
    informatieCategorieen: ['9aeb7501-3f77-4f36-8c8f-d21f47c2d6e8'],
    onderwerpen: ['901e91b6-9372-40cb-9330-5ae2a5545b05'],
    kenmerken: [],
    eigenaarGroep: {
      identifier: '3948145f-ac47-438e-abf9-229c157b245b',
      weergaveNaam: 'automation test test',
    },
  }

  const response = http.post(
    'https://app.gppwoo.nl/api/v2/publicaties',
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': SESSION_COOKIE,
        'is-api': 'true',
      },
    },
  )

  console.log(`Status: ${response.status}`)
  console.log(`Body: ${response.body}`)

  check(response, {
    'status is 200': r => r.status === 200,
    'has uuid': r => JSON.parse(r.body).uuid !== undefined,
  })

  sleep(1)
}
