# Message Queue & Captcha Flow

## FIFO queue

While the agent is running a task, type a follow-up and press Enter — it queues. The new task runs after the current one finishes (FIFO).

Sidebar shows queued tasks with a `◌` prefix:
```
● 1 open example.com         ← running
◌ q1 open hanivan.my.id      ← queued
◌ q2 search latest news
```

Press `d` while a queued item is selected to remove it.

## Captcha preempt

CAPTCHA prompts always preempt the queue — the agent pauses and the input bar enters captcha mode regardless of what's queued. After the user resolves the captcha (visibly clicks/types in the browser, then presses Enter in Naonw with empty input), the agent resumes and the queue continues processing.

If you type text into the input bar during captcha mode, it goes to the queue (does NOT resolve the captcha). Only an empty Enter advances past the captcha.

The input-bar hint changes to reflect mode:
- Idle: `Tab: scroll mode  ·  Esc: interrupt`
- Captcha: `Enter (empty): resolve captcha  ·  text+Enter: queue task  ·  Esc: abort`
- Queued nav: `j/k: select task  ·  d: delete queued  ·  ↑↓ PgUp PgDn Home End: scroll  ·  Tab: type mode`

## Storage

Queued messages live in memory (`Store.queue: QueuedMessage[]` in `src/ui/store.ts`). They do not persist across restarts.
