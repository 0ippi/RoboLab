# RoboLab

Selainpohjainen robotiikan työkalupakki (vanilla JS, ei build-vaihetta). Käyttäjä puhuu suomea; käyttöliittymä on kaksikielinen `tr("suomi", "english")`.

## Ajaminen
- `serve.ps1` palvelee kansion osoitteessa http://localhost:8080/ (myös `.claude/launch.json` → "testisivu").
- Käyttäjällä on RoboLab asennettuna: työpöydän ja Käynnistä-valikon pikakuvake ajaa `RoboLab.ps1`:n (käynnistää palvelimen taustalle ja avaa Edgen `--app`-ikkunan). Älä siirrä tai nimeä kansiota uudelleen päivittämättä pikakuvakkeita.
- Testit: `tests.html` (kaikkien pitää mennä läpi).

## Jokainen muutos = uusi versio
Sovellus huomaa päivitykset `version.js`:stä ja näyttää käyttäjälle "Päivitä nyt" -palkin ja "Mitä uutta" -ikkunan.
Kun muutat sovellusta:
1. Lisää `version.js`:n `ROBOLAB_RELEASES`-listan **alkuun** uusi merkintä: `version` (nosta: korjaus → x.y.Z, uusi ominaisuus → x.Y.0), `date`, ja lyhyet käyttäjälle suunnatut muutokset `fi`- ja `en`-listoihin.
2. Tee tämä viimeisenä, kun kaikki tiedostot on kirjoitettu (avoin sovellus tarkistaa version.js:n viiden minuutin välein).
3. Uusi tiedosto, joka pitää ladata sovellukseen, lisätään myös `sw.js`:n `APP_FILES`-listaan (offline-käyttö). Uusi CDN-kirjasto lisätään `LIB_FILES`-listaan.

## Mallit ja valitsimet
- Valmiit robotit: `robosim/core/models.js` (2D) ja `robosim/3d/models3d.js` (3D). Hahmot (`CHARACTER_KEYS` library.js:ssä) näkyvät valitsimissa omana osionaan.
- Käyttäjän omat robotit ja käsivarret: `Library` (library.js, localStorage `robolab-library-v1`, yhteinen kaikille projekteille). Valitsin `modelPicker` + `robotSections`.
- Kurssien tarkistukset: kun tarkistat "onko arvo muuttunut", anna `changed()`-apurille työkalun oletustila, muuten mikä tahansa tallennus kuittaa tehtävän.

## Tiedot
Projektit ja asetukset ovat selaimen localStorage-tallennuksessa (origin localhost:8080). Päivitykset eivät saa rikkoa vanhoja tallennuksia: jos tallennusmuoto muuttuu, lisää siirtokoodi. Testaa erillisessä testiprojektissa, älä käyttäjän "Oma projekti" -projektissa.

## Käyttäjätilit
- `accounts.js` (ladataan ennen i18n.js:ää) + `account-ui.js` (kirjautuminen, profiili). Kirjautuneen käyttäjän tiedot ovat tavallisissa `robolab-*`-avaimissa; käyttäjää vaihdettaessa ne siirretään nimiavaruuteen `robolab-u:<id>:<avain>`. Tilijärjestelmän omat avaimet: `robolab-accounts`, `robolab-active`, `robolab-remember`.
- Uusi `robolab-*`-avain kuuluu siis automaattisesti käyttäjälle. Laitekohtainen tieto tarvitsee muun etuliitteen tai SYSTEM-listan.
- Älä testaa tilien vaihtoa ilman varmuuskopiota pane-selaimen tallennuksesta.

## Volt (tekoäly)
`assistant.js`: Claude API -avain voittaa aina; muuten ilmainen WebLLM-malli (`VOLT_MODELS` app.js:ssä, kirjasto `@mlc-ai/web-llm@0.2.82` jsDelivristä) jos WebGPU löytyy; muuten paikallinen opas (KB). Ilmainen malli ladataan vasta käyttäjän luvalla.

## Laitteet
`robosim/core/usb.js`: MicroPython-lataus (raw REPL, main.py) ja live-linkki (`S:`/`M:`-rivit) Web Serialilla. Testattu simuloidulla laitteella, ei oikealla.

## Sivusto
`website/` on staattinen esittelysivu (linkittää `../index.html`:ään). Hahmot kopioidaan sovelluksesta: aja `website/update-assets.ps1`, kun hahmoja muutetaan.
