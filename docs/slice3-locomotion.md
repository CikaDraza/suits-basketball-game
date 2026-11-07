# Slice 3: držanje tela i koraci vođeni stvarnim kretanjem

Datum: 7. novembar 2026.

## Polazno stanje i inventar

- Oba GLB modela imaju samo klip `FaceDemo` (morph mete lica). Klipova za hod, trčanje
  ili hod unazad nema, iako je kostur kompatibilan sa Mixamo-om. Kretanje je zato
  dokumentovani proceduralni sistem, a ne obrnuto puštanje klipa.
- Kretanje tela: `Duel.ts` svakog fizičkog koraka postavlja horizontalnu brzinu Rapier
  kapsule. Ecctrl nije deo aplikacije. Kapsula ne menja visinu ni u Q/post stavu.
- Pre izmena (merenje probom kroz CPU skinning obuće, oba lika, 60 Hz i 20 Hz):
  tabani nisu propadali kroz parket (najniže −4 mm), ali je stopalo u osloncu klizalo
  6–29% pređenog puta, a pri izlasku iz Q u kretanju čak 84%.

## Uzroci

1. **„Tonjenje“ u Q/post stavu.** Visina karlice nije bila zadata, nego je nastajala
   zbirom: spuštanje karlice (`crouch`), posebno savijanje kolena za post, posebno
   savijanje kolena za brzinu kretanja, pa korekcija tabana koja karlicu spušta dok
   stopala ne dodirnu pod. Post u kretanju je zato bio 11 cm niži od posta u mestu
   (Shaq: 0,976 m prema 0,864 m), a i običan hod je spuštao kukove 6 cm. Kapsula nije
   propadala; problem je bio u vizuelnom skeletu.
2. **Klizanje stopala.** Cilj stopala u osloncu računat je kao pomeraj od trenutne FK
   pozicije stopala, a ne kao fiksna tačka na podu. Svaka promena FK poze (okret,
   promena stava) pomerala je i „oslonjeno“ stopalo.
3. **Trenutno ubrzanje.** Brzina je odmah bila `stick × brzina`.
4. **Blokiran igrač „hoda u mestu“.** Brzina koju Rapier prijavljuje posle solvera
   (`linvel`) ostaje velika kada protivnika guramo, a granica terena ga svakog koraka
   vraća, iako se telo ne pomera.
5. **Fizička greška iz ranijih slice-ova (pronađena usput).** Lopta koja se drži stoji
   0,29–0,32 m ispred tela, dakle unutar kapsule poluprečnika 0,42 m. Iako je
   kinematička i senzor, bila je u grupi sudara sa igračima i u ovoj postavci je
   gurala kapsulu onoga ko je drži. Pošto lopta prati telo, guranje se ponavljalo
   svakog koraka: primač ubacivanja je posle hvatanja klizio ~12 m/s, a podizanje
   lopte umalo uz protivnika ga je jednom lansiralo na 100 m. Reprodukovano je i na
   commit-u `bd83a66`.

## Izmene

