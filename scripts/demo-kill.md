# Demo runbook: kill an agent, watch the system heal (~90 seconds)

Setup before judges arrive:

1. `spacetime start` running, module published (`npm run publish:local`).
2. Fresh data: `spacetime publish --module-path spacetimedb --server local fineprint -y --delete-data=always`, then queue a few intakes: `spacetime call -s local fineprint request_building '"345 Park Avenue, Manhattan"'`.
3. Three terminals: `WORKER_NAME=atlas npm run worker`, `WORKER_NAME=lexi npm run worker`, `WORKER_NAME=rook npm run worker`.
4. Dashboard open on the laptop; judges' phones on the same URL (M4).

The script:

| t    | Action                                                                                                                                   | What the room sees                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Point at the board                                                                                                                       | 23 tickets, three agents claiming. Tickets move open → claimed → review on their own.                                |
| 0:20 | "Each ticket is a real legal deadline. Exactly one agent can own one — the database enforces it, not our code."                          | Claim events scrolling in the feed.                                                                                  |
| 0:35 | Kill an agent mid-ticket: press **kill** on the agent rail, or just Ctrl+C its terminal                                                  | Agent card goes red. Its ticket is stuck in claimed.                                                                 |
| 0:50 | Wait for the reaper (≤15s of silence)                                                                                                    | Ticket snaps back to **open**. Feed shows `worker_reaped` + `task_released`. Another agent claims it within seconds. |
| 1:10 | Hand a judge a phone, have them approve a drafted ticket                                                                                 | Approval lands on every screen simultaneously. Audit feed records who.                                               |
| 1:25 | Close: "Queue, locks, crash recovery, scheduling, sync, audit — that whole backend is one SpacetimeDB module. There is no other server." |                                                                                                                      |

CLI fallback if the dashboard is down (M4 not landed):

```bash
spacetime sql -s local fineprint "SELECT name, status FROM worker"
spacetime call -s local fineprint kill_worker 2
# wait ~15s
spacetime sql -s local fineprint "SELECT id, status, claimedBy FROM task WHERE status = 'open'"
spacetime sql -s local fineprint "SELECT kind, payload FROM event" | tail -5
```
