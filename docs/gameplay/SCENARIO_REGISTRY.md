# Gameplay Foundation v2 — registar scenarija

Statusi se odnose na nove kriterijume v2, ne na postojanje dugmeta ili stare animacije.
Datum baseline-a: 2026-11-07, `465f6e0`. Napredak slice-ova vodi
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md); stvarni rezultati testova su u
[REGRESSION_BASELINE.md](REGRESSION_BASELINE.md).

## Zajednički setup i postupak

Sledeće pozicije su ponovljivi **predlozi budućih fixture-a**, a ne tvrdnja da su
svi scenariji već automatizovani. Metri, Y nagore, parket Y=0, koš
`(1.575, 3.05, 0)`. Pozicije tela navode centar kapsule pri spawn-u; solver određuje
konačnu visinu. Ne postavljati model direktno. Seed=42, P1 Shaq/P2 Chuck; ponoviti
sa zamenjenim modelima. CPU isključen osim eksplicitnog testiranja njegove reakcije.

| Profil | P1 `(x,y,z)`   | P2 `(x,y,z)`   | Namena                             |
| ------ | -------------- | -------------- | ---------------------------------- |
| N      | `(5.9,.95,.5)` | `(4.3,.95,.2)` | Normalan duel                      |
| O      | `(6,.95,0)`    | `(10,.95,-3)`  | Izolovan napadač                   |
| P      | `(3.6,.95,0)`  | `(2.65,.95,0)` | Kontakt, P1 okrenut leđima ka košu |
| D      | `(5,.95,1.5)`  | `(5,.95,3.4)`  | Inbound denial                     |
| L      | `(1.65,.95,0)` | `(3,.95,1.2)`  | Završnica/obruč                    |
| T      | `(8.8,.95,0)`  | `(10,.95,-2)`  | Daleki šut                         |

Posed `P1 hold/dribble` označava kontrolisanu loptu; `none` slobodnu/dead-ball
loptu prema redu. Energija je `[P1,P2]` od 100. Svaki red eksplicitno daje posed i
energiju. Smerovi input-a su **svetski pravci**, pretvoreni kroz postojeći camera
input helper; nisu pretpostavka da W uvek znači pravac koša. Nove komande su
semantičke namere iz [ugovora](INPUT_CONTRACT.md), još nisu nove implementirane tipke.
Trajanja su predlozi kontrolisanih proba; kod budućih testova vezati ih za tick.

Svaka vizuelna provera zahteva oba modela, gameplay i bliski bočni/frontalni pogled,
uz prikaz faza i kontaktnih markera po potrebi. Pregledati ceo pokret i oporavak;
endpoint screenshot nije dokaz ciklusa. Ponoviti pri normalnom i usporenom renderu,
uz zabeležen stvarni FPS i isti 60 Hz gameplay. Za S01 dodati 20/30/60/120 Hz unit probe.

U tabelama `Partial` znači postojeći test srodne funkcije, bez pune v2 pokrivenosti.
**SC-001 je `Verified` u navedenom S01 opsegu i okruženju; ostalih 29 ostaje `Not Verified`.** `Verified` zahteva izvršene
asertacije, pregled navedenih kadrova i zapis artefakta/rezultata; ne dodeljuje se
automatski po prolasku starog testa.

## Lopta, kretanje i balans

