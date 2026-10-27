# RoboLab

**Robotiikan oppimisympäristö ja työkalupakki selaimessa.** Free-taso on ilmainen eikä vaadi tiliä. Education (2 €/kk, oppilaille ilmainen opettajan luokkakoodilla), Teacher (5 €/kk) ja Pro (7 €/kk) avaavat lisää kursseja ja työkaluja. Toimii asennuksen jälkeen myös ilman nettiä.

👉 Kokeile: **https://0ippi.github.io/RoboLab/**

*English summary below.*

## Mikä RoboLab on?

RoboLab opettaa robotiikkaa tekemällä. Kurssien robottioppaat ohjaavat käyttäjää vaihe kerrallaan oikeissa työkaluissa, ja sovellus tarkistaa tehtävät automaattisesti. Samoilla työkaluilla voi myös suunnitella oikeaa robottia.

**Kenelle:** aloittelijoille (noin 10-vuotiaasta alkaen), nuorille ja aikuisille, harrastajille sekä kouluille. Ohjelmointitaitoa ei tarvita.

## Mitä sillä voi tehdä?

- **11 kurssia kolmella tasolla.** Perusteet (mikä robotti on, anturit, sähkö) → liike, ohjaus ja näkö (reitinhaku, PID, konenäkö) → edistyneet (koordinaatistot, robottikäsivarsi, ROS, tekoäly, palkkiot ja tavoitteet). Jokaisessa kurssissa on tavoitteet, lyhyt teoria, tehtävät oikeassa työkalussa, välitön palaute, porrastetut vihjeet, pikakysymys selityksineen ja seuraava askel.
- **Neuroverkkosimulaatiot.** Nopea koulutus kaikilla prosessoriytimillä, oma tavoite ja reittipisteet, maaston automaattinen vaikeutus, koulutusajojen vertailu ja kisat, hidastettu uusinta, neuroverkon kaavio toiminnassa, haasteet ja saavutukset sekä jakolinkki ja QR-koodi.
- **Opettajille.** Neljä valmista oppituntia (Ensimmäinen robotti, Robotti väistää esteitä, PID-säätö käytännössä, Tekoälyhaaste). Niissä on tunnin kulku minuutteineen, tulostettava oppilaan moniste, ratkaisut, arviointikriteerit ja vaihtoehto ilman laitteita. Oppilaslinkit avaavat kurssin suoraan. Luokan edistymisen voi koota oppilaiden vientitiedostoista ilman oppilastilejä tai henkilötietoja.
- **24 työkalua:**
  - 2D- ja 3D-robottirakentajat
  - moottori- ja akkulaskurit
  - eteenpäin- ja käänteiskinematiikka, DH-parametrit ja liikeradat
  - reitinhaku (A*, Dijkstra, RRT…), lidar-kartoitus ja mobiilirobotin simulaatio
  - PID-viritin
  - neuroverkkojen koulutus evoluutiolla (2D/3D)
  - konenäkö
  - sarjaportti
  - TF-puu ja URDF
  - rotaatio- ja yksikkömuuntimet
- **Oikealle robotille:** koulutetut neuroverkkoaivot voi viedä koodina Arduinolle, ESP32:lle, Raspberry Pi Picolle tai Raspberry Pi:lle, ja MicroPython-laitteisiin ne voi ladata USB:llä. *Generoitu koodi on tarkistettu simulaatiota vastaan, mutta oikealla laitteistolla sitä ei ole vielä testattu.*
- **Volt-opas.** Volt toimii kolmella tavalla:
  - Ilman nettiä ja kielimallia Volt vastaa sisäänrakennetulla oppaalla, suomeksi tai englanniksi.
  - Vapaaehtoisesti voi ladata ilmaisen kielimallin (0,4–2 Gt), joka toimii omalla koneella. Se vaatii WebGPU:n ja vastaa englanniksi.
  - Omalla Claude API -avaimella saa parhaat vastaukset.

## Tasot

| Taso | Hinta | Sisältö |
|---|---|---|
| Free | 0 € | Perustyökalut ja kurssit Aloita tästä, Anturit ja elektroniikka sekä Virta ja akut |
| Education | 2 €/kk tai 19 €/v, ilmainen luokkakoodilla | Lisää työkaluja (reitinhaku, PID, konenäkö, kinematiikka, neuroverkko 2D…) ja 7 kurssia |
| Teacher | 5 €/kk tai 45 €/v | Education + Opettajille-sivu ja luokkakoodit (5 oppilasta sisältyy, lisäpaikka 1 €/v). Koululisenssi 290 €/v. |
| Pro | 7 €/kk tai 59 €/v | Kaikki työkalut ja kaikki 11 kurssia |

Käyttöönotto ja tason antaminen käsin on kuvattu tiedostossa [docs/maksut-ohje.md](docs/maksut-ohje.md).

