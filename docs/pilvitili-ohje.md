# Pilvitilin käyttöönotto (Supabase)

Pilvitilillä käyttäjä kirjautuu sähköpostilla ja salasanalla. Hänen projektinsa, kurssinsa, robottinsa ja asetuksensa ovat samat kaikilla laitteilla. Pilvitili on vapaaehtoinen: ilman sitä RoboLab toimii kuten ennenkin.

Käyttöönotto vie noin 10 minuuttia, ja se tehdään kerran.

## 1. Luo Supabase-projekti

1. Mene osoitteeseen https://supabase.com ja valitse **Start your project**. Kirjaudu esimerkiksi GitHub-tunnuksillasi.
2. Valitse **New project** ja anna tiedot:
   - **Name:** `robolab`
   - **Database password:** paina *Generate a password* ja tallenna salasana turvalliseen paikkaan. RoboLab ei tarvitse sitä, eikä sitä saa antaa kenellekään.
   - **Region:** jokin EU-alue, esimerkiksi *North EU (Stockholm)* tai *Central EU (Frankfurt)*.
   - **Plan:** Free.
3. Paina **Create new project** ja odota pari minuuttia, kunnes projekti on valmis.

## 2. Luo tietokantataulu

1. Valitse vasemmalta **SQL Editor** ja sitten **New query**.
2. Kopioi tiedoston [`docs/supabase.sql`](supabase.sql) koko sisältö ja liitä se editoriin.
3. Paina **Run**. Tulokseksi pitää tulla *Success. No rows returned*.

SQL-tiedosto tekee kolme asiaa:
- luo taulun, jossa jokaisella käyttäjällä on yksi rivi hänen tietojaan
- lisää säännöt, joiden ansiosta jokainen näkee ja muuttaa vain omia tietojaan
- luo toiminnon, jolla käyttäjä voi poistaa oman tilinsä

## 3. Kirjautumisen asetukset

Valitse vasemmalta **Authentication**.

1. **URL Configuration:**
   - **Site URL:** `https://0ippi.github.io/RoboLab/`
   - **Redirect URLs** → *Add URL*: lisää `https://0ippi.github.io/RoboLab/**`. Jos testaat koneellasi, lisää myös `http://localhost:8080/**`.
2. **Sign In / Providers → Email:** pidä *Email* päällä ja aseta salasanan vähimmäispituudeksi **8**.
3. **Confirm email (tärkeä valinta):**
   - Supabasen oma sähköpostipalvelu lähettää viestejä vain projektin omille tiimiläisille, ja vain muutaman tunnissa. Siksi muut käyttäjät eivät saa vahvistus- eivätkä salasananvaihtoviestejä ennen kuin oma sähköpostipalvelu (SMTP) on otettu käyttöön.
   - **Pilotin alussa:** kytke **Confirm email** pois päältä, jotta tilin luonti toimii heti. Tällöin sähköpostiosoitetta ei vahvisteta.
   - **Myöhemmin:** ota käyttöön oma SMTP (esim. Resendin ilmainen taso, *Authentication → Emails → SMTP Settings*) ja kytke *Confirm email* takaisin päälle. Vasta sitten myös **Unohtuiko salasana?** -toiminto toimii kaikilla käyttäjillä.

## 4. Anna RoboLabille projektin osoite ja avain

1. Valitse vasemmalta **Project Settings**.
   - Kopioi **Data API** -kohdasta **Project URL**, esim. `https://abcdefghijkl.supabase.co`.
   - Kopioi **API Keys** -kohdasta joko **publishable**-avain (`sb_publishable_…`) tai välilehdeltä *Legacy API keys* **anon public** -avain.
2. Liitä molemmat tähän keskusteluun, niin lisään ne tiedostoon `cloud-config.js`. Voit myös kirjoittaa ne tiedostoon itse:
   ```js
   window.ROBOLAB_CLOUD = {
     url: "https://abcdefghijkl.supabase.co",
     anonKey: "sb_publishable_…",
   };
   ```

Nämä kaksi tietoa ovat julkisia, ja ne näkyvät joka tapauksessa sivun koodissa. Tietoja suojaavat taulun säännöt.

**Älä koskaan anna** service_role- tai secret-avainta (`sb_secret_…`) äläkä tietokannan salasanaa. Niitä ei saa laittaa sovellukseen eikä tähän keskusteluun.

## 5. Julkaise ja kokeile

1. Lataa päivitetyt tiedostot GitHubiin.
2. Avaa https://0ippi.github.io/RoboLab/ ja valitse **Profiili → Kirjaudu tai luo pilvitili → Luo pilvitili**.
3. Avaa sama osoite toisella laitteella ja kirjaudu samalla sähköpostilla. Projektien pitää näkyä.

Supabasessa tilin näet kohdasta *Authentication → Users* ja tiedot kohdasta *Table Editor → user_data*.

## Hyvä tietää

- **Ilmaisen tason rajat:** 500 Mt tietokanta ja 50 000 aktiivista käyttäjää kuukaudessa. Ilmainen projekti **pysähtyy, jos sitä ei käytetä viikkoon**. Sen saa takaisin päälle Supabasen hallintapaneelista (*Restore project*).
- **Synkronointi:** muutokset tallentuvat pilveen noin 30 sekunnin välein ja kun sovellus suljetaan tai vaihdetaan toiseen välilehteen. Jos samaa tiliä on muokattu kahdella laitteella ennen synkronointia, sovellus kysyy, kumpi versio säilytetään.
- **Mitä tallennetaan:** samat tiedot kuin profiilin varmuuskopioon eli projektit, kurssien eteneminen, omat robotit, asetukset, nimi, hahmo ja esittely. Claude API -avain ei tallennu pilveen.
- **Tietosuoja:**
  - Pilvitili kerää sähköpostiosoitteen, joten RoboLabista tulee henkilötietojen käsittelijä.
  - Ennen laajempaa käyttöä tarvitaan tietosuojaseloste. Siinä kerrotaan rekisterinpitäjä, käsiteltävät tiedot, käsittelyn tarkoitus, säilytysaika, Supabase käsittelijänä EU-alueella sekä käyttäjän oikeudet.
  - Alle 13-vuotiaat tarvitsevat huoltajan suostumuksen. Kirjautumislomake kysyy tämän.
  - Koulukäytössä suositellaan tiliä vaativaa tapaa vain, jos koulu on hyväksynyt sen. Muuten käytetään tiliton tapaa ja edistymistiedostoja.
