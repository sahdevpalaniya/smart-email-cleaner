import { describe, it, expect } from 'vitest'
import { categorize } from './categories'

/** Minimal helper so each test only specifies the fields it cares about. */
function cat(over: Partial<Parameters<typeof categorize>[0]>) {
  return categorize({
    domain: '',
    address: '',
    subject: '',
    snippet: '',
    labelIds: [],
    bulk: false,
    ...over,
  })
}

describe('categorize — priority ladder', () => {
  it('SPAM label wins over everything', () => {
    expect(cat({ labelIds: ['SPAM'], subject: 'your invoice payment receipt' })).toBe('spam')
  })

  it('OTP keyword (non-bulk) → otp', () => {
    expect(cat({ subject: 'Your verification code is 123456' })).toBe('otp')
  })

  it('OTP keyword inside a bulk/marketing mail is NOT otp', () => {
    // "verify your" + bulk → must not be classified as a security code.
    const result = cat({ subject: 'verify your account for 20% off', bulk: true })
    expect(result).not.toBe('otp')
  })

  it('finance by domain', () => {
    expect(cat({ domain: 'paypal.com', subject: 'hello' })).toBe('finance')
  })

  it('finance by keyword', () => {
    expect(cat({ subject: 'Your invoice is attached' })).toBe('finance')
  })

  it('travel by domain and keyword', () => {
    expect(cat({ domain: 'makemytrip.com' })).toBe('travel')
    expect(cat({ subject: 'Your boarding pass is ready' })).toBe('travel')
  })

  it('shopping by domain and keyword', () => {
    expect(cat({ domain: 'amazon.in' })).toBe('shopping')
    expect(cat({ subject: 'Your order has shipped' })).toBe('shopping')
  })

  it('social by Gmail label or known domain', () => {
    expect(cat({ labelIds: ['CATEGORY_SOCIAL'] })).toBe('social')
    expect(cat({ domain: 'linkedin.com' })).toBe('social')
  })

  it('a real person on free webmail → personal', () => {
    expect(cat({ domain: 'gmail.com', address: 'jane.doe@gmail.com' })).toBe('personal')
  })

  it('a no-reply robot on free webmail is NOT personal', () => {
    const result = cat({ domain: 'gmail.com', address: 'noreply@gmail.com' })
    expect(result).not.toBe('personal')
  })

  it('a bulk message from free webmail is NOT personal', () => {
    const result = cat({ domain: 'gmail.com', address: 'news@gmail.com', bulk: true })
    expect(result).not.toBe('personal')
  })

  it('promotions by Gmail label or marketing keyword', () => {
    expect(cat({ labelIds: ['CATEGORY_PROMOTIONS'] })).toBe('promotions')
    expect(cat({ subject: 'Flash sale — 50% off everything' })).toBe('promotions')
  })

  it('updates by keyword', () => {
    expect(cat({ subject: 'Your account: a new sign-in was detected' })).toBe('updates')
  })

  it('an unplaceable bulk message falls through to promotions', () => {
    expect(cat({ domain: 'unknown-brand.example', bulk: true })).toBe('promotions')
  })

  it('a plain unknown message → other', () => {
    expect(cat({ domain: 'unknown-brand.example', subject: 'hi there' })).toBe('other')
  })
})
