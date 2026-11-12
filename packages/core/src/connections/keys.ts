// Profiles (dev mode, tests) share the system keyring: without a prefix, one would delete the other's token
export const gitlabTokenKey = (profile: string | undefined): string =>
  profile ? `${profile}:gitlab.token` : 'gitlab.token'
