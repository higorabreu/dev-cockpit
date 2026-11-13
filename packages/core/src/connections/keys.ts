// Profiles (dev mode, tests) share the system keyring: without a prefix, one would delete the other's token
export const connectorTokenKey = (connector: string, profile: string | undefined): string =>
  profile ? `${profile}:${connector}.token` : `${connector}.token`
