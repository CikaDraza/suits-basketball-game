# Analiza koda i refaktorisanje

Analiza i izmene: 6. novembar 2026.

## Zatečeno stanje

Aktivna aplikacija je Vite SPA u `src/`. `public/` sadrži modele i slike. Bundlovana konfiguracija je premeštena iz `public/data/`
u `src/game/data/`, što uklanja Vite upozorenja o JavaScript importima iz public direktorijuma.
`Basketball_Characters/` i `3D Basketball Court Setup-handoff/` su izvorni materijali;
`.backup/` su ranije kopije, a `dist/` generisani build. Ti izvori nisu deo TypeScript aplikacije.

Pregledani runtime koristi React 19.2.6, R3F 9.6.1, Drei 10.7.7, Three.js 0.184.0,
Rapier 2.2.0 i Zustand 5.0.13. React Compiler nije uključen; React 19 sam po sebi
ne uključuje automatsku kompajlersku memoizaciju.

Početni produkcioni build prolazio je, ali bez strogog TypeScript režima, lint pravila
ili ponovljivih automatizovanih regresionih testova.

| Problem                                                                 | Primenjeno rešenje                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| HUD i meniji pratili ceo Zustand store                                  | Pretplate na konkretne primitive; zasebne komponente za rezultat, energiju, poruku i šut               |
| UI ažuriranja stvarala nove tuple čak i kada su podaci isti             | `createHudSnapshot` zadržava nepromenjene reference i vraća postojeći snapshot kada se prikaz ne menja |
| `App` pratio rezultat i time ponovo renderovao Canvas granu             | Rezultate čitaju odgovarajući prikazi; `App` komponuje aplikaciju                                      |
| `TouchOverlay` objedinjavao tastaturu, pointer logiku, stilove i prikaz | Zasebni input hook-ovi, event helper i fajl stilova; komponenta komponuje prikaz                       |
| Escape prestajao da radi u pauzi zbog odmontiranog inputa               | `useGameControls` drži tastaturu i bridge aktivnim tokom pauze i učitavanja scene                      |
| Drugi prst i kombinovani izvori mogli da prekinu držani input           | Vlasništvo pointer-a i zasebna stanja akcija za tastaturu, dodir i spoljne događaje                    |
| Reset ostavljao stare HUD, flight i inbound vrednosti                   | Zajedničke fabrike početnog stanja i odmah objavljen resetovan HUD                                     |
| Zvuk bio deo simulacionog modula                                        | `game/audio/audio.ts` sa kontrolisanim životnim ciklusom AudioContext-a                                |
| Duplirane putanje modela/slika i matematičke funkcije                   | `assets/manifest.ts`, `utils/math.ts` i `simulation/coordinates.ts`                                    |
| Modeli imali posebne skeleton resurse bez eksplicitnog cleanup-a        | Klonovi imaju sopstvene skeleton resurse; izvorne GLB geometrije i materijali ostaju u loader kešu     |
| Facial kontroler ponavljao lookup i alokacije u svakom frejmu           | Morph binding se priprema jednom; vrednosti se menjaju direktno                                        |
| Neke animacije mogle da napreduju u demand frejmu tokom pauze           | Zajednički transient `isSimulationRunning` guard                                                       |
| Kamera ostajala blago pomerena nakon shake efekta                       | Vraćanje na baznu poziciju i lokalni scratch podaci instance                                           |
| Greška scene davala prazan prikaz                                       | Error boundary prikazuje objašnjenje i dugme za ponovno učitavanje                                     |
| TypeScript provere bile oslabljene                                      | `strict`, `noUnusedLocals`, `noUnusedParameters` i kontrola veličine slova putanja                     |

## Struktura i smer zavisnosti

