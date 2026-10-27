# Sähköpostit (salasanan palautus) kuntoon

Supabasen oma sähköpostipalvelu lähettää vain muutaman viestin tunnissa, ja viestit menevät usein roskapostiin. Siksi salasanan palautusviestit kannattaa lähettää omalla sähköpostipalvelulla (SMTP).

Helpoin tapa on käyttää **erillistä Gmail-tiliä**, esim. `robolab.app@gmail.com`. Tämä osoite näkyy käyttäjille lähettäjänä, joten henkilökohtaista osoitetta ei kannata käyttää. Gmail lähettää noin 500 viestiä päivässä, mikä riittää hyvin alkuun.

## 1. Gmailin sovellussalasana

1. Kirjaudu Gmail-tilille, jota käytät lähettäjänä.
2. Ota käyttöön kaksivaiheinen tunnistus: https://myaccount.google.com/security → **2-Step Verification**.
3. Luo sovellussalasana: https://myaccount.google.com/apppasswords → nimeksi esim. "RoboLab Supabase" → **Create**.
4. Kopioi 16-merkkinen salasana. Se näytetään vain kerran.

Sovellussalasana on salaisuus. Älä laita sitä RoboLabin tiedostoihin, GitHubiin tai keskusteluihin. Se kirjoitetaan vain Supabaseen.

## 2. Supabasen asetukset

Supabase → **Authentication → Emails → SMTP Settings** → ota käyttöön **Enable custom SMTP**:

| Kenttä | Arvo |
|---|---|
| Sender email | Gmail-osoite, esim. `robolab.app@gmail.com` |
| Sender name | `RoboLab` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | sama Gmail-osoite |
| Password | kohdan 1 sovellussalasana |

Paina **Save**.

Sen jälkeen Supabase → **Authentication → Rate Limits**: nosta sähköpostien raja (esim. 30 tunnissa).

## 3. Testaa

1. Avaa RoboLab → Kirjaudu pilvitilille → **Unohtuiko salasana?** → kirjoita oma osoitteesi.
2. Viestin pitäisi tulla minuutin sisällä. Linkki avaa RoboLabin, ja voit asettaa uuden salasanan.

Paluuosoite on jo asetettu oikein: **Authentication → URL Configuration** → Site URL `https://0ippi.github.io/RoboLab/`.

## 4. Suositus: sähköpostin vahvistus päälle

Kun sähköpostit toimivat, kytke päälle **Authentication → Sign In / Providers → Email → Confirm email**. Silloin kukaan ei voi luoda tiliä toisen ihmisen sähköpostiosoitteella. RoboLab osaa jo kertoa käyttäjälle, että vahvistuslinkki on lähetetty.

## Viestipohjat (valinnainen)

**Authentication → Emails → Templates** → esim. "Reset password". Viestin voi kirjoittaa suomeksi:

```html
<h2>RoboLab: uusi salasana</h2>
<p>Pyysit salasanan vaihtoa. Aseta uusi salasana tästä linkistä:</p>
<p><a href="{{ .ConfirmationURL }}">Vaihda salasana</a></p>
<p>Jos et pyytänyt tätä, voit jättää viestin huomiotta.</p>
```