| Fajl                                                    | Šta                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/entities/gait.ts` (nov)                       | Koraci sa svetski fiksiranim tačkama oslonca, sat koraka vođen pređenim putem, histerezis po brzini i po pređenoj udaljenosti, klasifikacija napred/nazad/bočno sa histerezisom ugla, stopala se ne ukrštaju, podešavajući koraci u mirovanju i pri okretu u mestu, prisilni korak pre izlaska iz dohvata noge.                           |
| `src/game/entities/posture.ts` (nov)                    | Izvedena, ortogonalna stanja: kretanje / držanje (`upright`, `defensive`, `post`) / gornji deo tela (`relaxed`, `callForPass`, `hold`, `dribble`, `deny`, `guard`). Izvode se iz postojećeg stanja igre, ne postoji druga mašina stanja.                                                                                                  |
| `src/game/entities/legRig.ts` (nov)                     | Dužine kostiju nogu, odmorna pozicija i orijentacija stopala, visina članka iz stvarnih tabana modela.                                                                                                                                                                                                                                    |
| `src/game/entities/Character.tsx`                       | Jedna zadata visina karlice po držanju (`max`, ne zbir), IK nogu do tačaka oslonca sa ravnim stopalom, spuštanje karlice samo koliko traži dohvat (ograničeno), poze gornjeg dela tela po stanju, merenje brzine iz stvarnog pomeraja tela. Rotacije se svakog kadra grade iznova iz bind poze, bez akumulacije.                          |
| `src/game/entities/limbIK.ts`                           | Opciona zadata orijentacija stopala u svetu.                                                                                                                                                                                                                                                                                              |
| `src/game/simulation/movement.ts` (nov), `Duel.ts`      | Ubrzanje ~0,4 s do pune brzine i kočenje 0,28 s kao ograničenje brzine promene (nezavisno od FPS-a); vertikalna brzina i sudari ostaju Rapier-u. Odbrana: okretanje ka čoveku sa loptom; ometanje dodavanja: ka primaču, otvoreno ka lopti; post tokom ubacivanja gleda stvarnu loptu. Granica terena više ne vraća telo na spawn visinu. |
| `src/game/physics/ballCollision.ts`                     | Lopta koju vodi igra (držana, šut, ubacivanje, dodavanje) nema interakciju sa kapsulama igrača; lopta koja postane slobodna unutar kapsule pomera se vodoravno do njene površine.                                                                                                                                                         |
| `FootContactDebug.tsx`, `locomotionDebug.ts`, test seam | Debug prikaz stopala (`setDebugFlag('footContacts', true)`): zeleno = oslonac, žuto = stopalo u zamahu, plavo = neutralna tačka. Uz `colliders` prikazuje Rapier kapsule. `getLocomotion(slot)` daje dijagnostiku.                                                                                                                        |

### Nova pravila igre (podesiva, `game-config.json`)

- `movement.accelTime` 0,4 s i `movement.brakeTime` 0,28 s.
- `defense.slideSpeed` 0,75: dok igrač u odbrani gleda svog čoveka, kretanje bočno i
  unazad ide 75% brzine (napred 100%). Dodato jer 3 m/s bočno, okrenut licem, teške
  noge ne mogu da isprate koracima. `defense.guardRange` 3,2 m, `denyBallBias` 0,6.

## Kalibracija

Korak je telesni pomeraj po jednom koraku, kao udeo dužine noge
(`animation.gait.stride`), skaliran brzinom (`slowStrideScale` 0,55 pri mirovanju do
1,0 pri punoj brzini). Sat koraka napreduje za `pređeni put / (2 · korak)`, pa se
kadenca menja sa stvarnom brzinom.

|       | dužina noge | članak iznad poda | napred | unazad |  bočno | odbrana |   post | kadenca napred pri punoj brzini |
| ----- | ----------: | ----------------: | -----: | -----: | -----: | ------: | -----: | ------------------------------: |
| Shaq  |     1,019 m |           0,161 m | 0,61 m | 0,47 m | 0,43 m |  0,45 m | 0,41 m |                    3,9 koraka/s |
| Chuck |     0,993 m |           0,129 m | 0,60 m | 0,46 m | 0,42 m |  0,44 m | 0,40 m |                    4,6 koraka/s |

Spuštanje karlice (udeo visine kuka): uspravno 1,2%, kretanje do 5,5%, držanje lopte 5%,
odbrana 13%, post 16,5%, oslonac pri guranju +3%. Prag polaska: 0,18 m/s i 12 cm od tačke
mirovanja; prag zaustavljanja 0,08 m/s.

## Provera

- **Unit testovi** (`npm test`, 61):
  - `gait.test.ts`: oslonac nepomičan, stopala se ne ukrštaju, nema zamaha napred pri
    kretanju unazad, smirivanje posle zaustavljanja, okret u mestu, histerezis,
    trzanje ±4 cm ne pokreće hod; 8–120 Hz.
  - `movement.test.ts`: ubrzanje i kočenje na 30/60/120 Hz.
  - `ball-collision.test.ts`: lopta koja postane slobodna unutar kapsule ne lansira
    igrača.
  - Testovi su provereni i namernim kvarenjem koda (padaju bez ispravke).
- **Browser** `tests/browser/locomotion.spec.ts`, oba lika, normalno i 20 Hz, svaki
  kadar sa CPU skinningom obuće. Scenariji: mirovanje, polazak i zaustavljanje, Q u
  mestu, post unazad, guranje blokiranog protivnika, odbrana bočno i unazad, ometanje
  dodavanja, traženje lopte i prijem.
  - Rezultati: klizanje stopala u osloncu 0,000 m na svim segmentima; 0 zamaha napred
    pri kretanju unazad; 0 kadrova hoda u mestu dok je blokiran; ubrzanje 0,35–0,43 s
    od 10% do 90% brzine; post u kretanju iste visine kao u mestu (±5 cm); primač
    posle hvatanja ostaje na mestu; ruka pri traženju lopte ≥ 20 cm iznad ramena.
- **Postojeći browser testovi** (Slice 2 šake, držanje lopte, post, Q stav, ubacivanje,
  kontrole, igra): ceo paket 32/33; jedini pad bio je povremen (post-motion, Chuck,
  podizanje stopala), ispravljen je, pa su post-motion (4 puta po 2 testa) i
  locomotion + stance ponovo pokrenuti i prošli. Q test sada dozvoljava jedan korak za
  širenje stava, uz uslov da je stopalo iznad poda samo dok je u zamahu.
- **Vizuelno:** snimci u `playtest/refactor/locomotion-*` (odbrana sa prikazom stopala,
  ometanje dodavanja, post unazad, traženje lopte).

## Ograničenja

- Test okruženje radi na softverskom WebGL-u (5–12 FPS). Pri brzini od 3 m/s telo
  pređe 25–35 cm po kadru, pa koraci izgledaju trzavo. Zastoj pretraživača duži od
  0,5 m pomeraja premešta stopala ispod tela (vodi se kao `resets`). Ponašanje pri
  60 i 120 Hz pokrivaju unit testovi.
- Nema faze leta pri trčanju (uvek je jedno stopalo na podu), a koraci su proceduralni,
  ne snimljena animacija.
- Pri velikom pomeraju po kadru noga u retkim kadrovima ne može da dohvati tačku;
  spuštanje karlice je ograničeno na 10 cm, pa stopalo tada promaši za nekoliko cm.
- Ruka pri traženju lopte se podiže na eksplicitan zahtev (Q) ili, kao rezerva, posle
  prolaska kroz prostor u prozoru za dodavanje (`animation.callForPass.fallback`:
  `movement` | `window` | `none`).
- Teleport lopte unutar kapsule u visini poda, odmah posle reseta u istom kadru
  (moguće samo iz testa), na starom commit-u je lansirao igrača. Sa ispravkom sudara
  više se ne reprodukuje, ali je proveren samo kroz test seam.
