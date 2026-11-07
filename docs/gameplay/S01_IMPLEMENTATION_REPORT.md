# S01 — fazni rad ruke kroz ceo dribling

**Dopuna:** korisnik je odbio vizuelni rezultat prve kalibracije. Aktuelna
popravka amplituda, laktova i ulaza za crossover dokumentovana je u
[korekciji driblinga](DRIBBLE_FEEDBACK_FIX.md). Brojevi ispod opisuju prvi S01 run.

Grana: `feat/s01-dribble-hand-cycle`. Osnova: `524aea9` (S00 dokumentacija),
gameplay osnova `465f6e0`. Korisnik je odobrio početak S01. Ovaj zapis opisuje
S01; naredni slice-ovi nisu započeti. Konačan status vodi
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Potvrđen uzrok i crveni test

`handContactPose.ts` je držao cilj na `dribbleTop + radius`. Korekcija oko vrha
bila je umnožena kratkim kontakt blend-om, pa je kroz ceo ciklus ostajalo samo
13–14 mm vertikalnog rada dlana i oko 4° promene lakta. Test kontakta pri vrhu je
zato prolazio sa ukočenom rukom.

Pre izmene dodat je test **celog ciklusa stvarnog riga**. Oba modela padaju sa
porukom `frozen palm` na 20 Hz: Shaq 13,93 mm / 4,22°, Chuck 12,63 mm / 4,27°.
Zasebno gusto uzorkovanje daje Shaq 14,08 mm, Chuck 12,76 mm. To su sada merene
socket pozicije, a ne samo procena formule iz S00. Lokalni dokaz:
`/tmp/suits-s01-red.log`, `/tmp/suits-s01-measure-before.jsonl`.

Proba dohvata je pokazala i zašto samo veliki vertikalni offset nije ispravka:
spuštanje za 12–24 cm pri istoj udaljenosti od tela previše ispruža ruku i aktivira
postojeće limite lakta. Zato slobodna šaka posle potiska ide malo ka kuku, zatim se
vraća ka lopti. Granice zglobova i palm kalibracija nisu menjani.

## Izmena i vlasništvo

[dribbleHandTrajectory.ts](../../src/game/entities/dribbleHandTrajectory.ts) je mali
sampler prezentacije. Čita postojeću fazu lopte i piše u ponovo upotrebljen izlaz;
nema svog sata, novih React objava ni per-frame alokacija. Koristi postojeći
`dribbleHeight` i kratke Hermite segmente sa usklađenim krajnjim brzinama.

| Faza ciklusa | Pri periodu 0,6 s | Šta rade ruke                                              |
| ------------ | ----------------- | ---------------------------------------------------------- |
| 0–0,12       | 0–72 ms           | Dlan potiskuje gornju površinu lopte                       |
| 0,12–0,30    | 72–180 ms         | Otpuštanje i ograničeni follow-through ka kuku             |
| 0,30–0,52    | 180–312 ms        | Ruka ostaje iznad poda dok se lopta slobodno spušta/odbija |
| 0,52–0,92    | 312–552 ms        | Povratak dlana uz ponovno ispružanje prema lopti           |
| 0,92–1       | 552–600 ms        | Ponovni kontakt, priprema narednog potiska                 |

`handContactPose.ts` pretvara taj uzorak u svetski cilj, normalu dlana i postojeći
IK. Korekcija prema stvarnoj lopti čuva ulazni catch/hold blend i crossover.
Postojeći update redosled u `Character.tsx` ostaje isti. Rame, lakat i zglob rešava
postojeći ograničeni solver; nema identičnih Euler poza nametnutih različitim rigovima.

Lopta ostaje u postojećoj jednoj kinematičkoj putanji driblinga. Nisu menjani
`ballHandling.ts`, Rapier režimi, crossover handoff, sila/masa tela, gait, Q/J/R
komande, kamera, geometrija, GLB ili sockete. S01 nije fizički redizajn driblinga.

## Kalibracija

Nove vrednosti su u `animation.dribbleHand` postojećeg `game-config.json`.
Faze su udeo ciklusa; `wristPitch` 0,12 je u radijanima, pomeraji u metrima.

| Profil | Spuštanje dlana | Povlačenje bočno ka telu | Povlačenje unazad prema kuku |
| ------ | --------------: | -----------------------: | ---------------------------: |
| Shaq   |          0,14 m |                   0,10 m |                       0,16 m |
| Chuck  |          0,13 m |                   0,08 m |                       0,14 m |

Socket kalibracije ostaju iz `palmSockets.ts`: Shaq L `[-.001,.072,-.046]`,
R `[.001,.069,-.046]`; Chuck L `[-.001,.060,-.036]`, R `[.001,.053,-.034]`.
To su lokalne koordinate hand kosti, ne svet ili centar modela. Njihove različite
orijentacije i nezavisni kosturi instanci su sačuvani.

## Automatizovani dokaz