```text
src/
  App.tsx                         kompozicija scene i overlay-a
  components/
    game-ui/                      HUD, meniji i ponovo korišćeni UI elementi
      hudModel.ts                 čisti selektori i izvedeni tekstovi
    touch-overlay/                prikaz kontrola i adapteri browser događaja
  hooks/useMediaQuery.ts          pretplata na browser API
  game/
    input/useGameControls.ts      životni ciklus globalnih kontrola
    audio/audio.ts                Web Audio adapter
    assets/manifest.ts            kanonske putanje resursa
    data/gameConfig.ts            konfiguracija i izvedeni input ugao
    simulation/
      types.ts                    zajednički domenski tipovi
      runtime.ts                  fabrike kompletnog runtime stanja
      coordinates.ts              transformacije kretanja
      hudSnapshot.ts              UI projekcija i deljenje referenci
      isSimulationRunning.ts      transient provera aktivnosti
    state/                        Zustand store-ovi i korisničke akcije
    entities/                     R3F objekti i simulacija duela
    court/                        geometrija, materijali, koš i mreža
    scene/                        kompozicija, kamera i svetlo
    harness/                      test adapteri i renderer metrike
    utils/math.ts                 zajedničke numeričke funkcije
```

`Duel.ts` vodi pravila igre i mutable runtime. `hudSnapshot.ts` pravi odvojen prikaz
za Zustand; React komponente čitaju te podatke i šalju namere kroz store ili input događaje.
`DuelArena` komponuje igrače, loptu i efekte. Test adapter je izdvojen iz JSX-a u
`useDuelTestSeam`, sa cleanup-om vezanim za montiranu scenu.

Velika tick funkcija i dalje predstavlja povezanu state machine duela. Čiste delove
stanja, transformacija i projekcije sada je moguće testirati bez WebGL-a.

## Props, React i renderovanje

- UI wrapper-i proširuju `ComponentProps<'button'>` i `ComponentProps<'div'>`, pa zadržavaju
  nativne event tipove, accessibility atribute i React 19 `ref` prop.
- Domenski props su mali i konkretni: npr. `PlayerSlot` i `Legend`; nema prenosa celog store-a.
- Lokalno UI stanje ostaje lokalno. Browser media query koristi `useSyncExternalStore`.
- U callback-ovima i frame petlji koristi se `store.getState()` kada pretplata nije potrebna.
- Stabilni renderer/camera options i Rapier ref callback-ovi sprečavaju nepotrebno menjanje
  njihovog identiteta. Skupi 3D resursi pripremaju se uz kontrolisane zavisnosti i cleanup.
- `memo`, `useMemo` i `useCallback` služe konkretnom trošku ili stabilnoj pretplati;
  nisu dodati na svaku komponentu i jednostavan izraz.
- Event listener-i, pointer capture, pulse timer-i i audio resursi imaju cleanup.
  Input se prazni na pauzi, resetu, gubitku fokusa i skrivanju dokumenta.

