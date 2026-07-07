// A reducer call is a PostgREST fetch; if it hangs — the network stalls or the
// database never answers — the promise can stay pending indefinitely, so an
// optimistic UI would lie forever. Racing against a timeout turns that silence
// into an honest error the caller can toast.
const ACK_TIMEOUT_MS = 6_000;

export function withAck(call: Promise<void>, label: string): Promise<void> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${label} never reached the database — connection may be down`)), ACK_TIMEOUT_MS);
  });

  return Promise.race([call, timeout]);
}
