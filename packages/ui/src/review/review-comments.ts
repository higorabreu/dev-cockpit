import {
  type CommentPlace,
  type DiffFile,
  type DiffLine,
  locateComment,
  locateComments,
  type ReviewComment,
  reviewText,
  type Translator,
} from '@dck/core'
import {
  type CommentEditor,
  cardEstimate,
  commentCard,
  commentLabel,
  createCommentEditor,
  linesLabel,
} from './comment-card.ts'

export interface ReviewCommentsDeps {
  readonly i18n: Translator
  readonly editKey: string
  readonly deleteKey: string
  readonly saveKey: string
  isSave(event: KeyboardEvent): boolean
  // The comments or the field changed: the rows and the count draw again
  onChange(): void
  // The field opened: it comes into view with the keys
  onOpen(): void
  // The field closed: the keys go back to the diff
  onDone(): void
}

interface Draft {
  comment: ReviewComment
  // Editing a saved comment rather than writing a new one
  readonly existing: boolean
  readonly editor: CommentEditor
}

// The pending comments of one review and the one comment field: they stay until sent, follow their lines
// on every read, and live as long as the tab's review
export function createReviewComments(deps: ReviewCommentsDeps) {
  let comments: ReviewComment[] = []
  let draft: Draft | undefined
  let counter = 0
  // Comments whose file left the change at the last drawing: their card names the file
  let gone = new Set<string>()

  const changed = () => deps.onChange()

  function open(comment: ReviewComment, existing: boolean) {
    const editor = createCommentEditor(comment, existing, {
      i18n: deps.i18n,
      saveKey: deps.saveKey,
      isSave: deps.isSave,
      save: (text) => save(text),
      cancel,
    })
    draft = { comment, existing, editor }
    changed()
    deps.onOpen()
  }

  // A field already open keeps what it has: written text is saved, an empty field goes
  function settle() {
    if (!draft) return
    const text = draft.editor.text()
    if (text.trim() === '') draft = undefined
    else save(text, false)
  }

  function save(text: string, done = true) {
    if (!draft) return
    const saved = { ...draft.comment, body: text.trim() }
    comments = draft.existing
      ? comments.map((comment) => (comment.id === saved.id ? saved : comment))
      : [...comments, saved]
    draft = undefined
    changed()
    if (done) deps.onDone()
  }

  function cancel() {
    draft = undefined
    changed()
    deps.onDone()
  }

  function edit(id: string) {
    const comment = comments.find((found) => found.id === id)
    if (!comment || draft?.comment.id === id) return
    settle()
    open(comment, true)
  }

  function remove(id: string) {
    if (draft?.comment.id === id) draft = undefined
    comments = comments.filter((comment) => comment.id !== id)
    changed()
  }

  return {
    // Opens the field for new lines of a file
    start(path: string, lines: readonly DiffLine[], place: CommentPlace) {
      settle()
      counter += 1
      open({ id: `comment-${counter}`, path, lines, body: '', place }, false)
    },
    edit,
    remove,
    // After a read every comment, and the field's, looks for its lines in the new change
    relocate(files: readonly DiffFile[]) {
      comments = locateComments(comments, files)
      if (draft) {
        const file = files.find((found) => found.path === draft?.comment.path)
        draft.comment = locateComment(draft.comment, file)
      }
    },
    // A file's comments, with the one being written; the field's comment keeps its old text until saved
    forFile(path: string): ReviewComment[] {
      const found = comments.filter((comment) => comment.path === path)
      if (draft && !draft.existing && draft.comment.path === path) found.push(draft.comment)
      if (draft?.existing) {
        const editing = draft.comment
        return found.map((comment) => (comment.id === editing.id ? editing : comment))
      }
      return found
    },
    // The comments on files that left the change, kept and still sent
    gone(paths: ReadonlySet<string>): ReviewComment[] {
      const left = comments.filter((comment) => !paths.has(comment.path))
      gone = new Set(left.map((comment) => comment.id))
      if (draft && !paths.has(draft.comment.path)) {
        gone.add(draft.comment.id)
        if (!draft.existing) left.push(draft.comment)
      }
      return left
    },
    count: () => comments.length,
    // The saved comments on a file, for its header
    countFor: (path: string) => comments.filter((comment) => comment.path === path).length,
    // The field and the comment it writes, while one is open
    editor() {
      return draft ? { id: draft.comment.id, element: draft.editor.element } : undefined
    },
    focusField: () => draft?.editor.focus(),
    card(id: string): HTMLElement | undefined {
      const comment = comments.find((found) => found.id === id)
      if (!comment) return undefined
      return commentCard(comment, gone.has(id), {
        i18n: deps.i18n,
        editKey: deps.editKey,
        deleteKey: deps.deleteKey,
        edit,
        remove,
      })
    },
    // How a screen reader names a comment's row; the field's own label names the one being written
    label(id: string): string {
      const { i18n } = deps
      if (draft?.comment.id === id) {
        return i18n.t('review.comment.field', { lines: linesLabel(draft.comment.lines, i18n) })
      }
      const comment = comments.find((found) => found.id === id)
      return comment ? commentLabel(comment, i18n) : ''
    },
    estimate(id: string): number {
      const comment = comments.find((found) => found.id === id)
      return comment ? cardEstimate(comment) : 0
    },
    // Every pending comment as the text for the agent, a field with text saved first
    text(): string {
      settle()
      changed()
      return reviewText(comments)
    },
    // Once the text reached the terminal, nothing is left pending
    clear() {
      comments = []
      draft = undefined
      changed()
    },
  }
}

export type ReviewComments = ReturnType<typeof createReviewComments>
