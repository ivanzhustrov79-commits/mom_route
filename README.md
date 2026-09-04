# Маршрут

A minimalist PWA that tells a parent when to leave to drop off and pick up
several children, and works out the fewest car trips that make the day possible.

Live: **https://ivanzhustrov79-commits.github.io/mom_route/**

No build step, no framework, no server, no account. Everything runs in the
browser and all data stays in `localStorage` on the device.

---

## Screens

**`Сегодня`** opens on one thing only: the countdown to the next departure and
that outing written out in full — every stop, who is dropped or collected, and
the time everyone is home again. It fills the screen; the rest of the day is one
scroll below. The teacher's name appears here and nowhere else, because it is
only worth knowing for the event you are about to drive to.

Below the fold the day runs as a single strip, in time order:

* **outings** — a walking or car glyph, departure from home, each stop, back home;
* **free windows** in green — how long, until when, and where you are. Tapping one
  switches between waiting at home and waiting at the next place; if that would
  leave a child sitting in the car past the limit, the app says so and puts it
  back rather than silently doing nothing;
* **children getting home on their own**, in amber with a warning glyph. Tapping
  turns it into a pick-up for that day, and one line at the foot of the day undoes
  it. The check is per child: if nobody in the plan collects them from their last
  class of the day, it says so.

**`Календарь`** (calendar icon) is the timetable — seven days of classes, no
driving. Overlapping classes step to the right so a clash is visible instead of
reading as one-after-another. Tap a class to edit its name, teacher, place, days,
times, who attends and how the drop-off and pick-up work; every class is weekly.
`+ занятие` adds one to that day, and children live at the bottom of this screen.
A class shared by several children is one row and edits reach all of them.

**`Настройки`** (from inside the calendar, one level deeper) is technical only —
addresses, planner limits, routing source, notifications, data. Nothing the
driver needs day to day.

There is also a rough parser for schedules pasted as text
(`Настройки → Импорт расписания`), and JSON import/export for moving a finished
setup between devices.

## How the planner works

Each activity becomes a *stop* with a time window; identical stops merge (three
children leaving the same school at once is one stop). Stops are then cut into
**outings** by dynamic programming, minimising

```
minutes behind the wheel  +  tripPenalty × (number of outings)
```

so an extra outing has to save roughly 22 minutes of driving to be worth making.

Within an outing a pick-up wants to be *early* (nobody waiting at the door) and a
drop-off *late* (nobody sitting at the club for half an hour), so the last stop
is anchored at whichever edge of its window suits its kind and earlier stops are
pushed as late as they can go. That is what makes children ride along instead of
being ferried home first. A child is never dropped somewhere before being
collected from wherever they were.

Constraints that keep it realistic:

| Setting | What it does |
|---|---|
| `Мест в машине` | seat limit; children being dropped off occupy seats from home, collected ones from their stop onwards |
| `Максимум ожидания` | idle longer than this between two stops and going home is cheaper — the outing splits |
| `Ребёнок в машине не дольше` | caps how long any child is carried around on one outing |
| `Штраф за пропуск` | optional pick-ups (children who *can* walk home) may be dropped if collecting them needs a whole extra outing |
| `Парковка и подход` | the friction that decides walk vs. drive for a short single errand |
| `Пешком не дальше` | walking cut-off |

### The long-ride question

A long ride-along is a judgement call, not a rule. The app plans the day twice —
once respecting the ride cap, once ignoring it — and if dropping the cap would
save outings it asks, rather than deciding:

> Можно обойтись **на 3 выезда меньше**, если Аня поедет кататься с мамой —
> 2 ч 18 м в машине.  **Да, поедет** · **Нет, домой**

The answer is remembered for that day only. Nothing is asked when there is
nothing to gain.

### When the schedule doesn't fit

No optimiser fixes a timetable that is physically impossible, so that is checked
separately: for each child the gap between two classes is compared against the
real driving time between the two addresses. If the gap is smaller the main
screen says so in red and names the shortfall.

## Travel times

| Need | Free without a key? | Used |
|---|---|---|
| Geocoding | yes | OpenStreetMap Nominatim — asks for 5 candidates and keeps the highest `place_rank`, so an exact building beats a street centroid |
| Road routing | yes | OSRM demo server, whole matrix in one request |
| Live traffic | no | free-flow times × a Moscow congestion curve by hour (×1.26 at 13:00, ×1.70 at 18:20, damped at weekends) |

