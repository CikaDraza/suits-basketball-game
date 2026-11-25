# SUITS — DEF-ARM-FIX-1

Korekcija je pripremljena na `fix/def-arm-fix-1`, sa osnove `origin/staging` (`a868a0e`, merge PR-a #3). Nema automatskog merge-a. Sledeća kapija je korisničko vizuelno prihvatanje.

## Šta je promenjeno

**1A — kalibrisan, odvojen odbrambeni IK.** Svaka od četiri ruke dobija korekciju koordinatnih okvira iz stvarnih početnih rotacija nadlaktice i podlaktice. Uzdužni pravci i dužine se mere iz GLB-a; anatomska osa lakta prati postojeću bind/FK konvenciju konkretnog riga. Orijentacija segmenta čuva taj okvir umesto da nameće lokalnu X osu. Podlaktica dobija ograničenu pronaciju oko sopstvene ose, a šaka zasebnu rotaciju. Cilj se prvo određuje za ručni zglob, pa pretvara u cilj dlana preko kalibrisanog palm socket-a.

Za neodređen pole koristi se prethodna validna ravan u okviru roditelja ramena, zatim kalibrisan rezervni smer. Projekcija se glatko meša sa tim smerom pri približavanju singularnosti, a hemisfera savijanja ostaje kontinuirana i pri izlasku iz te zone. Ugao pronacije se odmotava preko granice ±180°, a lokalna rotacija šake ima vremenski ograničenu promenu pri malim promenama mete. Ruka ostaje malo savijena: bočno cilj 12°, iznad glave 8°, uz minimalnih 5° za bezbedan dohvat. Gard cilja 95°, kontakt 72°, a postojeće odgurivanje smanjuje savijanje do 36°. Ograničenja ručnog zgloba su 45° za pružanje/gard i 60° za kontakt. Stari clamp dlana na 92% dužine nije primenjen u ovom solveru. Geometrijski cilj ručnog zgloba se rešava jednom iz tražene orijentacije dlana; ograničena rotacija šake se ne vraća u petlju koja bi mogla izazvati višestruka rešenja i skok ravni lakta. Kod nemogućeg zahteva za orijentaciju dlana prednost imaju anatomija i stabilnost, pa dijagnostika može pokazati preostalu grešku kontakta. Kalibrisane odbrambene poze prolaze znatno strožu proveru kontakta od tih stres zahteva.

**1B — vlasništvo nad pozom.** Redosled ostaje FK → uvezeni hod → kontakt sa loptom → odbrambeni IK, u istom `Character` frame prolazu. Aktivna odbrana i njen izlazni blend isključuju trake ramena/ruku iz hoda. Lopta i hvatanje odmah isključuju odbrambeni sloj; prethodni blend kontakta sa loptom se čisti samo kada odbrana zaista preuzme ruke. Rameni pojas se kontroliše preko izmerenog pravca ključne kosti i početne rotacije, uz glatko podizanje. Suprotna ruka ostaje savijena ispred gornjeg dela trupa, sa dlanom blago ka unutra.

**1C — kalibracija i dijagnostika.** Implementirane su merene poze `ready`, `wide`, leva + gard, desna + gard, obe gore, kontakt, postojeće mahanje i oporavak. `wide` je eksplicitna poza za pregled; nije uvedena nova gamepad komanda. Test seam dodaje prednji, bočni i zadnji pregled, izbor poze i merenja ramena, lakta, ručnog zgloba, pravaca segmenata, ravni lakta, uvrtanja i visine dlana u odnosu na glavu i dostupan dohvat.

Originalni GLB fajlovi, skinning, `armContact.ts` za košarkašku loptu, ulazne komande, vreme fizičkog impulsa, mase, root fizika i algoritmi oslonca stopala nisu menjani.

## Merene vrednosti

Ugao lakta je 0° pri pravoj ruci. Vrednosti pre korekcije računaju se iz stvarnih položaja ramena, lakta i ručnog zgloba u staging snimku; vrednosti posle dolaze iz završne poze. Brojevi ispod su iz prednjeg statičnog pogleda; sirovi JSON sadrži sva tri ugla.

| Rig / ruka  | Nadlaktica + podlaktica | Lakat bočno pre → posle | Uvrtanje bočno posle | Ručni zglob bočno posle | Dlan visoko posle |
| ----------- | ----------------------- | ----------------------- | -------------------- | ----------------------- | ----------------- |
| Shaq leva   | 0,281606 + 0,313727 m   | 84,58° → 12,00°         | +8,42°               | 5,31°                   | 2,537 m           |
| Shaq desna  | 0,281464 + 0,322815 m   | 83,64° → 12,00°         | −8,18°               | 3,89°                   | 2,543 m           |
| Chuck leva  | 0,256988 + 0,274919 m   | 82,44° → 12,00°         | +16,42°              | 7,44°                   | 2,325 m           |
| Chuck desna | 0,272771 + 0,282997 m   | 79,36° → 12,00°         | −16,27°              | 7,54°                   | 2,334 m           |

Bočni dohvat ručnog zgloba prelazi 99% zbira dužina segmenata. Maksimalno odstupanje geometrijske ravni lakta od kalibrisane ose u statičnim browser pozama je manje od 0,001°. Ravan se poredi sa kalibrisanim početnim okvirom konkretnog riga.

| Rig / ruka  | Ručni zglob gore pre → posle | Dlan iznad Head kosti posle |
| ----------- | ---------------------------- | --------------------------- |
| Shaq leva   | 2,330 → 2,465 m              | 0,608 m                     |
| Shaq desna  | 2,334 → 2,474 m              | 0,614 m                     |
| Chuck leva  | 2,130 → 2,264 m              | 0,497 m                     |
| Chuck desna | 2,151 → 2,280 m              | 0,507 m                     |

Dostupna maksimalna visina se računa iz trenutnog ramena, zbira izmerenih dužina oba segmenta i vertikalnog offset-a palm socket-a za otvoreni dlan. Test zahteva najmanje 97% tog dohvata iznad ramena, šake najmanje 40 cm iznad Head kosti i lakat ispod 12°. U statičnom fixture-u zabeleženo je približno 99,45–99,46% geometrijskog maksimuma iznad ramena. Ne koristi se pretpostavljena visina karaktera. Za poređenje pre/posle visine koristi se ručni zglob jer prethodni FK za podignute ruke nije održavao sve dijagnostičke vrednosti palm kontakta.

## Dokazi za vizuelni pregled

[Interaktivna galerija pre/posle i hoda](../playtest/def-arm-fix-1/index.html) omogućava izbor karaktera i poze, sva tri ugla i otvaranje originalnih snimaka. [Precizne mere](../playtest/def-arm-fix-1/summary.json) i zasebni `before/*-measurements.json`, `after/*-measurements.json`, `after/*-walking-transitions.json` ostaju uz slike.

| Poza         | Shaq: tri ugla pre/posle                                  | Chuck: tri ugla pre/posle                                  |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------------- |
| Gard         | [snimci](../playtest/def-arm-fix-1/review/shaq-ready.jpg) | [snimci](../playtest/def-arm-fix-1/review/chuck-ready.jpg) |
| Obe bočno    | [snimci](../playtest/def-arm-fix-1/review/shaq-wide.jpg)  | [snimci](../playtest/def-arm-fix-1/review/chuck-wide.jpg)  |
| Leva + gard  | [snimci](../playtest/def-arm-fix-1/review/shaq-left.jpg)  | [snimci](../playtest/def-arm-fix-1/review/chuck-left.jpg)  |
| Desna + gard | [snimci](../playtest/def-arm-fix-1/review/shaq-right.jpg) | [snimci](../playtest/def-arm-fix-1/review/chuck-right.jpg) |
| Obe gore     | [snimci](../playtest/def-arm-fix-1/review/shaq-up.jpg)    | [snimci](../playtest/def-arm-fix-1/review/chuck-up.jpg)    |
| Podlaktice   | [snimci](../playtest/def-arm-fix-1/review/shaq-brace.jpg) | [snimci](../playtest/def-arm-fix-1/review/chuck-brace.jpg) |
| Mahanje      | [snimci](../playtest/def-arm-fix-1/review/shaq-wave.jpg)  | [snimci](../playtest/def-arm-fix-1/review/chuck-wave.jpg)  |

Poze `ready` i `wide` nisu postojale kao zasebne poze u osnovi; njihov red „before” prikazuje tadašnje neutralno ponašanje. Prvi probni snimci sa portretnim viewport-om odbačeni su i zamenjeni stvarnim pejzažnim snimcima igre. Statične slike su pojedinačni vremenski uzorci, naročito za mahanje; kontinuitet se proverava i uzorkovanjem i izolovanim testovima.

## Verifikacija

- `npm run check`: typecheck, lint, svih **175** unit/regresionih testova i format prolaze.
- `npm run build`: prolazi; postojeće upozorenje o veličini bundle-a ostaje.
- Izolovani IK testovi: obe ruke oba riga, četiri orijentacije tela, lateralni/gornji/gard cilj, dužine segmenata, palm orijentacija i wrist/twist ograničenja. Singularni pole se proverava na 5,1° i 12° uz perturbacije od ±10⁻⁶ i ±10⁻⁴, i izričitu potvrdu rezervnog smera; ciljevi van dohvata ne produžavaju kosti.
- Dodatni prolaz kroz celu singularnu zonu: po 201 cilj, obe strane i oba riga, pri 5,1° i 12° savijanja, sa stvarnim palm socket-ima i ograničenjima šake. Po koraku od oko 0,002 rad merena je najveća rotacija nadlaktice 0,1146°, podlaktice ispod 0,0001°, šake 0,0606°, bez promena hemisfere ili skoka na suprotan limit.
- Izolovane poze i prelazi: gard, obe bočno, leva/desna + gard, obe gore, kontakt, vrh odgurivanja, izlazak iz poze i prepuštanje lopti. Hod nastavlja noge, bez traka ruku.
- Browser regresije: kontrola odbrane/neutral/pause/reconnect/odgurivanje na oba karaktera; držanje lopte; kontakt, dribling i crossover pri standardnom renderovanju i 20 Hz; hod/oslonac stopala/root ponašanje pri standardnom renderovanju i 20 Hz.
- Završni browser pregled: **6/6 scenarija prolazi** na konačnom buildu. Statične poze iz tri ugla, obe gore tokom stvarnog hoda uz aktivan uvezeni hod Shaqa i nula primenjenih traka ruku, prelazi između obe strane/kontakta/oporavka i postojeći dribling desnim stickom.

Pregled hoda i oporavka iz sva tri ugla: [Shaq hod](../playtest/def-arm-fix-1/review/shaq-walking.jpg), [Shaq oporavak](../playtest/def-arm-fix-1/review/shaq-recovery.jpg), [Chuck hod](../playtest/def-arm-fix-1/review/chuck-walking.jpg), [Chuck oporavak](../playtest/def-arm-fix-1/review/chuck-recovery.jpg). Za snimke prelaza koristi se hod ispod praga iscrpljivanja i proverava se da aktivna odbrambena komanda ne bude zamenjena stun stanjem. Logovi `check-verification.txt`, `build-verification.txt`, `browser-verification.txt` i `walking-verification.txt` sačuvani su uz snimke.

Snimci i sirova merenja su lokalni artefakti u git-ignorisanom `playtest/def-arm-fix-1/`. Nije dodata nova košarkaška tehnika niti Rokoko integracija. Fizički impuls odgurivanja i dalje koristi postojeći trenutak kontakta; precizno vezivanje impulsa za dodir podlaktice ostaje van ovog slice-a.

**Status: čeka korisničko vizuelno prihvatanje; ne spajati automatski.**
