# Gameplay podešavanja i dijagnostika

Pregled trenutnog koda: 2026-11-07, referentni `main` `465f6e0`.
S00 ovde beleži postojeće vrednosti i plan merenja; ne menja balans, kod, kameru,
kontrole ili GLB modele. Status realizacije vodi
[implementation tracker](IMPLEMENTATION_STATUS.md).

## Izvori i jedinice

Kanonski izvor postojećih gameplay vrednosti je
[game-config.json](../../src/game/data/game-config.json), a pozicija terena/koša i
početni raspored su u [level-1.json](../../src/game/data/level-1.json).
[gameConfig.ts](../../src/game/data/gameConfig.ts) izvozi ih bez mutiranja importovanog
JSON-a i izvodi `camera.inputAngle` iz položaja i target-a kamere. Zato JSON vrednost
`camera.inputAngle: 0` nije efektivni ugao komandi.

Koordinate: metri; `x` duž terena, `z` popreko, `y` nagore. Vremena su sekunde,
brzine m/s, masa kg; pragovi inputa i multiplikatori su bezdimenzioni osim gde je
drugačije navedeno. Seed je ceo broj. Geometrijske dimenzije su takođe definisane u
[court/constants.ts](../../src/game/court/constants.ts); ne menjati samo jedan izvor
ako ista vrednost učestvuje i u geometriji i u gameplay proveri.

`plan.md` štiti postojeća `camera.*` podešavanja: height 5,95 m,
horizontalDistance 24,3 m, pravac kompozicije, frameLength 10 m i ograničenje kadra
za ceo luk trojke. Gameplay tuning ih ne menja bez korisničkog zahteva. Front/side
inspection pogledi iz test seam-a služe dijagnostici. Putanje modela, geometrija,
teksture i skeleton kompatibilnost ostaju postojeći.

## Aktivna podešavanja i vlasnici

Ovo je mapa glavnih aktivnih parametara, ne druga kopija celog JSON-a. Vrednosti se
menjaju u izvornom fajlu tek u odgovarajućem slice-u, uz test i zabeležen rezultat.

