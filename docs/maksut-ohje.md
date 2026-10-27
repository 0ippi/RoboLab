# Tilaukset ja maksut: käyttöönotto

RoboLabissa on neljä tasoa:

| Taso | Hinta | Mitä saa |
|---|---|---|
| Free | 0 € | Perustyökalut ja 3 kurssia |
| Education | 2 €/kk tai 19 €/v | Lisää työkaluja ja kursseja. Oppilaalle ilmainen opettajan luokkakoodilla. |
| Teacher | 5 €/kk tai 45 €/v | Education + Opettajille-sivu ja luokkakoodit. 5 oppilasta sisältyy, lisäpaikka 1 €/oppilas/lukuvuosi. Koululisenssi 290 €/v. |
| Pro | 7 €/kk tai 59 €/v | Kaikki työkalut ja kurssit |

Hinnat ja tasojen sisältö ovat tiedostossa `plans.js` (PRICES, FEATURES), ja niitä voi muuttaa milloin tahansa. Jos muutat hintoja, muuta ne myös maksupalvelussa.

## 1. Aja tietokantakomennot (pakollinen)

Supabase → **SQL Editor** → **New query** → liitä tiedoston [`supabase-plans.sql`](supabase-plans.sql) koko sisältö → **Run**.

Komennot tekevät nämä:
- `subscriptions`-taulu: kunkin käyttäjän taso. Käyttäjä voi vain lukea omaa riviään, ei muuttaa sitä.
- `classes`- ja `class_activations`-taulut: opettajan luokkakoodit ja montako laitetta niihin on aktivoitu.
- Funktiot `my_plan`, `create_class`, `my_classes`, `delete_class` ja `activate_class_code`.

## 2. Tason antaminen käsin (pilotti ja laskulla maksavat koulut)

Tämä toimii heti ilman maksupalvelua:

1. Käyttäjä luo RoboLabissa pilvitilin.
2. Supabase → **Authentication → Users**: kopioi käyttäjän **UID**.
3. Supabase → **Table Editor → subscriptions** → **Insert row**:
   - `user_id`: UID
   - `plan`: `education`, `teacher` tai `pro`
   - `seats`: opettajan lisäoppilaspaikat (5 sisältyy aina). Koululisenssissä esim. `295`, jolloin paikkoja on yhteensä 300.
   - `valid_until`: esim. `2027-07-31 23:59:00+00`. Tyhjä tarkoittaa, että taso on voimassa toistaiseksi.
   - `source`: `manual` tai `school`
4. Käyttäjä painaa RoboLabissa **Tasot ja hinnat → Tarkista tilaus**, tai taso päivittyy itsestään minuutin kuluessa.

**Koululisenssi:** jokainen koulun opettaja luo pilvitilin, ja hänelle lisätään rivi `plan = teacher`. Paikat (`seats`) jaetaan opettajien kesken sopimuksen mukaan.

## 3. Verkkomaksut Stripellä (myöhemmin)

> Maksupalvelun tilin voi avata vain täysi-ikäinen henkilö tai yritys (esim. toiminimi), jolla on pankkitili. Tarkista myös verotus ja arvonlisävero. Stripen sijaan voi käyttää esimerkiksi Paddlea tai Lemon Squeezyä, jotka hoitavat EU:n arvonlisäveron puolestasi. Silloin webhook-funktiota pitää muokata.
>
> **Webhook-funktiota ei ole testattu oikeaa Stripe-tiliä vasten.** Kokeile ensin Stripen testitilassa.

1. **Tuotteet ja hinnat:** Stripe → Product catalog. Luo tuotteet Education, Teacher, Pro ja Oppilaspaikka.
   - Education, Teacher ja Pro: kuukausi- ja vuosihinta, toistuva maksu.
   - Oppilaspaikka: kertamaksu 1 € ja asiakkaan valittavissa oleva määrä.
2. **Maksulinkit:** luo jokaiselle hinnalle **Payment Link**. Kirjoita linkit tiedostoon `cloud-config.js` kohtaan `payments`, esim. `pro_month: "https://buy.stripe.com/…"`.
   - Sovellus lisää linkkiin automaattisesti `client_reference_id`:n, joka on käyttäjän pilvitilin tunnus. Sen avulla maksu liitetään oikeaan tiliin.
3. **Webhook-funktio:** asenna Supabase CLI ja aja projektin kansiossa:
   ```bash
   supabase functions deploy stripe-webhook --no-verify-jwt --project-ref tsftpfpbvujwhwuayofz
   ```
4. **Salaisuudet** (Supabase → Edge Functions → Secrets):
   - `STRIPE_SECRET_KEY`: Stripen secret key
   - `STRIPE_WEBHOOK_SECRET`: kohdan 5 signing secret
   - `PRICE_PLANS`: hinnat tasoihin, esim. `{"price_AAA":"education","price_BBB":"education","price_CCC":"teacher","price_DDD":"teacher","price_EEE":"pro","price_FFF":"pro","price_GGG":"seats"}`
5. **Webhook Stripessä:** Stripe → Developers → Webhooks → Add endpoint.
   - URL: `https://tsftpfpbvujwhwuayofz.supabase.co/functions/v1/stripe-webhook`
   - Tapahtumat: `checkout.session.completed`, `customer.subscription.updated` ja `customer.subscription.deleted`
6. **Asiakasportaali:** ota käyttöön Stripen Customer portal, jotta tilaajat voivat perua tilauksen itse. Linkin voi lisätä RoboLabin Tasot-sivulle myöhemmin.

**Salaisia avaimia (`sk_…`, `whsec_…`, service_role) ei koskaan laiteta sovelluksen tiedostoihin eikä GitHubiin.** Ne kuuluvat vain Supabasen Secrets-kohtaan.

## Miten lukitus toimii

- Taso tarkistetaan Supabasesta, ja se tallennetaan laitteelle, jotta sovellus toimii myös ilman nettiä. Tallennettu taso pysyy voimassa enintään 30 päivää ilman tarkistusta.
- Lukitus on sovelluksen puolella. RoboLabin koodi on avointa, joten taitava käyttäjä voi kiertää lukituksen. Tämä on tietoinen valinta: tavoite on ohjata ja mainostaa, ei estää kopiointia. Koulut ja tilaajat maksavat joka tapauksessa laskusta tai kuitista. Tiukempi suojaus vaatisi kurssien sisällön siirtämistä palvelimelle ja yksityisen repositorion.
- **Kurssin aikana sen käyttämät työkalut aukeavat**, vaikka työkalu kuuluisi korkeampaan tasoon. Esimerkiksi Free-tason Anturit-kurssi käyttää neuroverkkotyökalua yhdessä vaiheessa.
- **Luokkakoodit:**
  - Oppilas syöttää koodin, ja palvelin tallentaa vain satunnaisen laitetunnuksen, jotta paikkoja ei käytetä kahdesti. Nimiä tai tilejä ei tarvita.
  - Koodi tarkistetaan uudelleen viikoittain. Jos opettaja poistaa luokan, oppilaan Education-taso poistuu seuraavassa tarkistuksessa.
