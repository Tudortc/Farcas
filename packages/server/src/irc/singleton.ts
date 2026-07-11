import { Hub } from './hub.js'
import { IrcManager } from './manager.js'

export const hub = new Hub()
export const ircManager = new IrcManager(undefined, hub)
