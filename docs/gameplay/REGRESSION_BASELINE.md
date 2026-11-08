# S00 — regresioni baseline

Izvršeno 2026-11-07 nad čistim gameplay izvorom commita
`465f6e080f60bd6060f9f02b52e5f6dcec9e38d4`, jednakim udaljenom `main` u trenutku
provere. Jedine naknadne izmene su dokumentacija. Ovaj zapis ne proglašava nove
S01–S16 mehanike implementiranim ili prihvaćenim.

## Okruženje i komande

Linux, Node v24.13.1, npm 11.20.0. Instalirane zavisnosti iz postojećeg lockfile-a,
bez nadogradnje. Produkcijski preview na `127.0.0.1:5177`; postojeći korisnički
server na 5173 nije menjan. Chromium 1228 iz lokalnog Playwright cache-a, headless
softverski WebGL. Jedan browser worker.

```bash
npm run check
npm run build
npm run preview -- --host 127.0.0.1 --port 5177 --strictPort
```

U drugom terminalu (putanju Chromium-a prilagoditi instalaciji):

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5177/ \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/dmdevelo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
npm run test:browser -- --output=playtest/s00-baseline
```

## Rezultati ovog izvršavanja

| Provera                           | Rezultat                        | Granica dokaza                                                                                                  |
| --------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| TypeScript, ESLint                | PASS                            | Postojeći izvor bez promena                                                                                     |
| Unit/integracioni testovi         | **61/61 PASS**, 0 skipped       | Uključuju stvarne rigove, 324 Shaq finger/wrist poze, kontakt, gait, fiziku pasa i oslobađanje lopte iz kapsule |
| Format pre dokumentacionih izmena | PASS                            | Konačna provera novih dokumenata beleži se ispod                                                                |
| Produkcijski build                | PASS, 674 modula                | Postojeće upozorenje za chunk >500 kB; nije build greška                                                        |
| Browser regresije                 | **31/33 PASS, 2 FAIL**, 7,2 min | Nema ponavljanja celog paketa radi prikrivanja padova                                                           |

Build: app 591,92 kB (gzip 193,04), Three chunk 736,61 kB, physics 2.237,13 kB.
To su veličine JS chunk-ova, ne GLB-a. S00 ne optimizuje asset-e ili bundling.

## Zabeleženi padovi

| ID   | Tačan test / asertacija                                           | Opaženo                                                               | Sledeća istraga, bez gameplay izmene u S00                                                                                                                 |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | `tests/browser/inbound.spec.ts:56`, open chest pass; red 72       | Posle opaženog `outcome='caught'`, snapshot `owner=-1`, očekivano `0` | Utvrditi da li je prelaz poseda, izvor snapshot-a ili vremenski razmak poll→snapshot. Ne tvrditi da je lopta fizički ispala samo na osnovu ove asertacije. |
| B-02 | `tests/browser/locomotion.spec.ts:133`, Chuck `@default`; red 301 | Udeo `strafe` stanja 0,3333, prag ≥0,4                                | Pregledati klasifikaciju, orijentaciju, sampling i izmerenu putanju. Isti Chuck `@20Hz` i oba Shaq slučaja su prošli; to ne poništava pad.                 |

Oba pada su opažena na **neizmenjenom referentnom kodu**, pa nisu regresije nastale
ovom dokumentacijom. Njihova učestalost i tačan uzrok nisu utvrđeni jednim run-om.
Raniji [Slice 3 izveštaj](../slice3-locomotion.md) beleži drugi povremen pad
(post-motion/Chuck, podizanje stopala); to nije isti rezultat i ne prenosi se kao
novo merenje. Post-motion sva četiri testa sada prolaze.

Artefakti su lokalni i gitignored, u `playtest/s00-baseline/`:

- B-01: `inbound-an-open-lane-uses--1aee9-e-receiver-changes-position/`
- B-02: `locomotion-chuck-posture-a-67b3a-ush-defense-inbound-default/`
- Svaki pad ima `test-failed-1.png`, `error-context.md` i `trace.zip`.
- Izvorni logovi: `/tmp/suits-s00-check.log`, `/tmp/suits-s00-build.log`,
  `/tmp/suits-s00-browser.log`. Nisu deo trajne dokumentacije; ovaj izveštaj čuva
  ključne rezultate, a komande omogućavaju novu proveru.

## Šta stari paket zapravo proverava

Putanje u tabeli su relativne prema `tests/`. Browser zbir: gameplay 3, held-ball 3,
inbound 7, input 6, locomotion 4, post-motion 4, slice2 4, stance 2 = **33**.

| S00 ponašanje | Postojeći dokaz u ovom run-u                                                 | Rezultat / preostala granica                                                           |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Walk          | `movement.test.ts`, `gait.test.ts`, `browser/locomotion.spec.ts`             | Ubrzanje, stvarni pomeraj, oslonac; Chuck bočna klasifikacija B-02 ostaje otvorena     |
| Stop          | Isti gait/movement i browser locomotion                                      | Prošli stop segmenti; nema tvrdnje o budućem balance recovery-u                        |
| Turn          | `gait.test.ts`, `browser/locomotion.spec.ts`, `slice2.spec.ts`               | Oslonci/okret i dlanovi; 60/120 FPS browser iskustvo nije izmereno                     |
| Post-up       | `browser/post-motion.spec.ts`, `held-ball.spec.ts`                           | Oba lika: smer koraka i kontakt ruku; novi fizički otpor S04 još ne postoji            |
| Dribble       | `ball-handling.test.ts`, `dribble-contact.test.ts`, `browser/slice2.spec.ts` | Pod/vrh i kontinuitet prolaze; rad ruke kroz ceo ciklus nije kriterijum tih testova    |
| Crossover     | Isti ball-handling i slice2                                                  | Kontinuiran handoff u mestu i kretanju; nema nove S06 tehnike/overcommitment-a         |
| Catch         | `inbound-passing.test.ts`, `browser/inbound.spec.ts`                         | Lob/CPU catch prolaze, chest posed B-01 pada                                           |
| Inbound       | `inbound-passing.test.ts`, `browser/inbound.spec.ts`                         | 5+5, violation, R intercept, deep-paint collision, isti levi izvor; B-01 otvoren       |
| Shoot         | `browser/gameplay.spec.ts`, `inbound.spec.ts` basket restart                 | Charge/release/counter postoje; let i `made` su scripted, nije S09 fizičko bodovanje   |
| Dunk          | `three-resources.test.ts` proverava opruge/reset, ne ceo dunk                | Dodatni browser smoke se beleži niže; puna automatizovana dunk/hang sekvenca nedostaje |
| Fall          | Nema namenskog testa celog pada/ustajanja                                    | Dodatni smoke se beleži niže; fazni oporavak S14 ostaje budući                         |
| Reset         | `simulation.test.ts`, `stores.test.ts`, `browser/gameplay.spec.ts`           | Čisti postojeći runtime/input, bez novog opening shoot-out lifecycle-a                 |
| Pause/resume  | `stores.test.ts`, `browser/input.spec.ts`, `gameplay.spec.ts`                | Pause/blur/freeze i čišćenje držanih komandi prolaze                                   |

## Pregledani kadrovi i kontaktne metrike

Pregledani stvarni PNG artefakti iz ovog run-a:

- Shaq i Chuck `hold-front.png` i `post-side-contacts.png` iz `slice2-*@default`:
  u tim kadrovima oba dlana su uz loptu, nema vidljivih dugih šiljaka ili slomljenih
  ruku. Bočni debug wireframe delimično zaklanja tačnu penetraciju.
- Shaq `right-dribble.png`, Chuck `left-dribble.png`: lopta je odvojena od dlana
  tokom niskog dela bounce-a; jedan kadar ne dokazuje ispravan rad lakta/ciklus.
- Chuck `defense-feet-debug.png` i B-01 `test-failed-1.png`: sačuvan prikaz terena,
  igrača i kontaktnih markera; iz statične slike nije moguće utvrditi uzrok pada.
- `inbound-fronting-defense-*/lob-flight.png`: vidljiv visoki lob; ovo nije kompletna
  vizuelna potvrda catch/recovery faza.

Metrike iz `slice2-*/contact-report.json` (stvarne render probe):

| Model / režim | Frejmova | Proverenih vrhova | Opaženi dribble FPS | Maks. wrist bend | Maks. aktivni target error |
| ------------- | -------: | ----------------: | ------------------: | ---------------: | -------------------------: |
| Shaq default  |       65 |                 9 |                9,17 |           57,22° |                    3,36 mm |
| Shaq cap20    |       65 |                11 |                9,60 |           57,16° |                    0,97 mm |
| Chuck default |       70 |                11 |               10,43 |           65,00° |                    3,66 mm |
| Chuck cap20   |       67 |                10 |                9,86 |           65,00° |                    3,59 mm |

`target error` meri IK cilj, ne kontakt sa površinom lopte kroz ceo ciklus.
Kontaktna asertacija važi samo oko vrha; mali error ne dokazuje biomehaniku.
Render cap20 nije postignutih 20 FPS. Unit testovi pri 20/30/60/120 Hz nisu zamena
za budući vizuelni pregled na uređaju koji stvarno postiže 60/120 FPS.

## Dodatni smoke i završna provera dokumentacije

Dodatna read-only proba izvršena je za **oba modela**, seed 42, testMode uključen:

1. Dunk: P1 `(2.6,.95,0)`, P2 `(9,.95,-4)`; R do charge >0,2 s pa release.
   Oba daju `dunks=1`, `mode=dunk`; u 20 RAF uzoraka kapsula ostaje na
   Y≈0,9188 m dok se model vizuelno podiže do obruča. To potvrđuje cinematic
   izuzetak iz audita F-07, ne fizičku suspenziju tela iz S13.
2. Reset, P1 `(5,.95,0)`, P2 udaljen; dupli Q. Oba daju `flops=1`, `mode=down`,
   tajmer oko 3,4 s; posle 4,5 s su `idle`. Lopta prirodno postaje loose/out/inbound.
   Ovo potvrđuje postojeći pad/oporavak, ne nove višefazne zahteve S14.
3. Nema console/page grešaka. Početni FPS snapshot: Shaq 1, Chuck 8; 20 RAF
   uzoraka pokriva približno dve sekunde simulacije. Nema dokaza stabilnih 60 FPS.

Lokalni artefakti: `playtest/s00-baseline/manual/observations.json` i
`{shaq,chuck}-{dunk,after-dunk,fall,recovered}.png`. Skripta za ovaj run:
`/tmp/suits-s00-manual.cjs`. Pregledani su Shaq dunk/fall i Chuck dunk/recovery
kadrovi. Video nije snimljen jer lokalni ffmpeg cache nedostaje; ništa nije instalirano.
Ovo su pojedinačni kadrovi i state sampling, ne neprekinuta vizuelna analiza svih faza.

Nijedan SC-001–SC-030 ovim zapisom ne dobija status `Verified`.
Završna provera: `npm run format:check` prolazi. Kanonski dokument je programski
upoređen sa prilogom nakon istog Prettier formatiranja — sadržaj je identičan.
Provereni su lokalni linkovi, 30 jedinstvenih scenario ID-jeva, 17 slice-ova i
dokumentacioni opseg diff-a. `src/`, testovi, konfiguracija, GLB i lockfile nisu menjani.
