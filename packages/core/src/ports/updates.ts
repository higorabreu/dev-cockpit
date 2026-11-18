import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'

export interface ReleaseAsset {
  readonly name: string
  readonly url: string
  readonly size: number
}

export interface Release {
  // Without the tag's leading `v`
  readonly version: string
  // The release's page, where its notes are read
  readonly page: string
  readonly assets: readonly ReleaseAsset[]
}

// Where the cockpit's own releases are published
export interface ReleaseSource {
  // The newest stable release; undefined when there is none
  latest(): Promise<Result<Release | undefined, ErrorBody>>
}

export interface DownloadedFile {
  readonly file: string
  // Lowercase hex, computed while the file was written
  readonly sha256: string
}

// A cancelled password dialog is the user's answer, not a failure
export type InstallOutcome = 'installed' | 'cancelled'

// Downloads a release's package and installs it over the running app; only where the system allows it
export interface UpdateInstaller {
  // A small text file of the release, such as its checksums
  readText(url: string): Promise<Result<string, ErrorBody>>
  // To a private temporary folder; the fraction is reported while the size is known
  download(
    asset: ReleaseAsset,
    onProgress: (fraction: number) => void,
  ): Promise<Result<DownloadedFile, ErrorBody>>
  install(file: string): Promise<Result<InstallOutcome, ErrorBody>>
  // Removes a downloaded file and its folder
  discard(file: string): Promise<void>
}
