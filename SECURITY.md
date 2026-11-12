# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead:
open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, how
to reproduce it and the version. You will get an answer within a few days, and a fix is released as soon as
it is ready, with credit to you if you want it.

## What the app handles

- **Tokens.** A GitLab token is stored only in the system secret store (libsecret on Linux), never in a
  file or in a log, and it never goes back to the interface after it is saved.
- **Network.** The app talks only to the GitLab address the user configures, over https (plain http only
  for the local machine).
- **Local daemon.** It listens on a Unix socket in the user's runtime directory, not on a network port.
- **External writes.** Writing to a connected service requires the user's approval.

Supported versions: the latest release.