| Oblast / ključevi u `game-config.json`                                                         | Trenutno                           | Jedinica / značenje                                                           | Vlasnik                                                        |
| ---------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `player.shaq` mass / height / speed / power / accuracy                                         | 150 / 2.16 / 2.65 / 1.4 / 0.72     | kg / m / m/s / multiplikator / koeficijent preciznosti                        | `DuelArena` collider; `Duel` gameplay                          |
| `player.chuck` mass / height / speed / power / accuracy                                        | 138 / 1.98 / 3.1 / 1.05 / 0.91     | Iste jedinice kao za Shaqa                                                    | Isti vlasnici; visina rig-a se zasebno meri iz modela          |
| `physics.gravity`, `timestep`                                                                  | `[0,-16,0]`, 60                    | m/s²; fizički koraci/s                                                        | `SceneRoot`, pre/posle-step hook-ovi `DuelArena`               |
| `physics.radius`, `halfHeight`, `bodyY`                                                        | 0.42 / 0.5 / 0.95                  | m; kapsula: radius/polusegment, početna spawn visina                          | `DuelArena`; nominalno oslonjeno središte je 0.92 m, ne 0.95 m |
| `physics.damping`, `floorFriction`, `ballRestitution`, `contactPadding`                        | 5 / 0.8 / 0.72 / 0.23              | Damping / koeficijenti / m dodatka za kontakt                                 | Rapier konfiguracija; `Duel` kontakt prag                      |
| `movement.accelTime`, `brakeTime`                                                              | 0.4 / 0.28                         | s do pune brzine / kočenje pri limiteru; trenutno zajednički profil           | `movement.approachVelocity`, `Duel`                            |
| `defense.guardRange`, `denyBallBias`, `slideSpeed`                                             | 3.2 / 0.6 / 0.75                   | m / težina orijentacije / multiplikator brzine                                | `Duel.defensiveFacing` i kontrola kretanja                     |
| `player.energyMax`, `exhaustedThreshold`                                                       | 100 / 15                           | Jedinice gameplay energije                                                    | `Duel`; HUD izvodi prikaz                                      |
| `player.moveDrain`, `postDrain`, `recovery`, `slowRecovery`                                    | 7 / 12 / 24 / 12                   | Energija/s; postDrain se dodaje moveDrain-u                                   | `Duel` fiksni tick                                             |
| `player.exhaustedSpeed`, `postSpeed`, `chargingSpeed`, `exhaustedPush`                         | 0.42 / 0.74 / 0.35 / 0.4           | Multiplikatori, trenutno skokovit exhausted prag                              | `Duel`                                                         |
| `player.spinCost`, `smashCost`, `flopCost`, `shotCost`                                         | 20 / 18 / 12 / 8                   | Energija po akciji                                                            | `Duel` akcije; nisu potpuni fazni ugovori                      |
| `player.postImpulse`, `normalImpulse`, `bumpCooldown`                                          | 4.8 / 1.8 / 0.5                    | Dodaci horizontalnoj brzini pre power/mass skaliranja, m/s; cooldown s        | `Duel` kontakt; ovi ključevi nisu Rapier impulsi u N·s         |
| `player.minMove`, `drainThreshold`                                                             | 0.15 / 0.5                         | Magnituda komande; bezdimenzioni pragovi                                      | Input/held movement i gameplay                                 |
| `player.doubleTapWindow`, `smashTapWindow`                                                     | 0.28 / 0.65                        | s; postojeće Q/R kontekstualne kombinacije                                    | `Duel`; budući input ugovor u S02                              |
| `handling.jabTapWindow`, `jabDuration`, `jabCooldown`                                          | 0.1 / 0.34 / 0.2                   | s; razlikovanje tap/hold, izvođenje i cooldown                                | `heldMovement`, `Duel`, `Character`                            |
| `handling.jabFakeRange`, `biteChance`, `jabBite`, `jabBiteSpeed`, `holdStealFactor`            | 2.6 / 0.6 / 0.42 / 2.2 / 0.35      | m / verovatnoća / s / m/s / koeficijent                                       | `Duel`; seeded bite je sadašnja aproksimacija                  |
| `ball.radius`, `reach`, `pickupHeight`, `pickupDelay`                                          | 0.13 / 1.12 / 1.7 / 0.25           | m / m / m / s                                                                 | Geometrija lopte, controller i loose-ball pickup               |
| `ballControl.period`, `transitionTime`, `crossoverForward`                                     | 0.6 / 0.16 / 0.18                  | s / s / m                                                                     | `ballHandling`, `handContactPose`                              |
| `ballControl.turnRate`, `armBlendRate`                                                         | 14 / 24                            | Stope eksponencijalnog blendovanja, s⁻¹                                       | `Duel` orijentacija / `handContactPose`                        |
| `shots.raiseDuration`, `perfectTime`, `perfectWindow`, `minHold`                               | 1.05 / 0.68 / 0.13 / 0.15          | s; prozor je ±perfectWindow oko perfectTime                                   | `Duel` charge/shot                                             |
| `shots.baseAccuracy`, `perfectBonus`, `contestPenalty`, `distancePenalty`, `exhaustionPenalty` | 0.8 / 0.22 / 0.38 / 0.045 / 0.3    | Koeficijenti; distancePenalty po metru                                        | `Duel` seeded odluka `made`, ne fizički rezultat pogotka       |
| `shots.flightDuration`, `arcHeight`, `hookArc`, `dunkArc`                                      | 1.05 / 3.2 / 1.6 / 0.35            | s / m / m / m                                                                 | Trenutna kinematička putanja šuta                              |
| `shots.dunkRange`, `dunkEnergy`, `dunkJump`, `dunkHang`, `hangPull`                            | 1.85 / 18 / 0.42 / 0.85 / 0.075    | m / energija / s / s / skala sile                                             | `Duel`, `Character`, hoop rig; nije budući fizički grip        |
| `inbound.positionTime`, `passWindow`                                                           | 5 / 5                              | s; autoritativni sat simulacije                                               | `Duel`; HUD samo prikazuje snapshot                            |
| `inbound.aiPassMin`, `aiPassMax`, `aiLateChance`                                               | 0.8 / 3.4 / 0.06                   | s / s / verovatnoća kašnjenja                                                 | CPU inbound odluka                                             |
| `ai.reaction`, `shootDistance`, `shootDelay`, `charge`, `stealInterval`, `stealChance`         | 0.2 / 4.1 / 1.4 / 0.68 / 1.8 / 0.2 | s / m / s / s / s / verovatnoća                                               | `Duel.cpu`; nije budući zajednički intent adapter              |
| `score.winTarget`, `inside`, `outside`                                                         | 7 / 1 / 2                          | Bodovi                                                                        | `Duel`; opening shoot-out je budući S15                        |
| `effects.hudInterval`                                                                          | 0.08                               | s; objavljivanje HUD snapshot-a uz ponovno korišćenje nepromenjenih vrednosti | `Duel`, `hudSnapshot`                                          |