`tests/dribble-contact.test.ts` sada proverava oba modela, obe ruke, mirovanje i
kretanje sa okretom na 20/30/60/120 Hz. Svaka kombinacija meri najmanje tri cela
ciklusa: amplitudu i smer rada dlana/lakta, push/catch kontakt, odvajanje od slobodne
lopte, penetraciju, dohvat, wrist/elbow limite i ograničene brzine/quaternion promene.
Dodatno se osam puta ponavlja hold → dribble → crossover → hold bez kumulativnog drifta.

| Metrika kroz test matricu                     |             Shaq |            Chuck |
| --------------------------------------------- | ---------------: | ---------------: |
| Vertikalni raspon dlana                       | 141,36–142,21 mm | 130,64–130,92 mm |
| Raspon fleksije lakta                         |     29,97–31,42° |     28,29–32,59° |
| Najveći IK target error                       |          6,75 mm |          2,99 mm |
| Najveća brzina dlana, uključeno kretanje tela |         2,70 m/s |         2,32 m/s |
| Najveća promena arm quaterniona po vremenu    |      16,46 rad/s |      14,90 rad/s |

Prag amplitude je >95 mm, jasno iznad starog kvara; nije proglašen univerzalnim
biomehaničkim standardom. Prag raspona lakta je >12°. Sadašnji profil prolazi bez
promene postojećih anatomskih limita. Maksimalna IK greška nije isto što i razmak
od površine lopte: taj razmak i normalu test posebno proverava tokom push/catch faza.

`tests/browser/slice2.spec.ts` zadržava ranije hold/post/top/floor/crossover provere,
a dodaje amplitudu stvarnog renderovanog dlana/lakta, uzorkovanje push/release/floor/
recovery faza i odvajanje bez penetracije. Posle post hold provere gasi Q stav,
pa posebno proverava običan uspravan dribling levom i desnom rukom.

