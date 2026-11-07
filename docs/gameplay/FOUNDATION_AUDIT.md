# S00 — Provera postojećeg fundamenta

Datum: 2026-11-07. Osnova: `465f6e080f60bd6060f9f02b52e5f6dcec9e38d4`.
Lokalni HEAD i udaljeni `origin/main` provereni su pre izmena. Radno stablo bilo
je čisto. Ovaj pregled ne menja gameplay kod.

Naknadna ispravka F-01/F-02 i trijaža testova opisani su u
[S01 izveštaju](S01_IMPLEMENTATION_REPORT.md). Nalazi ispod ostaju inventar
referentnog commita, ne tvrdnja da stari kvar postoji i posle S01.

[Predlog v2](SUITS_GAMEPLAY_FOUNDATION_V2_2026_11_07.md) ostaje sačuvan kao predlog.
Ovaj dokument beleži činjenice i dopune; napredak vodi isključivo
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Šta zadržavamo i ko čime upravlja

| Odgovornost                               | Sadašnji vlasnik                                                     | Nalaz                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pravila, posed, vreme, CPU i ishod akcije | `src/game/entities/Duel.ts`, `simulation/runtime.ts`                 | Jedan promenljivi runtime. Zustand objavljuje HUD, lifecycle i zahteve; ne uvoditi paralelnu gameplay mašinu.                                                                       |
| Fizički korak                             | `DuelArena.tsx:110`, `SceneRoot.tsx:26`                              | Rapier 60 Hz: gameplay pre koraka, obrada pasa posle. Prezentacija dolazi kasnije.                                                                                                  |
| Položaj i brzina tela                     | `Duel.ts:854–890`, `simulation/movement.ts`                          | Rapier kapsula, kontrolisana horizontalna brzina sa ubrzanjem/kočenjem; vertikala ostaje solveru. Ograničavanje granice i reset imaju eksplicitnu korekciju položaja.               |
| Ubrzanje                                  | `movement.ts:9–38`                                                   | Već postoji ograničenje promene brzine: 0,4 s ubrzavanje i 0,28 s kočenje. To nije odsutan sistem koji treba ponovo napisati.                                                       |
| Držanje tela                              | `entities/posture.ts:46–69`                                          | Izvedena ortogonalna stanja kretanja, držanja i gornjeg dela tela. Ne dodavati još jednu nezavisnu mašinu poza.                                                                     |
| Karlica, noge i stopala                   | `Character.tsx:796–845`, `gait.ts:336–341`, `legRig.ts`, `limbIK.ts` | Svetske tačke oslonca, izvedena visina karlice, IK nogu. Sačuvati fiksni oslonac i postojeće regresije stvarnih tabana.                                                             |
| Pivot                                     | `Character.tsx:802–809`, postojeći jab                               | Postoji pomeraj vodeće noge za fintu, ali nema trajno određenog gameplay pivot stopala i ugovora o legalnom napuštanju oslonca. S05 ostaje potreban.                                |
| Ruke i dlanovi                            | `handContactPose.ts`, `armContact.ts`, `palmSockets.ts`              | Posebna kalibracija oba modela, ograničen IK, nezavisni klonovi kostura. Ne zamenjivati ih zajedničkim Euler uglovima.                                                              |
| Animacioni redosled                       | `Character.tsx:480,723–748,886–913`                                  | Reset/bind osnova → proceduralna poza → IK nogu → IK ruku → konačne svetske matrice. Physics prioritet −100, Character −50. Nema body klipova; `FaceDemo` nije animacija driblinga. |
| Držana/driblana lopta                     | `simulation/ballHandling.ts`, `Duel.ts:1014–1038`                    | Jedna kontrolisana kinematička putanja. Ruke prate loptu; lopta ne prati IK šaku.                                                                                                   |
| Pas i presecanje                          | `inboundPassController.ts:91–128,180–233`, `tacticalPass.ts`         | Početna brzina prema cilju pri izbačaju; dalje dinamički Rapier let. Swept provere za hvatanje/presecanje, bez hominga.                                                             |
| Režim tela i sudara lopte                 | `physics/ballCollision.ts:62–80`                                     | Pas/slobodna/postignut koš: dinamika; kontrolisani režimi: kinematika. Sačuvati odvajanje kontrolisane lopte od kapsula igrača i bezbedno oslobađanje iz kapsule.                   |
| Šut i bodovi                              | `Duel.ts:340–390,1039–1129`                                          | Ishod `made` bira se unapred iz seeded verovatnoće; putanja je kinematička, a bodovi zavise od tog ishoda. To još nije fizički šut i detekcija prolaska kroz obruč iz S09.          |
| Kontakt i energija                        | `Duel.ts:979–1007,894–904`                                           | Postoje radijalno guranje i potrošnja/oporavak energije. To još nije sistem balansa, bracing-a i progresivnog zamora.                                                               |
| Input                                     | `inputStore.ts`, touch/keyboard hookovi, `Duel.ts:469–512`           | Tastatura/touch imaju most i gestove; gamepad se posebno čita, CPU posebno vraća komande. S02 ih spaja kroz ugovor namere.                                                          |
| Obračun obruča/mreže                      | `court/hoopRig.ts`, `BasketballHoop.tsx`, `Net.tsx`                  | Postojeći opružni obruč i Verlet mreža ostaju. Budući kontakt mora da koristi stvarnu animiranu geometriju.                                                                         |

