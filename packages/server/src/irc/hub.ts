import type { ServerMessage } from '@bool/shared'

export type Sink = (msg: ServerMessage) => void

export class Hub {
  private subs = new Map<string, Set<Sink>>()

  subscribe(userId: string, sink: Sink): () => void {
    let set = this.subs.get(userId)
    if (!set) {
      set = new Set()
      this.subs.set(userId, set)
    }
    set.add(sink)
    return () => {
      const s = this.subs.get(userId)
      if (!s) return
      s.delete(sink)
      if (s.size === 0) this.subs.delete(userId)
    }
  }

  publish(userId: string, msg: ServerMessage): void {
    const set = this.subs.get(userId)
    if (!set) return
    for (const sink of set) {
      try {
        sink(msg)
      } catch {
        // a dead/throwing socket must not stop delivery to the user's other devices
      }
    }
  }

  subscriberCount(userId: string): number {
    return this.subs.get(userId)?.size ?? 0
  }
}
