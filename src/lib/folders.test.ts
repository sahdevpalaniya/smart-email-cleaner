import { describe, it, expect } from 'vitest'
import type { CategoryId, Email } from '../types'
import {
  CATCH_ALL_ID,
  DRAFTS_ID,
  STARRED_ID,
  defaultFolders,
  indexByFolder,
  resolveFolderId,
  senderFolder,
} from './folders'

/** Build an Email with sensible defaults; override only what a test needs. */
function email(over: Partial<Email> & { id: string }): Email {
  return {
    threadId: over.id,
    fromName: 'Test',
    fromAddress: 'test@example.com',
    domain: 'example.com',
    subject: '',
    snippet: '',
    to: '',
    date: 0,
    labelIds: [],
    unread: false,
    bulk: false,
    category: 'other' as CategoryId,
    ...over,
  }
}

describe('resolveFolderId — routing priority', () => {
  const folders = defaultFolders()

  it('STARRED label routes to the Starred folder, beating its category', () => {
    const e = email({ id: '1', labelIds: ['STARRED'], category: 'finance' })
    expect(resolveFolderId(e, folders)).toBe(STARRED_ID)
  })

  it('DRAFT label routes to the Drafts folder', () => {
    const e = email({ id: '2', labelIds: ['DRAFT'], category: 'personal' })
    expect(resolveFolderId(e, folders)).toBe(DRAFTS_ID)
  })

  it('a custom sender folder beats the built-in category', () => {
    const withSender = [senderFolder('example.com'), ...folders]
    const e = email({ id: '3', domain: 'example.com', category: 'promotions' })
    expect(resolveFolderId(e, withSender)).toBe('sender:example.com')
  })

  it('an email matching a built-in category routes there', () => {
    const e = email({ id: '4', category: 'finance' })
    expect(resolveFolderId(e, folders)).toBe('finance')
  })

  it('anything unmatched falls back to the catch-all', () => {
    const e = email({ id: '5', category: 'other' })
    expect(resolveFolderId(e, folders)).toBe(CATCH_ALL_ID)
  })
})

describe('indexByFolder — counts', () => {
  it('per-folder counts sum to the number of emails', () => {
    const folders = defaultFolders()
    const emails = [
      email({ id: 'a', labelIds: ['STARRED'] }),
      email({ id: 'b', labelIds: ['DRAFT'] }),
      email({ id: 'c', category: 'finance' }),
      email({ id: 'd', category: 'other' }),
      email({ id: 'e', category: 'promotions' }),
    ]
    const { map, counts } = indexByFolder(emails, folders)
    const total = Object.values(counts).reduce((n, c) => n + c, 0)
    expect(total).toBe(emails.length)
    // Every email is assigned exactly one home.
    expect(Object.keys(map)).toHaveLength(emails.length)
    expect(counts[STARRED_ID]).toBe(1)
    expect(counts[DRAFTS_ID]).toBe(1)
  })
})