### Ruke, lopta i koraci

| Parametar                         | Shaq | Chuck | Jedinica / vlasništvo                                 |
| --------------------------------- | ---- | ----- | ----------------------------------------------------- |
| `ballControl.<legend>.holdHeight` | 1.48 | 1.37  | m iznad lokalnog poda; `ballHandling`                 |
| `holdForward`                     | 0.32 | 0.29  | m ispred tela                                         |
| `postDrop`                        | 0.18 | 0.16  | m smanjenja cilja lopte u postu; ne spuštanje kapsule |
| `hipSide`                         | 0.47 | 0.43  | m bočno za normalan dribling                          |
| `dribbleForward`                  | 0.26 | 0.24  | m napred za normalan dribling                         |
| `dribbleTop`                      | 1.2  | 1.1   | m visine centra lopte na vrhu; dno je `ball.radius`   |

Palm socket kalibracija je u
[palmSockets.ts](../../src/game/entities/palmSockets.ts), u lokalnim metrima svakog
stvarnog hand bone-a, sa zasebnim osama normale/prstiju. Ne zamenjivati je starim
`handling.*` offsetima. [armContact.ts](../../src/game/entities/armContact.ts) trenutno
ograničava lakat na 25–150°, pronaciju na ±85° i zglob na 65°. To su postojeće
granice u kodu, ne novododati parametri ili dokaz da je svaki pokret prirodan.

`animation.gait` ima start/stop brzine 0.18/0.08 m/s, startDistance 0.12 m,
settleDistance 0.07 m, settleYaw 0.6 rad, settleDuration 0.22 s i minFootGap 0.17 m.
`stride` forward/backward/strafe/post/defensive je 0.60/0.46/0.42/0.40/0.44
puta izmerena dužina noge; `lift` je 0.11/0.08/0.06/0.07/0.06 m.
`slowStrideScale: 0.55` skalira korak pri maloj brzini. `armSwing: 0.38` je ugaona
amplituda u radijanima. `snapDistance: 0.5` m pokreće replant pri velikom pomeraju
između render kadrova, a nije gameplay teleport dozvola.

`animation.posture` zadaje spuštanje karlice kao udeo visine kuka: upright 0.012,
hold 0.05, defensive 0.13, post 0.165; dodatno brace 0.03 i exhausted 0.09.
Osnovni posture/moving drop se kombinuje kroz maksimum, ne sabiranjem svih stavova.
`maxReachDrop: 0.1` m ograničava korekciju dohvata. Detalji i merene proporcije su u
[postojećem Slice 3 izveštaju](../slice3-locomotion.md).

### Fizičko dodavanje i prostor