Optional keys for **TomTom** or **Yandex** switch to real traffic; when the
provider returns traffic-aware durations the modelled curve turns itself off, so
traffic is never counted twice. `Настройки → Проверить источник маршрутов`
reports what the current source actually returns.

## Notifications

Alerts at 30 / 10 / 0 minutes before departure, configurable. iOS only allows
web notifications for a PWA added to the Home Screen (iOS 16.4+), over https.

A closed web app gets no timer from iOS, so reminders need something outside it.

### Background reminders without giving away the schedule

`worker/` is a Cloudflare Worker that acts as an **alarm clock, not a postman**.
The phone sends it a list of moments — nothing else — and at the right minute it
sends a Web Push with **no payload at all**. The service worker wakes, reads the
text from the device's own IndexedDB and shows it. Neither Cloudflare nor Apple
ever sees a name, an address or a child.

Deploy it with `worker/README.md`. Where the keys live:

| | Where | Secret? |
|---|---|---|
| VAPID public key | `js/push.js`, `worker/wrangler.toml` | no — public by design |
| VAPID private key | `wrangler secret put VAPID_PRIVATE` | **yes**, never in git |
| Shared password | `wrangler secret put APP_SECRET` + the phone's settings | **yes** |
| Cloudflare API token | not needed — `wrangler login` uses the browser | — |

Then in the app: `Настройки → Фоновые уведомления` — the worker address and the
same password, then *Включить и передать расписание*. The queue is refreshed
hourly while the app is open and covers a week ahead.

Free tier covers it: the cron fires once a minute regardless of how many
reminders there are, which is about 1 500 invocations a day against a 100 000
limit.

### Without any of that

Alerts fire while the app is open, and a missed threshold is announced on the
next open with the real time remaining rather than swallowed. That makes a
Shortcuts automation — *Время суток → Открыть приложение* a few times a day —
a working, free substitute.

### The native route

`UNCalendarNotificationTrigger` schedules the whole day ahead and fires with the
app shut, no server and nothing leaving the phone. `js/planner.js` is pure
functions over a state object and ports across unchanged. A native app would also
get traffic-aware ETAs free from `MKDirections.calculateETA()`, with no API key.

## Files

```
index.html          screens, no framework
style.css           the whole design; light + dark via prefers-color-scheme
js/state.js         data model, defaults, localStorage
js/travel.js        geocoding, routing matrix, traffic model
js/planner.js       stop building, feasibility, DP optimiser, conflict detection
js/notes.js         text schedule parser
js/notify.js        30/10/0 alerts, dedupe, wake-lock
js/idb.js           on-device alarm texts, readable by the service worker
js/push.js          subscription + the week's alarm times for the worker
worker/             Cloudflare Worker: an alarm clock that carries no content
js/ui.js            router, rendering, field binding
sw.js               offline shell + notification click
test/headless.js    node test/headless.js — exercises the planner without a browser
```

## Privacy

The app ships with an empty template. Home addresses, children's names and
schedules are entered on the device and never leave it — there is no server and
no analytics. Keep real schedules out of this repository.

### Optional: an encrypted schedule in the repo

So a second device does not need a file transfer, a schedule can be committed as
`data.enc.json` — AES-GCM-256 with the key derived from a passphrase by
PBKDF2-SHA256, 600 000 iterations:

```
node tools/encrypt_schedule.js "четыре случайных слова подряд"
git add data.enc.json && git commit -m "schedule" && git push
```

On a device with no data yet, the app then asks for the passphrase instead of
starting empty. Unlocking takes about 150 ms on a desktop.

Any phrase is accepted — the tool estimates its strength, says so, and gets out
of the way. `--suggest` prints a random five-word phrase if you would rather not
invent one.

**Understand what this trades away.** The ciphertext is public and stays public —
forks, mirrors and git history outlive any later deletion, so the only thing
standing between a stranger and the plaintext is the passphrase. Changing it
later does not help: the old blob remains in history and still opens with the old
passphrase. A PIN or a familiar saying is broken offline in minutes; length and
unpredictability are what count.

If the data is a child's daily whereabouts, `Настройки → Данные → Импорт JSON`
publishes nothing at all and costs one minute per device. Prefer it.

## Running locally

```
python -m http.server 8123 --bind 0.0.0.0 --directory .
```