Putanje u tabeli su relativne prema `src/game/`, osim gde je puna putanja navedena.
Brojevi redova važe za referentni commit, ne za buduće implementacije.

## Potvrđeni nalazi i granice dokaza

| ID   | Nalaz                                                      | Dokaz i posledica                                                                                                                                                                                                                                                                                                                  |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | Cilj dlana je skoro nepomičan kroz dribling.               | `handContactPose.ts:64–86`: `dribbleTop + radius`, korekcija najviše 6 cm samo oko vrha. Analitičko uzorkovanje 10.001 faze na ravnom podu daje stvarni raspon ove formule oko 14,1 mm za Shaqa i 12,8 mm za Chucka. To nije merenje prikazanog dlana niti samo po sebi dokaz vizuelne ukočenosti. S01 mora da proveri ceo pokret. |
| F-02 | Postojeći testovi ne odbacuju F-01.                        | `dribble-contact.test.ts:84–87` preskače kontaktne asertacije van vrha; `browser/slice2.spec.ts` takođe ne zahteva amplitudu dlana i lakta tokom celog ciklusa. Prolazak testa kontakta nije prihvatanje biomehanike.                                                                                                              |
| F-03 | Test seam nema tačno stepovanje.                           | `harness/useDuelTestSeam.ts:20–23,123`: `step(frames)` čeka `setTimeout`, ne izvršava tačno N Rapier koraka. Seeded reset i ponovljivi setup postoje; precizan command replay još ne postoji.                                                                                                                                      |
| F-04 | Input izvori nemaju isti vremenski ugovor.                 | Tastatura/touch mere gest preko `performance.now()`, gamepad kroz fizičke korake. S02 treba normalizaciju timestamp → simulation tick, uz očuvanje tapa između koraka.                                                                                                                                                             |
| F-05 | Dijagonalni digitalni input može dati veću traženu brzinu. | Komponente ose ograničene su zasebno; `coordinates.ts:7–8` čuva dužinu, a `Duel.ts:799–801` koristi oba pravca. S02 mora da definiše radijalnu normalizaciju i test ravnopravnosti dijagonale. Ne ispravlja se u S00.                                                                                                              |
| F-06 | Reakcija na jab nije budući balans.                        | `Duel.ts:270–280,829–831`: seeded šansa i direktan nalet odbrane. S05/S06 treba uslove i oporavak, bez garantovanog guranja odbrane.                                                                                                                                                                                               |
| F-07 | Dunk je vizuelno vođen izuzetak.                           | `Character.tsx:757–787` pomera prikaz u odnosu na kapsulu. Ovo treba eksplicitno ograničiti do S13; nije dokaz fizičkog vešanja tela na rukama.                                                                                                                                                                                    |
| F-08 | Dve vrednosti gravitacije imaju različite uloge.           | Svet koristi −16 m/s², sila držanja obruča računa se sa 9,81 u `Duel.ts:87–88`. Zabeležiti i izmeriti u S13; ne menjati naslepo.                                                                                                                                                                                                   |
| F-09 | Nema dokaza da se Shaqov raniji skinning kvar vratio.      | Postoje kontrolisani testovi prstiju/zglobova i hash provere GLB-a. Njihov rezultat je u baseline izveštaju. Loš izgled ruke nije automatski dokaz loših težina ili razlog za novi asset.                                                                                                                                          |