| `inbound.passing.*`                                                           | Vrednost              | Jedinica / značenje                                   |
| ----------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| `chestSpeed`, `minChestTime`, `maxChestTime`                                  | 17 / 0.18 / 0.85      | m/s, s, s; vreme plana prema horizontalnom rastojanju |
| `lobRise`, `lobClearance`                                                     | 2.35 / 0.6            | m; visina luka i slobodan prostor                     |
| `denialLaneWidth`, `denialReceiverDistance`, `denialEndMargin`                | 0.75 / 2.4 / 0.05     | m / m / udeo segmenta                                 |
| `deepPaintRadius`, `boardOvershoot`, `boardAimAboveRim`, `boardLateralFactor` | 2 / 0.25 / 0.12 / 0.6 | m / m / m / udeo poluširine table                     |
| `catchRadius`, `interceptRadius`, `interceptWindow`                           | 0.22 / 0.65 / 0.25    | m / m / s                                             |
| `interceptReachAboveHead`, `interceptMinHeight`                               | 0.3 / 0.35            | m                                                     |
| `minFlightTime`, `catchGrace`, `deflectionVelocityDelta`                      | 0.05 / 0.4 / 1.2      | s / s / m/s promene brzine                            |

Vlasnici su `tacticalPass.ts` (plan) i `inboundPassController.ts` (launch, fizički
kontakt, swept catch/interception). Trenutni risky deep-paint lob menja aim prema
tabli i onemogućava automatski catch; nije sistem predikcije buduće pozicije iz S07.
Vidi [postojeći tactical inbound izveštaj](../tactical-inbound.md).

U `level-1.json`: parket ima površinu na y=0; granice igrača su x=0.15–13.85 m,
z=−7.35–7.35 m; koš je `(1.575, 3.05, 0)`, tabla x=1.2 m. Inbound ostaje na
postojećoj aut poziciji `(5.2, 1.0, 7.85)`. Spawns su `(5.9,0.95,0.5)` i
`(4.3,0.95,0.2)`, početni owner 0. S00 ne menja mesto izvođenja.

## Zamke u postojećim imenima i vrednostima

- `ball.dribbleRate: 9` i `ball.dribbleHeight: 0.9` nemaju potrošača u sadašnjem
  `src` kodu; efektivni dribling koristi `ballControl.period/dribbleTop`.
- Stari `handling.chestForward`, `postHoldDrop`, `postWristGap`, `chestHeight`,
  `palmForward`, `palmDrop`, kao i `ball.handDistance`, nemaju runtime potrošača.
  Ne podešavati ih kao da upravljaju novim IK kontaktom. Uklanjanje je zaseban
  pregledani cleanup, ne deo ove dokumentacione promene.
- `rendering.maxTriangles: 60000` i `maxDrawCalls: 90` su deklarisani budžeti bez
  runtime potrošača/automatskog ograničavanja. `getPerformance()` vraća stvarne brojeve;
  sama vrednost u JSON-u ne dokazuje da su modeli unutar budžeta.
- `hangForce` koristi 9.81 m/s² dok svet koristi −16 m/s². Razliku proveriti i
  objasniti u S13; S00 je ne ispravlja usput.
- `shots.arcHeight` je amplituda skriptovane sin putanje, ne početna vertikalna
  brzina. Budući fizički šut i inverted hold-time profil iz S08/S09 tek treba definisati.

## Dijagnostika iz §9: postojeće i nedostajuće

