import { describe, it, expect, afterEach, vi } from 'vitest'
import { trashEmails, untrashEmails } from './gmail'

interface Captured {
  url: string
  method?: string
  body: { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }
}

/** Install a fetch stub that records every batchModify call and returns 204. */
function stubFetch(): Captured[] {
  const calls: Captured[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method,
        body: JSON.parse(init.body as string),
      })
      return new Response(null, { status: 204 })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('trashEmails', () => {
  it('does nothing for an empty id list', async () => {
    const calls = stubFetch()
    await trashEmails('tok', [])
    expect(calls).toHaveLength(0)
  })

  it('moves to Trash: adds TRASH, removes INBOX', async () => {
    const calls = stubFetch()
    await trashEmails('tok', ['a', 'b'])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/messages/batchModify')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body.ids).toEqual(['a', 'b'])
    expect(calls[0].body.addLabelIds).toEqual(['TRASH'])
    expect(calls[0].body.removeLabelIds).toEqual(['INBOX'])
  })

  it('chunks ids in batches of 1000', async () => {
    const calls = stubFetch()
    const ids = Array.from({ length: 2300 }, (_, i) => `id-${i}`)
    await trashEmails('tok', ids)
    expect(calls).toHaveLength(3)
    expect(calls[0].body.ids).toHaveLength(1000)
    expect(calls[1].body.ids).toHaveLength(1000)
    expect(calls[2].body.ids).toHaveLength(300)
  })
})

describe('untrashEmails', () => {
  it('does nothing for an empty id list', async () => {
    const calls = stubFetch()
    await untrashEmails('tok', [], [])
    expect(calls).toHaveLength(0)
  })

  it('removes TRASH from all, re-adds INBOX only to the inbox subset', async () => {
    const calls = stubFetch()
    // 'a' was an inbox email, 'b' was archived-starred (no INBOX).
    await untrashEmails('tok', ['a', 'b'], ['a'])
    // One call to remove TRASH from both, one to re-add INBOX to 'a'.
    expect(calls).toHaveLength(2)

    const removeCall = calls[0]
    expect(removeCall.body.ids).toEqual(['a', 'b'])
    expect(removeCall.body.removeLabelIds).toEqual(['TRASH'])
    expect(removeCall.body.addLabelIds).toBeUndefined()

    const addInboxCall = calls[1]
    expect(addInboxCall.body.ids).toEqual(['a'])
    expect(addInboxCall.body.addLabelIds).toEqual(['INBOX'])
  })

  it('skips the INBOX call entirely when no ids had INBOX', async () => {
    const calls = stubFetch()
    await untrashEmails('tok', ['x', 'y'], [])
    expect(calls).toHaveLength(1)
    expect(calls[0].body.removeLabelIds).toEqual(['TRASH'])
  })
})
