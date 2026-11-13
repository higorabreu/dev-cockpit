import { describe, expect, it } from 'vitest'
import type { ViewItem } from '../ports/views.ts'
import { matchesReference, searchViewItems } from './search.ts'

type MergeRequestItem = Extract<ViewItem, { kind: 'mergeRequest' }>
type IssueItem = Extract<ViewItem, { kind: 'issue' }>

const task = (key: string, extra: Partial<IssueItem> = {}): IssueItem => ({
  kind: 'issue',
  id: key,
  key,
  summary: `Task ${key}`,
  url: `https://acme.example.com/browse/${key}`,
  project: key.split('-')[0] ?? '',
  type: 'Story',
  status: 'To Do',
  statusCategory: 'todo',
  updatedAt: '2026-11-11T10:00:00Z',
  ...extra,
})

const mr = (number: number, extra: Partial<MergeRequestItem> = {}): MergeRequestItem => ({
  kind: 'mergeRequest',
  id: `acme/backend!${number}`,
  number,
  title: `Merge request ${number}`,
  url: `https://gitlab.example.com/acme/backend/-/merge_requests/${number}`,
  project: 'acme/backend',
  author: 'ana',
  sourceBranch: `feat/item-${number}`,
  targetBranch: 'main',
  draft: false,
  updatedAt: '2026-11-11T10:00:00Z',
  hasConflicts: false,
  openDiscussions: false,
  pipeline: 'success',
  ...extra,
})

const keys = (items: readonly ViewItem[]) =>
  items.map((item) => (item.kind === 'issue' ? item.key : `!${item.number}`))

describe('searchViewItems', () => {
  const tasks = [
    task('BID-7', { summary: 'Fix the build cache', type: 'Task' }),
    task('NTF-12', { summary: 'Login fails on Safari', type: 'Bug', status: 'In Progress' }),
    task('PLTB-3', { summary: 'Deploy de homologação quebrado' }),
    task('NTF-397', { summary: 'Retry the webhook' }),
    task('NTF-39', { summary: 'Document the retry policy' }),
    task('NTF-3', { summary: 'Rename the digest' }),
  ]

  it('should keep the list as it is when the query is empty or blank', () => {
    expect(searchViewItems(tasks, '')).toBe(tasks)
    expect(searchViewItems(tasks, '   ')).toBe(tasks)
  })

  it('should match only the start of a word when typing part of one', () => {
    expect(keys(searchViewItems(tasks, 'bug'))).toEqual(['NTF-12'])
    expect(keys(searchViewItems(tasks, 'uild'))).toEqual([])
    expect(keys(searchViewItems(tasks, 'buil'))).toEqual(['BID-7'])
  })

  it('should ignore case and accents when the text has them and the query does not', () => {
    expect(keys(searchViewItems(tasks, 'homologacao'))).toEqual(['PLTB-3'])
    expect(keys(searchViewItems(tasks, 'HOMOLOGAÇÃO'))).toEqual(['PLTB-3'])
  })

  it('should need every typed word to start a word of the item', () => {
    expect(keys(searchViewItems(tasks, 'retry webhook'))).toEqual(['NTF-397'])
    expect(keys(searchViewItems(tasks, 'retry safari'))).toEqual([])
  })

  it('should match the status, the type and the project of a task', () => {
    expect(keys(searchViewItems(tasks, 'progress'))).toEqual(['NTF-12'])
    expect(keys(searchViewItems(tasks, 'task'))).toEqual(['BID-7'])
    expect(keys(searchViewItems(tasks, 'pltb'))).toEqual(['PLTB-3'])
  })

  it('should put the exact key first, then the keys that start with the query, when a key is typed', () => {
    const list = [task('NTF-397'), task('BID-39'), task('NTF-390'), task('NTF-39')]

    expect(keys(searchViewItems(list, 'ntf-39'))).toEqual(['NTF-39', 'NTF-397', 'NTF-390'])
  })

  it('should keep the list order among items that match the same way', () => {
    expect(keys(searchViewItems(tasks, 'the'))).toEqual(['BID-7', 'NTF-397', 'NTF-39', 'NTF-3'])
  })

  it('should match a merge request by reference, title, author and branch', () => {
    const list = [
      mr(41, { title: 'Add rate limiting', sourceBranch: 'feat/rate-limit' }),
      mr(4, { author: 'bruno', title: 'Build the image' }),
      mr(410, { title: 'Bump the bundler' }),
    ]

    expect(keys(searchViewItems(list, 'limit'))).toEqual(['!41'])
    expect(keys(searchViewItems(list, 'bruno'))).toEqual(['!4'])
    expect(keys(searchViewItems(list, 'bug'))).toEqual([])
    expect(keys(searchViewItems(list, 'backend!41'))).toEqual(['!41', '!410'])
  })

  it.each([
    ['the exact key', 'ntf-39', true],
    ['the start of the key', 'NTF-3', true],
    ['a word of the summary', 'policy', false],
    ['nothing', '  ', false],
  ])('should tell whether the query names the task when it is %s', (_label, query, expected) => {
    expect(matchesReference(task('NTF-39', { summary: 'Retry policy' }), query)).toBe(expected)
  })

  it('should put the exact reference first when a merge request number is typed', () => {
    const list = [mr(410), mr(4), mr(41)]

    expect(keys(searchViewItems(list, '!41'))).toEqual(['!41', '!410'])
    expect(keys(searchViewItems(list, 'acme/backend!4'))).toEqual(['!4', '!410', '!41'])
  })
})
