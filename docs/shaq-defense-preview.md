# Shaq — dodatne GLB animacije i defense preview

Nove animacije za Shaqa i Chucka čuvaju se u `public/models/animations/`.
`shaq_defense_sequence_clean.glb` premešten je iz `public/models/` bez promene
sadržaja. SHA-256: `e5e1928fce643197e96fd8cfe8dadfb3939c6709cb0ad6fa676b2ccfba910d26`.

`ANIMATION_PATHS` u `src/game/assets/manifest.ts` vodi dodatne animacije,
odvojeno od `MODEL_PATHS`. Trenutno je registrovan samo `shaq.defense`;
`chuck` je prazan dok ne stignu njegovi izvozi. Budući dribble/shoot/post-up
fajlovi nisu dodati kao prazni placeholder-i.

Aktivni modeli i postojeći hod ostaju isti:

- `public/models/shaquille_oneal.glb`: aktivni Shaq sa ugrađenim hodanjem.
- `public/models/charles_barkley.glb`: aktivni Chuck.
- `src/game/entities/importedWalk.ts`: postojeći sistem hodanja.
- `public/models/archives/`: originalni izvozi i raniji walking export.

## Zaseban preview

```bash
npm run dev -- --host 127.0.0.1 --port 5181 --strictPort
```

Otvori <http://127.0.0.1:5181/game/dev/defense-preview.html>.
Na drugom portu koristi istu `/game/dev/defense-preview.html` putanju.

Preview prikazuje klon **aktivnog** Shaqovog modela. Iz dodatnog GLB-a uzima
isključivo `SHAQ_DEFENSE_SEQUENCE_V01`, dužine oko 5,333 s. Mesh i kostur iz
animacionog fajla nikada se ne dodaju u prikazanu scenu. Nema drugog Shaqa.
Cela sekvenca se izvršava jednom i zadržava završnu pozu; Play/Pause,
Restart i brzina reprodukcije služe za pregled. Prevlačenjem rotiraš kameru.

`bindAnimationClip` proverava 65 naziva kostiju, roditeljske veze, lokalne
početne transformacije i njihove world matrice, kao i svih 195 putanja.
Na nekompatibilnom kosturu preview prijavljuje grešku umesto tihe primene
pogrešnih putanja. Ovo je direktno vezivanje kompatibilnog izvoza, ne sistem
za retargeting različitih kostura. Putanje se kloniraju i vezuju na UUID
proverenih kostiju aktivnog modela; keširani modeli i izvorni klip ostaju netaknuti.

Preview koristi ceo klip sa izvornim position/quaternion/scale podacima,
uključujući pomeranje kukova. `useAnimations` upravlja reprodukcijom u R3F-u.
Gameplay, fizika, lopta, hodanje i IK ne izvršavaju se u ovoj sceni.
Preview HTML nije ulaz production build-a, kao ni raniji walking preview.

## Provera i sledeća faza

CPU test na stvarnim GLB fajlovima proverava kompatibilnost, promenu poza,
očuvanost izvornih modela i odsustvo dodatnih mesh-eva. Negativni testovi
odbijaju nedostajuće kosti, promenu hijerarhije/početnih osa i ne-koštane putanje.
Browser test proverava učitavanje, stvarnu reprodukciju, pauzu, pregled
različitih trenutaka, restart, kraj sekvence, mobilni prikaz i konzolu/mrežu.

```bash
node --import tsx --test --test-isolation=none tests/animation-clip.test.ts
npx playwright test --config playwright.animation-preview.config.ts defense.spec.ts
```

Browser artefakti: `playtest/animated-glb-preview/defense-*/`, uključujući
`defense-inspection.json` i slike pojedinačnih poza.

Koraci 1–3 obuhvataju direktorijum, registar i poseban preview.
Naknadno je uveden i [korak 4 — veza sa Q i prelazi u gameplay-u](shaq-defense-in-game.md).
Sekvenca još nije isečena na Enter/Wide/High klipove. Proširenje RS debug-a u
univerzalni Gameplay Debug ostaje korak 5; model, animacija, gameplay komanda i
debug ostaju odvojene odgovornosti.