Postojeća dokumentacija (`../slice3-locomotion.md`, `../slice2-rig-audit.json`,
`../shaq-finger-skinning-fix.md`) predstavlja ranije nalaze. Njene brojke nisu
prepisane kao novo merenje S00.

Browser run je dao dva dodatna potvrđena **simptoma testa**, B-01/B-02:
chest catch zatim `owner=-1`, i Chuck `strafe` udeo ispod praga. Dokaz i granice
zaključka su u [baseline-u](REGRESSION_BASELINE.md). Uzrok još nije potvrđen;
ne svoditi ih unapred na animaciju, fiziku ili flaky test.

## Dopune zavisnosti i pravila plana

1. S06 eksplicitno zahteva prihvaćen S01, uz S05: lanac S05 → S04 → S03 → S02 ne sadrži S01, a crossover zahteva ispravan ceo kontaktni ciklus.
2. S07 zadržava S03/S04, ali za prihvatanje zahteva regresiju hvatanja/kontakta iz S01. Predikcija buduće prijemne zone ne uvodi navođenje već izbačene lopte.
3. S02 sledi S01 u izvršavanju, iako oba u originalu zavise od S00. Ne započinjati paralelne gameplay slice-ove.
4. S08 definiše komandu, pripremu i jedinstven događaj izbačaja; S09 preuzima fizički let i bodovanje. U prelazu jedna putanja ostaje autoritativna. S08 nema pravo da obeća fizičko bodovanje koje tek S09 donosi.
5. Minimalni seam za precizno stepovanje/replay pripada S02 ili posebno opisanom preduslovu pre prve mehanike koja ga traži. S00 beleži ograničenje, a ne dodaje novi simulator.
6. Novi S03 nije raniji commit „Slice 3“. Postoje ubrzanje i planted-foot gait; budući S03 još zahteva hustle/drive, profile i progresivni zamor.
7. Budući pivot preuzima postojeći mehanizam tačke oslonca, ne uvodi drugi vlasnik stopala. Tehnika traži/oslobodi anchor kroz jedan ugovor.
8. Buduća optimizacija ne podrazumeva smanjivanje/remesh postojećih GLB modela. Ranije ograničenje da modeli ostanu sačuvani važi; prvo meriti keš, alokacije, teksture, draw calls i isporuku.

## Najmanje potrebne zajedničke dopune

- S01: fazni cilj šake i novi test celog ciklusa, uz postojeću fazu lopte, sockete i IK.
- S02: normalizovane akcije, ivice gestova, tick vremenski ugovor, device ownership i replay.
- S03/S04: proširiti postojeće ubrzanje, oslonac i kontakt kontekstom balansa i oporavka.
- S05 nadalje: jedan ugovor tehnike i prenosa vlasništva nad kostima/loptom/stopalom.
- Dijagnostiku dograđivati preko postojećeg test seam-a, bez React objava svakog kadra.

Ne praviti generički novi engine pre nego što ove konkretne situacije zahtevaju promenu.
[Predlog prvog zahvata S01](S01_IMPLEMENTATION_PROPOSAL.md) je izdvojen i još nije implementiran.

## Tehničke reference

[Three.js AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html) podržava
nezavisno upravljanje animacijama objekta; to ne nalaže uvođenje miksera u S01.
[Rapier rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/)
razlikuje dinamičko i kinematičko vlasništvo nad kretanjem. Otvorena Rapier
online dokumentacija je za 0.21; projekat koristi verziju iz lockfile-a. S00 ne
nadograđuje biblioteke niti prepisuje kod prema drugoj verziji API-ja.
