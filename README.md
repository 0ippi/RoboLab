# RoboLab

**Robotiikan oppimisympäristö ja työkalupakki selaimessa.** Ilmainen, ei mainoksia, ei pakollista tiliä. Toimii asennuksen jälkeen myös ilman nettiä.

👉 Kokeile: **https://0ippi.github.io/RoboLab/**

*English summary below.*

## Mikä RoboLab on?

RoboLab opettaa robotiikkaa tekemällä. Kurssien robottioppaat ohjaavat käyttäjää vaihe kerrallaan oikeissa työkaluissa, ja sovellus tarkistaa tehtävät automaattisesti. Samoilla työkaluilla voi myös suunnitella oikeaa robottia.

**Kenelle:** aloittelijoille (noin 10-vuotiaasta alkaen), nuorille ja aikuisille, harrastajille sekä kouluille. Ohjelmointitaitoa ei tarvita.

## Mitä sillä voi tehdä?

- **10 kurssia kolmella tasolla.** Perusteet (mikä robotti on, anturit, sähkö) → liike, ohjaus ja näkö (reitinhaku, PID, konenäkö) → edistyneet (koordinaatistot, robottikäsivarsi, ROS, tekoäly). Jokaisessa kurssissa on tavoitteet, lyhyt teoria, tehtävät oikeassa työkalussa, välitön palaute, porrastetut vihjeet, pikakysymys selityksineen ja seuraava askel.
- **Opettajille.** Kolme valmista oppituntia (Ensimmäinen robotti, Robotti väistää esteitä, PID-säätö käytännössä). Niissä on tunnin kulku minuutteineen, tulostettava oppilaan moniste, ratkaisut, arviointikriteerit ja vaihtoehto ilman laitteita. Oppilaslinkit avaavat kurssin suoraan. Luokan edistymisen voi koota oppilaiden vientitiedostoista ilman oppilastilejä tai henkilötietoja.
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

- Tiedot tallentuvat vain selaimeen (localStorage), eikä niitä synkronoida laitteiden välillä. Siirto tehdään profiilin varmuuskopiolla. Jos selaimen tiedot tyhjennetään, tallennukset katoavat.
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

RoboLab is a free, browser-based robotics learning environment and toolkit, with no ads and no required account. It has 10 guided courses at three levels, three ready-made school lessons with teacher guides, worksheets and solutions, and 24 tools. The tools cover kinematics, PID, path planning, mapping, motors, batteries, robot builders, neural network training, computer vision and ROS concepts. Trained brains can be exported as code for Arduino, ESP32, Pico and Raspberry Pi. The app works offline once it has been opened. All data stays in the browser.

To run it locally, serve the folder with any static web server (`serve.ps1` or `python -m http.server 8080`). To run the tests, open `tests.html` (maths) and `tests-app.html` (whole app, isolated in-memory storage). Please report issues at https://github.com/0ippi/RoboLab/issues.
