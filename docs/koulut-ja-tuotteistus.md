# RoboLab kouluille: tuotteistusluonnos

> **Päivitys (versio 2.3.0):** tasot Free, Education, Teacher ja Pro on toteutettu omistajan päätöksellä. Hinnat ja sisältö ovat tiedostossa `plans.js`, ja käyttöönotto on kuvattu tiedostossa [maksut-ohje.md](maksut-ohje.md). Alla oleva alkuperäinen luonnos on säilytetty taustaksi.
>
> **Tila:** luonnos ja hypoteesit. Tätä ei ole vahvistettu markkinatiedolla eikä opettajien kanssa. Tarkoitus on testata kiinnostusta pienellä pilotilla ennen kuin mitään hinnoitellaan tai rakennetaan lisää.

## 1. Lähtökohta

RoboLab on ilmainen ja toimii selaimessa ilman tiliä. Siinä on jo:
- 10 kurssia kolmella tasolla, automaattinen tarkistus ja Volt-opas
- **Opettajille-sivu**, jossa on kolme valmista oppituntia tulostettavine materiaaleineen ja luokan edistymisen kokoaminen oppilaiden tiedostoista, ilman oppilastilejä ja henkilötietoja

Oletus koulujen tarpeista, joka pitää vielä tarkistaa opettajilta: koulut eivät tarvitse lisää työkaluja. Ne tarvitsevat vähemmän valmistelua, varmuutta siitä, että tunti toimii, ja helpon tavan nähdä, mitä oppilaat tekivät.

## 2. Versiot (ehdotus)

| | **Free** (nyt) | **Education** (ehdotus) | **Pro** (vain jos tarve löytyy) |
|---|---|---|---|
| Kaikki 24 työkalua ja simulaatiot | ✓ | ✓ | ✓ |
| 10 kurssia ja Volt-opas | ✓ | ✓ | ✓ |
| Paikallinen tallennus, ei mainoksia, ei pakollista tiliä | ✓ | ✓ | ✓ |
| 3 pilottioppituntia materiaaleineen | ✓ | ✓ | ✓ |
| Laaja oppituntikirjasto (esim. 20–30 tuntia, OPS-kytkennät) | – | ✓ | ✓ |
| Tulostettavat monisteet, kokeet ja arviointimatriisit kaikkiin kursseihin | – | ✓ | ✓ |
| Tehtäväkokonaisuuksien kokoaminen ja jakaminen luokalle (linkki tai koodi) | – | ✓ | – |
| Etenemisen seuranta (ensin tiedostoilla, myöhemmin ehkä pilvessä) | tiedostot ✓ | ✓ | – |
| Käyttöönottokoulutus ja tuki (sähköposti, 1 webinaari) | – | ✓ | – |
| Edistyneet työnkulut (esim. oma laitteisto, ROS-vienti, joukkokoulutus) | – | – | ? |

**Periaatteet:**
- Nykyisiä ilmaisia ominaisuuksia ei siirretä maksumuurin taakse. Ilmaisversion pitää riittää yhden opettajan kokeiluun ja itsenäiseen opiskeluun.
- Maksullinen osa on opettajan ajan säästöä (materiaalit, hallinta, tuki), ei oppilaan oppimisen rajoittamista.

## 3. Koululisenssin luonnos

- **Kenelle:** yksi koulu (toimipiste) tai kunta.
- **Sisältö:** Education-ominaisuudet koko koulun opettajille, rajaton oppilasmäärä ja tuki lukuvuoden ajan.
- **Käyttöönotto:** opettajat saavat lisenssikoodin. Oppilaat käyttävät edelleen ilman tiliä.
- **Tietosuoja:** oppilaista ei kerätä henkilötietoja. Jos myöhemmin lisätään pilvitallennus, tarvitaan sitä ennen:
  - tietosuojaseloste
  - henkilötietojen käsittelysopimus koulun tai kunnan kanssa
  - tietojen sijainti EU:ssa
  - vanhempien ja oppilaiden informointi
  - tietoturva-arvio
- **Kesto:** lukuvuosi, sopimus uusitaan vuosittain.

## 4. Alustava hinnoitteluhypoteesi (testattava, ei päätetty)

| Malli | Hypoteesi | Mitä testataan |
|---|---|---|
| Opettajalisenssi | 5–9 €/kk tai 49–79 €/lukuvuosi | Maksaisiko opettaja itse? |
| Koululisenssi | 300–900 €/lukuvuosi koon mukaan | Onko budjetti koululla vai kunnalla? |
| Kuntalisenssi | sopimuksen mukaan | Hankintamenettely, kilpailutusrajat |

Vertailukohtina toimivat koulujen robotiikkasarjojen ja digimateriaalien hinnat. Nämä pitää selvittää, ennen kuin lukuja käytetään.

## 5. Selvitettävää opettajilta ennen hinnoittelua

