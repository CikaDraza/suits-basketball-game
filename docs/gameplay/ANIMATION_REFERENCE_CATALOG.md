# Katalog referenci za košarkaške tehnike

Datum evidencije: 2026-11-07. Zahtevi su u
[kanonskom planu, §6](SUITS_GAMEPLAY_FOUNDATION_V2_2026_11_07.md#6-technique-reference-library).
Napredak slice-ova vodi isključivo [implementation tracker](IMPLEMENTATION_STATUS.md).

## Dostupnost i granice dokaza

Korisnik je predložio kanal
[KaKaBasketball — @kaka_animator / Shorts](https://www.youtube.com/@kaka_animator/shorts)
kao polaznu vizuelnu referencu. Pokušaj otvaranja tokom S00 vratio je `Cache miss`.
Nijedan konkretan video, segment ni animacioni fajl nije pregledan. Dostupnost,
autorstvo i dozvole za pojedinačne materijale nisu potvrđeni. Link kanala nije
dokaz da određeni potez ili vremenski segment postoji u njegovoj ponudi.

Zato je katalog trenutno red za izbor referenci i obrazac analize. Nema izmišljenih
URL-ova, timecode-ova ni biomehaničkih zaključaka pripisanih nepregledanom snimku.
Ako kanal nije dostupan, može se izabrati druga konkretna dostupna referenca uz
navođenje izvora i ograničenja.

Snimci služe za analizu položaja, kontakta i tajminga. Pre preuzimanja,
redistribucije ili korišćenja tuđeg animacionog fajla proveriti odgovarajuća prava.
Pregled snimka ne daje automatski dozvolu za kopiranje animacionih resursa. S00
ne preuzima materijal, ne menja postojeće GLB modele i ne generiše nove modele.

## Prioritet izbora

Oznake ispod predstavljaju planirane stavke kataloga, ne pregledane snimke.
Za svaku je konkretan URL/segment i dalje **pending**.

| ID     | Tehnika / povezani slice                   | Šta treba posmatrati u izabranom snimku                                                     | Dokaz koji treba dobiti                                                                        |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| REF-01 | Normalan dribling, S01                     | Priprema, kontakt gornje površine lopte, potisak, otpuštanje, oporavak; rame, lakat i zglob | Ceo ciklus iz čitljivog ugla, obe ruke ili jasno navedeno ograničenje                          |
| REF-02 | Dribling u kretanju i crossover, S01/S06   | Odvajanje ruke, putanja preko tela, prijem drugom rukom, oslonci i oporavak                 | Razlikovanje prenosa lopte od naredne odluke o prodoru                                         |
| REF-03 | Hod, zaustavljanje i odbrambeni korak, S03 | Prenos težine, kočenje, povratak oslonca, hod unazad/bočno                                  | Putanja stopala i težišta, uz vidljiv kontakt sa podom                                         |
| REF-04 | Kontakt i post-up, S04/S10                 | Rame/nadlaktica, položaj kukova, brace, otpor i oporavak oba igrača                         | Razlika stabilne odbrane i izgubljenog balansa                                                 |
| REF-05 | Triple threat, pivot i jab, S05            | Pivot/lead stopalo, vraćanje noge, zaštita lopte, ramena i glava                            | Legalno sidro stopala kroz celu tehniku                                                        |
| REF-06 | Cut, inbound i catch, S07                  | Polazak primača, praćenje lopte, dohvat, amortizacija prijema                               | Prijem zahteva dostupnu putanju i fizički dohvat                                               |
| REF-07 | Šut i fake, S08/S09                        | Gather, set point, leva potporna ruka, desni izbačaj, follow-through                        | Odvojeni trenutak komande i stvarnog izbačaja                                                  |
| REF-08 | Drop step i hook, S10                      | Kontakt, okret oko oslonca, slobodna noga, zaštita i izbačaj                                | Faze poteza i završetak bez teleportacije tela                                                 |
| REF-09 | Floater, step-back i fadeaway, S11         | Kočenje, prostor, odraz, težište i doskok                                                   | Različiti profili tela i lopte po tehnici                                                      |
| REF-10 | Contest i rebound, S12                     | Vertikalnost, tajming odraza, ruke i doskok                                                 | Razlika reach-a, vertikalnog skoka i stvarnog kontakta                                         |
| REF-11 | Monster dunk i rim hang, S13               | Prijem obruča, zatvaranje prstiju, vešanje, ljuljanje i puštanje                            | Oba dlana na obruču; referenca za korisnički traženo podizanje/širenje nogu tek nakon pregleda |
| REF-12 | Flop, pad i ustajanje, S14                 | Gubitak oslonca, kontakt sa podom, zaštita tela i fazno ustajanje                           | Oporavak koji ne prekida pravila vlasništva nad telom/loptom                                   |

Ne treba čekati da se pronađu svi snimci pre S01. Za svaki slice prvo odabrati
njegovu relevantnu referencu ili eksplicitno evidentirati da je poza originalno
proceduralno rešenje bez pregledane spoljne reference.

## Obrazac jedne pregledane reference

Kopirati obrazac tek kada postoji konkretan materijal. `Pending` polja ne tretirati
kao završenu analizu.

| Polje                                                                   | Zapis                                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Reference ID                                                            | REF-…                                                                                                |
| Izvor, autor i direktan URL                                             | Pending — konkretan video/izvor                                                                      |
| Datum pregleda i dostupnost                                             | Pending                                                                                              |
| Tehnika i povezani slice/scenario                                       | Pending                                                                                              |
| Relevantan segment                                                      | Pending — početak/kraj i format vremena                                                              |
| Početni stav napadača                                                   | Pending                                                                                              |
| Početni stav odbrambenog igrača                                         | Pending; ako ga nema u snimku, navesti to                                                            |
| Pivot stopalo                                                           | Pending; navesti nejasnoću ako ga ugao skriva                                                        |
| Lead stopalo                                                            | Pending                                                                                              |
| Kretanje centra mase                                                    | Pending — smer, približan profil i oslonci; razlikovati opažanje i pretpostavku                      |
| Ramena i glava                                                          | Pending                                                                                              |
| Položaj i putanja lopte                                                 | Pending                                                                                              |
| Kontakt / trenutak izbačaja                                             | Pending — odnos prema fazi tela i segmentu snimka                                                    |
| Oporavak                                                                | Pending — završni oslonac, balans i raspoloživost sledeće akcije                                     |
| Priprema → iniciranje → prenos težine → izvođenje → rezultat → oporavak | Pending — mapiranje faza na snimak                                                                   |
| Prilagođavanje Shaqu / Chucku                                           | Pending — navesti šta je opažanje, a šta predlog za probu                                            |
| Dozvole / način korišćenja                                              | Pending — analiza reference; odvojeno navesti eventualnu dozvolu za resurse                          |
| Implementacija                                                          | Pending — link na postojeći helper/klip, test i vizuelni artefakt; status slice-a ostaje u tracker-u |
| Ograničenja                                                             | Pending — ugao, zaklonjena stopala/ruke, ubrzan video, nepoznata merila                              |

## Hipoteze za prilagođavanje teškim likovima

Konfiguracija već razlikuje Shaqa (2,16 m / 150 kg) i Chucka (1,98 m / 138 kg).
Sledeće su **predlozi za probu i kalibraciju**, nisu zaključci izvedeni iz kanala:

- Shaqu može odgovarati duža priprema/kočenje i sporija promena pravca; Chucku
  brži lateralni oporavak. Masu i odziv komande ne poistovećivati sa kašnjenjem inputa.
- Visinu dlana, dohvat, amplitudu rada lakta i set point treba prilagoditi stvarnim
  dužinama kostiju i postojećim palm socket-ima, umesto kopiranja identičnih Euler uglova.
- Veći oslonac i izraženiji prenos težine mogu učiniti kontakt i zaustavljanje
  čitljivijim, ali ne smeju pomerati fizičko telo kroz protivnika ili kidati world-space oslonac.
- Vidljiv zamor i duži oporavak mogu razlikovati teške penzionisane likove od brzih
  profesionalnih bekova. Tačne amplitude i trajanja zahtevaju igru i merenje.
- Tokom vešanja na obruču dužina ruku, oba grip kontakta i odnos tela prema obruču
  moraju prethoditi širokim pokretima nogu. Izgled nije dovoljan dokaz fizičkog oslonca.

Postojeće osnove za implementaciju i njihova ograničenja su u
[auditu](FOUNDATION_AUDIT.md), [S01 predlogu](S01_IMPLEMENTATION_PROPOSAL.md),
[rig/skinning popravci](../shaq-finger-skinning-fix.md),
[rig auditu](../slice2-rig-audit.json) i [planted-foot locomotion izveštaju](../slice3-locomotion.md).
Ti dokumenti nisu zamena za pregled konkretnog referentnog snimka.
