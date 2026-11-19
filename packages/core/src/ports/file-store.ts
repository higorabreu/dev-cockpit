import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'
import type { Unsubscribe } from './pty.ts'

// What a file held when it was read or written; a save or a change on disk is checked against it
export interface FileStamp {
  readonly size: number
  readonly mtimeMs: number
  // SHA-256 of the bytes in hex; a file past the open limit is never hashed and carries its size and time
  readonly hash: string
}

export interface FileInfo {
  readonly size: number
  readonly mtimeMs: number
}

export interface FileBytes {
  readonly bytes: Uint8Array
  // Of exactly these bytes
  readonly stamp: FileStamp
}

// A save either wrote, or found the disk no longer holding what it expected (undefined: no file there)
export type FileWrite =
  | { readonly kind: 'written'; readonly stamp: FileStamp }
  | { readonly kind: 'changed'; readonly disk: FileStamp | undefined }

// A real change of content: a touch, or a write of the same bytes, is not one
export type FileChange =
  | { readonly kind: 'changed'; readonly stamp: FileStamp }
  // Deleted, or renamed away; a file showing up again at the path is a change
  | { readonly kind: 'deleted' }

// Files on the user's disk, by absolute path; links are followed. Never logs a file's content
export interface FileStore {
  // A regular file only: a folder, a device or a missing path fails
  stat(path: string): Promise<Result<FileInfo, ErrorBody>>
  // At most the first `length` bytes
  head(path: string, length: number): Promise<Result<Uint8Array, ErrorBody>>
  read(path: string): Promise<Result<FileBytes, ErrorBody>>
  // Only when the disk still holds `expected` (null: no file there), written whole beside it and renamed
  // over it, keeping its mode, so no reader ever sees half a file
  write(
    path: string,
    bytes: Uint8Array,
    expected: FileStamp | null,
  ): Promise<Result<FileWrite, ErrorBody>>
  // Follows the file through a rename over it by another writer; changes come together, after a pause.
  // With `since`, what the reader holds, a change made before the watch began is reported too
  watch(
    path: string,
    since: FileStamp | undefined,
    listener: (change: FileChange) => void,
  ): Result<Unsubscribe, ErrorBody>
}