Ova pravila prate zvanične smernice za
[React memoizaciju](https://react.dev/reference/react/memo),
[external store pretplate](https://react.dev/reference/react/useSyncExternalStore) i
[React 19 ref ponašanje](https://react.dev/reference/react-dom/components/common).

## Provider-i, upiti i keširanje

Projekat nema TanStack Query, `QueryClientProvider`, backend fetch sloj niti serverske upite.
Ne postoji zatečeni Query provider koji treba rekonfigurisati.

- Rapier `Physics` ostaje provider fizike unutar Canvas-a.
- Modeli koriste Drei `useGLTF`/R3F loader keš i preload istih kanonskih URL-ova.
- Koštani rigovi kloniraju se po instanci; zajedničke loader geometrije i materijali ne brišu se
  pri promeni lika. Samo resursi koje instanca poseduje dobijaju njen cleanup.
- Lopta koristi `useTexture`; color space se podešava u layout efektu umesto mutacije tokom rendera.
- Lokalni JSON se importuje jednom; izvedeni ugao kamere računa se bez mutiranja uvezenog JSON-a.
- HUD snapshot i input/store akcije preskaču identična ažuriranja.

Ako se uvedu stvarni serverski podaci, query klijent treba kreirati jednom na granici
aplikacije, a zajedničke `queryOptions` i ključeve držati uz data sloj. `staleTime`,
`gcTime`, invalidacija i refetch pravila tada treba da prate životni vek tih podataka.
Serverski query keš ne treba da bude vlasnik 60 Hz položaja igrača ili fizike.
Ovo je smernica za budući API sloj, ne dodata zavisnost ili navodni postojeći provider.
Vidi [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

## Three.js i frame petlja

Položaji, animacije, lice, mreža i hoop spring ostaju van React state-a po frejmu.
UI snapshot se objavljuje po konfigurisanom HUD intervalu i preskače identične podatke.
Renderer metrike objavljuju se zajedno na 500 ms.

`frameloop` je `always` tokom igre i `demand` tokom pauze/završnog ekrana ili screenshot
freeze-a. Postojeće DPR i svetlosno podešavanje je sačuvano. Privremene geometrije se
oslobađaju posle merge-a; promenljiv buffer mreže označen je kao `DynamicDrawUsage`.

Zajednički source GLB resursi i per-instance skeleton/shadow resursi imaju različito
vlasništvo. React StrictMode ostaje uključen i cleanup je proveren za replay životnog ciklusa.
Smernice: [R3F performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls) i
[Three.js disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html).

## Provere i ograničenja

`npm run check` pokreće strogi TypeScript, ESLint sa Rules of Hooks, exhaustive-deps i proverama ref pristupa i render side effect-a,
18 testova logike/stanja/3D resursa i proveru formatiranja. `npm run build` pravi
produkcioni izlaz. `npm run test:browser` pokriva tastaturu, alias tastere, višestruki
input, touch pointer-e, igranje, zamenu modela, inbound reset i mobilne prikaze.

Uklonjene su nekorišćene `ecctrl` i `@react-three/postprocessing` zavisnosti.
Primenjene su kompatibilne zakrpe postojećih paketa i dodat minimatch override na
zakrpljenu verziju za development alate. Poslednja instalacija prijavila je 0 ranjivosti.

Preostali glavni troškovi učitavanja su približno 27.6 MB izvornih GLB modela i
engine/WASM JavaScript od približno 3.52 MB pre gzip kompresije. Build sada razdvaja
aplikacioni chunk (550.54 kB, gzip 177.48 kB), Three.js (736.60 kB, gzip 190.86 kB)
i physics engine (2,237.13 kB, gzip 830.29 kB). Stabilni engine chunk-ovi mogu ostati
u browser kešu kada se menja aplikacioni kod; ovo ne smanjuje ukupan prvi download.
Ovo refaktorisanje ne menja originalne modele niti uvodi novu kompresiju modela.
Preload i keš sprečavaju ponovni download pri promeni lika, ali ne smanjuju prvi download.
Build upozorenje o chunk-u većem od 500 kB ostaje vidljivo.

Nije izmeren FPS dobitak na fizičkom telefonu; headless SwiftShader provera je funkcionalna
regresiona provera, a ne merodavan mobilni GPU benchmark. Test adapter `step` koristi
stvarno vreme za postojeći ugovor i nije deterministički physics stepping API.

Završna razvojna browser provera: **9/9** testova prolazi (6 input + 3 gameplay).
Isti komplet nad produkcionim preview-om sa razdvojenim engine chunk-ovima: **9/9**, 57 s.
Desktop, telefonski landscape i portrait snimci su i vizuelno pregledani; nema uočenih
regresija rasporeda u proverenim prikazima.
Unit/regresiona provera: **18/18**. Strogi TypeScript obuhvata i testove i tooling konfiguraciju.
React immutability pravilo važi za DOM UI; Three.js adapteri namerno menjaju engine
objekte van rendera u skladu sa R3F frame modelom.
