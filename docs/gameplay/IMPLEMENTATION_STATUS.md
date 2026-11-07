# Gameplay Foundation v2 — autoritativni status

Datum provere: 2026-11-07. Referentni `main`:
`465f6e080f60bd6060f9f02b52e5f6dcec9e38d4`.

Ovaj fajl vodi napredak. Kanonski dokument je
[sačuvani korisnički predlog](SUITS_GAMEPLAY_FOUNDATION_V2_2026_11_07.md), a
[provera osnove i dopune](FOUNDATION_AUDIT.md) beleže razlike prema stvarnom kodu.
Prethodni commit-i `bd83a66` (Slice 2) i `465f6e0` (Slice 3) nisu oznake S02/S03
iz ovog novog plana.

## Poreklo dokumenta i istorijski opseg S00

Prilog „Gameplay Foundation v2 — Biomechanics, Physics, Basketball Skills & Controls“
primljen je 2026-11-07, 42.198 bajtova. SHA-256 originala:
`b86ec8bb1f80cda67bb78efa291e939775f1b2db64b708db785c0d65476004dc`.
Sadržaj predloga je sačuvan; Markdown format je usklađen sa Prettier-om. Dopune
zavisnosti su odvojene u auditu, umesto tihog menjanja korisničkih zahteva.

S00 je obuhvatio dokumentaciju, pregled i beleženje postojećih testova.
Nijedan S01–S16 gameplay zahvat nije deo S00. Grana za pregled:
`docs/gameplay-foundation-v2-s00`, commit `524aea9`. Nema direktnog push-a na `main`.

## Značenje statusa

`Planned → In Progress → Implemented → Automated Verified → Visual Verified → Accepted`.

- `Implemented`: isporučen opseg konkretnog slice-a, ne samo pomoćna klasa.
- `Automated Verified`: izvršene asertacije i regresije za taj opseg, uz zapis rezultata.
- `Visual Verified`: pregledani oba lika i potrebni pogledi/scenariji, uz navedene artefakte.
- `Accepted`: eksplicitno prihvaćen završen slice; zelen build sam ne daje taj status.

Delimično postojeća mehanika nije automatski završen novi slice. Rupe u dokazima
ostaju vidljive u [registru scenarija](SCENARIO_REGISTRY.md).

## Redosled i kontrolne kapije

| Slice | Opseg                                                 | Preduslovi za prihvatanje                               | Trenutni status                                                                                                     |
| ----- | ----------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| S00   | Audit, ugovori, scenario registar, baseline i roadmap | Zapis rezultata provere trenutne osnove i pregled plana | Accepted — korisnik odobrio nastavak na S01; baseline rezultati sačuvani                                            |
| S01   | Ceo ciklus ruke pri driblingu i kontakt               | S00                                                     | Implemented — S01 4/4 browser, 65/65 unit i vizuelno pregledan; full 31/33, B-02/B-04 otvoreni; prihvatanje pending |
| S02   | Jedinstvene input namere i gamepad                    | S00; izvršavanje posle S01                              | Planned                                                                                                             |
| S03   | Teško kretanje, tempo i progresivni zamor             | S02                                                     | Planned; postojeće ubrzanje/gait se proširuju                                                                       |
| S04   | Kontakt, odbrambeni otpor i balans                    | S03                                                     | Planned                                                                                                             |
| S05   | Triple threat, pivot i jab                            | S04                                                     | Planned                                                                                                             |
| S06   | Crossover i overcommitment                            | S05 + S01 (dopuna audita)                               | Planned                                                                                                             |
| S07   | Inbound predikcija, lob i recovery                    | S03 + S04; regresije kontakta S01                       | Planned; postojeći inbound ostaje osnova                                                                            |
| S08   | Priprema šuta, fake i događaj izbačaja                | S01 + S05                                               | Planned                                                                                                             |
| S09   | Fizički šut, tabla, obruč, mreža i bodovanje          | S08                                                     | Planned                                                                                                             |
| S10   | Post-up, drop step i hook                             | S04 + S05 + S09                                         | Planned                                                                                                             |
| S11   | Floater, step-back i fadeaway                         | S08 + S09 + S10                                         | Planned                                                                                                             |
| S12   | Vertikalna odbrana, contest i skok                    | S04 + S09                                               | Planned                                                                                                             |
| S13   | Monster dunk, prsti, obruč, vešanje i noge            | S09 + S12; provera realnog grip-a i dohvata             | Planned                                                                                                             |
| S14   | Flop, pad, ustajanje, leg grab i smash                | S04 + S12; razrešen fake/shot/smash ugovor iz S08       | Planned                                                                                                             |
| S15   | Početno raspucavanje i lifecycle duela                | S09 + reset regresije                                   | Planned                                                                                                             |
| S16   | CPU, povezivanje poteza, balans i performanse         | Prihvaćeni prethodni gameplay slice-ovi                 | Planned                                                                                                             |

Izvršavanje ide S00 → S01 → S02, zatim numeričkim redom uz kapije iz tabele.
Promena prioriteta zbog greške koja sprečava proveru mora biti zapisana kao
ograničen zahvat tekućeg slice-a. Nema usputnog otvaranja drugog velikog slice-a.

## Pregled pre početka S01

1. Pregledati [audit](FOUNDATION_AUDIT.md) i [baseline](REGRESSION_BASELINE.md).
2. Potvrditi [S01 predlog](S01_IMPLEMENTATION_PROPOSAL.md), metrike i vizuelni postupak.
3. Zadržati postojeće sockete, IK limite, gait i jednog vlasnika lopte.
4. Izvesti samo S01, izvršiti njegovu punu proveru i zabeležiti prihvatanje.
5. Tek zatim otvoriti S02.

## Evidencija prihvatanja

S00: prihvaćen korisničkim odgovorom „Ok, može S01“ (2026-11-07). Originalni
rezultati ostaju u [baseline-u](REGRESSION_BASELINE.md): 61/61, build PASS, browser
31/33. To prihvatanje dokumentacionog koraka nije tvrdnja da su svi gameplay
scenariji već verifikovani.

S01: implementiran na `feat/s01-dribble-hand-cycle`, oba modela i obe ruke.
Izvršeno: check 65/65, build PASS, S01 browser 4/4; pun paket 31/33 sa otvorenim
Chuck gait/sampling padovima B-02/B-04. Nije proglašen potpuno zelenim.
Implementaciju, crveni/zeleni test, kalibraciju i stvarnu proveru vodi
[S01 izveštaj](S01_IMPLEMENTATION_REPORT.md). Prihvatanje S01 ostaje pending.
S02–S16 nisu započeti. Kanonski predlog i S00 baseline nisu prepisivani da bi se
naknadni rezultati prikazali kao polazno stanje.