## Käynnistys paikallisesti

Sovellus on pelkkää HTML:ää, CSS:ää ja JavaScriptiä, eikä siinä ole build-vaihetta. Se tarvitsee kuitenkin web-palvelimen, koska service worker ja moduulit eivät toimi `file://`-osoitteesta.

```bash
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File serve.ps1   # → http://localhost:8080/
# tai mikä tahansa staattinen palvelin, esim.
python -m http.server 8080
```

## Testit

- **`tests.html`**: laskennan yksikkötestit. Mukana ovat PID, moottorit, akut, kinematiikka, DH, rotaatiot, liikeprofiilit, reitinhaku, kartoitus, neuroverkko ja koodivienti. Testit vertaavat tuloksia tunnettuihin arvoihin.
- **`tests-app.html`**: koko sovelluksen testit. Sovellus avataan kehykseen muistiin tallentavassa testitilassa (`?memstore`), joten selaimen oikeisiin tietoihin ei kosketa. Testit kattavat:
  - projektien luonnin, nimeämisen, avaamisen ja poiston
  - rikkinäiset tallennukset
  - JSON-viennin ja -tuonnin, myös virheelliset ja haitalliset tiedostot
  - täyttyneen tallennustilan
  - asetukset
  - käyttäjätilit ja varmuuskopion
  - kurssien etenemisen ja oppilaslinkit
  - opettajan työkalut
  - kaikkien työkalujen avautumisen
  - puhelinleveyden
  - offline-tiedostolistan

Avaa testisivu selaimessa palvelimen kautta (esim. http://localhost:8080/tests.html). Kaikkien testien pitää mennä läpi.

## Tunnetut rajoitukset

- Tiedot tallentuvat oletuksena vain selaimeen (localStorage). Jos selaimen tiedot tyhjennetään, tallennukset katoavat. Laitteiden välillä tiedot siirtyvät profiilin varmuuskopiolla tai vapaaehtoisella **pilvitilillä** (Supabase). Pilvitilin käyttöönotto-ohje on tiedostossa [docs/pilvitili-ohje.md](docs/pilvitili-ohje.md).
- Käyttäjätilit ovat paikallisia. Salasana estää vain saman koneen muita käyttäjiä avaamasta tiliä, eikä tietoja salata.
- Simulaatiot ovat opetukseen tehtyjä likimääräisiä malleja eivätkä tarkkoja fysikaalisia malleja. Esimerkiksi moottori on lineaarinen DC-malli ja akusta puuttuu jännitteen notkahdus. Mitoituksia kannattaa verrata komponenttien datalehtiin.
- Ilmainen kielimalli vaatii WebGPU:n (Chrome tai Edge) ja kirjoittaa suomea heikosti, joten se vastaa englanniksi.
- Web Serial (USB) toimii vain tietokoneen Chromessa ja Edgessä. Laiteyhteyksiä on testattu vain simuloidulla laitteella.
- 3D-kirjastot ja kielimalli ladataan CDN:stä ensimmäisellä käyttökerralla.

## Osallistuminen

Virheilmoitukset ja ideat ovat tervetulleita: **https://github.com/0ippi/RoboLab/issues**. Hyvässä ilmoituksessa kerrotaan selain, mitä teit, mitä odotit ja mitä tapahtui.

Kun teet koodimuutoksen:
1. Seuraa ympäröivän koodin tyyliä. Käyttöliittymän tekstit kirjoitetaan muodossa `tr("suomi", "english")`.
2. Lisää uusi versio `version.js`:n alkuun ja uudet tiedostot `sw.js`:n `APP_FILES`-listaan.
3. Aja `tests.html` ja `tests-app.html`.
4. Älä riko vanhoja tallennuksia. Jos tallennusmuoto muuttuu, lisää siirtokoodi.

Koulukäytön suunnitelmat ovat tiedostossa [docs/koulut-ja-tuotteistus.md](docs/koulut-ja-tuotteistus.md).

---

## English summary

RoboLab is a free, browser-based robotics learning environment and toolkit, with no ads and no required account. It has 11 guided courses at three levels, four ready-made school lessons with teacher guides, worksheets and solutions, and 24 tools. The tools cover kinematics, PID, path planning, mapping, motors, batteries, robot builders, neural network training, computer vision and ROS concepts. Neural network training runs on every processor core and includes custom goals, waypoints, a curriculum, races, slow-motion replays, challenges with a class leaderboard and share links. Trained brains can be exported as code for Arduino, ESP32, Pico and Raspberry Pi, with a wiring guide. The app works offline once it has been opened. All data stays in the browser.

To run it locally, serve the folder with any static web server (`serve.ps1` or `python -m http.server 8080`). To run the tests, open `tests.html` (maths) and `tests-app.html` (whole app, isolated in-memory storage). Please report issues at https://github.com/0ippi/RoboLab/issues.