1. Millä luokka-asteilla ja missä aineissa robotiikkaa opetetaan (tekninen työ, matematiikka, fysiikka, ohjelmointi, valinnaiset)?
2. Kuinka paljon aikaa opettaja käyttää nyt yhden robotiikkatunnin valmisteluun?
3. Mitä laitteita koululla on (tietokoneet, Chromebookit, tabletit, robottisarjat)? Toimiiko WebGPU koulun koneissa?
4. Mitä tunnin pitäminen nyt vaatii, ja mikä menee usein pieleen?
5. Tarvitaanko arviointia, ja millaista? Riittääkö oppilaiden vientitiedosto, vai tarvitaanko reaaliaikainen näkymä?
6. Saako koulun koneille asentaa sovelluksia, ja onko selaimissa estoja (esim. tiedostojen lataus)?
7. Mitkä tietosuojavaatimukset koskevat oppilaiden tietoja (kunnan linjaukset, sallitut palvelut)?
8. Kuka päättää ostoista: opettaja, rehtori vai kunnan ICT? Millainen budjetti on?
9. Mitkä ovat tärkeimmät puuttuvat aiheet tai oppitunnit?
10. Mikä saisi opettajan suosittelemaan RoboLabia kollegalle?

## 6. Lyhyt kyselypohja opettajille (5 min)

1. Mitä opetat ja millä luokka-asteella? *(avoin)*
2. Kuinka usein opetat robotiikkaa tai ohjelmointia? *(ei koskaan / muutaman kerran vuodessa / kuukausittain / viikoittain)*
3. Paljonko aikaa kuluu yhden robotiikkatunnin valmisteluun? *(alle 15 min / 15–60 min / 1–3 h / yli 3 h)*
4. Mitä laitteita oppilailla on tunnilla käytössä? *(monivalinta: Windows, Chromebook, iPad, Android-tabletti, robottisarjat)*
5. Kokeilitko RoboLabin oppituntia? Miten se meni asteikolla 1–5? *(1–5 + avoin)*
6. Mikä oli tunnilla hyödyllisintä? Mikä puuttui tai ei toiminut? *(avoin)*
7. Kuinka tärkeitä nämä ovat sinulle? *(1–5 kukin)*
   - valmiit tuntisuunnitelmat
   - tulostettavat monisteet
   - etenemisen seuranta
   - arviointimatriisit
   - suomenkielinen materiaali
   - toimii ilman tilejä
8. Maksaisiko koulusi tällaisista materiaaleista ja työkaluista? Kuka päättäisi? *(kyllä / ehkä / ei + avoin)*
9. Saako sinuun ottaa yhteyttä pilotista? *(sähköposti, vapaaehtoinen)*

## 7. Pilottiohjelma (1–2 opettajaa, 4–6 viikkoa)

**Tavoite:** selvittää, säästääkö RoboLab opettajan aikaa ja toimiiko oppitunti oikeassa luokassa. Lisäksi selvitetään, mitä koulut olisivat valmiita maksamaan.

| Viikko | Mitä tehdään | Mitä mitataan |
|---|---|---|
| 0 | Aloituspalaveri (30 min): opettaja kokeilee Opettajille-sivua ja oppituntia A. Varmistetaan koulun laitteet. | Valmisteluaika, tekniset esteet |
| 1–2 | Oppitunti A (Ensimmäinen robotti) yhdelle ryhmälle | Ehtivätkö oppilaat tehtävät? Moniste, ongelmat |
| 3–4 | Oppitunti B tai C | Sama + edistymistiedostojen kokoaminen |
| 5 | Opettajan haastattelu (30 min) ja kysely (luku 6) | Hyödyllisyys, puutteet, maksuhalukkuus |
| 6 | Yhteenveto ja päätös seuraavista askelista | — |

**Pilotin säännöt:**
- Ei oppilaiden henkilötietoja. Oppilaat käyttävät nimimerkkejä, ja palaute kerätään vain opettajalta.
- Käytetään vain nykyistä ilmaista versiota, joten mitään ei tarvitse asentaa.
- Opettaja saa materiaalit maksutta ja mahdollisuuden vaikuttaa kehitykseen.

**Onnistumisen mittarit (ehdotus):**
- Opettaja pitää tunnin alle 30 minuutin valmistelulla.
- Vähintään 80 % oppilaista tekee tunnin perustehtävät.
- Opettaja suosittelisi RoboLabia kollegalle (vähintään 4/5).

## 8. Mitä ei tehdä vielä

- Maksujärjestelmää, lisenssiavaimia tai maksumuuria ei rakenneta.
- Palvelinpuolen tilejä tai pilvisynkronointia ei lisätä, ennen kuin tietoturva, kustannukset, ylläpito ja tietosuojavelvoitteet on selvitetty.
- Analytiikkaa, mainoksia tai seurantaa ei lisätä.
