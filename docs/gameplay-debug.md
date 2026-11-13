# Faza 5 — univerzalni Gameplay Debug

Postojeći RS panel proširen je u **Gameplay Debug**. Dostupan je u development
igri, u Duel i Training režimu, preko sklopljenog dugmeta desno. Parametar
`?gameplayDebug` odmah otvara panel; raniji `?rightStickDebug` i test flag
`rightStick` ostaju kompatibilni. Novi test flag je `gameplay`.

## Četiri odvojene činjenice

- **Requested:** komanda i njen ID, igrač, revision i vreme zahteva.
- **Decision:** accepted, rejected, queued, deferred ili cancelled, uz razlog.
- **Gameplay effect:** potvrđen efekat nakon promene gameplay stanja ili
  izmerenog pomeraja tela. Accepted sam po sebi ne postaje executed.
- **Final pose:** povezana prijava završnog Character prolaza, posle FK i IK-a.
  Beleži stvarne vlasnike slojeva i podatke o primenjenom klipu. Promena gameplay
  moda sama po sebi ne postaje dokaz da je određeni GLB klip primenjen.

Primer: Q bez lopte može prihvatiti `post` mod; BODY pokazuje da li se stvarno
primenjuje `SHAQ_DEFENSE_SEQUENCE_V01`, njegovu fazu, težinu, vreme i broj
uzorkovanih kostiju. Eksplicitna komanda za ruke može imati završni arm IK
prioritet dok trup i noge i dalje koriste snimljenu sekvencu.

Izostanak korelisane poze ne predstavlja automatsku grešku. Inbound pokreće
loptu bez posebnog klipa za bacanje, a vrlo kratka komanda može završiti između
dva rendera. Korelacija zahteva odgovarajuće završno stanje, isti command ID,
te najnoviju izvršenu komandu te vrste u tekućoj sesiji; prozor je 3 s simulacije.

## Panel

**GAMEPLAY** prikazuje komandu, objedinjeni input, poslednji keyboard/touch
događaj, gamepad/gate, mod, posture i upper-body stanje, vlasnike nogu, stopala,
trupa, ruku i glave. Aktivni walk i defense klipovi imaju fazu/težinu i broj
primenjenih putanja. Broj kostiju klipa odnosi se na primenu pre završnog IK-a;
vlasnik ruku pokazuje kada IK zatim preuzima te kosti. Prikazani su izmerena
brzina, podrška stopala, stanje/vlasnik lopte, dribble skill i postojeće IK provere.

**COMMAND HISTORY** drži poslednje 32 komande po igraču, sa filterima za
odbijene/otkazane, komande bez potvrđenog izvršenja, kretanje, stav i inbound.
Red se otvara za četiri faze i detaljne podatke. Pri resetu/promeni sesije istorija
panela počinje novu revision; snimljeni JSON i dalje čuva prethodne epohe.
P1/P2 imaju odvojene prikaze; Free Movement prikazuje samo aktivnog P1.

**RS DETAILS** čuva postojeće vektore, mapiranje, anatomske strane i neutral gate.
Otvaranje panela ili promena taba ne pokreću novu animacionu ili physics petlju.
Panel se osvežava na 10 Hz i skroluje unutar postojećih granica za touch kontrole.

## Potvrde izvršenja

- Kretanje dobija izvršenje tek nakon više od 1 cm stvarnog horizontalnog
  pomeraja tela uz aktivan movement intent; željena brzina nije dovoljan dokaz.
- Stav/special beleži rezultat promene moda; Q priča i dalje pripada gameplay-u.
- Charge, contest, promena ruke, jab i prelaz na dribble potvrđuju se nakon
  stvarne promene odgovarajućeg stanja. Shoot release tek nakon lansiranja šuta.
- RS gestovi zadržavaju postojeće accepted/rejected/queued/cancelled odluke.
  Defensive izvršenje potvrđuje aktivni završni arm IK, a crossover posmatranje
  zahteva da je odgovarajući ball skill stvarno počeo uz ball-hand IK.
- Inbound zahtevi iz keyboard/touch bridge-a, gamepada i UI-a prolaze kroz
  isti audit: queued zahtev dobija accepted/executed tek pri stvarnom launch-u
  ili positioning promeni; neuspeh dobija razlog, zamenjeni zahtev cancelled.
- Pause/resume, flush, reset, promena lika i konfiguracije ostaju zasebni
  događaji na postojećem timeline-u, sa svojim izvorom i revision granicama.

## Snimanje i ograničenja

RECORD, STOP, EXPORT JSON i RECENT 30s JSON ostaju lokalni. Snimanje i rolling
buffer rade i kada je panel zatvoren. Postojeći schema v1, ograničenja
30 s recent / 60 s capture, checkpoint-i, bounded storage i deklarisani
external command IDs ostaju isti. Kontekst sada navodi zasebni animation
manifest i SHA-256 defense GLB-a uz osnovne modele.

Observer ne menja komande, kostur, animacione težine, IK, loptu ili Rapier telo.
Prijavljeni slojevi i numeričke provere su dijagnostika; vizuelna ispravnost se
i dalje proverava u browseru. Produkcija nema widget, recorder sadržaj niti
novi `getGameplayDebug` test adapter. Automatsko slanje podataka nije uvedeno.

## Provera

```bash
node --import tsx --test --test-isolation=none tests/gameplay-debug.test.ts tests/motion-recorder.test.ts
npx playwright test tests/browser/gameplay-debug.spec.ts tests/browser/motion-diagnostics.spec.ts
```

CPU provere pokrivaju razliku između četiri faze, bounded/detached istoriju,
P1/P2 i revision izolaciju, odbijene/završene/zamenjene komande, matcher i
isključen produkcioni recorder. Browser scenariji koriste stvarne keyboard,
touch i gamepad putanje, walk/Q klipove, jab/dribble/šut, inbound, izbor igrača,
reset, RS detalje, mobilne kontrole i postojeći JSON export.