| ID / slice                                 | Start; posed; energija           | Input sekvenca                                                      | Očekivani događaj i stanje tela/lopte                                     | Vizuelni kriterijum                                                            | Automatizacija / status                                                                                                                      |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-001 / S01 — Standing dribble            | S01-O; P1 dribble; `[100,100]`   | Mirovanje ≥3 cela ciklusa levom pa desnom rukom, ponovljeni ciklusi | Potisak → release → pod → povratak; jedan vlasnik lopte, pod na radius-u  | Dlan i lakat rade kroz ceo ciklus, šaka ne ide do poda; kontakt samo u prozoru | Verified: `dribble-contact.test.ts`, `browser/slice2.spec.ts`, S01 phase screenshot-i; vidi dokaz ispod.                                     |
| SC-002 / S01 — Walking dribble             | O; P1 dribble; `[100,100]`       | 2 s napred, 1 s bočno, stop                                         | Kontinuirana putanja lopte i smena oslonca; stop bez prekida bounce-a     | Aktivna šaka uz kuk, nema klizanja stopala ili bežanja lopte pri okretu        | Partial: `slice2.spec.ts`, `locomotion.spec.ts` u `tests/browser/`. Not Verified                                                             |
| SC-003 / S06 — Crossover while stationary  | O; P1 dribble desno; `[100,100]` | Skill levo kroz crossover pa mirovanje; ponoviti obrnuto            | Definisan handoff i povratak; P1 nema automatski bočni prodor             | Lopta prelazi telo neprekinuto, nijedna ruka je ne prati do poda               | Partial: `dribble-contact.test.ts`, `browser/slice2.spec.ts`; fazna tehnika nedostaje. Not Verified                                          |
| SC-004 / S06 — Crossover during movement   | O; P1 dribble; `[100,100]`       | Kretanje napred, Skill u drugu ruku, zatim zaseban Drive            | Kontinuitet putanje/brzine; promena pravca tela nastaje od naredne namere | Prenos težine i oporavak odvojeni od handoff-a                                 | Partial: `browser/slice2.spec.ts`; drive/tehnika nedostaju. Not Verified                                                                     |
| SC-005 / S03 — Walk to hustle              | O; P1 dribble; `[100,100]`       | Move .5 tokom 1 s; Move 1 + Hustle 1 s; otpusti                     | Odmah registrovana namera, postupno ubrzanje i potrošnja energije         | Naginjanje, dužina/tempo koraka i rad ruku prate stvarnu brzinu                | Planned; `movement.test.ts` i `gait.test.ts` pokrivaju samo postojeću osnovu. Not Verified                                                   |
| SC-006 / S03 — Acceleration and heavy stop | O; P1 dribble; `[100,100]`       | Move 1 tokom 1.2 s; neutral 1 s; obrni smer                         | Merljivo ubrzanje i kočenje po profilu; bez klizanja kroz igrača/granice  | Teški koraci, kontrolisan nagib i povratak u balans                            | Partial: `movement.test.ts`, `browser/locomotion.spec.ts`. Not Verified                                                                      |
| SC-007 / S03 — Defensive lateral shuffle   | N; P2 hold; `[100,100]`          | P1 DefensiveStance + Move lateralno 1 s u oba smera                 | Defanzivno kretanje uz oslonac i zadržanu orijentaciju                    | Ne ukršta noge neplanirano; stopala ostaju iznad poda                          | Partial: `browser/locomotion.spec.ts`, `stance.spec.ts`. Not Verified                                                                        |
| SC-008 / S04 — Body-up collision           | P; P1 hold; `[100,100]`          | P1 napred ka P2 .8 s; P2 Brace .8 s; otpusti                        | Kontakt normal, otpor i gubitak balansa po masi/brzini; bez teleportacije | Ramena/težište reaguju, kapsule i tabani se slažu                              | Partial: blocked-push segment `browser/locomotion.spec.ts` proverava postojeći vizuelni brace; gameplay balans/brace nedostaju. Not Verified |
| SC-009 / S04,S10 — Post-up resistance      | P; P1 hold; `[100,100]`          | P1 Post + Move ka košu 1 s; P2 Brace, zatim popusti                 | Otpor sprečava beskonačno besplatno guranje; energija i recovery          | Koraci unazad, oslonac, kontakt nadlaktice i zaštićena lopta                   | Partial: `browser/post-motion.spec.ts`; budući otpor/recovery nedostaju. Not Verified                                                        |
| SC-010 / S05 — Triple threat               | N; P1 hold; `[100,100]`          | Catch → neutral .5 s; menjaj smer pogleda/Skill bez koraka          | Jedno pivot stopalo, zaštićena lopta; nema početka driblinga bez namere   | Oba dlana kontaktiraju loptu, kolena/karlica spušteni bez propadanja           | Partial: `hand-contact.test.ts`, `browser/held-ball.spec.ts`; legalni pivot nedostaje. Not Verified                                          |
| SC-011 / S05 — Jab step and recovery       | N; P1 hold; `[100,100]`          | Kratak Move tap; oporavak; ponovi 3 puta; zatim drži Move           | Jab bez travel-a, svaki ima trošak/oporavak; držanje započinje dribling   | Pivot anchor miruje, vodeća noga se vraća, nema drifta                         | Partial: `held-movement.test.ts`, `browser/held-ball.spec.ts`; budući ugovor pivota/cost nedostaje. Not Verified                             |
| SC-012 / S06 — Defender overcommitment     | N; P1 dribble; `[100,100]`       | P2 unapred odredi reakciju, P1 crossover; tek potom Drive           | Greška odbrane zavisi od balansa/tajminga; nema garantovanog stuna        | Vidljiv pogrešan oslonac i oporavak; bez automatskog pomeranja P1              | Planned; postojeći seeded jab bite nije dokaz ove tehnike; test scenarija nedostaje. Not Verified                                            |

