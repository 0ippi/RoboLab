// Pilvitilin (Supabase) yhteystiedot. Molemmat ovat julkisia: ne näkyvät joka tapauksessa selaimelle,
// ja tietojen suojaus hoidetaan tietokannan rivitason säännöillä (docs/supabase.sql).
// Jos kentät ovat tyhjiä, pilvitili ei näy sovelluksessa ja kaikki toimii kuten ennenkin.
// ÄLÄ koskaan laita tähän service_role-avainta tai tietokannan salasanaa.
window.ROBOLAB_CLOUD = {
  url: "https://tsftpfpbvujwhwuayofz.supabase.co",
  anonKey: "sb_publishable_4Qv4nBe9YV4J8Z6C0a2HMA_jrXZH9GZ", // julkinen publishable-avain (Project Settings → API Keys)
  // Julkinen osoite, johon salasanan vaihtolinkki vie (myös paikallisesti asennetusta RoboLabista).
  // Sama kuin Supabasen Site URL; osoitteen pitää olla Authentication → URL Configuration -sallittujen listassa.
  siteUrl: "https://0ippi.github.io/RoboLab/",
  // Maksulinkit (esim. Stripe Payment Links). Tyhjä = verkkomaksu ei vielä käytössä; Osta-nappi kertoo sen.
  // Tilaus liitetään pilvitiliin: sovellus lisää linkkiin client_reference_id = käyttäjän tunnus.
  payments: {
    education_month: "",
    education_year: "",
    teacher_month: "",
    teacher_year: "",
    seats: "",          // oppilaspaikat (määrä valitaan kassalla)
    pro_month: "",
    pro_year: "",
  },
};
