# RoboLab

Selainpohjainen robotiikan työkalupakki (vanilla JS, ei build-vaihetta). Käyttäjä puhuu suomea; käyttöliittymä on kaksikielinen `tr("suomi", "english")`.

## Ajaminen
- `serve.ps1` palvelee kansion osoitteessa http://localhost:8080/ (myös `.claude/launch.json` → "testisivu").
- Käyttäjällä on RoboLab asennettuna: työpöydän ja Käynnistä-valikon pikakuvake ajaa `RoboLab.ps1`:n (käynnistää palvelimen taustalle ja avaa Edgen `--app`-ikkunan). Älä siirrä tai nimeä kansiota uudelleen päivittämättä pikakuvakkeita.
- Testit: `tests.html` (laskenta) ja `tests-app.html` (koko sovellus kehyksessä `?memstore`-tilassa: tallennus muistiin, ei koske selaimen oikeisiin tietoihin). Kaikkien pitää mennä läpi. Sovelluksen `const`/`let`-globaalit luetaan testeissä `w.eval("nimi")`-kutsulla.
- Piilossa olevassa esikatseluselaimessa requestAnimationFrame ei etene, joten simulaatioiden ajotesti ohitetaan siellä.

## Jokainen muutos = uusi versio
Sovellus huomaa päivitykset `version.js`:stä ja näyttää käyttäjälle "Päivitä nyt" -palkin ja "Mitä uutta" -ikkunan.
Kun muutat sovellusta:
1. Lisää `version.js`:n `ROBOLAB_RELEASES`-listan **alkuun** uusi merkintä: `version` (nosta: korjaus → x.y.Z, uusi ominaisuus → x.Y.0), `date`, ja lyhyet käyttäjälle suunnatut muutokset `fi`- ja `en`-listoihin.
2. Tee tämä viimeisenä, kun kaikki tiedostot on kirjoitettu (avoin sovellus tarkistaa version.js:n viiden minuutin välein).
3. Uusi tiedosto, joka pitää ladata sovellukseen, lisätään myös `sw.js`:n `APP_FILES`-listaan (offline-käyttö). Uusi CDN-kirjasto lisätään `LIB_FILES`-listaan.

## Robotinrakentaja
- `robosim/builder/` (ui.js käyttöliittymä, model.js mallin operaatiot, viewport.js Three.js-näkymä, physics.js fysiikkatesti). Testitilassa (`?memstore`) `window.__builder` antaa testeille pääsyn tilaan.
- Siirrettäessä osan lapset (`M.descendants`, nivel a → b) tulevat mukana; Alt + veto siirtää vain valinnan. Usean osan kahva on apupisteessä `view.pivot` (siirto, kierto, tasainen skaalaus).
- Fysiikkatestin lentoavustin (`PhysicsTest.autopilot`, vain käsin testaukseen): PI-nousunopeus ja PD-asento, voimat pienimmän normin ratkaisulla. Simulaatiossa neuroverkko ohjaa roottoreita suoraan.

## Kurssien tarkistukset
- Jokaisella tehtävällä on `check`; toimintoja (napit, valinnat, vedot) seurataan `did(ctx, tyyppi, valitsin)`-apurilla vaiheen alusta (`ctx.t0`). Katso/lue-tehtävä ilman checkiä kuitataan, kun työkalu on ollut auki `look` sekuntia (oletus 8). Tein sen -nappia ei ole.

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

## Pilvitili (Supabase)
- `cloud-config.js` (julkinen URL + anon/publishable-avain; tyhjä = pilvi pois) ja `cloud.js` (`Cloud`): kirjautuminen, synkronointi tauluun `user_data` (yksi JSON-rivi per käyttäjä, RLS: `docs/supabase.sql`), ristiriidan ratkaisu, tilin poisto (`delete_my_account`). Käyttöönotto-ohje: `docs/pilvitili-ohje.md`.
- Pilvitili on `accounts.js`:n tili, jolla `cloud: true` ja `cloudUid`; vaihto `Accounts.cloudAccount` / `useAccount`. Laitekohtaiset avaimet: `rlcloud-meta` (synkronointitila), `rlcloud-auth` (Supabasen istunto). Synkronoimatta: API-avain ja `SKIP`-lista cloud.js:ssä.
- Testit käyttävät Supabasen testiversiota (`makeSupabaseMock` tests-app.html:ssä); oikeaa Supabasea ei testata automaattisesti. Älä koskaan lisää service_role-avainta.