## Dodavanje, šut i odbrana

| ID / slice                               | Start; posed; energija                           | Input sekvenca                                                      | Očekivani događaj i stanje tela/lopte                                             | Vizuelni kriterijum                                                                      | Automatizacija / status                                                                             |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| SC-013 / S07 — Inbound lob over defender | D; inbound P1, lopta `(5.2,1,7.85)`; `[100,100]` | Čekanje 5 s; Q u pass prozoru; P2 pokušava Reach kroz putanju       | Lob preko fronting-a; stvarni dinamički let, catch ili tajmingom dozvoljena krađa | Visina luka, oba dlana pri catch-u, nema hominga; deep-paint varijanta udara tablu/obruč | Partial: `inbound-passing.test.ts`, `browser/inbound.spec.ts`. Not Verified                         |
| SC-014 / S07 — Running to catch a pass   | D; inbound P1; `[100,100]`                       | P1 lateralno .5 s; Q u prozoru; nastavlja prema prijemnoj zoni      | Predikcija cilja pri izbačaju, bez kasnijeg navođenja; promašaj postaje loose     | Ruke se pripreme, hvatanje amortizuje kontakt, lopta ne skače u šaku                     | Partial: `browser/inbound.spec.ts`; predikcija/recovery još nedostaju. Not Verified                 |
| SC-015 / S08,S09 — Normal jump shot      | O; P1 hold; `[100,100]`                          | Shoot priprema, različito trajanje pa release; ponovi istu poziciju | Jedan izbačaj, realna brzina/luk, bodovi samo prolaskom kroz obruč                | Noge → trup → ruke → wrist follow-through, vidljiv oporavak                              | Partial: `browser/gameplay.spec.ts`; sadašnji scripted `made` nije fizičko bodovanje. Not Verified  |
| SC-016 / S05,S08 — Shot fake and pivot   | N; P1 hold; `[100,100]`                          | Kratka priprema + cancel; pivot suprotno; Shoot release             | Finta ne oslobađa loptu; anchor ostaje; samo pravi release kreira let             | Odbrana može da nasedne; bez pucanja ramena ili promene pivot noge                       | Planned; treba razrešiti tap/fake/smash prioritet. Not Verified                                     |
| SC-017 / S09 — Bank shot                 | P1 `(3.6,.95,2)`, P2 O; P1 hold; `[100,100]`     | Aim tabla, Shoot release sa nekoliko jačina                         | Prvi kontakt tabla, zatim fizički obruč/pod/out; bez garantovanog pogotka         | Vidljiv ugao udarca i odskok, mreža reaguje na stvarnu loptu                             | Planned; postojeći hoop test nije test kompletnog fizičkog šuta. Not Verified                       |
| SC-018 / S10 — Hook shot                 | P; P1 hold; `[100,100]`                          | Post → pivot/drop → Hook release, leva i desna strana               | Legalan oslonac, zaštita loptom/ramenom, dinamički let i recovery                 | Bočni luk ruke, jedna ruka izbacuje; druga ne prolazi kroz telo                          | Planned; postojeći `hookRange/hookArc` ne potvrđuje tehniku. Not Verified                           |
| SC-019 / S11 — Running floater           | P1 `(4.5,.95,0)`, P2 L; P1 dribble; `[100,100]`  | Drive prema košu .7 s → Floater                                     | Skup koraka, visok kratak izbačaj pre blokera, doskok i nastavak                  | Meki wrist, kraći follow-through, nema preskoka catch/release stanja                     | Planned. Not Verified                                                                               |
| SC-020 / S11 — Contact step-back         | P; P1 dribble; `[100,100]`                       | Brace/contact → StepBack → zaseban Shoot                            | Prostor iz kontakta/koraka uz energiju i balans; bez teleportacije                | Zadnji oslonac, odgurivanje, stop pa šut, stabilna lopta                                 | Planned. Not Verified                                                                               |
| SC-021 / S12 — Vertical contest          | N; P2 priprema šut; `[100,100]`                  | P1 HandsUp pa Jump u trenutku release-a                             | Vertikalan skok/contest; kontakt i doskok po fizici, bez magnetnog bloka          | Ruke gore, očuvan prostor tela, stopala dobijaju stabilan doskok                         | Planned; runtime ima ground contest, ali namenski test i vertikalna odbrana nedostaju. Not Verified |
| SC-022 / S12 — Rebound jump              | L; none, lopta `(2.2,4,0)` u padu; `[100,100]`   | Oba prilaze, Jump/Reach sa različitim tajmingom                     | Samo jedan posed pri realnom dohvatu; promašaj ostaje loose; kontakt/doskok       | Jedna ili dve šake hvataju, lopta ne skače kroz glavu, balans pri sletanju               | Planned; običan auto-pickup nije skok za loptu. Not Verified                                        |

