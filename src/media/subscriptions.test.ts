import { describe, expect, it } from 'vitest'
import { parseSubscriptions } from './subscriptions'

const UC_A = 'UC4R8DWoMoI7CAwX8_LjQHig'
const UC_B = 'UCX6OQ3DkcsbYNE6H8uQQuVA'

describe('parseSubscriptions', () => {
  it('parses a Google Takeout CSV, skipping the header', () => {
    const csv = [
      'Channel Id,Channel Url,Channel Title',
      `${UC_A},http://www.youtube.com/channel/${UC_A},Kaleigh Cohen Cycling`,
      `${UC_B},http://www.youtube.com/channel/${UC_B},MrBeast`,
    ].join('\n')
    expect(parseSubscriptions(csv)).toEqual([
      { id: UC_A, name: 'Kaleigh Cohen Cycling' },
      { id: UC_B, name: 'MrBeast' },
    ])
  })

  it('parses a NewPipe / Piped JSON export', () => {
    const json = JSON.stringify({
      app_version: '0.29.1',
      subscriptions: [
        { service_id: 0, url: `https://www.youtube.com/channel/${UC_A}`, name: 'Kaleigh Cohen Cycling' },
        { service_id: 0, url: `https://www.youtube.com/channel/${UC_B}`, name: 'MrBeast' },
      ],
    })
    expect(parseSubscriptions(json)).toEqual([
      { id: UC_A, name: 'Kaleigh Cohen Cycling' },
      { id: UC_B, name: 'MrBeast' },
    ])
  })

  it('parses pasted channel links and bare ids', () => {
    const text = `https://www.youtube.com/channel/${UC_A}\n${UC_B}`
    expect(parseSubscriptions(text).map((c) => c.id)).toEqual([UC_A, UC_B])
  })

  it('dedupes by channel id and keeps the named entry', () => {
    const text = `${UC_A}\n${UC_A},http://x,Kaleigh Cohen Cycling`
    expect(parseSubscriptions(text)).toEqual([{ id: UC_A, name: 'Kaleigh Cohen Cycling' }])
  })

  it('ignores lines with no channel id and empty input', () => {
    expect(parseSubscriptions('')).toEqual([])
    expect(parseSubscriptions('just some text\nhttps://example.com')).toEqual([])
  })
})
