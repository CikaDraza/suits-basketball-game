# Shaq walking GLB — proba u igri

**Naknadno odobreno za redovnu igru:** walking model sada nosi ime
`shaquille_oneal.glb` i koristi se podrazumevano i u production build-u. Parametar
`?shaqWalk=1` više nije potreban. Arhivu i trenutni workflow vodi
[release izveštaj](release-and-staging.md). Tekst ispod čuva istoriju prve probe.

2026-11-08. Ovaj naknadni zahtev odobrava probnu upotrebu novog modela u igri.
[Prethodni izveštaj](animated-glb-preview.md) opisuje zaseban preview i nalaze
exporta pre ove integracije. Originalni GLB i dalje nije zamenjen na disku.

## Pokretanje

```bash
npm run dev -- --port 5181 --strictPort
```

- Novi Shaq u igri: <http://localhost:5181/game/?shaqWalk=1>.
- Postojeći Shaq: <http://localhost:5181/game/>.
- Zasebni raw preview: <http://localhost:5181/game/dev/animation-preview.html>.

Parametar važi samo u development režimu. Produkcioni izbor modela ostaje
postojeći; Chuck nije promenjen. Kontrole su iste: WASD/strelice za kretanje,
Q za stav i Z/C za ruku. Prvi napad i dalje počinje ubacivanjem sa strane.

## Šta se sada vidi

`characterExperiment.ts` bira walking GLB za Shaqa kada je proba uključena;
preload bira isti fajl. `isolateWalkingCharacter` odstranjuje dodatnu FBX granu
iz nezavisnog klona **pre** inspekcije kostiju, stopala i IK-a. U game rig ulazi
65 Shaq kostiju i osam njegovih mesh-eva, bez `Beta_Joints`/`Beta_Surface`.
Keširani asset i GLB fajl ostaju neizmenjeni.

U normalnom hodu napred koriste se izvožene lokalne quaternion putanje nogu i
stopala; opuštene ruke takođe koriste walking klip. Dok vodi/drži/hvata loptu,
postojeća košarkaška poza i hand IK zadržavaju vlasništvo nad rukama. Q,
odbrambeni stav, hod unazad/bočno, jab, priprema šuta i specijalni potezi
vraćaju postojeći sistem. Hod se ne vrti kada telo stoji ili je blokirano.

`importedWalk.ts` uzorkuje postojeće quaternion ključeve u istoj Character pose
petlji. Nema dodatnog mixer clock-a koji bi prepisivao završni IK. Faza prati
stvarni pomeraj kapsule duž pravca tela; izmereni puni ciklus je 1,89736 m.
Brzina hoda zato prati postignutu brzinu tela, a ne samo pritisnutu komandu.
Lokalna poza se obnavlja pre svakog frame-a, bez kumulativnog drift-a.

Pozicioni i scale track-ovi se ne primenjuju na telo. Preskočen je prvi loš
ključ exporta; uzorkuje se koherentan ciklus od 1/30 s do kraja klipa.
Horizontalno pomeranje ostaje isključivo u postojećoj fizici. Postojeća sole
grounding korekcija poravnava animirane noge sa parketom, zatim se evaluira
hand IK. Kapsula, masa, brzina, ball controller i gameplay pravila nisu menjani.

Ovo je probni vizuelni FK hod, **nije završeno planted-foot povezivanje mocap-a**.
Dok je imported hod aktivan, stari gait foot targets predstavljaju bazni gait,
a `getLocomotion(slot).importedWalk` prikazuje stvarno primenjeni imported
profil/fazu/težinu. Prelazak na idle se blenduje; zaštićene/specijalne poze
odmah vraćaju postojeći IK. Retargetovan sako/pantalone i dalje imaju poznato
istezanje iz raw exporta. Nije uveden novi backpedal/post-up mocap klip.

## Provera

- `npm run check`: 107/107, TypeScript, ESLint i formatiranje prolaze.
- `npm run build`: prolazi, uz postojeće upozorenje o veličini chunk-ova.
- Unit proba za 20/30/60/120 Hz proverava identičnu fazu za istu udaljenost,
  nepomerene lokalne pozicije kostiju, izostavljen FBX rig, konačne quaternione,
  zaustavljanje faze u mestu i povratak na IK.
- Browser proba stvarne igre sa `?shaqWalk=1` proverava novi network asset,
  stvarno primenjen hod, kapsulu, podlogu, dribling/izabranu ruku i Q povratak.
  U prvoj snimljenoj seriji od deset uzoraka telo je prešlo 2,01668 m, najniži
  shoe vertex je −2,17 mm, a najveća aktivna palm IK greška 0,187 mm.
- Završni development browser paket: **4/4 PASS** — dve probe u samoj igri
  (dribling/Q i hod bez lopte sa obe ruke), plus dve probe zasebnog preview-a.
- Standardna igra bez parametra: gameplay/held-ball/stance/slice2 paket
  **11/12 PASS** u prvom pokretanju. Shaq @20Hz nije uhvatio kratak `push`
  prozor (`right: push sampled`), bez prijavljene greške kontakta ili poze.
  Isti neizmenjeni scenario je zasebno ponovljen i prošao **1/1**. To je
  sampling ograničenje pri sporom softverskom renderu; prvi crveni rezultat
  nije sakriven niti je ceo prvi run prikazan kao zelen. Nisu povećani pragovi.

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/dmdevelo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
npx playwright test --config playwright.animation-preview.config.ts in-game.spec.ts
```

Artefakti prve probe: `playtest/shaq-walk-game/` (`in-game-walk.json`, hod i Q
slike). Vizuelni pregled uvezenog hoda koristi igru, ne zaseban studio preview.
Završni artefakti: `playtest/shaq-walk-complete/`, sa front/side slikama stvarnog
hoda bez lopte i odvojenim Q prikazom posle blend-a. Pregledan je zamah obe ruke,
duži naizmenični korak, položaj obuće i prelaz u postojeći stav. Standardne
regresije i sampling recheck su u `playtest/shaq-walk-default-regression/` i
`playtest/shaq-walk-default-sampling-recheck/`.
Nije izvršen commit, push ili merge.