## Tilaustasot
- `plans.js` (`Plans`): hinnat (`PRICES`) ja tasojen sisältö (`FEATURES`: työkalu- ja kurssilistat). Uusi työkalu tai kurssi on oletuksena Pro-tasoa, ellei sitä lisätä FREE- tai EDU-listaan.
- Taso tulee pilvitilin `subscriptions`-rivistä (`my_plan`) tai laitteen luokkakoodista (`activate_class_code`). Laiteavaimet: `rlplan`, `rlclass`, `rldevice`. SQL: `docs/supabase-plans.sql`, ohje: `docs/maksut-ohje.md`, maksujen webhook: `supabase/functions/stripe-webhook`.
- Lukitus on sovelluksessa (`Plans.canTool` routerissa, `canCourse` kursseissa). Aktiivinen kurssi avaa sen omat työkalut. Testeissä `__robolabPlanOverride` (oletus "pro").
- Opettajille (`teach`) kuuluu vain Teacher-tasoon (ei Prohon; `create_class` vaatii teacher-tason). Testien oletustaso on `"pro,teacher"`. Se näkyy valikossa, kojelaudalla ja haussa vain, kun `Plans.canTeach()` (`toolListed` app.js:ssä); opettajalla on kojelaudalla `.teach-banner`.
- Kehittäjätila: `docs/supabase-dev.sql` (taulu `developers` UID:llä, RPC:t `am_developer`, `dev_set_plan`, `dev_grant_plan` (lisenssi muulle sähköpostilla, "free" = poisto), `dev_list_plans`). Tasot-sivulla `.dev-card`. Kehittäjä lisätään SQL Editorissa UID:llä, ei koskaan sähköpostilla sovelluksesta.
- Tietosuojaseloste: `tietosuoja.html` (päivitä, jos tallennettavat tiedot tai palveluntarjoajat muuttuvat). Sähköpostit (SMTP): `docs/sahkoposti-ohje.md`.

## Opettajille ja tietoturva
- `education.js`: Opettajille-sivu (`TOOL_IMPL.teach`), oppitunnit A–C (`LESSONS`), tulostus (`#print-area`), oppilaan edistymistiedosto (`robolab-class-progress`, vain eteneminen) ja opettajan tuonti (vain muistissa). Oppilaslinkki `#/course/<kurssi>`.
- Tuotu koodi (nn2d/nn3d `taskCode`) merkitään `taskCodeUntrusted`: sitä ei ajeta ennen kuin käyttäjä hyväksyy sen editorissa. Kaikki tuodut tai tallennetut arvot `esc()`:llä HTML:ään; `getToolState` pakottaa numero-oletusten kentät luvuiksi.
- Käyttäjän vaihto siirtää avaimet yksi kerrallaan ja peruu kaiken, jos tallennustila loppuu (`accounts.js` `switchTo`).
- Koulujen tuotteistusluonnos: `docs/koulut-ja-tuotteistus.md` (ei maksumuuria, ei palvelintilejä ilman selvitystä).

## Volt (tekoäly)
`assistant.js`: Claude API -avain voittaa aina; muuten ilmainen WebLLM-malli (`VOLT_MODELS` app.js:ssä, kirjasto `@mlc-ai/web-llm@0.2.82` jsDelivristä) jos WebGPU löytyy; muuten paikallinen opas (KB). Ilmainen malli ladataan vasta käyttäjän luvalla. Ilmainen malli vastaa aina englanniksi (pienet mallit tuottivat testissä virheellistä suomea); suomeksi vastaavat opas ja Claude.

## Laitteet
`robosim/core/usb.js`: MicroPython-lataus (raw REPL, main.py) ja live-linkki (`S:`/`M:`-rivit) Web Serialilla. Testattu simuloidulla laitteella, ei oikealla.

## Sivusto
`website/` on staattinen esittelysivu (linkittää `../index.html`:ään). Hahmot kopioidaan sovelluksesta: aja `website/update-assets.ps1`, kun hahmoja muutetaan.
