# Shaq defense — Q komanda i prelazi u igri

Faza 4 povezuje `SHAQ_DEFENSE_SEQUENCE_V01` iz `ANIMATION_PATHS.shaq.defense`
sa postojećom komandom za stav. Nije potrebno uključivati eksperimentalni URL
parametar. Originalni model, walking klip i `importedWalk.ts` ostaju isti.

## Ponašanje

- **Shaq bez lopte: Q** uključuje stav i odigrava celu odbrambenu sekvencu
  jednom, pa zadržava završnu pozu sa obe ruke podignute. Ponovni Q izlazi iz
  stava. Još nema izdvajanja Enter/Wide/High klipova i zasebnih komandi za njih.
- **Shaq sa loptom: Q** zadržava postojeći post-up, kontrolu lopte i hand IK.
  Novi defense klip se tada ne primenjuje.
- **Kretanje u stavu:** noge postepeno preuzima postojeći gait/foot IK, dok
  gornji deo tela nastavlja sekvencu. Pri zaustavljanju vraćaju se izvožene
  rotacije nogu i kukova uz poravnanje đonova sa parketom.
- **Komande za ruke:** eksplicitni left/right/up/wave/brace/push i dalje imaju
  završni prioritet preko postojećeg defensive arm IK-a. Automatski ready
  sloj ne prepisuje novi klip.
- **Hvatanje, posed i posebni potezi:** odmah isključuju novi sloj. Čekanje
  sopstvenog inbound dodavanja, charge, jab, bite, contest, spin, pad, stun i
  dunk zadržavaju postojeće poze i prioritete.
- **Pause** zamrzava sekvencu; Resume nastavlja. Reset/restart/teleport ne
  nastavlja staro vreme sekvence. Chuck zadržava postojeću animaciju stava.

Za najjednostavniji pregled otvori igru i iz menija izaberi **Training → Free
Movement → Start Training** sa Shaqom. Hodaj, pritisni Q, zaustavi se i sačekaj
celu sekvencu (~5,33 s), pa ponovo Q i hod. Isti Q radi bez lopte u duelu.

## Redosled primene

`createImportedDefense` prvo proverava kompatibilnost izvoza sa aktivnim
kosturom preko `bindAnimationClip`. Prikazuje se samo aktivni Shaqov klon;
mesh i kostur iz fajla animacije ostaju u loader kešu i nikada se ne montiraju.

Reprodukcija uzorkuje svih 65 quaternion putanja u postojećem Character
`useFrame` prolazu. Nema drugog mixer-a koji bi pisao preko završnog IK-a.
Izvorni position i scale track-ovi ne primenjuju se u gameplay-u: fizika
zadržava jedino vlasništvo nad pomeranjem kapsule, a dužine kostiju ostaju iste.
Pomeranje kukova po visini rešavaju postojeća poza i poravnanje đonova.
Sirovi preview i dalje može prikazati sve izvorne track-ove.

Pri ulazu/izlazu čuva se prethodna završna vidljiva poza, uključujući hod,
pa se tokom 0,3 s meša sa novom pozom. Gait, FK i foot IK formiraju osnovu,
novi sloj primenjuje rotacije, zatim hand/defensive IK imaju poslednju reč.

Podešavanja su u `src/game/data/game-config.json`, `animation.importedDefense`:
`blendDuration` je trajanje ulaznog/izlaznog prelaza, a `lowerBlendRate` brzina
predaje nogu gait-u pri kretanju i povratka na izvoženu pozu pri zaustavljanju.

## Provere

```bash
node --import tsx --test --test-isolation=none tests/imported-defense.test.ts
npx playwright test tests/browser/imported-defense.spec.ts
```

CPU test koristi stvarne GLB fajlove pri 20/30/60/120 Hz. Proverava početak
prelaza iz vidljive poze, završetak bez petlje, predaju nogu gait-u, isključenje
pri prioritetnom stanju, reset i očuvanje pozicija/skala kostiju.
Browser testovi pokrivaju keyboard Q u Free Movement režimu, hod, ulaz/izlaz,
pauzu, završnu pozu, parket/kapsulu, komande za ruke, preuzimanje lopte i
Chuckov postojeći stav. Slike i `sequence.json` su u
`playtest/refactor/imported-defense-*/`.

Postojeći `getLocomotion(slot).importedDefense` i nazivi slojeva u motion audit-u
beleže primenjeni klip, vreme, fazu, težinu i broj primenjenih kostiju.
Ovo dopunjuje postojeće provere; [faza 5 — univerzalni Gameplay Debug](gameplay-debug.md)
prikazuje ove podatke zajedno sa komandama i stvarno prijavljenim završnim slojevima.