| Završna provera                         | Rezultat                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run check`                         | PASS: TypeScript, ESLint, **65/65** testova, 0 skipped, format                             |
| `npm run build`                         | PASS; postojeće upozorenje na velike JS chunk-ove ostaje                                   |
| Pun browser paket, `playtest/s01-final` | **31/33 PASS**, 7,3 min; S01 četiri provere **4/4 PASS**                                   |
| Preostali padovi                        | B-02 Chuck strafe 0,3333 umesto ≥0,4; B-04 Chuck inbound foot lift 0,0191 m umesto >0,03 m |

Prvi puni run (`playtest/s01-regression`) bio je 27/33: B-01, B-03 i četiri
S01 fixture pada na Q izlasku iz post stava. Posle opisanih korekcija testova
pokrenut je ceo paket ponovo. Ni taj završni run nije predstavljen kao potpuno
zelen. B-02/B-04 ostaju otvoreni, bez menjanja strafe/lift pragova.

Stvarni browser podaci iz `slice2-*/contact-report.json`:

| Model / render režim | Opaženi dribble FPS |   Raspon dlana L/R | Raspon lakta L/R |
| -------------------- | ------------------: | -----------------: | ---------------: |
| Shaq default         |                9,06 | 137,04 / 149,21 mm |   25,30 / 37,69° |
| Shaq cap20           |                9,06 | 147,49 / 143,29 mm |   34,35 / 30,65° |
| Chuck default        |                9,81 | 132,01 / 130,05 mm |   33,72 / 26,16° |
| Chuck cap20          |                9,81 | 122,23 / 122,05 mm |   35,11 / 22,04° |

Render rezultati se razlikuju od izolovanog unit riga zbog bazne poze,
interpolacije i uzorkovanja. U oba slučaja test odbacuje stari skoro statični dlan.
Logovi: `/tmp/suits-s01-check-final.log`, `/tmp/suits-s01-build.log`,
`/tmp/suits-s01-browser-final.log`, `/tmp/suits-s01-contact-final.log`.
Artefakti/logovi su lokalni; ovaj izveštaj trajno čuva rezultate i ograničenja.

## Razrešenje baseline padova

B-01/B-02 su ponovljeni **pre runtime izmene**, nad starim produkcionim buildom:
2/2 prolaze. Istorijski padovi iz [S00 baseline-a](REGRESSION_BASELINE.md) ostaju
sačuvani; taj run nije prepisan kao zelen.

B-01 se ponovio u prvom punom S01 run-u. Playwright trace potvrđuje isti snapshot:
`time=6.4833`, HUD `owner=-1/ballState=pass`, ali stvarna lopta ima
`owner=0/state=held` i pass `outcome=caught`. Catch se obrađuje posle fizike, a HUD
se objavljuje odvojeno sa nižom frekvencijom. To je test koji meša dva vremenska
izvora, nije dokaz gubitka fizičkog poseda.

Mala korekcija `tests/browser/inbound.spec.ts` zato odmah proverava runtime
`ball.owner/state`, zadržava proveru handling-a i posebno čeka HUD owner=0. Nisu
menjani trajanje pasa, catch uslovi ili pragovi. B-02 ostaje poznata povremena
klasifikacija/sampling situacija: postojeći strafe prag i gait nisu menjani;
rezultat novog punog run-a beleži se ispod.

U prvom run-u Chuck je pao ranije na broju replant-a (B-03), a ne na B-02.
Trace pokazuje dva stvarna zastoja: 0,200 s / 0,607 m i 0,183 s / 0,556 m između
render kadrova. Postojeći `Character.tsx` namerno resetuje oslonac kada pomeraj
pređe `animation.gait.snapDistance=0.5 m`, ali test je svaki takav reset brojao u
isti budžet od jednog neobjašnjenog reset-a po segmentu.

Test sada odvojeno beleži **izmerene hitch replant-e** i zadržava prag ≤1 za
ostale reset-e. Grounding, stance-slide, smer koraka, ubrzanje i strafe pragovi
ostaju isti. Gait i fizičko kretanje nisu menjani. Ovo ne proglašava trzav hod na
softverskom WebGL-u glatkim niti dokazuje rad pri 60 FPS.

Prva verzija proširenog browser fixture-a koristila je trenutni Q tap pri izlasku
iz post-a; pri niskom FPS-u on može proći između fizičkih tick-ova. Zamenjen je
postojećim down → opažena promena stava → up postupkom. Ovo čuva gameplay komande;
normalizacija kratkih input ivica ostaje posao S02.

U završnom run-u opažen je i B-04: Chuck `post-motion` inbound shuffle ima
maksimalni opaženi lift 0,0191 m umesto >0,03 m. Raniji Slice 3 izveštaj već
beleži povremeni pad iste vrste na ovom modelu. U prvom S01 run-u sva četiri
post-motion testa su prošla; u završnom je pao jedan. Ne prepisuje se kao sigurno
nova greška animacije ruku, niti se prag snižava. Potrebna je zasebna provera
sampling-a/gait-a; S01 ne menja te module.

## Vizuelna provera i ograničenja

Proba koristi postojeći `window.__TEST__`: seed 42, testMode, P1 `(5,.95,0)`,
P2 `(9,.95,-4)`. Obe vrste riga, leva/desna ruka i front/side. Faza je očitana iz
stvarnog kontrolera; na ulasku u traženi prozor pauzirana je simulacija za screenshot.
Faza, lopta i kosti nisu ručno postavljani radi kadra. Ovo nije fixed-step replay.

Lokalni artefakti: `playtest/s01-visual/` i `playtest/s01-visual-alt/`, po pet faza
(push/release/floor/recovery/catch) za oba lika i oba para pogleda. Skripte za
ponavljanje su `.tmp/s01-visual.cjs` i `.tmp/s01-visual-alt.cjs`; JSON observacije
čuvaju stvarnu fazu, socket/ball/joint podatke i greške. Kretanje/okret/crossover
su dodatno probani kroz stvarne input ose. Obe probe su završene bez network/console/page grešaka; ukupno je sačuvano
40 faznih kadrova i četiri kadra posle kretanja/crossover-a.

Prvi side pogled na desnu ruku delimično zaklanja telo; zato je dodata druga
proba sa vidljivom levom rukom sa strane i desnom rukom spreda, umesto zaključka
na osnovu zaklonjenog zgloba. Pregledane su sve faze oba modela i obe ruke kroz kompozitne preglede
`playtest/s01-review-shaq.png` i `playtest/s01-review-chuck.png`, kao i izvorni
krupni kadrovi vidljivih šaka. Dlan se spušta, odvaja i vraća; lakat/rame menjaju
pozu, nema vidljivih dugih trouglova, odvojenih prstiju ili vezivanja za lakat.
Side pogled desne ruke ostaje označen kao zaklonjen; drugi uglovi popunjavaju taj
vizuelni dokaz. Kompoziti su lokalni pregled screenshot-ova, ne dodatne animacije.

Softverski WebGL okruženje ne postiže stabilnih 60/120 FPS. Unit frekvencije i
render cap nisu tvrdnja o stvarnom FPS-u uređaja. Bez full-body mocap klipova,
proceduralna poza ostaje ograničena postojećim rigovima i IK limitima. Nema novih
plaćenih ili preuzetih animacionih resursa.

## Promenjeni fajlovi

- `src/game/entities/dribbleHandTrajectory.ts`: fokusiran fazni sampler.
- `src/game/entities/handContactPose.ts`: ciljevi ruke kroz ceo ciklus.
- `src/game/data/game-config.json`: imenovani parametri i profili oba modela.
- `tests/dribble-contact.test.ts`: crveni/zeleni ceo ciklus i ponovljene tranzicije.
- `tests/browser/slice2.spec.ts`: ceo ciklus stvarne prezentacije.
- `tests/browser/inbound.spec.ts`: razdvajanje runtime poseda i HUD osvežavanja.
- `tests/browser/locomotion.spec.ts`: odvojena evidencija dokazanih render hitch reset-a.
- Dokumentacija/status/scenario registar: stvarni rezultati S01, bez otvaranja S02.

## Stanje isporuke

S01 implementacija i njene fokusirane provere su završene. Pun regresioni paket
ima dva otvorena Chuck gait/sampling pada (B-02/B-04), pa se ne proglašava potpuno
zelenom osnovom. Status ostaje `Implemented` uz izvršenu S01 automatizovanu i
vizuelnu proveru; konačno korisničko prihvatanje je pending. S02 nije započet.
