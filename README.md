# Маршрут

A minimalist PWA that tells a parent when to leave to drop off and pick up
several children, and works out the fewest car trips that make the day possible.

Live: **https://ivanzhustrov79-commits.github.io/mom_route/**

No build step, no framework, no server, no account. Everything runs in the
browser and all data stays in `localStorage` on the device.

---

## Screens

`Сегодня` is all the driver needs — a countdown to the next departure and
today's outings. The calendar icon opens `Неделя`, seven days from today. The
settings icon lives *inside* the week view, one level deeper, so the day-to-day
screen carries no knobs at all.

## Setting it up

`Настройки → Дети → ребёнок → занятие`: place, weekdays, start and end, whether
a drop-off and/or pick-up is needed, how early to be there, the pick-up window
(`не раньше` / `не позже`), how long the pick-up itself takes, and whether the
child may be met on foot. Addresses are geocoded through OpenStreetMap.

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

A web app cannot run in the background on iOS: while open it holds a screen
wake-lock and ticks every 10 s, and when closed iOS gives it no timer. A native
build would schedule `UNCalendarNotificationTrigger` local notifications a day
ahead and refresh them on a `BGAppRefreshTask`; `js/planner.js` is pure functions
over a state object and ports across unchanged. A native app would also get
traffic-aware ETAs free from `MKDirections.calculateETA()`, with no API key.

## Files

```
index.html          screens, no framework
style.css           the whole design; light + dark via prefers-color-scheme
js/state.js         data model, defaults, localStorage
js/travel.js        geocoding, routing matrix, traffic model
js/planner.js       stop building, feasibility, DP optimiser, conflict detection
js/notes.js         text schedule parser
js/notify.js        30/10/0 alerts, dedupe, wake-lock
js/ui.js            router, rendering, field binding
sw.js               offline shell + notification click
test/headless.js    node test/headless.js — exercises the planner without a browser
```

## Privacy

The app ships with an empty template. Home addresses, children's names and
schedules are entered on the device and never leave it — there is no server and
no analytics. Keep real schedules out of this repository.

## Running locally

```
python -m http.server 8123 --bind 0.0.0.0 --directory .
```
