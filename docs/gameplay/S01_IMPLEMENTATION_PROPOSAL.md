# S01 — predlog prvog implementacionog zahvata

Status: Planned. Ovaj dokument ne menja animaciju. Preduslov je pregledan S00 i
zabeležen baseline. Sačuvati postojeću fiziku, komande, oslonce i modele.

## Problem koji treba rešiti

Cilj dlana sada ostaje gotovo na `dribbleTop`. Cela putanja lopte i dodir pri vrhu
već postoje, ali to ne dokazuje spuštanje ruke, fleksiju lakta i povratak.
[Audit F-01/F-02](FOUNDATION_AUDIT.md) razlikuje potvrđenu formulu od vizuelne ocene.

## Najmanji koherentan zahvat

Proširiti `src/game/entities/handContactPose.ts` malim čistim pomoćnikom za faznu
putanju dlana. Ako pomoćnik zaslužuje fajl, koristiti npr. `dribbleHandTrajectory.ts`;
ne praviti novi tehnički engine. Izvor ostaje postojeći `ballControl.phase`, aktivna
ruka i crossover iz `ballHandling.ts`. Ne dodavati nezavisan sat ruke.

| Faza                | Namera ruke                                                                              | Kontakt                              |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| Priprema/vrh        | Dlan iznad lopte, lakat savijen, zglob orijentisan ka lopti                              | Dodir površine lopte na vrhu         |
| Potisak             | Rame i lakat koordinisano spuštaju dlan, uz prenos težine koji ne pomera telo automatski | Kratak, definisan kontaktni prozor   |
| Otpuštanje          | Dlan prestaje da prati loptu; položaj i orijentacija nastavljaju se bez skoka            | Razdvajanje od lopte                 |
| Slobodan pad/odskok | Ruka ne ide do parketa; druga ruka balansira/štiti                                       | Bez lepljenja ili penetracije        |
| Oporavak/povratak   | Ruka se vraća i priprema novi kontakt                                                    | Kontakt tek kada lopta ponovo stigne |

Tačne granice faza i amplitude prvo izmeriti na oba modela. Koristiti različite
profile za potisak i oporavak, sa neprekinutim položajem i kontrolisanom promenom
brzine; jedna opšta ease kriva nije zamena za tehniku. Po potrebi animirati i
elbow pole, uz postojeće anatomske limite i neutralni reset kostiju svakog kadra.

## Fajlovi za ponovno korišćenje

| Fajl                             | Uloga u S01                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| `handContactPose.ts`             | Koordinacija faza i aktivne/slobodne ruke                             |
| `armContact.ts`                  | Postojeći ograničeni IK; menjati samo ako merenje pokaže potrebu      |
| `palmSockets.ts`                 | Sačuvati kalibraciju po modelu; ne zamenjivati wrist origin-om        |
| `simulation/ballHandling.ts`     | Čitati postojeću fazu; ne menjati vlasništvo/putanju lopte bez dokaza |
| `game-config.json`               | Jasno imenovani parametri putanje/faza po potrebi, sa jedinicama      |
| `tests/dribble-contact.test.ts`  | Proširiti postojeće top-contact provere na svaki deo ciklusa          |
| `tests/browser/slice2.spec.ts`   | Proširiti stvarne rigove, kadrove, poglede i artefakte                |
| Postojeći hand debug i test seam | Koristiti stvarne svetske socket transformacije i beležiti fazu       |

`gait.ts`, `posture.ts`, `movement.ts`, gamepad, pravila šuta i bodovanje ostaju van
ovog zahvata. Crossover ostaje promena ruke i lopte, bez automatskog bočnog prodora.

## Dokaz koji mora odbaciti sadašnji kvar

Pre implementacije dodati crveni test koji sadašnja skoro statična šaka ne može
proći. Na stvarnim rigovima Shaqa i Chucka, obe ruke, meriti:

- Vertikalnu amplitudu dlana kroz potisak i oporavak, u metrima i kao udeo raspona lopte.
- Raspon i smer fleksije lakta; rame, lakat i zglob moraju dati koherentan pokret.
- Minimalno/maksimalno rastojanje dlana od lopte u kontaktu, otpuštanju i slobodnom letu.
- Normalu dlana prema lopti, penetraciju i ograničenja dohvata/zgloba.
- Maksimalni pomeraj i ugaonu promenu po koraku/kadru u odnosu na proteklo vreme.
- Kontinuitet držanje → dribling → crossover → držanje i odsustvo akumuliranog drifta.

Prvo snimiti sadašnje vrednosti. Prag amplitude mora biti jasno iznad sadašnjih
~13–14 mm cilja, ali konačnu vrednost kalibrisati prema vidljivom pokretu i proporcijama,
ne prema želji da test bude zelen. Ne proglašavati proizvoljnu amplitudu za biomehanički standard.

Pre implementacije zabeležiti trijažu baseline padova B-01/B-02 iz
[regresionog izveštaja](REGRESSION_BASELINE.md). S01 ne sme da ih sakrije ili
snizi postojeće pragove. Ako istraga zahteva gameplay zahvat van njegovog opsega,
posebno opisati mali preduslov i njegov dokaz pre širenja izmene.

## Matrica provere

Oba modela × leva/desna ruka × mirovanje/kretanje/okret × normalan/crossover
ciklus. Unit proba pri 20/30/60/120 Hz; browser pri normalnom i usporenom renderu.
Svaki ciklus uzorkovati po fazama, ne samo po nasumičnim render frejmovima ili vrhu.
Beležiti stvarno opaženi FPS; cap od 20 Hz nije dokaz da je browser prikazao 20 FPS.

Zadržati stare asertacije za vrh, pod na jednom poluprečniku lopte, handoff pri
odskoku, nezavisnost kostura, stabilne tabane, fizički inbound i pauzu/reset.
Pokrenuti `npm run check`, `npm run build`, relevantne i postojeće browser testove.
Pregledati front/side/gameplay snimke potiska, otpuštanja, odskoka i oporavka.

## Granica prihvatanja

S01 je gotov tek kada se kroz ceo ciklus vide promena visine šake i rad lakta,
kontakt postoji u odgovarajućoj fazi, ruka se odvaja i vraća, a ranije mehanike
ostaju ispravne. Zelene endpoint asertacije same nisu dovoljne. Novi fizički
model šuta, balans odbrane i gamepad pripadaju narednim slice-ovima.
