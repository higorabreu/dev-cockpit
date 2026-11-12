// Bumps when the daemon gains or changes a method. The shell compares it with the daemon it finds:
// an older daemon that survived an update is replaced instead of rejecting calls
export const DAEMON_PROTOCOL = 4