## Spektakl, lifecycle i energija

| ID / slice                                 | Start; posed; energija                                   | Input sekvenca                                                   | Očekivani događaj i stanje tela/lopte                                                       | Vizuelni kriterijum                                                               | Automatizacija / status                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-023 / S13 — Monster dunk and hang       | L; P1 hold; `[100,100]`                                  | Drive → Dunk → Grip → Hang → Release → doskok                    | Dohvat/vrhovi prstiju odgovaraju obruču; masa savija konstrukciju; kontrolisano oslobađanje | Shaq podiže i širi noge dok se ljulja; stvarni grip bez dugih trouglova; oporavak | Partial: `three-resources.test.ts` proverava opruge/reset; automatizovani full-cycle dunk test nedostaje; ograničeni smoke je u baseline-u. Sadašnji vizuelni hang nije fizička suspenzija. Not Verified |
| SC-024 / S14 — Backward flop               | P; P2 hold; `[100,100]`                                  | P1 brzi dupli Post/Flop pri kontaktu                             | Pad ima faze, cenu i kontrolisan kontakt sa podom; nije trenutni stun teleport              | Težište unazad, ruke zaštite, telo sleti pre ležanja                              | Planned; ograničeni browser smoke pada je u baseline-u; automatizovani full-cycle test nedostaje, postojeća down animacija nije fazni pad. Not Verified                                                  |
| SC-025 / S14 — Multi-stage recovery        | P; none, lopta `(4,.13,1)` miruje; `[60,100]`            | P1 u down stanju; Recovery tapovi sa/bez protivnika blizu        | Leži → sedi/klek → oslonac → stoji; različita vremena/prekid po ugovoru                     | Telo ne ustaje jednim skokom; šake i kolena imaju razumljiv kontakt               | Planned; down/mash i smoke povratka u idle postoje; fazni oporavak i njegov test nedostaju. Not Verified                                                                                                 |
| SC-026 / S14 — Leg-grab attempt            | P; P2 dribble, P1 down; `[40,100]`                       | P1 Reach ka dostupnoj nozi; ponovi van dohvata                   | Dozvoljeno samo iz ground stanja; uspeh/rizik/oporavak, bez vezivanja na daljinu            | Šaka stvarno doseže nogu; P2 reaguje i može zadržati balans                       | Planned. Not Verified                                                                                                                                                                                    |
| SC-027 / S14 — Ball smash                  | P; P1 hold; `[100,100]`                                  | P1 propisan Smash gest; ponovi van dometa i tokom recovery-a     | Jedan stvarni udar, energija, prekid poseda/loose prema kontaktu                            | Ruka prati udar, lopta ima kontinuitet položaja/brzine i nema hominga             | Planned; triple-tap postoji u runtime-u, browser scenario i novi kontaktni ugovor nedostaju. Not Verified                                                                                                |
| SC-028 / S15 — Opening shoot-out           | T, oba redom na istoj poziciji; dead ball; `[100,100]`   | Početak duela, naizmenični šut, tie-break po definisanom pravilu | Otvarački posed određuje raspucavanje; nema skrivenih starih tajmera                        | Jasna promena učesnika/pripreme, ispravni score/phase prikazi                     | Planned. Not Verified                                                                                                                                                                                    |
| SC-029 / S15 — New Duel reset              | N nakon završenog meča; dead ball; `[10,20]` pre reset-a | Pause/New Duel; ponovi tokom leta, pada i hang-a                 | Posed, energija, score, physics i svi action/recovery tajmeri očišćeni; novi shoot-out      | Bez stare poze/privremene lopte/visenja; input ne ostaje pritisnut                | Partial: `stores.test.ts`, `browser/input.spec.ts`, reset helper; kompletni shoot-out reset nedostaje. Not Verified                                                                                      |
| SC-030 / S03,S16 — Exhaustion and recovery | O; P1 dribble; `[10,100]`                                | Move/Hustle pokušaj; odmor; isti potez pri 40/70/100 energije    | Progresivan pad kapaciteta i oporavak, ista namera odmah prepoznata                         | Vidljiv zamor, teži koraci, bez naglog prebacivanja pune brzine na jednom pragu   | Partial: `simulation.test.ts` proverava samo HUD zamora; progresivni model i ponašanje kroz energije nedostaju. Not Verified                                                                             |

