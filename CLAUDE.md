# RoboLab

Selainpohjainen robotiikan työkalupakki (vanilla JS, ei build-vaihetta). Käyttäjä puhuu suomea; käyttöliittymä on kaksikielinen `tr("suomi", "english")`.

## Ajaminen
- `serve.ps1` palvelee kansion osoitteessa http://localhost:8080/ (myös `.claude/launch.json` → "testisivu").
- Käyttäjällä on RoboLab asennettuna: työpöydän ja Käynnistä-valikon pikakuvake ajaa `RoboLab.ps1`:n (käynnistää palvelimen taustalle ja avaa Edgen `--app`-ikkunan). Älä siirrä tai nimeä kansiota uudelleen päivittämättä pikakuvakkeita.
- Testit: `tests.html` (laskenta) ja `tests-app.html` (koko sovellus kehyksessä `?memstore`-tilassa: tallennus muistiin, ei koske selaimen oikeisiin tietoihin). Kaikkien pitää mennä läpi. Sovelluksen `const`/`let`-globaalit luetaan testeissä `w.eval("nimi")`-kutsulla.
- Piilossa olevassa esikatseluselaimessa requestAnimationFrame ei etene, joten simulaatioiden ajotesti ohitetaan siellä.
- `?memstore` toimii vain testisivun kehyksessä (muuten sovellus käyttää selaimen oikeaa tallennusta). Testitilassa sovellus ei päivitä itseään käynnistyksessä (julkaisun jälkeen välimuistin vanha version.js ja verkon uusi eroavat hetken, ja uudelleenlataus katkaisi testit).
- Paikallisen testiajon kannattaa käyttää tuoretta välimuistia: Chrome voi käyttää muokatun tiedoston vanhaa versiota (heuristinen välimuisti). Testisivun osoitteeseen uusi `?v=`-arvo ja tarvittaessa `fetch(tiedosto, { cache: "reload" })`.

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

## Neuroverkkosimulaatiot (tools/nn.js)
- Nopea koulutus (`st.parallel`, oletus päällä): `TrainPool` jakaa sukupolven Web Workereille (`robosim/core/worker2d.js` perinteinen, `robosim/3d/worker3d.js` moduuli; sama siemen kaikille). Pääsäie ajaa vain parhaan robotin näytöksen. Jos työläiset eivät käynnisty, `S.noParallel` ja paluu tavalliseen koulutukseen. Simulaatiomoduulien pitää toimia ilman DOMia (robot3d.js tuo three:n täydellä URL:lla, koska työläisellä ei ole import mapia).
- Maasto ulottuu aloituspaikan joka puolelle (2D ±400 m, 3D X −80…150, Z ±40).
- Oma tavoite (`goalDialog`/`goalCode`): valinnat → palkkiofunktion koodi; `st.goal` tallentaa valinnat. Koodiin päätyy vain kiinteitä paloja ja lukuja.
- Koulutusajot `nnXdRuns` ({ list }, enintään 8, painot 4 numeron tarkkuudella, `sig` = mallin tiiviste): vertailukäyrät (`st.runShow`), kisa (`S.mode = "race"`, sama episodi, `S.race`), "Ota käyttöön". Ennen aivojen nollausta/korvausta `autoArchive()` tallentaa ≥ 10 sukupolven koulutuksen. Ajot tarkistetaan (`runs()`), koska tuotu projekti voi sisältää mitä tahansa; projects.js:n tuonti hyväksyy `nnXdRuns`.
- Maaston vaikeutus `st.autoTerrain`: `curriculumStep()` vaihtaa seuraavaan maastoon, kun ≥ 20 sukupolvea samassa maastossa eikä paras parane (8 + 8 sukupolven keskiarvot). Historian rivit saavat `ter`-kentän, kaavio piirtää vaihdot (`drawPlot` `marks`).
- Uusinta (`S.mode = "replay"`): sama siemen = sama rata, aikajana ajaa alusta uudelleen (`replaySeek`), hidastus 0,1–2× pehmennetään `be.pose` + `lerp`. 3D: kiertävä kamera `st.orbit`.
- Reittipisteet `st.waypoints` (2D {x,y}, 3D {x,z}) → episodin `cfg.targets` (myös työläisille). Maassa kulkevalle 2D-robotille y lasketaan maastosta.
- Aivonäkymä `drawBrainViz()` (sisääntulojen nimet `RS.deployInfo`), anturit näkyviin `st.sensors`. Aivot tallennetaan enintään 1,5 s välein (`saveBrain`/`flushBrain`).
- Testitilassa `window.__nn["2d"|"3d"]` antaa testeille pääsyn tilaan (S, st, finishGeneration, startRace, replaySeek, addWaypoint, runChallenge…).
- Maaston tai episodin pituuden vaihto ja reittipisteiden muutos kutsuvat `forgetBest()`: eri ehtojen pisteet eivät ole vertailukelpoisia.
- Jakolinkki `#/share/<data>` (app.js router → `RSShare.open`): JSON + Int16-painot (QR-versiossa Int8 kerroksittain) deflate-raw + base64url. Avautuu kysymällä uuteen projektiin; koodi → `taskCodeUntrusted`, Oma tavoite tehdään koodiksi `goalCode`:lla. Localhostissa linkki osoittaa julkiseen sivuun (`PUBLIC_URL`). QR: `qrcode-generator@1.4.4` (LIB_FILES).
- Koko näyttö: `.nn-stage.fs` (CSS, toimii myös iOS:ssä), alapalkin napit klikkaavat oikeita nappeja. Opastus: `coachTour(id, steps)` app.js:ssä, nähdyt `robolab-tips`.
- Vie omalle robotille → Kytkentäohje: `RS.wiringGuide` (deploy.js) jakaa Picon nastat (I2C GP4/GP5, ulostulot GP6–22, sisääntulot GP26–28 ja GP0–3). Ei testattu oikealla laitteella.

