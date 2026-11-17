// Ubuntu 22.04 and Debian 12 have at least this glibc; the README promises both
export const SUPPORTED_GLIBC = '2.35'

export function compareVersions(a, b) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

// The newest glibc an ELF file asks for, read from the GLIBC_2.x version names it carries; undefined
// when it names none
export function newestGlibc(bytes) {
  const names = bytes.toString('latin1').match(/GLIBC_\d+(\.\d+)+/g) ?? []
  return names
    .map((name) => name.slice('GLIBC_'.length))
    .sort(compareVersions)
    .at(-1)
}
