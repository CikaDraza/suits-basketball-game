# DRIBBLE-1 — izbor ruke, crossover i zaštićeni post-up

Datum: 2026-11-08. Osnova je provereni `origin/main`
`e0e9cc5e06b710eb8e9f0d40238848cd585448b1` (PR #1). Grana: `feat/dribble-1`.
[Korisnička specifikacija](DRIBBLE_1_SPEC.md) definiše granice ovog korektivnog
slice-a. Lokalni početni HEAD bio je `2ac0acd`; fetch je potvrdio merge na `main`
sa identičnim stablom. Prethodni rad je sačuvan.

## Uzroci

1. Desna palica je koristila samo fiksne znakove ose X za anatomske ruke.
   Nedostajali su Y, položaj tela i nagib kamere.
2. `Duel.ts` je i dalje birao ruku i dodavao post juke impuls pri promeni smera
   kretanja kada `manualHand` nije bio postavljen.
3. Post-up je koristio istu putanju lopte i cilj slobodne šake kao uspravan
   dribling, uprkos nižim ramenima i nagnutom torzu.
4. Završna regresija je otkrila postojeću grešku kratkog direction tap-a:
   pritisak i puštanje sa istim timestamp-om daju trajanje 0, pa je događaj bio
   odbačen. `heldMovement.ts` sada prepoznaje kompletan release kao jedan jab i
   kada preciznost browser sata ne razlikuje ta dva trenutka. Namenski test je
   prvo reprodukovao pad, zatim prošao; hold/dribble prag ostaje isti.

## DRIBBLE-1A — smer palice

Aktuelnu matematiku smera dopunjava [RIGHT-STICK-RELATIVE-1](../right-stick-relative-1.md):
jednaki sektori oko projektovanog pravca tela zamenjuju raniju inverznu projekciju sticka.
Sledeći opis beleži prvobitnu implementaciju DRIBBLE-1.

Četiri `SKILL_*` smera u postojećoj mapi daju jedan nezavisan 2D vektor. Ose se
konfigurišu kroz postojeće Controls Settings; gameplay ne čita fiksne indekse.
Primena radijalne mrtve zone zadržava dijagonale. Z/C, touch i posebno naučena
HAND dugmad i dalje biraju anatomsku ruku direktno.

`skillGesture.ts` koristi postojeći `createMovementTransform`. Anatomska desna
strana tela je `(-cos(facing), sin(facing))` u XZ ravni. Projekcija u ravni kamere
uzima i vertikalno sažimanje dubine kroz sinus njenog postojećeg nagiba. Sirova
`camera.position.y` nije visina kamere koju CameraRig stvarno koristi; računamo
iz `height`, `target` i `horizontalDistance`. Konfiguracija kamere nije menjana.

Pragovi na obrađenoj radijalnoj magnitudi: aktiviranje 0,65, povratak 0,25;
minimalna bočna projekcija 0,25. Pravac ka sredini grudnog koša/leđima bez jasne
bočne komponente zadržava ruku i troši taj gest do neutralnog položaja. Držanje
palice ne ponavlja komandu, a orijentacija se čuva u prihvaćenom događaju.

Mali `dribbleSkillBuffer` uzorkuje gest pre Rapier-a (`-110`, fizika `-100`) i
čuva ivicu do sledećeg fizičkog koraka. Zato opaženi kratak gest i puštanje
između dva physics tick-a ne nestaju. Gamepad API nema događaje za neopažene
promene osa između dva render uzorka; takve fizičke impulse ne možemo rekonstruisati.

## DRIBBLE-1B — izabrana ruka i telo

Kretanje više ne bira ruku niti proizvodi crossover/juke impuls. Izbor ostaje
sačuvan i tokom prodora i promene smera. CPU zadržava postojeći eksplicitno
inicijalizovani izbor; nije uvedena nova AI tehnika.

Politika: poslednja namera može zameniti zahtev koji još nije započeo. Tokom
aktivnog crossover-a novi zahtevi se odbijaju i ne izvode kasnije. Isti izbor
ne pokreće dodatni crossover. U hold-u dozvoljen zahtev započinje dribling u
mestu. Ako tastatura/touch i gamepad pošalju nameru u istom tick-u, prednost ima
ivica tastature/touch-a, a gamepad ivica se potroši.

Postojeći `ballHandling.ts` ostaje jedini vlasnik putanje lopte: isti bounce sat,
početak crossover-a na sledećem vrhu, prenos aktivne ruke pri odskoku od poda i
kontinuirana putanja preko tela. Nema novih sila na telo iz komande ruke.

Pause, reset, promena uređaja/profila i disconnect čiste pending gest i traže
neutralni položaj pre ponovnog aktiviranja. Dijagnostika `skillInput` u test seam-u
beleži aktiviranja, odbijanja i snapshot orijentacije. `setFacing` je fixture samo
u testMode-u; produkcioni smer ostaje u gameplay-u.

## DRIBBLE-1C — post-up

Ball control deli jedan fixed-step profil sa IK prezentacijom. Protivnik utiče
na mali pomeraj zaštitnog prostora, a ne na izbor ruke. GLB, palm socket-i,
dužine kostiju, mase i planted-foot sistem ostaju postojeći.

`dribbleProfile.ts` daje zajedničku geometriju za loptu i faznu šaku. Prelaz pri
4/s čuva bounce fazu i uzima u obzir sporiji render tela: testirana je i poza
koja prati pri 45% nominalne brzine. Zadržan je postojeći stabilni smer IK lakta;
nema novih reach clamp-ova, promenjenih limita ili ekstremnih korektivnih offset-a.

| Kalibracija (metri)                  |              Shaq |           Chuck |
| ------------------------------------ | ----------------: | --------------: |
| Izmerena poluširina torso/hip skin-a |           0,30255 |          0,3466 |
| Nadlaktica L / podlaktica L          | 0,28161 / 0,31373 | 0,2570 / 0,2749 |
| Nadlaktica R / podlaktica R          | 0,28146 / 0,32281 | 0,2728 / 0,2830 |
| Post lopta: bočno / napred           |       0,57 / 0,42 |     0,53 / 0,41 |
| Vrh centra lopte                     |              1,13 |            1,05 |
| Spuštanje šake                       |              0,23 |            0,21 |
| Povratak šake ka telu / kuku         |       0,14 / 0,06 |     0,12 / 0,05 |

Pozicija protivnika se prvo prevodi u prostor tela. Mali vektor od protivnika
prema izabranoj putanji lopte prilagođava prostor, do ±1,5 cm bočno i ±2,5 cm
napred; blendovan je u istom fixed-step profilu. Ovo povećava razmak pri pritisku
i ne menja ruku. Izloženu stranu igrač sam rešava novom komandom. Nema nove
verovatnoće krađe ili redesign-a odbrane.

Palm socket-i ostaju u lokalnom prostoru stvarne hand kosti: Shaq
L `[-.001,.072,-.046]`, R `[.001,.069,-.046]`; Chuck L `[-.001,.060,-.036]`,
R `[.001,.053,-.034]`, sa postojećim nezavisnim orijentacijama/kosturima.

Stvarni rigovi: 48 steady kombinacija po modelu (obe ruke, 20/30/60/120 Hz,
lean 0,24/0,38/0,52 i brace), plus prelazi pri body blend faktorima 1 i 0,45 i
četiri kvadranta protivnika. Obnovljena je autorska rest poza pre svake nezavisne
instance, da prethodni slučaj ne postane lažna neutralna poza.

| Izmereno u rig probama                         |             Shaq |            Chuck |
| ---------------------------------------------- | ---------------: | ---------------: |
| Vertikalni rad dlana                           | 210,90–230,58 mm | 200,37–210,48 mm |
| Najveća IK greška (steady matrica)             |         24,78 mm |         12,85 mm |
| Najveća IK greška (prelazi)                    |         22,28 mm |         18,84 mm |
| Najveći izlazak lakta iza ramena               |             0 mm |         27,06 mm |
| Najmanja palm facing vrednost pri top kontaktu |           0,9803 |           0,9567 |
| Najmanji zazor lopte od kuka u steady matrici  |        141,06 mm |         56,76 mm |

Top kontakt u unit matrici ima grešku površine <0,001 mm; tokom prelaza provereni
su pragovi <25 mm i facing >0,9. Ovo nije tvrdnja da render ili realna fizička
šaka imaju mikrometarsku tačnost. Slobodna follow-through šaka u najtežem slučaju
dolazi blizu limita dohvata; to se posebno meri kroz ceo ciklus. Arm speed tokom
prelaza ostaje <25 rad/s (opaženi maksimum 22,44 rad/s), bez promene IK limita.

## Odložene, odobrene kontrole

Sledeće mape su zapisane za naredni controls slice i nisu aktivirane ovim zahvatom:

| PlayStation | Xbox | Naredna namena                           |
| ----------- | ---- | ---------------------------------------- |
| Cross       | A    | Inbound dodavanje                        |
| Triangle    | Y    | Skok, skok za loptu i jednoručna blokada |
| L2          | LT   | Post-up / zaštitni stav                  |
| L1          | LB   | Kontakt telom / bracing                  |
| Square      | X    | Šut i finta šuta                         |

Postojeće akcije Q/Triangle, R/Square i inbound ostaju dostupne. Ovaj slice nije
kompletan S02, S04 ili napredni S06; nema novih skokova, fake-shot sistema ili
automatske reakcije odbrane.

## Verifikacija i isporuka

Provera koristi produkcioni Vite preview na `127.0.0.1:5177`, Chromium 1228 i
SwiftShader, jedan Playwright worker. `npm run check` prolazi: TypeScript,
ESLint, **106/106** unit/rig testova i Prettier. `npm run build` prolazi uz
postojeće upozorenje o velikim chunk-ovima; modeli nisu smanjivani.

Komanda punog browser paketa:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5177/ \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/dmdevelo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
npm run test:browser -- --output=playtest/dribble-1-shipping
```

Završni puni browser paket: **48/48 PASS, 11,8 min**, bez preskočenih testova
ili retry-ja. Obuhvata 8 DRIBBLE-1 scenarija (po 4 za oba modela), 2 P2 probe i
38 input/gameplay/hold/inbound/CPU/gait/post/contact/stance regresija.
Artefakti su u `playtest/dribble-1-shipping/`; završni log je
`/tmp/dribble-shipping-browser.log`.

U stacionarnim SC-D1/D2 probama svih osam orijentacija ima izmeren root drift
**0 m** i promenu ugla **0 rad**: Shaq 112, Chuck 111 zabeleženih uzoraka.
Post-up/prelazi imaju po 76 browser uzoraka; najveća opažena aktivna IK greška
je Shaq **20,04 mm**, Chuck **18,02 mm**. Kontaktni prozori proveravaju površinu
lopte <25 mm i palm facing >0,9; phase continuity prag je 1e−6.

Snimljeno je **40 front/side kadrova**: oba modela × obe ruke × dva pogleda ×
push/release/floor/recovery/catch. Podaci su u
`playtest/dribble-1-final-visual/observations.json`, uz PNG kadrove. Pregledani su
front push/floor kadrovi obe ruke za oba modela i bočni kontakt/release uzorci,
kao i gameplay crossover, drive i backing kadrovi. Podlaktica se spušta i vraća,
šaka ostaje iznad lopte pri kontaktu i ne prati je do poda; lopta je van kuka,
aktivni lakat nije izvrnut iza leđa. U pregledanim pozama nema prstnih šiljaka.

U ovih 40 uzoraka maksimalna IK greška je Shaq 0,049 mm / Chuck 0,025 mm;
vertikalni raspon dlana po ruci je Shaq 221,9–226,3 mm / Chuck 202,4–208,8 mm.
To su mirne post poze posle blend-a, ne zamena za težu tranzicionu matricu iznad.
Nema opaženih page/console/network grešaka. FPS dijagnostika pri snimanju je
8–26 za Shaqa i 9–23 za Chucka, uz screenshot freeze; nije hardverski benchmark.
Kadrovi nisu video niti potpuna provera svakog ugla zaklonjene šake. Postojeći
uglati nabori sakoa ostaju ograničenje skinovane odeće; cloth simulacija i nova
popravka GLB rig-a nisu deo DRIBBLE-1.

Tokom pripreme su dijagnostikovani i sačuvani i crveni rezultati:

- P2 probe su prvo slale komandu odmah nakon fixture reset-a bez neutralnog
  uzorka. Priprema sada čeka da postojeći input gate obradi reset; runtime
  zaštita nije uklonjena. Oba P2 scenarija potom prolaze.
- Dve Shaq provere su poređivale interpoliranu mesh poziciju sa fiksnim
  physics satom i zanemarivale pomeraj/okret tela. Test sada beleži oba sata i
  obe pozicije; zasebno proverava njihove putanje, uz izmeren pomeraj tela i
  rotacioni luk lopte. Pragovi za IK, kontakt i bounce fazu nisu povećani.
- Postojeći browser jab test je otkrio stvaran gubitak tap-a trajanja 0.
  Namenski unit test je reprodukovao `null !== 'jab'`; posle popravke prolazi.

Pripremna browser pokretanja prekinuta su radi ovih korekcija i nisu prikazana
kao puni regresioni prolazi. Konačni paket se izvršava nad novim produkcionim
build-om, sa stabilnom verzijom svih testova.

Fizički gamepad nije korišćen: browser probe idu kroz mock `navigator.getGamepads`
i stvarnu produkcionu putanju komandi/mapiranja. Render na SwiftShader-u nije
proba rada na 60/120 FPS; te frekvencije proverene su numeričkim rig/input
probama. Front/side inspection služi proveri poze, dok je tumačenje palice
provereno isključivo sa zaključanom gameplay kamerom. Grana se predaje za
pregled; nema automatskog merge-a niti statusa `Accepted` bez korisničkog pregleda.

## Promenjeni fajlovi

- Input: `skillGesture.ts`, `dribbleSkillBuffer.ts`, `gamepadInput.ts` i
  `controlBindings.ts` — projekcija, pragovi, buffering i migracija mapa.
- Integracija: `Duel.ts`, `DuelArena.tsx`, `simulation/types.ts` i `runtime.ts` —
  redosled uzorkovanja, trajni izbor ruke, uklanjanje movement fallback-a i
  preuzimanje P2 kontrole eksplicitnim hand dugmetom.
- `heldMovement.ts` i `held-movement.test.ts` — očuvan kratki jab kada oba
  događaja imaju isti timestamp, bez izmišljanja trajanja inputa.
- Lopta/ruke: `dribbleProfile.ts`, `ballHandling.ts`, `handContactPose.ts`,
  `dribbleHandTrajectory.ts` i `game-config.json` — zajednički post profil.
- `gameConfig.ts` — eksplicitni JSON import atributi za isti konfiguracioni
  izvor u Vite-u i Node ESM browser testovima.
- `ControlsSettings.tsx` i `HelpScreen.tsx` — četiri remapabilna smera i opis
  trenutnog ponašanja; bez novih budućih gameplay akcija.
- Harness: `exposeTestSeam.ts` i `useDuelTestSeam.ts` — test-only facing fixture,
  postojeće hand komande i dijagnostika gestova.
- Novi testovi: `skill-gesture.test.ts`, `dribble-skill-buffer.test.ts`,
  `post-dribble.test.ts`, `browser/dribble-1.spec.ts` i `browser/dribble-1-p2.spec.ts`.
  Postojeći `control-bindings.test.ts`, `browser/controls.spec.ts` i
  `browser/slice2.spec.ts` prate novi eksplicitni izbor umesto automatske promene.
- Dokumentacija: ovaj izveštaj, sačuvana specifikacija, README, input ugovor,
  gameplay tuning, implementation tracker i scenario registry.

Nereferencirani lokalni `public/models/shaquille_oneal_walking_test.glb` nije deo
DRIBBLE-1 i nije uključen u commit. Produkcija i testovi koriste postojeće
kanonske modele. Originalni lokalni fajl ostaje sačuvan.
