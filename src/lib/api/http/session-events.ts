// "The session ended" signal. The HTTP client emits it when a call (other than the sign-in endpoints) answers 401;
// the route guard subscribes later to send the person to /login. The client itself never redirects.
// Plain module state: no window, no randomness, safe at module load during SSR.

type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();

/** Subscribes to the signal; returns the unsubscribe function. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notifies every subscriber. A failing listener never stops the others. */
export function emitSessionExpired(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A broken subscriber must not break the request that detected the expiry.
    }
  }
}