## Kako dopunjavati dokaz

Pre prihvatanja reda dodati tačan test/title, command/replay fixture, opažene
metrike i tolerancije, datum/commit, oba modela, render režim, link do lokalnih
artefakata i ko je pregledao sekvencu. Ne povezivati buduću datoteku kao postojeći
test. Putanje testova gore su relativne prema `tests/`, osim eksplicitno navedenih.
Baseline pad ostaje zapisan i kada kasniji ciljani rerun prođe.

## Izvršeni dokaz S01

SC-001: fixture **S01-O** = P1 `(5,.95,0)`, P2 `(9,.95,-4)`, seed 42, energija
100, testMode. Oba modela u ulozi P1; dopunska vizuelna proba menja i protivnički
model. Scenario je verifikovan za stacionarni ceo ciklus, obe ruke i oba modela:
unit 20/30/60/120 Hz, browser default/cap20 i pet faznih kadrova front/side.
Stvarni browser FPS je ~9–10, ne 60/120. Dokaz, pragovi, komande, artefakti i
ograničenja su u [S01 izveštaju](S01_IMPLEMENTATION_REPORT.md).

SC-002: S01 proverava putanju/kontakt tokom kretanja, okreta i crossover-a, ali
scenario ukupnog kretanja ostaje `Not Verified` dok su Chuck gait/sampling
regresije otvorene. SC-003/004 imaju proverenu postojeću predaju ruke; buduća S06
fazna tehnika i reakcija odbrane nisu time implementirane. Prihvatanje slice-a
ostaje odvojeno od statusa pojedinačnog scenarija i vodi se u tracker-u.
