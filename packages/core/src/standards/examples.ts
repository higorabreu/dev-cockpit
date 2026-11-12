import { BUILT_IN_EXTENSION_ID } from '../extensions/built-in.ts'
import type { StandardFile } from './resolve.ts'
import type { Standard } from './standard.ts'

export interface BuiltInStandard {
  // Suggested when a repository is set up; the others are only listed
  readonly recommended: boolean
  readonly standard: Standard
}

const branchFormat: Standard = {
  id: 'branch-format',
  title: 'Branch names',
  applies: 'branch',
  paths: [],
  why: 'The kind of work shows in the branch list and automation can rely on the name',
  enabled: false,
  check: [
    {
      pattern: '^(main|master|develop|(feat|fix|docs|refactor|test|chore|ci)/[a-z0-9][a-z0-9-]*)$',
      message: 'Use <type>/<short-slug> in lowercase, for example feat/add-login',
    },
  ],
  body: `Name a branch \`<type>/<short-slug>\`, in lowercase with hyphens, for example \`feat/add-login\`.
The type is one of feat, fix, docs, refactor, test, chore or ci.

To require a ticket key, replace \`check\` in your own file for this standard with a pattern like
\`^(feat|fix|chore)/{ticket}-[a-z0-9-]+$\` and the variable \`ticket: '[A-Z]+-[0-9]+'\`, which accepts
\`feat/ABC-12-add-login\`.`,
}

const commitMessage: Standard = {
  id: 'commit-message',
  title: 'Commit messages',
  applies: 'commit',
  paths: [],
  why: 'The history reads as a changelog and release notes can be generated from it',
  enabled: false,
  check: [
    {
      // Git writes the merge and revert subjects itself
      pattern:
        '^(Merge .+|Revert ".+"|(feat|fix|docs|refactor|test|chore|ci)(\\([^()\\s]+\\))?!?: \\S.*)$',
      scope: 'first-line',
      message:
        'Start with <type>(<optional scope>): <summary>, for example fix(cli): handle empty input',
    },
    {
      maxLength: 72,
      scope: 'first-line',
      message: 'Keep the first line within 72 characters',
    },
  ],
  body: `Write the first line as \`<type>(<optional scope>): <summary>\`, in the imperative and within 72
characters, for example \`fix(cli): handle empty input\`. The type is one of feat, fix, docs, refactor,
test, chore or ci. When the reason is not obvious, explain it in the body after a blank line.`,
}

const reviewRubric: Standard = {
  id: 'review-rubric',
  title: 'Review rubric',
  applies: 'review',
  paths: [],
  why: 'A fixed order finds behavior problems before style remarks and makes reviews comparable',
  enabled: false,
  check: [],
  body: `Review the change in this order and report only what you verified in the code:

1. Correctness: it does what the description says, including the edge cases and the error paths.
2. Tests: each new behavior has a test that would fail without the change.
3. Scope: nothing unrelated or unrequested is in the diff.
4. Readability: a teammate understands it without asking the author.
5. Safety: no secret, no unvalidated external input, no destructive action without approval.

Mark each finding as blocking or optional and point to its file and line.`,
}

const mrDescription: Standard = {
  id: 'mr-description',
  title: 'Merge request description',
  applies: 'pr',
  paths: [],
  why: 'A reviewer needs the intent and the evidence before reading the diff',
  enabled: false,
  check: [
    {
      required: '(^|\\n)#{1,6} Summary[ \\t]*\\r?\\n\\s*[^#\\s]',
      message: 'Add a "## Summary" section that says what changed and why',
    },
    {
      required: '(^|\\n)#{1,6} Testing[ \\t]*\\r?\\n\\s*[^#\\s]',
      message: 'Add a "## Testing" section that says how the change was verified',
    },
  ],
  body: `Write the description with these two sections:

- \`## Summary\`: what changed and why, in a few sentences a reviewer reads before the diff.
- \`## Testing\`: how the change was verified (the commands run, the cases tried, what was not tested).`,
}

// All off by default: a user turns one on with a file of their own that sets `enabled: true`
export const BUILT_IN_STANDARDS: readonly BuiltInStandard[] = [
  { recommended: true, standard: branchFormat },
  { recommended: true, standard: commitMessage },
  { recommended: false, standard: reviewRubric },
  { recommended: false, standard: mrDescription },
]

// The examples as files, so they go through the same resolution as an installed or a repository standard
export function builtInStandardFiles(): StandardFile[] {
  return BUILT_IN_STANDARDS.map(({ standard: { body, ...frontMatter } }) => ({
    source: 'built-in',
    extension: BUILT_IN_EXTENSION_ID,
    path: `built-in/${frontMatter.id}.md`,
    frontMatter,
    body,
  }))
}
