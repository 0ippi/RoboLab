"use strict";

/* Robottirakentajat 2D ja 3D (RoboSim-rakentaja, sovitettu RoboLabiin). Itse käyttöliittymä on moduulissa
   robosim/builder/ui.js, joka ladataan vasta, kun rakentaja avataan (Three.js, siirtokahvat, Rapier). */
(() => {
  let mod = null;
  const load = () => (mod ||= import(new URL("robosim/builder/ui.js", document.baseURI).href).catch((e) => { mod = null; throw e; }));

  function makeTool(dim) {
    let inst = null, token = 0;
    return {
      async render(root, tool) {
        const my = ++token;
        root.innerHTML = `${toolHead(tool)}<div class="card"><p class="note">${tr("Ladataan rakentajaa…", "Loading the builder…")}</p></div>`;
        let m;
        try { m = await load(); }
        catch (err) {
          if (my !== token) return;
          root.innerHTML = `${toolHead(tool)}${alertsHtml([{ level: "err", text: tr("Rakentajan lataus epäonnistui (tarvitset internetyhteyden ensimmäisellä kerralla): ", "Loading the builder failed (you need an internet connection the first time): ") + err.message }])}`;
          return;
        }
        if (my !== token || currentRoute() !== "build" + dim) return; // käyttäjä ehti vaihtaa sivua
        inst = m.mount(root, dim, tool);
      },
      unmount() { token++; inst?.unmount(); inst = null; },
    };
  }

  TOOL_IMPL.build2d = makeTool("2d");
  TOOL_IMPL.build3d = makeTool("3d");

  // Näkyvät pikanäppäinikkunassa (? tai ⌨-nappi), kun rakentaja on auki
  const keys = (dim) => [
    [tr("Kopioi osat nivelineen", "Copy parts with their joints"), "Ctrl+C"],
    [tr("Leikkaa", "Cut"), "Ctrl+X"],
    [tr("Liitä (myös robotin JSON leikepöydältä)", "Paste (also a robot’s JSON from the clipboard)"), "Ctrl+V"],
    [tr("Monista", "Duplicate"), "Ctrl+D"],
    [tr("Valitse kaikki", "Select all"), "Ctrl+A"],
    [tr("Kumoa / tee uudelleen", "Undo / redo"), "Ctrl+Z"],
    [tr("Poista valinta", "Delete selection"), "Delete"],
    [tr("Siirrä 5 cm (Shift: 1 cm)", "Move 5 cm (Shift: 1 cm)"), dim === "3d" ? tr("Nuolet, PgUp/PgDn", "Arrows, PgUp/PgDn") : tr("Nuolet", "Arrows")],
    [tr("Käännä 90° (Shift: toiseen suuntaan)", "Rotate 90° (Shift: the other way)"), "R"],
    [tr("Laske maahan", "Lower to ground"), "G"],
    [tr("Siirtokahvat", "Move handles"), "W"],
    [tr("Kääntökahvat", "Rotate handles"), "E"],
    [tr("Skaalauskahvat", "Scale handles"), "S"],
    [tr("Valintalaatikko päälle / pois", "Box select on / off"), "B"],
    [tr("Siirrä vain valittu osa (ei kiinnitettyjä osia)", "Move only the selected part (not attached parts)"), "Alt+" + tr("veto", "drag")],
    [tr("Yhdistä kaksi osaa nivelellä", "Join two parts with a joint"), "J"],
    [tr("Peilaa", "Mirror"), "M"],
    [tr("Seuraava / edellinen osa", "Next / previous part"), "Tab"],
    dim === "3d" ? [tr("Lisää laatikko, pallo, sylinteri, kapseli", "Add box, sphere, cylinder, capsule"), "1–4"] : [tr("Lisää laatikko, ympyrä", "Add box, circle"), "1–2"],
    [tr("Testaa fysiikka", "Test physics"), "T"],
    [tr("Näytä / piilota nivelet", "Show / hide joints"), "H"],
    [tr("Näytä / piilota painopiste", "Show / hide centre of mass"), "C"],
    [tr("Kohdista kamera", "Focus camera"), "F"],
    [tr("Pikavalikko", "Quick menu"), tr("Hiiren oikea", "Right click")],
    [tr("Valitse useita", "Select several"), "Ctrl/Shift+" + tr("klikkaus", "click")],
    [tr("Valitse laatikolla", "Select with a box"), dim === "2d" ? tr("Veto tyhjästä kohdasta", "Drag from empty space") : "Shift+" + tr("veto", "drag")],
    [tr("Poista valinta / lopeta testi", "Clear selection / stop test"), "Esc"],
  ];
  TOOL_SHORTCUTS.build2d = keys("2d");
  TOOL_SHORTCUTS.build3d = keys("3d");

  // Rakentaja → simulaatio: robotti jätetään simulaation "odottavaksi malliksi". Simulaatio ottaa sen käyttöön
  // avautuessaan ja kysyy ensin, jos jo opitut aivot nollautuisivat.
  window.RSBridge = Object.assign(window.RSBridge || {}, {
    builderToSim(dim) {
      const b = getToolState("build" + dim, {});
      if (!b.export) { toast(tr("Robotissa on virheitä — katso rakentajan Tarkistus-välilehti.", "The robot has errors — see the builder's Check tab.")); return false; }
      const cur = getToolState("nn" + dim, {});
      saveToolState("nn" + dim, { ...cur, pendingModel: b.export }, { undo: false });
      return true;
    },
  });
})();
