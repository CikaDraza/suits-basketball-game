# Shaq: šiljci pri savijanju prstiju

Datum: 7. novembar 2026.

## Potvrđen uzrok

Problem su pogrešni skin joint indeksi/težine u postojećem GLB-u. Zbir težina je
normalizovan, indeksi su u dozvoljenom opsegu, a inverse bind matrice i hijerarhija
65 kostiju odgovaraju neutralnoj pozi. To ipak ne znači da su anatomski uticaji ispravni.

Primer: vrh `9148` na desnoj šaci imao je **24.6987%** težine kosti
`mixamorig:LeftHandPinky4`. Vrhovi druge šake imali su odgovarajući obrnuti problem.
Na vrhovima prstiju nalazili su se i uticaji `RightToe_End`, dok je 21 vrh u distalnim
površinama prstiju bio dodeljen pogrešnom susednom prstu.

Rotiranje jedne kosti zato je povlačilo pojedine vrhove udaljene šake, uz naglo
različito kretanje susednih vrhova istog trougla. Dobijali su se vidljivi „noževi”.
Normalizacija težina sama za sebe ne uklanja takve pogrešne veze.

## Popravka u asset-u

Popravljena su oba odgovarajuća primerka:

- `public/models/shaquille_oneal.glb` — model koji učitava igra;
- `Basketball_Characters/models/shaquille_oneal.glb` — odgovarajući izvorni primerak.

Original je sačuvan u `.backup/2026-11-07-shaq-fingers/shaquille_oneal.glb`.

Skripta uklanja uticaje suprotne šake i udaljenih kostiju, razdvaja uticaje distalnih
površina prema povezanim komponentama prstiju i ispravlja pogrešne dodele iz obližnjih
ispravnih vrhova istog prsta. Prelazi težina se zatim ublažavaju preko stvarnih ivica
mreže, uz objedinjavanje UV/normal seam duplikata. Prostorno bliski, ali nepovezani prsti
ne povezuju se dodatnim ivicama. Ostaju najviše četiri normalizovana uticaja po vrhu.

Uklonjeno je 3,240 neispravnih uticaja. Promenjeni su skin atributi 4,638 vrhova:
4,361 u oblasti šaka/zglobova i 277 udaljenih vrhova sa neispravnim uticajima šaka.

**Menjani su isključivo binarni opsezi `JOINTS_0` i `WEIGHTS_0` telesne mreže.**
Položaji vrhova, trouglovi, normale, UV, teksture, morph targeti, FaceDemo animacija,
hijerarhija kostiju i inverse bind matrice ostali su identični na nivou bajtova.
Veličina GLB-a ostaje tačno **12,641,480 bajtova**. Nema novog runtime klampovanja,
isključivanja prstiju ili skrivanja deformacije u React komponenti.

## Provere

Python test rotira svaki pojedinačni zglob prsta, lance prstiju, celu šaku i ručne
zglobove, oko sve tri lokalne ose i u oba smera do 70° — ukupno **324 poze**.
Nezavisan Node/Three.js test ponavlja istih 324 slučaja koristeći pravi GLTFLoader
i `SkinnedMesh.getVertexPosition`, uz dodatnu proveru da jedna šaka ne pomera drugu.

| Metrika na istim stres pozama               |      Pre |    Posle |
| ------------------------------------------- | -------: | -------: |
| Najveći rast dužine ivice                   | 1.0010 m | 0.0431 m |
| Najveći odnos deformisane/rest dužine       |  120.16× |    5.46× |
| Pojave rasta ivice preko 8 cm kroz sve poze |    4,698 |        0 |

Preostali najveći rast je u ekstremnom rotiranju lanca palca oko Z ose; normalno
razvlačenje kože između palca i dlana ne treba poistovećivati sa šiljcima iz vrhova.
Pregledani su krupni renderi otvorene šake, uticaja suprotnog malog prsta, zasebnog
savijanja domalog prsta, zatvorene šake i palca. Originalne teksture i broj trouglova
su zadržani; ova popravka ne dodaje novu anatomsku geometriju prstiju.

Mašinski izveštaj, checksum-i i dozvoljeni binarni opsezi nalaze se u
`docs/shaq-skinning-report.json`. Test proverava da su svi bajtovi van tih opsega isti.

## Ponovljiva obrada i pregled

```bash
python3 -m pip install -r scripts/requirements-skinning.txt
python3 scripts/repair_shaq_skinning.py           # read-only provera već primenjene popravke
python3 scripts/repair_shaq_skinning.py --write   # primena iz verifikovanog originala
npm test
```

Skripta radi samo nad očekivanim originalnim checksum-om i odbija prepisivanje
modela koji je u međuvremenu zasebno izmenjen. Ponovna primena ne ublažava težine
ponovo: uvek računa iz originalne rezervne kopije.

Uz pokrenut `npm run dev`, poređenje je na
`http://localhost:5173/game/scripts/inspect-hands.html`.
Levo je rezervni original, desno aktivni popravljeni model. Poza se može zadati kroz
`window.__HAND_VIEW__.pose({ view: 'Right', side: 'Left', finger: 'Pinky', axis: 'x', angle: 70 })`.
Viewer je razvojni alat, odvojen od igre i produkcionog build-a. Sačuvani snimci su u
`playtest/hand-skinning/`.

Reference: [glTF skin attributes](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#skinned-mesh-attributes),
[Three.js SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html).

Završna validacija: `npm run check` prolazi (21 test, TypeScript, ESLint i formatiranje),
`npm run build` prolazi, a produkcioni browser paket prolazi **11/11** testova.
Pokriveni su šut, držanje lopte, inbound reset, promena likova, input i prethodno
popravljeni Q stav za oba modela. Izračunavanje popravke ponovljeno je bez upisa i
potvrđen je isti rezultat/checksum. Charlesov GLB nije menjan.
