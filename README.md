# Маршрут

A minimalist PWA that tells a parent when to leave to drop off and pick up
several children, and works out the fewest car trips that make the day possible.

Live: **https://ivanzhustrov79-commits.github.io/mom_route/**

No build step, no framework, no server, no account. Everything runs in the
browser and all data stays in `localStorage` on the device.

---

## Who is holding the phone

On first run the app asks: **Папа**, **Мама**, or one of the children old enough
to carry one. Parents see the whole day and can change anything. A child sees
only their own classes and the outings they are part of, and has neither the
calendar editor nor settings.

The role lives on the device. This is politeness rather than security — the data
sits on the phone in full either way, and a determined child could read it. Real
separation would need per-person keys, which is a larger change than it sounds.

## Screens

**`Сегодня`** shows one movement at a time — one drive or one walk, never the
whole outing.

A step is not closed by the clock. If the departure time passes and nothing says
you actually left, the countdown becomes **«Опаздываем на N»** and the arrival is
recomputed from now rather than from the plan; the step stays put instead of
sliding on to the next place. Two buttons — *выехали* and *на месте* — settle it,
and an arrival more than a few minutes behind schedule is named on the leg: «на
23 мин позже плана (13:41)». A step closes itself only long after its arrival
time, so the screen can never get permanently stuck.

When the fix is fresh and accurate the two buttons disappear entirely and the
screen just says it is watching; they come back when the signal is stale, the
accuracy is hopeless, tracking is off — or when a step is already overdue, which
usually means an unplanned stop the app cannot see.

`Настройки → Подсказывать по местоположению` does those two taps for you where it
can: if the phone is still at the origin past departure it knows you have not
left, and it can tell when you have arrived. Location is only ever a hint — a web
app gets no background location on iOS, so everything works the same without the
permission, just with more tapping. The teacher's name appears here and nowhere else, because it
only matters for the thing you are about to drive to. The rest of the day
follows immediately underneath, with no reserved blank space, filtered to what
is still ahead.

Every card that has a real second option carries **one question in the app's own
voice** with a tick and a cross:

> Я предложил идти пешком — может, дети дойдут сами?  ✓ ✗

Each question appears about ten minutes before the moment it has to be answered
and goes quiet ten minutes after — a question you cannot act on yet is only noise
on the one screen that should stay calm. The tick accepts and it goes quiet for
the day; the cross rebuilds the day the other way. Both answers are counted, so a repeated preference eventually
stops being asked. Everything decided by hand rolls back on one line at the foot
of the day. The questions are: walk instead of collecting, drive instead of
walking, wait out instead of coming home, and collect instead of letting them
make their own way.

If location is on and she simply drives to the next place during a free window,
the app notices and moves the window there rather than asking about it — the
decision was made by driving.

Free windows appear in green with where you will be; children left to get home
alone, and children left at home longer than their own limit, appear in amber.

**`Календарь`** (calendar icon) is the timetable — seven days of classes, no
driving. Overlapping classes step to the right so a clash reads as a clash. Tap
a class to edit its name, teacher, place, days, times, who attends and how the
drop-off and pick-up work. One **+** offers a weekly class or a one-off event. A class shared by several
children is one row and edits reach all of them. Anything the app had to guess sits on the
event it belongs to, not in a list somewhere else.

**Пожелания** — each class takes a free-text remark, read by a small local
parser: «приезжать за 20 минут до начала» sets the lead time, «не позже 18:40»
the pick-up window, «сами дойдут» clears the must-collect flag. It prints back
what it understood rather than changing things silently, and needs no network
and no model.

**`Настройки`** (from inside the calendar, one level deeper) is technical only —
children (name, emoji, how long alone at home, how long in the car), addresses,
planner limits, routing source, notifications, data. Addresses are
typed however you like and picked from what OpenStreetMap finds, each candidate
saying whether it is an exact building.

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
| `В машине не дольше` | per child — unlimited for the older ones, two hours for the little ones. An outing is rejected only when it exceeds the limit of the child actually sitting in it |
| `Один дома не дольше` | per child; a longer unattended stretch shows as a warning |
| `Штраф за пропуск` | optional pick-ups (children who *can* walk home) may be dropped if collecting them needs a whole extra outing |
| `Парковка и подход` | the friction that decides walk vs. drive for a short single errand |
| `Пешком не дальше` | walking cut-off |

### The long-ride question

A long ride-along is a judgement call, not a rule. The app plans the day twice —
once respecting the ride cap, once ignoring it — and if dropping the cap would
save outings it asks, rather than deciding:

> Можно обойтись **на 3 выезда меньше**, если Ксю поедет кататься с мамой —
> 2 ч 18 м в машине.  **Да, поедет** · **Нет, домой**

The answer is remembered for that day only, and after the same answer three
times it stops asking. Nothing is asked when there is nothing to gain.

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
| Live traffic | on the web, no | free-flow times × a Moscow congestion curve by hour (×1.26 at 13:00, ×1.70 at 18:20, damped at weekends) |
| Live traffic | in the native shell, **yes and free** | `MKDirections.calculateETA()` via `native/plugin/AppleRoute.swift` — real travel times, no key, no quota |

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

### The native route — `native/`

A Capacitor shell whose only job is local notifications: iOS schedules them
itself, so they fire with the app closed, with no server, no keys and nobody
else in the loop.

The interface is not duplicated. `server.url` points at the same GitHub Pages
build, so screen changes still arrive without rebuilding anything — the shell
needs rebuilding roughly never. Inside it the app schedules the coming week
directly and the Cloudflare worker is not used at all; settings says so.

iOS keeps at most 64 pending local notifications per app, so the nearest 60 are
scheduled and rewritten every time the app is opened.

Build on a Mac with `native/README.md`. A free Apple ID is enough — **local**
notifications need no paid membership; it is push that does. The free signing
certificate lasts 7 days, after which Xcode has to run it again; the $99/year
programme turns that into a year and adds TestFlight.

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
