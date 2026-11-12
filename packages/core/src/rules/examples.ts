import { BUILT_IN_EXTENSION_ID } from '../extensions/built-in.ts'
import type { RuleFile } from './resolve.ts'
import type { Rule } from './rule.ts'

export interface BuiltInRule {
  // Suggested when a repository is set up; the others are only listed
  readonly recommended: boolean
  readonly rule: Rule
}

// Alternatives of an expression, kept as check variables so a screen can edit them as fields
const TYPES = 'feat|fix|docs|refactor|test|chore|ci'
const LONG_LIVED = 'main|master|develop'

const branchFormat: Rule = {
  id: 'branch-format',
  title: 'Branch names',
  applies: 'branch',
  paths: [],
  why: 'The kind of work shows in the branch list and automation can rely on the name',
  enabled: false,
  check: [
    {
      pattern: '^({longLived}|({types})/[a-z0-9][a-z0-9-]*)$',
      variables: { types: TYPES, longLived: LONG_LIVED },
      message:
        'Use <type>/<short-slug> in lowercase with a type from {types}, for example feat/add-login; long-lived branches such as {longLived} keep their names',
    },
  ],
  body: `Name a branch \`<type>/<short-slug>\`, in lowercase with hyphens, for example \`feat/add-login\`.
The check below lists the types. The long-lived branches, such as main, keep their names.

To accept other types or other long-lived branches, change the fields \`types\` and \`longLived\` of the check.`,
}

const commitMessage: Rule = {
  id: 'commit-message',
  title: 'Commit messages',
  applies: 'commit',
  paths: [],
  why: 'The history reads as a changelog and release notes can be generated from it',
  enabled: false,
  check: [
    {
      // Git writes the merge, revert, fixup and squash subjects itself
      pattern: '^(Merge .+|Revert ".+"|(fixup|squash)! .+|({types})(\\([^()\\s]+\\))?!?: \\S.*)$',
      variables: { types: TYPES },
      scope: 'first-line',
      message:
        'Start with <type>(<optional scope>): <summary> with a type from {types}, for example fix(cli): handle empty input',
    },
    {
      maxLength: 72,
      scope: 'first-line',
      message: 'Keep the first line within {maxLength} characters',
    },
  ],
  body: `Write the first line as \`<type>(<optional scope>): <summary>\`, short and in the imperative, for
example \`fix(cli): handle empty input\`. The checks below list the types and the length. When the reason
is not obvious, explain it in the body after a blank line.

To accept other types or another length, change the fields \`types\` and \`maxLength\` of the checks.`,
}

const reviewRubric: Rule = {
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

const mrDescription: Rule = {
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

// All off by default: turning one on writes it, complete, into the user's own folder
export const BUILT_IN_RULES: readonly BuiltInRule[] = [
  { recommended: true, rule: branchFormat },
  { recommended: true, rule: commitMessage },
  { recommended: false, rule: reviewRubric },
  { recommended: false, rule: mrDescription },
]

// The examples as files, so they go through the same resolution as an installed or a repository rule
export function builtInRuleFiles(): RuleFile[] {
  return BUILT_IN_RULES.map(({ rule: { body, ...frontMatter } }) => ({
    source: 'built-in',
    extension: BUILT_IN_EXTENSION_ID,
    path: `built-in/${frontMatter.id}.md`,
    frontMatter,
    body,
  }))
}
