import { IrcManager } from './manager.js'

// One process-wide manager so IRC connections outlive individual WebSocket sockets.
export const ircManager = new IrcManager()
