# Q stav: dijagnoza i ispravka oslonca stopala

Datum: 7. novembar 2026.

## Tačan uzrok

Problem je u vidljivom skeletu i njegovom offset-u, a ne u propadanju fizičke kapsule.
Provera je urađena sa uključenim Rapier `Physics debug` prikazom i numeričkim očitavanjem
kapsule, kukova i stvarno deformisanih vrhova obuće oba GLB modela.

Q uključuje/isključuje `post` režim u `Duel.ts`. Ne menja capsule collider, njegovu
visinu, gravitaciju ili vertikalnu brzinu tela. Ecctrl nije deo aktivne aplikacije.

U `Character.tsx` su se kombinovala dva nezavisna vizuelna problema:

1. `Hips.position.y` spuštan je za `pose.crouch = 0.17`, dok je postojeći pregib
   kuka i kolena bio previše plitak da skrati noge za 17 cm. Snižavanje kukova
   povlačilo je i tabane kroz pod, bez ikakvog uslova oslonca na parket.
2. Vizuelni root koristio je `-bodyY = -0.95`, odnosno početnu spawn visinu.
   Kapsula se na podu oslanja na `halfHeight + radius = 0.5 + 0.42 = 0.92`.
   Time je model već dobijao dodatni offset od približno 3 cm naniže.

Samo povećavanje/smanjivanje kapsule ne bi ispravilo ovu skeletnu animaciju.

## Izmereno pre i posle

Vrednosti su u metrima, u odnosu na gornju površinu parketa `Y = 0`.

| Lik         | Levi taban pre Q ispravke | Desni taban pre | Levi taban posle | Desni taban posle |
| ----------- | ------------------------: | --------------: | ---------------: | ----------------: |
| Shaq, post  |                   -0.1634 |         -0.1606 |          -0.0013 |           +0.0006 |
| Chuck, post |                   -0.1604 |         -0.1656 |          -0.0012 |           +0.0006 |

U svim tim merenjima fizičko telo ostaje na `Y ≈ 0.9188`, uz kapsulu iste poluvisine
`0.5` i poluprečnika `0.42`. Donja ivica kapsule je približno `-0.0012`.
Preostalo odstupanje tabana od oko 1 mm prati kontaktno odstupanje kapsule.

Kukovi se posle ispravke zaista spuštaju pri ulasku iz početnog držanja lopte u post:
približno 18.9 cm za Shaq-a i 17.3 cm za Chuck-a. Niži stav nastaje savijanjem nogu;
stopala ostaju uz pod. Merenje tabana koristi CPU skinning posedovanog modela,
a ne položaj ankle joint-a ili statički bounding box.

## Primenjena ispravka

- Vizuelni root računa offset iz stvarnih dimenzija kapsule umesto spawn visine.
- Post stav dobija usklađen dublji pregib kuka i kolena i kompenzaciju članka.
- `footGrounding.ts` pri pripremi instance prepoznaje obuću preko foot/toe skin weights
  i jednom pamti sole kontaktne tačke u prostoru stopala.
- U frejmu se transformišu samo pripremljene kontaktne tačke i usklađuje pozicija
  karlice sa ravni oslonca kapsule. Ne skenira se/skinuje ceo mesh po frejmu.
- Oslonac važi i tokom prelaza između uspravnih poza. Dunk i pad zadržavaju svoje
  root-motion putanje; grounding se tada preskače.
- Korekcija se primenjuje pre računanja položaja šaka, tako da držana lopta prati
  ispravan grip i posle korekcije karlice.
- Nijedan GLB, dimenzije kapsule, fizički parametri, inbound tajmeri 5+5 s ili
  prag driblinga od 0.8 s nisu menjani.

## Regresione provere

`tests/browser/stance.spec.ts` proverava oba stvarna GLB modela:

- tabane pre Q i tokom prelaza u post, uz uključen collider debug;
- nepromenjenu visinu/dimenzije kapsule;
- stvarno spuštanje kukova i očuvan oslonac stopala;
- izlazak iz post stava i povratak u početno držanje.

`tests/foot-grounding.test.ts` proverava oslonac ispod skaliranog/rotiranog parent-a,
odsustvo akumuliranja offset-a i očuvanje root transformacije i izvorne geometrije.
Očitavanje kroz `getCharacterPose` je on-demand test adapter i ne pokreće CPU
skinning svih vrhova u normalnoj frame petlji.

Reference: [Rapier debug](https://github.com/pmndrs/react-three-rapier#debug),
[Three.js SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html).

Završna validacija: `npm run check` prolazi (strogi TypeScript, ESLint, formatiranje,
19 testova), produkcioni build prolazi, a kompletna produkciona browser provera
prolazi **11/11** testova, uključujući oba Q stava. Debug snimci oba lika su vizuelno
pregledani. Merenja pre/posle sačuvana su u `playtest/stance/before.json` i `after.json`.