## Saavutukset ja haasteet (achievements.js)
- `Achievements.unlock(id)` (tapahtumat työkaluista, `achieve()` nn.js:ssä) ja `check()` (kursseista johdetut, kutsutaan courses.js:n `persist`issa). Tallennus `robolab-achievements` ({ got, ch }).
- Haasteet `CHALLENGES`: kiinteä siemen, maasto ja kesto; tulos mitataan omalla mittarilla (`measureCode`), ei käyttäjän palkkiolla. Tavoitteet on kalibroitu kouluttamalla (kouluttamaton ei läpäise, n. 30–60 s nopea koulutus läpäisee).
- Luokkaan liittyneen oppilaan tulokset lähtevät `report_progress`-kutsussa kursseina `ch-<id>` (ei SQL-muutoksia); opettajan luokkahuoneessa haasteiden tulostaulu (`roomChallengesHtml` education.js:ssä).
- Opettaja antaa haasteita samalla `set_class_courses`-listalla kuin kursseja (id `ch-<haaste>`, enintään 20 yhteensä); oppilaan Kurssit-sivulla `classChallengesHtml` (courses.js). Kurssien tarkistukset käyttävät laskureita `window.rsRaces` ja `window.rsChallenges`, koska Haasteet-lista piirretään uudelleen (did() ei löydä irrotettua nappia).

## Rakentajan jouset
- Nivel `motor: false` + `spring` (jäykkyys) + `springDamping` = jousi (lepoasento 0). 2D: vääntö lasketaan `act()`:ssa ja rajataan osan hitausmomentin mukaan (muuten värähtelee); 3D: Rapierin moottori kulmaan (stiffness/damping). Valmisosat: Jousijalka (`addSpringLeg`), Kosketusanturi (`addBumper`, foot-osa joustavalla saranalla).
- Kurssien pikakysymysten vaihtoehdot arvotaan joka avauksella (`s._qo`, ei tallennu).

