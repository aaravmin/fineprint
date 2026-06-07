// The SDK's reducer-call promise never settles when the socket is dead, so
// an optimistic UI would lie forever. Racing against a timeout turns that
// silence into an honest error the caller can toast.
const ACK_TIMEOUT_MS = 6_000;

export function withAck(call: Promise<void>, label: string): Promise<void> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(new Error(`${label} never reached the database — connection may be down`)),
      ACK_TIMEOUT_MS,
    );
  });

  return Promise.race([call, timeout]);
}
