"use strict";

/* Kielituki. Kieli luetaan ennen muita skriptejä, jotta kaikki tekstit voidaan kirjoittaa muodossa
   tr("suomeksi", "in English"). Kielen vaihto lataa sivun uudelleen, joten vakiot (työkalulista,
   asetusten skeema) rakentuvat valitulla kielellä. */
const LANG = (() => {
  if (window.ROBOLAB_LANG) return window.ROBOLAB_LANG; // testit pakottavat kielen
  try {
    const s = JSON.parse(localStorage.getItem("robolab-settings-v1"));
    if (s && (s.language === "fi" || s.language === "en")) return s.language;
    // Ennen kieliasetusta tallennetut asetukset: sovellus oli silloin suomenkielinen, joten pysytään siinä
    if (s || localStorage.getItem("robolab-projects-v1")) return "fi";
  } catch {}
  // Uusi käyttäjä: selaimen kieli
  return (navigator.language || "").toLowerCase().startsWith("fi") ? "fi" : "en";
})();

const tr = (fi, en) => (LANG === "en" ? en : fi);
document.documentElement.lang = LANG;
