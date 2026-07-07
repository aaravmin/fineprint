# Demo runbook: kill an agent, watch the system heal (~90 seconds)

Setup before judges arrive:

1. `npm run db:start` running (local Supabase).
2. Fresh data: `npm run db:reset`, then queue a few intakes from the dashboard address bar (or `npm run ingest -- "345 Park Avenue, Manhattan"`).
3. Three terminals: `WORKER_NAME=atlas npm run worker`, `WORKER_NAME=lexi npm run worker`, `WORKER_NAME=rook npm run worker`.
4. Dashboard open on the laptop; judges' phones on the same URL (M4).

The script:

| t    | Action                                                                                                                                            | What the room sees                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Point at the board                                                                                                                                | 23 tickets, three agents claiming. Tickets move open → claimed → review on their own.                                |
| 0:20 | "Each ticket is a real legal deadline. Exactly one agent can own one — the database enforces it, not our code."                                   | Claim events scrolling in the feed.                                                                                  |
| 0:35 | Kill an agent mid-ticket: press **kill** on the agent rail, or just Ctrl+C its terminal                                                           | Agent card goes red. Its ticket is stuck in claimed.                                                                 |
| 0:50 | Wait for the reaper (≤15s of silence)                                                                                                             | Ticket snaps back to **open**. Feed shows `worker_reaped` + `task_released`. Another agent claims it within seconds. |
| 1:10 | Hand a judge a phone, have them approve a drafted ticket                                                                                          | Approval lands on every screen simultaneously. Audit feed records who.                                               |
| 1:25 | Close: "Queue, locks, crash recovery, scheduling, sync, audit — that whole backend is one Postgres schema on Supabase. There is no other server." |                                                                                                                      |

CLI fallback if the dashboard is down (M4 not landed):

```bash
npx supabase db query --local "SELECT name, status FROM worker"
npx supabase db query --local "SELECT kill_worker(2)"
# wait ~15s
npx supabase db query --local "SELECT id, status, claimed_by FROM task WHERE status = 'open'"
npx supabase db query --local "SELECT kind, payload FROM event ORDER BY id DESC LIMIT 5"
```
