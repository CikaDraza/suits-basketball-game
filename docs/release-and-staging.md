# Odobreni Shaq model i grane za isporuku

2026-11-08. Korisnik je prihvatio prikaz hoda u igri i odobrio arhiviranje,
objavljivanje na GitHub-u i razdvajanje production/razvoj grana. Naknadno je
potvrdio da aktivni novi model zadržava dosadašnje ime `shaquille_oneal.glb`.

## Fajlovi

```text
public/models/
  charles_barkley.glb
  shaquille_oneal.glb                    # odobreni walking export
  archives/
    shaquille_oneal.org.glb              # prethodni model, neizmenjen
    shaquille_oneal_walking_test.glb     # izvorni novi export, neizmenjen
```

Aktivni Shaq i arhivirani walking export imaju isti SHA-256:
`9ddf028f4b4f2e7074c715ee08a8d8f3ec5fdf6e2159b4c35cc3dc4b49eda5d9`.
Stari model u arhivi ima SHA-256:
`2501bf68c682e1f412df660aa239efec0865eedc3f9c042cc44ebcd9c850750b`.
Chuck nije menjan. GLB podaci nisu prepravljani, kompresovani niti ponovo generisani.

`MODEL_PATHS` je jedini izvor aktivnih putanja, a `MODEL_ARCHIVES` izvor arhivskih
putanja. Igra podrazumevano učitava novi Shaq i njegov hod u development i
production build-u; `?shaqWalk=1` više nije potreban. Učitavaju se samo aktivni
modeli; arhiva se ne preload-uje u igri. Poseban razvojni preview poredi dva
arhivirana ulaza.

I dalje se uklanja dodatna FBX grana iz render klona, preskače loši prvi ključ
i koristi hod bez izvezenog pomeranja root-a. Q, odbrana, šut i kontakt šaka
zadržavaju postojeću kontrolu. Detalji i poznata ograničenja exporta su u
[analizi](animated-glb-preview.md) i [prvoj probi u igri](shaq-walking-in-game.md).
Ovaj release prihvata taj provereni prikaz; nije nova prerada rig-a ili pravila igre.

## Grane i dalji rad

- `main`: odobren kod, production grana.
- `staging`: razvoj i provera; napravljena iz istog odobrenog release commita.
- Sledeće funkcionalnosti razvijaju se na `staging` ili feature grani izvedenoj
  iz nje. Posle provera ide PR `staging` → `main`; stabilna produkcija ostaje na
  poslednjoj prihvaćenoj verziji dok se PR ne spoji.
- `Quality` workflow izvršava `npm ci`, `npm run check` i `npm run build` na
  Node.js 24, na push/PR za obe grane. Postojeća test komanda koristi
  `--test-isolation=none`, koji Node.js 22 u prvom CI pokušaju nije prepoznao.
  Browser provere se izvršavaju pre izdavanja; ovaj workflow
  ne deploy-uje na Vercel niti sam uključuje branch protection.

Korisnik podešava Vercel: Production Branch Tracking → `main`, Staging Branch
Tracking → `staging`. Za staging se koriste njegove vrednosti promenljivih i
domain po potrebi. Vercel Git integracija zatim deploy-uje odgovarajuću granu.
Ako nalog nema Custom Environments, `staging` može koristiti Preview branch
sa granom i njenim promenljivama.
[Zvanična Vercel dokumentacija](https://vercel.com/docs/deployments/environments#setting-up-a-staging-environment).

Povezani projekat je pronađen kroz Vercel listu. Detaljna inspekcija njegovog
tima je vratila 403 zbog nedovoljnog scope pristupa, pa postojeći Production
Branch Tracking i status deployment-a nisu potvrđeni tim alatom. Vercel
konfiguracija nije menjana; GitHub grane i commit proveravaju se zasebno.

## Provera release-a

Prvi puni browser prolaz: 46/48. Obe Shaq locomotion probe (default/20 Hz)
otkrile su stvarno lebdenje obuće do 43 mm pri punoj brzini: postojeća sole
korekcija tretirala je toe geometriju kao krut deo stopala, iako novi klip
savija prste. Dodata je opcija skinnovanih kontaktnih tačaka u postojećem
`footGrounding.ts`, uključena za novi Shaq. Koristi se unapred odabran pojas
đona, bez skeniranja celog mesh-a svakog frame-a; Chuck i postojeći IK režim
ostaju na svojoj putanji. Novi test prati 65 poza ispod skaliranog roditelja,
bez kumulativnog offset-a i bez pomeranja root objekta. `check`: 109/109.
Posle korekcije obe ranije pale Shaq locomotion probe prolaze u novom production
build-u (2/2, default i 20 Hz). Preostalih 46 scenarija prošlo je u prethodnom
punom prolazu; svih 48 nije ponovo pokrenuto posle korekcije. Dodatna provera
podrazumevanog modela u production build-u prolazi 2/2: hod sa loptom i Q prelaz,
te hod bez lopte sa animiranim rukama. Razvojni preview sa arhiviranim putanjama
prolazi 2/2, uključujući Play/Pause/Restart/brzinu, ceo klip, skelet i FBX toggle.
Pregledani su browser snimci hoda sa strane i postojećeg Q/dribling stava.
`npm run build` prolazi; ostaje postojeće upozorenje o veličini bundle chunk-ova.
Test originalne binarne popravke čita arhivu, dok rig/socket/deformation testovi
čitaju aktivni novi Shaq. Provera porekla dodatno potvrđuje hash-eve i da u korenu
`models` postoje samo dva aktivna GLB-a.