Zahtev je [Gameplay Tuning Mode iz kanonskog plana](SUITS_GAMEPLAY_FOUNDATION_V2_2026_11_07.md#9-gameplay-tuning-and-diagnostics).
Takav objedinjen UI trenutno ne postoji. Postojeći `window.__TEST__`, debug markeri
i mutable snapshot-i su osnova za proširenje, ne nova kontrolna putanja gameplay-a.

| Traženo polje                       | Šta je sada dostupno                                                 | Šta nedostaje / predviđeni slice                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Character / gameplay phase          | `getState()` player/opponent legend, mode, HUD phase i inbound state | Objedinjen development prikaz                                                                    |
| Active technique / technique phase  | Postojeći mode i specifični tajmeri; `ballControl.phase`             | Zajednički ugovor faza pojedinačnih tehnika, S02–S14                                             |
| Locomotion mode                     | `getLocomotion(slot)` klasifikacija i posture/upper                  | Nove hustle/drive/pivot sposobnosti, S03/S05                                                     |
| Requested speed                     | Input ose i `moving` namera, `moveVX/moveVZ` rampirano kretanje      | Eksplicitna željena brzina u istim jedinicama kao actual speed, S03                              |
| Actual speed / acceleration         | Rapier `linvel`; gait speed iz stvarnog render pomeraja              | Uzorkovana actual acceleration i jasno označen vremenski domen, S03                              |
| Stamina / balance                   | `energy` postoji; `brace` je izvedena vizuelna težina                | Gameplay balance nije isto što i brace; S04                                                      |
| Pivot foot / ground contact         | Gait feet planted/target/neutral/lift i grounded indikator           | Legalno gameplay pivot stopalo; grounded indikator nije sam po sebi Rapier contact događaj, S05  |
| Contact direction                   | Pozicije tela i hand normal/target postoje                           | Zajednički kontaktni vektor, normal i semantika reakcije, S04                                    |
| Active dribble hand / dribble phase | `ballControl.hand/phase/crossing/fromHand/toHand`                    | Faze contact/push/release/recovery za S01                                                        |
| Ball mode                           | `ball.state`, owner, bodyType, sensor i gravityScale                 | Jednoznačno dokumentovano mapiranje budućih tehnika na postojeći lifecycle                       |
| Shot timing / release velocity      | Charge, shot brojač; `ball.velocity` je trenutna Rapier brzina       | Jednokratni release event i sačuvana shot release velocity; sadašnji šut je kinematički, S08/S09 |
| Right-stick gesture                 | Nema normalizovanog right-stick intent-a                             | S02; predlog kontrola nije postojeća mogućnost                                                   |

| Tražena vizuelizacija                            | Postojeće stanje                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Player colliders                                 | `setDebugFlag('colliders', true)` uključuje Rapier debug                                        |
| Foot anchors                                     | `setDebugFlag('footContacts', true)`; oslonac, swing i neutralni ciljevi                        |
| Hand targets / ball radius                       | `setDebugFlag('handContacts', true)`; wrist, socket, target i žičani radius lopte               |
| Contact normals                                  | Hand normale se mogu očitati; posebni world contact normal markeri nisu implementirani          |
| Ball trajectory / shot release point / rim plane | Nema namenskog zajedničkog debug prikaza; postoje putanja plana, hoop geometrija i podaci lopte |
| Defensive reach / active technique phases        | Swept reach matematika postoji, ali namenski prikaz volumena/faza još ne                        |

`getLocomotion`, `getHandContacts` i `getState` očitavaju postojeće dijagnostičke
podatke. Oznake `footContacts`/`handContacts` su nazivi debug opcija; ne dokazuju
postojanje solver kontakta u Rapier-u. `step(frames)` test seam-a trenutno samo
čeka wall-clock vreme; nije deterministički advance za tačan broj fizičkih koraka.

## Pravila budućeg podešavanja

1. Koristiti postojeću konfiguraciju, razdvojene oblasti i male helpers-e. Ne praviti
   paralelni tuning store koji postaje drugi gameplay autoritet.
2. Za novu vrednost navesti jedinicu, potrošača, podrazumevanu vrednost, scenario i
   očekivanu posledicu. Vrednost koja ne utiče na potrošača nije funkcionalan knob.
3. Meriti oba lika i ceo potez. Za S01 koristiti
   [predlog punog ciklusa](S01_IMPLEMENTATION_PROPOSAL.md), ne samo bounce-top kontakt.
4. Razdvojiti input odziv od fizičkog ubrzanja. Gamepad mapping, deadzone, flick i
   trigger pragovi su budući S02; ovde nisu dodate komande ili pragovi za njih.
5. Brze transformacije/markere menjati direktno u postojećoj frame/physics petlji.
   HUD već objavljuje snapshot na 0.08 s, renderer metrike na 0.5 s. Ne objavljivati
   sve diagnostic vrednosti kroz React state svakog kadra; budući UI treba da čita
   usporeni snapshot, uz direktan debug render gde je potreban.
6. Uz rezultat čuvati seed, scenario, konfiguraciju, opaženi FPS, step rate i
   front/side/gameplay dokaze. S00 rezultate vodi
   [regression baseline](REGRESSION_BASELINE.md), a pokrivenost
   [scenario registry](SCENARIO_REGISTRY.md).

Postojeća pravila za Zustand/React, keš resursa i frame petlju ostaju u
[code review dokumentu](../code-review.md). Rig popravke i granice su u
[skinning izveštaju](../shaq-finger-skinning-fix.md); nije potrebno duplirati ih
ili smanjivati modele radi ovog plana.

## Dopuna S01 — fazna šaka

S01 dodaje `animation.dribbleHand`: `releasePhase` 0.12, `followThroughPhase` 0.30,
`recoveryPhase` 0.52 i `catchPhase` 0.92 (udeli postojećeg ciklusa od 0.6 s),
`wristPitch` 0.12 rad. Profili `shaq` i `chuck` imaju `drop/retractSide/retractForward`
0.14/0.10/0.16 m i 0.13/0.08/0.14 m. Potrošači su `dribbleHandTrajectory` i
`handContactPose`; ovo menja prezentaciju ruke, ne putanju lopte.

Merenja, kontaktni prozori i ograničenja su u [S01 izveštaju](S01_IMPLEMENTATION_REPORT.md).
Istorijski pregled vrednosti `465f6e0` iznad ostaje sačuvan.

## Korekcija posle S01

Aktuelno: Shaq/Chuck `drop` 0.27/0.25 m i `dribbleTop` 1.30/1.20 m.
Elbow pole se menja samo u driblingu; hold ostaje sa laktovima spolja.
`gait.minFootGap` je 0.27 m, `stride` forward/backward/strafe/post/defensive
0.72/0.58/0.52/0.45/0.50, `slowStrideScale` 0.72. Posture `postDrop` je 0.19,
`movingDrop` 0.07, a spread hold/defensive/post je 0.065/0.16/0.15 m.
Korisnički razlog, kalibracija i stvarno izvršene provere su u
[dopuni driblinga](DRIBBLE_FEEDBACK_FIX.md); istorijske vrednosti iznad nisu aktuelni tuning.

## DRIBBLE-1 — izbor ruke i zaštićeni profil

Aktuelni dodatak (2026-11-08) koristi `ballControl.postDribble`, sa blend brzinom
4/s, pritiskom u opsegu 1,8 m do punog pritiska na 0,8 m i maksimalnim pomerajem
prostora lopte 0,015 m bočno / 0,025 m napred. Shaq/Chuck post profili imaju
`hipSide` 0,57/0,53 m, `dribbleForward` 0,42/0,41 m, `dribbleTop` 1,13/1,05 m,
`drop` 0,23/0,21 m, `retractSide` 0,14/0,12 m i `retractForward` 0,06/0,05 m.
Postojeći smer elbow pole-a 0,08/−1,2 ostaje stabilan. `dribbleProfile.ts` izvodi
jedan profil po fizičkom koraku; koriste ga i `ballHandling.ts` i IK prezentacija.
Protivnik prilagođava razmak, nikada izabranu ruku. Nema drugog bounce sata.

`skillGesture.ts` centralizuje pragove obrađene palice: aktiviranje 0,65, ponovno
naoružavanje u neutralnom položaju ≤0,25 i minimalnu bočnu projekciju >0,25.
`gamepadInput.ts` prethodno primenjuje jednu radijalnu mrtvu zonu iz sačuvanog
profila (default 0,18). `dribbleSkillBuffer.ts` pamti opaženu ivicu do fizičkog
koraka. Ovo je ograničeni izbor ruke, ne opšti S02 technique/replay sistem.
`getState().skillInput` prikazuje aktiviranja, odbijanja, pending zahtev i
orijentaciju na aktiviranju; `ballControl` izlaže `postBlend`, `shape` i pritisak.

Izmereni dohvati stvarnih modela, prelazi, socket kalibracija i rezultati provera
nalaze se u [DRIBBLE-1 izveštaju](DRIBBLE_1_IMPLEMENTATION.md). Kamera, mase,
GLB modeli, socket-i i upright dribble profil nisu menjani ovim slice-om.