## Kurssien tarkistukset
- Jokaisella tehtävällä on `check`; toimintoja (napit, valinnat, vedot) seurataan `did(ctx, tyyppi, valitsin)`-apurilla vaiheen alusta (`ctx.t0`). Katso/lue-tehtävä ilman checkiä kuitataan, kun työkalu on ollut auki `look` sekuntia (oletus 8). Tein sen -nappia ei ole.
- Tehtävän pitää olla mahdollinen siinä työkalussa, johon vaihe vie (esim. 2D-rakentaja näyttää robotin sivulta: siinä ei voi kääntyä; kääntyminen opetetaan Mobiilirobotti 2D:ssä). Tarkista teksti, nappien nimet ja vihjeiden luvut työkalun koodista tai ajamalla ne.
- Tehtävä ei saa olla valmis vaiheen alussa oletustilalla (`auto: true` vain tarkoituksella). `enter()` valmistelee vaiheen kerran (esim. PID-kesto `pidDuration`, kartan palautus). Tilannekohtaiset apurit: `driven` (fysiikkatestin ajomatka, `builderStatus().x/x0/run`), `turnedSince` (`sim2dStatus().spin/arc`), `pidPeak`, `pathLen`, `wheelsOf`.
- Älä viittaa tekstissä vasempaan/oikeaan reunaan: kurssipaneelin kanssa työkalu voi olla yhdessä sarakkeessa. Nimeä kortti tai nappi.
- `tests-app.html` käy jokaisen kurssin jokaisen vaiheen läpi: tehtävät ovat alussa tekemättä ja `did()`-valitsimet löytyvät työkalusta.

## Etusivu ja valikko
- Etusivu (`dashboardPage` app.js:ssä): pääpolku (jatka kurssia / ensimmäinen kurssi), omat työkalut (suosikit ja viimeksi käytetyt) ja kaikki työkalut ryhmittäin nimilistana. Ei isoja mainoksia: ilmaiselle tasolle yksi `.upgrade-banner`-rivi.
- Sivupalkissa vain avoimet työkalut (`navShown`); lukitut ovat yhdellä `.nav-more`-rivillä (→ Tasot). Kurssipaneelin ollessa auki sivupalkki kapenee (`setLessonLayout`), käyttäjän asetus ei muutu.

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
- Luokkahuone (2.7.0): opettaja luo luokan (`create_class`), antaa kurssit ja määräpäivät (`set_class_courses`) ja seuraa oppilaita (`class_overview`, päivittyy 20 s välein, CSV). Oppilas liittyy koodilla + nimimerkillä ilman tiliä (`Plans.activateClass` → `join_class`); eteneminen lähtee `Plans.queueSync` → `report_progress` (vain luvut, ei koodia). SQL: `docs/supabase-classroom.sql`.
- Kurssien loppukokeet: `EXAMS` courses.js:ssä, oikea vastaus aina indeksissä 0 (järjestys sekoitetaan oppilaskohtaisesti).
- Tuotu koodi (nn2d/nn3d `taskCode`) merkitään `taskCodeUntrusted`: sitä ei ajeta ennen kuin käyttäjä hyväksyy sen editorissa. Kaikki tuodut tai tallennetut arvot `esc()`:llä HTML:ään; `getToolState` pakottaa numero-oletusten kentät luvuiksi.
- Käyttäjän vaihto siirtää avaimet yksi kerrallaan ja peruu kaiken, jos tallennustila loppuu (`accounts.js` `switchTo`).
- Koulujen tuotteistusluonnos: `docs/koulut-ja-tuotteistus.md` (ei maksumuuria, ei palvelintilejä ilman selvitystä).

## Volt (tekoäly)
`assistant.js`: Claude API -avain voittaa aina; muuten ilmainen WebLLM-malli (`VOLT_MODELS` app.js:ssä, kirjasto `@mlc-ai/web-llm@0.2.82` jsDelivristä) jos WebGPU löytyy; muuten paikallinen opas (KB). Ilmainen malli ladataan vasta käyttäjän luvalla. Ilmainen malli vastaa aina englanniksi (pienet mallit tuottivat testissä virheellistä suomea); suomeksi vastaavat opas ja Claude.

## Laitteet
`robosim/core/usb.js`: MicroPython-lataus (raw REPL, main.py) ja live-linkki (`S:`/`M:`-rivit) Web Serialilla. Testattu simuloidulla laitteella, ei oikealla.

## Sivusto
`website/` on staattinen esittelysivu (linkittää `../index.html`:ään). Hahmot kopioidaan sovelluksesta: aja `website/update-assets.ps1`, kun hahmoja muutetaan.
