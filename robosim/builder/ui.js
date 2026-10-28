// Robottirakentajan käyttöliittymä RoboLabissa: valinnat, ominaisuuspaneeli, fysiikkatesti ja siirto koulutukseen.
// Malli tallennetaan projektiin (build2d / build3d), joten kumoaminen kulkee sovelluksen Ctrl+Z:n kautta.
import * as THREE from 'three';
import * as M from './model.js';
import { Viewport } from './viewport.js';
import { PhysicsTest, initPhysics } from './physics.js';
import { MODELS3D } from '../3d/models3d.js';

export { M, MODELS3D };

// Rakentajien yhteinen leikepöytä (säilyy työkalujen ja projektien välillä tämän välilehden ajan).
// Kopio viedään myös järjestelmän leikepöydälle tekstinä, joten sen voi liittää toiseen välilehteen.
let clipboard = null, pasteCount = 0;
const partsN = (n) => (n === 1 ? tr('1 osa', '1 part') : tr(`${n} osaa`, `${n} parts`));
// Kirjoituskenttä: pikanäppäimet eivät toimi. Valintaruutu, liukusäädin ja värivalitsin eivät ole kirjoituskenttiä
// (liukusäätimen nuolinäppäimet käsitellään erikseen onKeyssä).
const isTyping = (t) => (/^(textarea|select)$/i.test(t?.tagName || '') || t?.isContentEditable
  || (t?.tagName === 'INPUT' && !/^(checkbox|radio|range|color|button|submit|reset|file)$/i.test(t.type)));

export function mount(root, dim, tool) {
  const key = 'build' + dim, other = dim === '2d' ? '3d' : '2d';
  const q = (id) => root.querySelector('#rb-' + id);
  const saved = getToolState(key, {});
  const S = {
    dim,
    level: saved.level || (settings.advanced ? 'pro' : 'beginner'),
    model: saved.model && Array.isArray(saved.model.bodies) ? saved.model : M.emptyModel(dim),
    sel: { bodies: [], joint: null },
    gizmoMode: 'translate',
    tab: 'props',
    test: null,
    errors: 0
  };
  let view, raf = 0, testRaf = 0, dead = false;
  // Kurssien tarkistukset (courses.js): onko fysiikkatesti käynnissä, mitä moottoreille on annettu, kuinka pitkälle
  // robotti on ajanut testin alusta (run vaihtuu, kun testi aloitetaan uudelleen) ja onko Tarkistus-välilehti vihreä
  window.builderStatus = () => ({ dim, testing: !!S.test, actions: S.test ? [...S.test.actions] : [], kinds: S.test ? S.test.motors.map((m) => m.kind) : [],
    x: S.test ? S.test.rootX() : null, x0: S.test ? S.test.x0 : null, run: S.runs || 0, check: S.checkLevel || null });

  root.innerHTML = `
    ${toolHead(tool, `
      <button class="btn" data-a="open" title="${tr('Avaa robottimallin .json-tiedosto (myös simulaatioiden Vie malli- ja Vie aivot -tiedostot).', 'Open a robot model .json file (also the simulations’ Export model and Export brain files).')}">${tr('Avaa', 'Open')}</button>
      <button class="btn" data-a="saveOwn" title="${tr('Tallentaa robotin Omat robotit -listaan: se löytyy pohjista ja simulaatioista kaikissa projekteissa.', 'Saves the robot to My robots: it appears in the templates and simulations in every project.')}">☆ ${tr('Omiin robotteihin', 'To my robots')}</button>
      <button class="btn" data-a="save" title="${tr('Tallenna robotti .json-tiedostoon.', 'Save the robot to a .json file.')}">${icon('download')} ${tr('Tallenna', 'Save')}</button>
      <button class="btn" id="rb-testBtn" title="${tr('Pudottaa robotin maahan oikealla fysiikalla. Kokeile moottoreita liukusäätimillä.', 'Drops the robot to the ground with real physics. Try the motors with sliders.')}">▶ ${tr('Testaa fysiikka', 'Test physics')}</button>
      <button class="btn primary" data-a="send" title="${tr('Avaa robotin koulutettavaksi neuroverkkosimulaatiossa.', 'Opens the robot for training in the neural network simulation.')}">${tr('Kouluta simulaatiossa', 'Train in simulation')} →</button>`)}
    <div class="rsb">
      <div class="rsb-bar">
        <div id="rb-template" aria-label="${tr('Pohja', 'Template')}"></div>
        <span class="seg small" id="rb-level" role="group" aria-label="${tr('Taso', 'Level')}" title="${tr('Aloittelija näyttää vain tärkeimmät asetukset. Edistynyt näyttää kaikki fysiikka-asetukset, useat muodot yhdessä osassa ja JSON-editorin.', 'Beginner shows only the key settings. Advanced shows all physics settings, several shapes per part and the JSON editor.')}">
          <button data-level="beginner">${tr('Aloittelija', 'Beginner')}</button><button data-level="pro">${tr('Edistynyt', 'Advanced')}</button></span>
        <button class="btn" data-a="convert" title="${dim === '3d' ? tr('Tekee robotista 2D-version 2D-rakentajaan: syvyys poistetaan ja sylinterit muuttuvat ympyröiksi.', 'Makes a 2D version of the robot in the 2D builder: depth is removed and cylinders become circles.') : tr('Tekee robotista 3D-version 3D-rakentajaan. Siirrä sen jälkeen esim. jalat sivuille ja peilaa.', 'Makes a 3D version of the robot in the 3D builder. Then move e.g. the legs sideways and mirror them.')}">${dim === '3d' ? tr('Tee 2D-versio', 'Make a 2D version') : tr('Tee 3D-versio', 'Make a 3D version')} →</button>
        <span class="rsb-spacer"></span>
        ${dim === '3d' ? `<span class="seg small" id="rb-views" role="group" aria-label="${tr('Kuvakulma', 'View')}">
          <button data-view="iso">3D</button><button data-view="front">${tr('Edestä', 'Front')}</button><button data-view="side">${tr('Sivulta', 'Side')}</button><button data-view="top">${tr('Ylhäältä', 'Top')}</button></span>` : ''}
        <button class="btn" data-a="shot" title="${tr('Tallenna kuva robotista PNG-tiedostona.', 'Save a picture of the robot as a PNG file.')}">📷 ${tr('Kuva', 'Image')}</button>
        <button class="btn" data-a="keys" title="${tr('Näytä rakentajan pikanäppäimet (?)', 'Show the builder shortcuts (?)')}">⌨ ${tr('Pikanäppäimet', 'Shortcuts')}</button>
      </div>
      <div class="rsb-grid">
        <aside class="card rsb-left">
          <h3 class="card-title" title="${tr('Osa on jäykkä kappale; liikkuvat kohdat tehdään yhdistämällä osia nivelillä.', 'A part is a rigid body; moving bits are made by joining parts with joints.')}">${tr('Lisää osa', 'Add a part')}</h3>
          <div class="rsb-parts" id="rb-parts"></div>
          <h3 class="card-title" title="${tr('Valmiit kokonaisuudet, jotka kiinnittyvät valittuun osaan nivelillä. Valitse ensin osa (esim. runko).', 'Ready-made pieces that attach to the selected part with joints. Select a part first (e.g. the body).')}">${tr('Valmisosat', 'Ready-made')}</h3>
          <div class="rsb-parts">
            <button class="btn" id="rb-addWheel" title="${dim === '3d' ? tr('Lisää moottoroidun pyörän valitun osan sivulle. Peilaa se toiselle puolelle.', 'Adds a motorised wheel to the side of the selected part. Mirror it to the other side.') : tr('Lisää moottoroidun pyörän valitun osan etuosaan. Peilaa se taakse, tai käytä Pyöräparia.', 'Adds a motorised wheel to the front of the selected part. Mirror it to the back, or use Wheel pair.')}">⚙ ${tr('Pyörä', 'Wheel')}</button>
            <button class="btn" id="rb-addRotor" title="${tr('Lisää roottorin (potkurin) valitun osan päälle. Roottorien voimat tasataan niin, että puolella teholla robotti leijuu. Neuroverkko säätää jokaisen roottorin työntövoimaa.', 'Adds a rotor (propeller) on top of the selected part. Rotor forces are balanced so the robot hovers at half power. The neural network controls each rotor’s thrust.')}">🌀 ${tr('Roottori', 'Rotor')}</button>
            <button class="btn" id="rb-addLeg" title="${tr('Lisää jalan (reisi + sääri, lonkka- ja polvinivel) valitun osan alle.', 'Adds a leg (thigh + shin, hip and knee joints) under the selected part.')}">🦵 ${tr('Jalka', 'Leg')}</button>
            <button class="btn" id="rb-addWheelPair" title="${dim === '3d' ? tr('Lisää moottoroidut pyörät valitun osan kummallekin puolelle. Sama käsky pyörittää molempia eteenpäin.', 'Adds motorised wheels to both sides of the selected part. The same command drives both forward.') : tr('Lisää moottoroidut pyörät valitun osan etu- ja takaosaan.', 'Adds motorised wheels to the front and back of the selected part.')}">⚙⚙ ${tr('Pyöräpari', 'Wheel pair')}</button>
            <button class="btn" id="rb-addCaster" title="${tr('Lisää pienen, liukkaan tukipyörän valitun osan alle. Ei moottoria: pitää rungon pystyssä kahden pyörän robotissa.', 'Adds a small slippery caster under the selected part. No motor: keeps the body level on a two-wheel robot.')}">○ ${tr('Tukipyörä', 'Caster')}</button>
            <button class="btn" id="rb-addArm" title="${tr('Lisää robottikäden (olka- ja kyynärnivel, kärjessä tarttuja) valitun osan päälle.', 'Adds a robot arm (shoulder and elbow joints, a gripper at the tip) on top of the selected part.')}">🦾 ${tr('Käsivarsi', 'Arm')}</button>
            <button class="btn" id="rb-addGripper" title="${tr('Lisää kaksisormisen tarttujan valitun osan etuosaan. Sormet sulkeutuvat servoilla.', 'Adds a two-finger gripper to the front of the selected part. The fingers close with servos.')}">✊ ${tr('Tarttuja', 'Gripper')}</button>
            <button class="btn" id="rb-addTail" title="${tr('Lisää vapaasti heiluvan hännän valitun osan takaosaan.', 'Adds a freely swinging tail to the back of the selected part.')}">〰 ${tr('Häntä', 'Tail')}</button>
            <button class="btn" id="rb-addSpringLeg" title="${tr('Lisää jalan, jossa on moottoroitu lonkka ja joustava polvi (jousi). Vähemmän moottoreita: hyppivä robotti oppii nopeammin.', 'Adds a leg with a motorised hip and a springy knee. Fewer motors: a hopping robot learns faster.')}">🦘 ${tr('Jousijalka', 'Spring leg')}</button>
            <button class="btn" id="rb-addBumper" title="${tr('Lisää kosketusanturin (joustava puskuri) valitun osan etuosaan. Robotti tietää, osuuko puskuri esteeseen tai maahan.', 'Adds a touch sensor (a springy bumper) to the front of the selected part. The robot knows whether the bumper hits an obstacle or the ground.')}">🛡 ${tr('Kosketusanturi', 'Touch sensor')}</button>
            <button class="btn" id="rb-addLidar" title="${tr('Lisää lidar-anturin valitun osan päälle ja kytkee etäisyysanturit päälle.', 'Adds a lidar sensor on top of the selected part and turns the distance sensors on.')}">📡 Lidar</button>
            <button class="btn" id="rb-addCamera" title="${tr('Lisää kamerasilmän valitun osan etuosaan (ulkonäkö).', 'Adds a camera eye to the front of the selected part (appearance).')}">📷 ${tr('Kamera', 'Camera')}</button>
          </div>
          <h3 class="card-title">${tr('Toiminnot', 'Actions')}</h3>
          <div class="rsb-actions">
            <button class="btn" id="rb-jointBtn" title="${tr('Valitse kaksi osaa (Shift+klikkaus): ensin se, johon kiinnitetään, sitten liikkuva osa. Pikanäppäin J.', 'Select two parts (Shift+click): first the one to attach to, then the moving part. Shortcut J.')}">🔗 ${tr('Yhdistä nivelellä', 'Join with a joint')}</button>
            <button class="btn" id="rb-mirrorBtn" title="${tr('Tekee valituista osista peilikuvan toiselle puolelle nivelineen. Pikanäppäin M.', 'Mirrors the selected parts with their joints to the other side. Shortcut M.')}"></button>
            <button class="btn" id="rb-dupBtn" title="${tr('Monistaa valitut osat (Ctrl+D).', 'Duplicates the selected parts (Ctrl+D).')}">⧉ ${tr('Monista', 'Duplicate')}</button>
            <div class="rsb-pair">
              <button class="btn" id="rb-copyBtn" title="${tr('Kopioi valitut osat nivelineen (Ctrl+C). Kopion voi liittää myös toiseen rakentajaan tai projektiin.', 'Copy the selected parts with their joints (Ctrl+C). You can paste them into the other builder or another project too.')}">${tr('Kopioi', 'Copy')}</button>
              <button class="btn" id="rb-pasteBtn" title="${tr('Liitä kopioidut osat (Ctrl+V). Toimii myös robotin JSON-tekstillä leikepöydältä.', 'Paste the copied parts (Ctrl+V). Also works with a robot’s JSON text from the clipboard.')}">${tr('Liitä', 'Paste')}</button>
            </div>
            <div class="rsb-pair">
              <button class="btn" id="rb-rotBtn" title="${dim === '3d' ? tr('Kääntää valittuja osia 90° pystyakselin ympäri (R, Shift+R toiseen suuntaan).', 'Rotates the selected parts 90° about the vertical axis (R, Shift+R the other way).') : tr('Kääntää valittuja osia 90° (R, Shift+R toiseen suuntaan).', 'Rotates the selected parts 90° (R, Shift+R the other way).')}">⟳ 90°</button>
              <button class="btn" id="rb-groundBtn" title="${tr('Laskee valitut osat (tai koko robotin) maan pinnalle (G).', 'Lowers the selected parts (or the whole robot) onto the ground (G).')}">⤓ ${tr('Maahan', 'To ground')}</button>
            </div>
            <button class="btn" id="rb-rootBtn" title="${tr('Päärunko on osa, jonka liikettä tehtävät mittaavat.', 'The main body is the part whose motion the tasks measure.')}">★ ${tr('Päärungoksi', 'Make main body')}</button>
            <button class="btn pro" id="rb-mergeBtn" title="${tr('Liittää toisen valitun osan ensimmäiseen yhdeksi jäykäksi kappaleeksi.', 'Merges the second selected part into the first as one rigid body.')}">⊕ ${tr('Liitä yhteen', 'Merge')}</button>
            <button class="btn danger" id="rb-delBtn" title="${tr('Poistaa valinnan (Delete).', 'Deletes the selection (Delete).')}">✕ ${tr('Poista', 'Delete')}</button>
          </div>
          <h3 class="card-title">${tr('Rakenne', 'Structure')}</h3>
          <div id="rb-tree" class="rsb-tree"></div>
        </aside>
        <div class="rsb-center">
          <canvas id="rb-view" aria-label="${tr('Rakentajan 3D-näkymä', 'Builder 3D view')}"></canvas>
          <div class="rsb-viewtools">
            <button class="btn" id="rb-modeMove" title="${tr('Siirrä (W)', 'Move (W)')}">✥</button>
            <button class="btn" id="rb-modeRotate" title="${tr('Käännä (E)', 'Rotate (E)')}">⟳</button>
            <button class="btn" id="rb-modeScale" title="${tr('Skaalaa (S): vedä akselista venyttääksesi osaa yhteen suuntaan tai keskeltä koko osaa. Usea osa skaalataan yhdessä samassa suhteessa.', 'Scale (S): drag an axis to stretch a part in one direction or the centre to scale it all. Several parts are scaled together in proportion.')}">⤢</button>
            <button class="btn" id="rb-boxSel" ${dim === '2d' ? 'hidden' : ''} title="${tr('Valintalaatikko (B): vedä tyhjästä kohdasta laatikko osien ympärille. 3D:ssä myös Shift- tai Ctrl+veto.', 'Box select (B): drag a box around parts from empty space. In 3D also Shift or Ctrl + drag.')}" aria-pressed="false">⬚</button>
            <label class="mini-toggle" title="${tr('Kiinnittää siirrot 5 cm:n ja käännöt 15°:n välein.', 'Snaps moves to 5 cm and rotations to 15°.')}"><input type="checkbox" id="rb-snap" checked> ${tr('Kiinnitys', 'Snap')}</label>
            <button class="btn" id="rb-focusBtn" title="${tr('Kohdista kamera robottiin (F)', 'Focus the camera on the robot (F)')}">⌖</button>
            <label class="mini-toggle" title="${tr('Näytä tai piilota nivelten merkit (H).', 'Show or hide the joint markers (H).')}"><input type="checkbox" id="rb-showJoints" checked> ${tr('Nivelet', 'Joints')}</label>
            <label class="mini-toggle" title="${tr('Näyttää robotin painopisteen. Mitä matalammalla ja keskempänä tukipintaa se on, sitä vakaampi robotti on (C).', 'Shows the robot’s centre of mass. The lower and more central over its support it is, the steadier the robot (C).')}"><input type="checkbox" id="rb-showCom"> ${tr('Painopiste', 'Centre of mass')}</label>
          </div>
          <div class="menu rsb-ctx" id="rb-ctx" role="menu" hidden></div>
          <div class="rsb-phys" id="rb-phys" hidden>
            <div class="rsb-phys-head"><b>${tr('Fysiikkatesti', 'Physics test')}</b><span id="rb-physStatus"></span></div>
            <label class="mini-toggle"><input type="checkbox" id="rb-wiggle"> ${tr('Heiluta moottoreita automaattisesti', 'Wiggle the motors automatically')}</label>
            <div id="rb-sliders"></div>
            <div class="row-actions">
              <button class="btn" id="rb-physRestart">↺ ${tr('Alusta', 'Restart')}</button>
              <button class="btn" id="rb-physZero">${tr('Nollaa moottorit', 'Zero motors')}</button>
              <button class="btn primary" id="rb-physStop">${tr('Lopeta testi', 'Stop test')}</button>
            </div>
          </div>
          <div class="rsb-hint" id="rb-hint"></div>
          <div class="nn-loading" id="rb-loading" hidden></div>
        </div>
        <aside class="card rsb-right">
          <div class="seg small rsb-tabs">
            <button data-tab="props">${tr('Ominaisuudet', 'Properties')}</button>
            <button data-tab="check">${tr('Tarkistus', 'Check')} <span id="rb-checkBadge"></span></button>
            <button data-tab="json" class="pro">JSON</button>
          </div>
          <div id="rb-tab-props" class="rsb-tab"></div>
          <div id="rb-tab-check" class="rsb-tab" hidden></div>
          <div id="rb-tab-json" class="rsb-tab" hidden>
            <p class="note">${tr('Robotti simulaation muodossa. Muokkaa ja paina Käytä.', 'The robot in simulation format. Edit and press Apply.')}</p>
            <textarea id="rb-jsonText" class="rsb-json" spellcheck="false"></textarea>
            <p id="rb-jsonError" class="rs-err"></p>
            <div class="row-actions"><button class="btn primary" id="rb-jsonApply">${tr('Käytä', 'Apply')}</button><button class="btn" id="rb-jsonCopy">${tr('Kopioi', 'Copy')}</button></div>
          </div>
        </aside>
      </div>
    </div>`;

  // ---------- Tallennus ja kumoaminen ----------
  const exportModel = () => (S.dim === '2d' ? M.to2D(S.model) : M.to3D(S.model));
  // Tallentaa mallin projektiin (kumottavissa). export = simulaation muoto, jota "Kouluta simulaatiossa" käyttää.
  function persist(undo = true) {
    let exp = null;
    try { if (!S.errors) exp = exportModel(); } catch { /* keskeneräinen malli */ }
    saveToolState(key, { model: S.model, level: S.level, export: exp }, { undo });
  }
  const snap = () => JSON.stringify(S.model);

  // Kaikki mallin muutokset kulkevat tätä kautta. Fysiikkatesti pysäytetään ensin: testin aikana muokattu malli
  // on piilossa, joten muutos tapahtuisi näkymättömästi.
  function change(fn, keepSelection) {
    if (S.test) { stopTest(true); toast(tr('Fysiikkatesti pysäytettiin, jotta muutos näkyy.', 'The physics test was stopped so you can see the change.')); }
    const before = snap();
    fn();
    if (snap() === before) { refresh(true); return; }
    if (!keepSelection) cleanSelection();
    refresh();
    persist();
  }

  function cleanSelection() {
    const ids = new Set(S.model.bodies.map((b) => b.id));
    S.sel.bodies = S.sel.bodies.filter((id) => ids.has(id));
    if (S.sel.joint != null && !S.model.joints[S.sel.joint]) S.sel.joint = null;
  }

  // ---------- Valinta ----------
  function select(kind, id, additive) {
    if (kind === 'body') {
      if (additive) {
        const i = S.sel.bodies.indexOf(id);
        if (i >= 0) S.sel.bodies.splice(i, 1); else S.sel.bodies.push(id);
      } else S.sel.bodies = [id];
      S.sel.joint = null;
    } else if (kind === 'joint') S.sel = { bodies: [], joint: id };
    else if (kind === 'all') S.sel = { bodies: S.model.bodies.map((b) => b.id), joint: null };
    else S.sel = { bodies: [], joint: null };
    if (S.tab === 'json') S.tab = 'props';
    refresh(true);
  }
  const selectedBody = () => (S.sel.bodies.length === 1 ? S.model.bodies.find((b) => b.id === S.sel.bodies[0]) : null);
  // Valmisosan kiinnityskohta: valittu osa, tai jos mitään ei ole valittu, päärunko (napit eivät ole turhaan harmaina)
  const attachTarget = () => selectedBody() || (!S.sel.bodies.length && S.sel.joint == null ? S.model.bodies.find((b) => b.id === S.model.root) || null : null);

  // ---------- Päivitys ----------
  function refresh(selectionOnly) {
    if (!view) return;
    if (!selectionOnly) view.build(S.model, S.sel);
    else view.applySelection(S.sel);
    const b = selectedBody();
    if (S.test) view.attachGizmo(null);
    else if (b) view.attachGizmo('body', b.id, S.gizmoMode);
    else if (S.sel.bodies.length > 1) view.attachGizmo('group', S.sel.bodies, S.gizmoMode);
    else if (S.sel.joint != null) view.attachGizmo('joint', S.sel.joint);
    else view.attachGizmo(null);
    renderTree();
    renderProps();
    renderCheck();
    renderJson();
    updateButtons();
    view.setCom(M.massProps(S.model, S.dim).com, S.showCom);
  }

  function updateButtons() {
    const n = S.sel.bodies.length, one = n === 1;
    const target = attachTarget();
    for (const id of ['addWheel', 'addLeg', 'addRotor', 'addWheelPair', 'addCaster', 'addArm', 'addGripper', 'addTail', 'addLidar', 'addCamera', 'addBumper', 'addSpringLeg']) q(id).disabled = !target;
    q('jointBtn').disabled = n !== 2;
    q('mergeBtn').disabled = n !== 2;
    q('mirrorBtn').disabled = n === 0;
    q('dupBtn').disabled = n === 0;
    q('copyBtn').disabled = q('rotBtn').disabled = n === 0;
    q('groundBtn').disabled = !S.model.bodies.length;
    q('rootBtn').disabled = !one || S.sel.bodies[0] === S.model.root;
    q('delBtn').disabled = n === 0 && S.sel.joint == null;
    q('mirrorBtn').textContent = '⇋ ' + (S.dim === '2d' ? tr('Peilaa eteen–taakse', 'Mirror front–back') : tr('Peilaa toiselle puolelle', 'Mirror to the other side'));
    for (const btn of root.querySelectorAll('#rb-level button')) btn.classList.toggle('on', btn.dataset.level === S.level);
    root.querySelector('.rsb').classList.toggle('pro', S.level === 'pro');
    q('modeMove').classList.toggle('on', S.gizmoMode === 'translate');
    q('modeRotate').classList.toggle('on', S.gizmoMode === 'rotate');
    q('modeScale').classList.toggle('on', S.gizmoMode === 'scale');
    for (const t of root.querySelectorAll('.rsb-tabs button')) t.classList.toggle('on', t.dataset.tab === S.tab);
    for (const id of ['props', 'check', 'json']) q('tab-' + id).hidden = S.tab !== id;
    for (const btn of q('parts').querySelectorAll('button')) {
      const t = M.PART_TYPES[btn.dataset.type];
      btn.hidden = !!t.only3d && S.dim === '2d';
      btn.textContent = (S.dim === '2d' && t.label2d) || t.label;
    }
    setHint();
  }

  function setHint(text) {
    const n = S.sel.bodies.length;
    let h = text;
    if (!h) {
      if (S.test) h = S.dim === '2d' ? tr('Fysiikkatesti käynnissä. Liikuta moottoreita liukusäätimillä. Näkymää voi siirtää vetämällä ja zoomata rullalla.', 'Physics test running. Move the motors with the sliders. Drag to move the view and scroll to zoom.')
        : tr('Fysiikkatesti käynnissä. Liikuta moottoreita liukusäätimillä. Kameraa voi kääntää hiirellä.', 'Physics test running. Move the motors with the sliders. You can rotate the camera with the mouse.');
      else if (!S.model.bodies.length) h = tr('Aloita lisäämällä osa Lisää osa -listasta (esim. laatikko rungoksi) tai valitse valmis robotti pohjaksi Uusi / pohja -valikosta.', 'Start by adding a part from the Add part list (e.g. a box as the body) or pick a ready robot as a template from the New / template menu.');
      else if (S.sel.joint != null) h = tr('Nivel valittu. Vedä se kohtaan, jossa osat kääntyvät toistensa suhteen. Säädä tyyppiä ja rajoja Ominaisuudet-välilehdellä.', 'Joint selected. Drag it to where the parts turn relative to each other. Adjust its type and limits on the Properties tab.');
      else if (n === 1) h = tr('Siirrä (W), käännä (E) tai skaalaa (S) kahvasta. Osaan kiinnitetyt osat tulevat mukana (Alt + veto: vain tämä osa). Ctrl+klikkaa muita osia valitaksesi useita.', 'Move (W), rotate (E) or scale (S) with the handle. Parts attached to it come along (Alt + drag: this part only). Ctrl+click other parts to select several.');
      else if (n === 2) h = tr(`Paina "Yhdistä nivelellä": "${S.sel.bodies[0]}" on osa, johon kiinnitetään, ja "${S.sel.bodies[1]}" kääntyy sen suhteen. Kahvasta voit myös siirtää molempia.`, `Press "Join with a joint": "${S.sel.bodies[0]}" is the part to attach to and "${S.sel.bodies[1]}" turns relative to it. You can also move both with the handle.`);
      else if (n > 2) h = tr(`${n} osaa valittu. Siirrä, käännä tai skaalaa ne yhdessä kahvasta, tai peilaa, monista tai poista.`, `${n} parts selected. Move, rotate or scale them together with the handle, or mirror, duplicate or delete them.`);
      else h = S.dim === '2d' ? tr('Klikkaa osaa valitaksesi sen, tai vedä tyhjästä kohdasta laatikko usean osan ympärille. Rulla zoomaa.', 'Click a part to select it, or drag a box around several parts from empty space. Scroll to zoom.')
        : tr('Klikkaa osaa valitaksesi sen. Vedä tyhjää kohtaa kääntääksesi kameraa; Shift+veto valitsee laatikolla. Rulla zoomaa.', 'Click a part to select it. Drag empty space to rotate the camera; Shift+drag selects with a box. Scroll to zoom.');
    }
    q('hint').textContent = h;
  }

  // ---------- Rakennelista ----------
  function renderTree() {
    const el = q('tree');
    el.innerHTML = '';
    if (!S.model.bodies.length) { el.innerHTML = `<p class="note">${tr('Ei vielä osia.', 'No parts yet.')}</p>`; return; }
    const sub = (t) => { const d = document.createElement('div'); d.className = 'rsb-sub'; d.textContent = t; el.appendChild(d); };
    sub(tr(`Osat (${S.model.bodies.length})`, `Parts (${S.model.bodies.length})`));
    for (const b of S.model.bodies) {
      const d = document.createElement('button');
      d.className = 'rsb-item' + (S.sel.bodies.includes(b.id) ? ' sel' : '');
      d.innerHTML = `<span class="swatch"></span><span></span>${b.id === S.model.root ? `<span class="rsb-badge">★ ${tr('päärunko', 'main body')}</span>` : ''}`;
      d.querySelector('.swatch').style.background = b.color || '#9fb3c8';
      d.children[1].textContent = b.id;
      d.onclick = (e) => select('body', b.id, e.shiftKey || e.ctrlKey);
      el.appendChild(d);
    }
    if (S.model.joints.length) sub(tr(`Nivelet (${S.model.joints.length})`, `Joints (${S.model.joints.length})`));
    S.model.joints.forEach((j, i) => {
      const d = document.createElement('button');
      d.className = 'rsb-item joint' + (S.sel.joint === i ? ' sel' : '');
      const type = M.jointType(j);
      d.textContent = `${type === 'wheel' ? '⚙' : type === 'free' ? '○' : type === 'spring' ? '〰' : '◆'} ${j.a} → ${j.b}`;
      d.onclick = () => select('joint', i);
      el.appendChild(d);
    });
  }

  // ---------- Ominaisuuspaneeli ----------
  function prop(label, tip, control, pro) {
    const wrap = document.createElement('div');
    wrap.className = 'rsb-prop' + (pro ? ' pro' : '');
    const lab = document.createElement('label');
    lab.className = 'lab';
    lab.textContent = label;
    if (tip) { lab.title = tip; lab.classList.add('has-tip'); }
    wrap.append(lab, control);
    return wrap;
  }

  function numInput(value, onSet, opts = {}) {
    const i = document.createElement('input');
    i.type = 'number';
    i.step = opts.step ?? 0.05;
    if (opts.min != null) i.min = opts.min;
    if (opts.max != null) i.max = opts.max;
    i.value = value ?? '';
    if (opts.placeholder) i.placeholder = opts.placeholder;
    i.onchange = () => {
      const v = i.value === '' ? null : parseFloat(i.value);
      if (v != null && !isFinite(v)) { i.value = value ?? ''; return; }
      // Sallitun alueen ulkopuolinen arvo rajataan: esim. nopeus 0 tai negatiivinen vaimennus rikkoisi fysiikan
      const lo = opts.min != null ? +opts.min : -Infinity, hi = opts.max != null ? +opts.max : Infinity;
      const cv = v == null ? null : Math.min(hi, Math.max(lo, v));
      if (cv !== v) { i.value = cv; toast(tr(`Arvo rajattiin sallitulle alueelle (${cv}).`, `The value was limited to the allowed range (${cv}).`)); }
      change(() => onSet(cv), true);
    };
    return i;
  }

  function vecInput(values, onSet, opts = {}) {
    const d = document.createElement('div');
    const names = opts.names || ['x', 'y', 'z'];
    d.className = 'vec' + (names.length === 2 ? ' two' : '');
    names.forEach((n, k) => {
      const cell = document.createElement('div');
      const idx = opts.indices ? opts.indices[k] : k;
      // Tyhjennetty kenttä ei muuta arvoa nollaksi (osa hyppäisi origoon): vanha arvo jää voimaan
      const i = numInput(values[idx], (v) => { if (v == null) return; const arr = values.slice(); arr[idx] = v; onSet(arr); }, opts);
      const s = document.createElement('span');
      s.textContent = n;
      cell.append(i, s);
      d.appendChild(cell);
    });
    return d;
  }

  function selectInput(options, value, onSet) {
    const s = document.createElement('select');
    for (const [v, l] of options) {
      const o = document.createElement('option');
      o.value = v; o.textContent = l;
      s.appendChild(o);
    }
    s.value = value;
    s.onchange = () => change(() => onSet(s.value), true);
    return s;
  }

  function checkInput(label, value, onSet, tip) {
    const l = document.createElement('label');
    l.className = 'mini-toggle rsb-check';
    if (tip) l.title = tip;
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = !!value;
    i.onchange = () => change(() => onSet(i.checked), true);
    l.append(i, document.createTextNode(' ' + label));
    return l;
  }

  function title(text) {
    const h = document.createElement('h4');
    h.className = 'rsb-title';
    h.textContent = text;
    return h;
  }

  function renderProps() {
    const el = q('tab-props');
    el.innerHTML = '';
    const b = selectedBody();
    if (b) renderBodyProps(el, b);
    else if (S.sel.joint != null) renderJointProps(el, S.model.joints[S.sel.joint]);
    else if (S.sel.bodies.length > 1) {
      el.append(title(tr(`${S.sel.bodies.length} osaa valittu`, `${S.sel.bodies.length} parts selected`)));
      const p = document.createElement('p');
      p.className = 'note';
      // Liitä yhteen näkyy vain Edistynyt-tasolla
      p.textContent = S.level === 'pro'
        ? tr('Kahdella valitulla osalla: Yhdistä nivelellä tai Liitä yhteen. Useammalla: Peilaa, Monista tai Poista.', 'With two parts selected: Join with a joint or Merge. With more: Mirror, Duplicate or Delete.')
        : tr('Kahdella valitulla osalla: Yhdistä nivelellä. Useammalla: Peilaa, Monista tai Poista.', 'With two parts selected: Join with a joint. With more: Mirror, Duplicate or Delete.');
      el.append(p);
    } else renderRobotProps(el);
  }

  const XY = () => ({ names: ['x', 'y'], indices: [0, 1] });

  function shapeFields(container, b, s, single) {
    const is2d = S.dim === '2d';
    const types = Object.entries(M.PART_TYPES).filter(([, t]) => !(is2d && t.only3d)).map(([k, t]) => [k, (is2d && t.label2d) || t.label]);
    container.append(prop(tr('Muoto', 'Shape'), tr('Osan muoto. Fysiikka käyttää täsmälleen tätä muotoa törmäyksissä.', 'The part’s shape. Physics uses exactly this shape for collisions.'),
      selectInput(types, s.type, (v) => {
        const n = M.defaultShape(v, S.dim);
        Object.keys(s).forEach((k) => { if (!['pos', 'rot', 'color'].includes(k)) delete s[k]; });
        Object.assign(s, { ...n, pos: s.pos, rot: s.rot, color: s.color });
      })));
    if (s.type === 'box') {
      container.append(prop(tr('Koko (m)', 'Size (m)'), tr('Leveys (x), korkeus (y) ja syvyys (z) metreinä.', 'Width (x), height (y) and depth (z) in metres.'),
        vecInput(s.size, (v) => { s.size = v.map((x) => Math.max(0.01, x)); },
          is2d ? { names: [tr('leveys', 'width'), tr('korkeus', 'height')], indices: [0, 1], min: 0.01 } : { names: [tr('leveys', 'width'), tr('korkeus', 'height'), tr('syvyys', 'depth')], min: 0.01 })));
    } else {
      container.append(prop(tr('Säde (m)', 'Radius (m)'), null, numInput(s.r, (v) => { s.r = Math.max(0.01, v || 0.01); }, { min: 0.01 })));
      if (s.type === 'cylinder' || s.type === 'capsule') {
        container.append(prop(tr('Pituus (m)', 'Length (m)'), tr('Pituus akselin suunnassa (oletuksena pystyssä; käännä osaa vaakaan).', 'Length along the axis (upright by default; rotate the part to lay it down).'),
          numInput(s.h, (v) => { s.h = Math.max(0.01, v || 0.01); }, { min: 0.01 })));
      }
    }
    if (!single) {
      container.append(prop(tr('Paikka osassa', 'Position in part'), tr('Muodon paikka osan keskipisteeseen nähden.', 'The shape’s position relative to the part’s centre.'),
        vecInput(s.pos, (v) => { s.pos = v; }, is2d ? XY() : {})));
      container.append(prop(tr('Kierto osassa (°)', 'Rotation in part (°)'), null, is2d
        ? numInput(s.rot[2], (v) => { s.rot = [0, 0, v || 0]; }, { step: 5 })
        : vecInput(s.rot, (v) => { s.rot = v; }, { step: 5 })));
      const c = document.createElement('input');
      c.type = 'color';
      c.value = s.color || b.color || '#9fb3c8';
      c.onchange = () => change(() => { s.color = c.value; }, true);
      container.append(prop(tr('Muodon väri', 'Shape colour'), null, c));
    }
  }

  function renderBodyProps(el, b) {
    const is2d = S.dim === '2d';
    el.append(title(tr('Osa', 'Part')));
    const name = document.createElement('input');
    name.type = 'text';
    name.value = b.id;
    name.onchange = () => {
      const v = name.value.trim();
      change(() => { if (!M.renameBody(S.model, b.id, v)) name.value = b.id; else S.sel.bodies = [v]; }, true);
    };
    el.append(prop(tr('Nimi', 'Name'), tr('Osan tunnus. Nivelet ja päärunko viittaavat osiin nimellä.', 'The part id. Joints and the main body refer to parts by name.'), name));
    if (b.shapes.length === 1) shapeFields(el, b, b.shapes[0], true);
    el.append(prop(tr('Sijainti (m)', 'Position (m)'), tr('Osan keskipiste. y = korkeus maasta. Robotti nostetaan simulaatiossa automaattisesti maan pinnalle.', 'The part’s centre. y = height above ground. The robot is lifted onto the ground automatically in the simulation.'),
      vecInput(b.pos, (v) => {
        // Kiinnitetyt osat (lapset) siirtyvät mukana kuten vedettäessä
        const d = (is2d ? [v[0], v[1], 0] : v).map((x, i) => x - b.pos[i]);
        M.moveBodies(S.model, [b.id, ...M.descendants(S.model, [b.id])], d);
      }, is2d ? XY() : {})));
    el.append(prop(tr('Kierto (°)', 'Rotation (°)'), is2d ? tr('Osan kulma asteina.', 'The part’s angle in degrees.') : tr('Kierto x-, y- ja z-akselin ympäri asteina.', 'Rotation about the x, y and z axes in degrees.'), is2d
      ? numInput(b.rot[2], (v) => { b.rot = [0, 0, v || 0]; }, { step: 5 })
      : vecInput(b.rot, (v) => { b.rot = v; }, { step: 5 })));
    const color = document.createElement('input');
    color.type = 'color';
    color.value = b.color || '#9fb3c8';
    color.onchange = () => change(() => { b.color = color.value; }, true);
    el.append(prop(tr('Väri', 'Colour'), null, color));
    el.append(checkInput(tr('Maakosketus', 'Ground contact'), b.foot, (v) => { b.foot = v || undefined; },
      tr('Robotti tietää, koskeeko tämä osa maahan. Merkitse jalat ja pyörät.', 'The robot knows whether this part touches the ground. Mark feet and wheels.')));
    if (b.id !== S.model.root) {
      const rb = document.createElement('button');
      rb.className = 'btn';
      rb.textContent = '★ ' + tr('Aseta päärungoksi', 'Make main body');
      rb.onclick = () => change(() => { S.model.root = b.id; }, true);
      el.append(rb);
    } else {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = '★ ' + tr('Tämä on päärunko: tehtävät mittaavat sen liikettä.', 'This is the main body: the tasks measure its motion.');
      el.append(p);
    }
    el.append(prop(tr('Tiheys', 'Density'), tr('Massa = tiheys × tilavuus. Oletus 1. Raskas runko on vakaampi, kevyet jalat liikkuvat nopeammin.', 'Mass = density × volume. Default 1. A heavy body is steadier, light legs move faster.'),
      numInput(b.density, (v) => { b.density = v ?? undefined; }, { step: 0.5, min: 0.01, placeholder: '1' }), true));
    el.append(prop(tr('Kitka', 'Friction'), tr('Kuinka hyvin osa pitää maasta. 0 = liukas, 1 = tavallinen, 1,5 = kumi. Oletus 0,8.', 'How well the part grips the ground. 0 = slippery, 1 = normal, 1.5 = rubber. Default 0.8.'),
      numInput(b.friction, (v) => { b.friction = v ?? undefined; }, { step: 0.1, min: 0, placeholder: '0.8' }), true));
    if (!is2d) {
      el.append(prop(tr('Kitkan yhdistys', 'Friction combine'), tr('Miten osan ja maan kitka yhdistetään. "pienempi" pitää liukkaan osan liukkaana (esim. tukipyörä).', 'How the part’s and the ground’s friction combine. "min" keeps a slippery part slippery (e.g. a caster).'),
        selectInput([['', tr('keskiarvo (oletus)', 'average (default)')], ['min', tr('pienempi', 'min')], ['max', tr('suurempi', 'max')], ['multiply', tr('tulo', 'multiply')]],
          b.frictionCombine || '', (v) => { b.frictionCombine = v || undefined; }), true));
    }
    // Roottorit: paikka, suunta ja poisto. Kiekko seuraa roottoria.
    const rotors = (S.model.thrusters || []).map((t, i) => [t, i]).filter(([t]) => t.body === b.id);
    if (rotors.length) {
      el.append(title(tr(`Roottorit (${rotors.length})`, `Rotors (${rotors.length})`)));
      const DIRS = [['0,1,0', tr('ylös', 'up')], ['1,0,0', tr('eteen', 'forward')], ['-1,0,0', tr('taakse', 'back')], ['0,-1,0', tr('alas', 'down')],
        ...(is2d ? [] : [['0,0,1', tr('oikealle (+z)', 'right (+z)')], ['0,0,-1', tr('vasemmalle (−z)', 'left (−z)')]])];
      rotors.forEach(([t, i], k) => {
        const box = document.createElement('div');
        box.className = 'rsb-shape';
        const head = document.createElement('div');
        head.className = 'rsb-shape-head';
        const tt = document.createElement('b');
        tt.textContent = '🌀 ' + tr(`Roottori ${k + 1}`, `Rotor ${k + 1}`);
        const del = document.createElement('button');
        del.className = 'link-btn';
        del.textContent = tr('Poista', 'Delete');
        del.onclick = () => change(() => { M.removeRotor(S.model, i); }, true);
        head.append(tt, del);
        box.append(head);
        box.append(prop(tr('Paikka osassa (m)', 'Position in part (m)'), null, vecInput(t.pos, (v) => { M.moveRotor(S.model, i, is2d ? [v[0], v[1], 0] : v); }, is2d ? XY() : {})));
        const cur = t.dir.map((v) => Math.round(v)).join(',');
        box.append(prop(tr('Työntösuunta', 'Thrust direction'), tr('Mihin suuntaan roottori työntää osaa. Droonissa ylös.', 'Which way the rotor pushes the part. Up for a drone.'),
          selectInput(DIRS, DIRS.some(([v]) => v === cur) ? cur : '0,1,0', (v) => { t.dir = v.split(',').map(Number); })));
        el.append(box);
      });
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = tr(`Kaikkien roottorien voimat on tasattu: puolella teholla ne kannattelevat robotin painon. Lentäville roboteille kannattaa antaa päärungolle ilmanvastus (JSON: linearDamping, angularDamping).`, `All rotor forces are balanced: at half power they carry the robot’s weight. Flying robots work best with air drag on the main body (JSON: linearDamping, angularDamping).`);
      el.append(p);
    }

    const stWrap = document.createElement('div');
    stWrap.className = 'pro';
    stWrap.append(checkInput(tr('Kiinteä (ei liiku)', 'Fixed (does not move)'), b.static, (v) => { b.static = v || undefined; }, tr('Osa on kiinni maailmassa, esim. robottikäden jalusta.', 'The part is fixed to the world, e.g. a robot arm’s base.')));
    el.append(stWrap);

    const shapes = document.createElement('div');
    shapes.className = 'pro';
    shapes.append(title(tr(`Muodot (${b.shapes.length})`, `Shapes (${b.shapes.length})`)));
    if (b.shapes.length > 1) {
      b.shapes.forEach((s, i) => {
        const box = document.createElement('div');
        box.className = 'rsb-shape';
        const head = document.createElement('div');
        head.className = 'rsb-shape-head';
        const t = document.createElement('b');
        t.textContent = tr(`Muoto ${i + 1}`, `Shape ${i + 1}`);
        const del = document.createElement('button');
        del.textContent = tr('Poista', 'Delete');
        del.className = 'link-btn';
        del.onclick = () => change(() => { b.shapes.splice(i, 1); }, true);
        head.append(t, del);
        box.append(head);
        shapeFields(box, b, s, false);
        shapes.append(box);
      });
    }
    const add = document.createElement('button');
    add.className = 'btn';
    add.textContent = '+ ' + tr('Lisää muoto tähän osaan', 'Add a shape to this part');
    add.title = tr('Lisää osaan toisen muodon (esim. pää rungon päälle). Muodot liikkuvat yhdessä yhtenä kappaleena.', 'Adds another shape to the part (e.g. a head on the body). Shapes move together as one body.');
    add.onclick = () => change(() => { const s = M.defaultShape('box', S.dim); s.pos = [0, 0.3, 0]; s.size = [0.2, 0.2, 0.2]; b.shapes.push(s); }, true);
    shapes.append(add);
    el.append(shapes);
  }

  function renderJointProps(el, j) {
    const is2d = S.dim === '2d';
    const type = M.jointType(j);
    el.append(title(tr('Nivel', 'Joint')));
    const ids = S.model.bodies.map((b) => [b.id, b.id]);
    el.append(prop(tr('Kiinnitetty osaan', 'Attached to'), tr('Osa, johon nivel kiinnittyy (emo).', 'The part the joint attaches to (parent).'), selectInput(ids, j.a, (v) => { j.a = v; })));
    el.append(prop(tr('Liikkuva osa', 'Moving part'), tr('Osa, joka kääntyy nivelen ympäri.', 'The part that turns about the joint.'), selectInput(ids, j.b, (v) => { j.b = v; })));
    const tp = prop(tr('Tyyppi', 'Type'), null, selectInput(Object.entries(M.JOINT_TYPES).map(([k, t]) => [k, t.label]), type, (v) => M.setJointType(j, v)));
    const hint = document.createElement('p');
    hint.className = 'note';
    hint.textContent = M.JOINT_TYPES[type].hint;
    tp.append(hint);
    el.append(tp);
    if (!is2d) {
      const axes = [['0,0,1', tr('Eteen–taakse (z-akseli)', 'Front–back (z axis)')], ['1,0,0', tr('Sivuttain (x-akseli)', 'Sideways (x axis)')], ['0,1,0', tr('Pystyakselin ympäri (y)', 'About the vertical (y)')]];
      const k = j.axis.map((v) => Math.round(v)).join(',');
      const known = axes.some(([a]) => a === k) && j.axis.every((v) => Number.isInteger(v));
      el.append(prop(tr('Kiertosuunta', 'Rotation direction'), tr('Minkä akselin ympäri nivel kääntyy. Kävelevän jalan lonkka ja polvi sekä pyörät: eteen–taakse.', 'Which axis the joint turns about. A walking leg’s hip and knee, and wheels: front–back.'),
        selectInput([...axes, ...(known ? [] : [['custom', tr('Oma suunta', 'Custom')]])], known ? k : 'custom', (v) => { if (v !== 'custom') j.axis = v.split(',').map(Number); })));
      el.append(prop(tr('Akseli (vektori)', 'Axis (vector)'), tr('Kiertoakselin suunta vapaasti (normalisoidaan).', 'Any rotation axis direction (normalised).'), vecInput(j.axis, (v) => { j.axis = v; }, { step: 0.1 }), true));
    }
    // Liikealue: servolla aina; vapaalla ja jousinivelellä rajat ovat valinnaisia (rajat toimivat fysiikassa niilläkin)
    const limited = j.lower != null && j.upper != null;
    if (type === 'servo' || limited) {
      el.append(prop(tr('Liikealue (°)', 'Range of motion (°)'), tr('Kuinka paljon nivel voi kääntyä kumpaankin suuntaan. Esim. polvi −45…45.', 'How far the joint can turn each way. E.g. a knee −45…45.'),
        vecInput([j.lower, j.upper], (v) => { j.lower = v[0]; j.upper = v[1]; }, { names: ['min', 'max'], step: 5 })));
    }
    if (type === 'free' || type === 'spring') {
      const b = document.createElement('button');
      b.className = 'link-btn';
      b.textContent = limited ? tr('Poista liikealue (kääntyy vapaasti ympäri)', 'Remove the range (turns all the way round)') : tr('Lisää liikealue', 'Add a range of motion');
      b.onclick = () => change(() => { if (limited) { delete j.lower; delete j.upper; } else { j.lower = -45; j.upper = 45; } }, true);
      el.append(b);
    }
    if (type === 'spring') {
      el.append(prop(tr('Jousen jäykkyys', 'Spring stiffness'), tr('Kuinka voimakkaasti nivel palaa lepoasentoon. Isompi = jäykempi. Tavallisesti 10–100.', 'How strongly the joint returns to its rest position. Bigger = stiffer. Usually 10–100.'),
        numInput(j.spring, (v) => { j.spring = v > 0 ? v : M.SPRING_DEFAULT.k; }, { step: 5, min: 1, placeholder: String(M.SPRING_DEFAULT.k) })));
      el.append(prop(tr('Vaimennus', 'Damping'), tr('Jarruttaa pomppimista. 0 = ei vaimennusta. Tavallisesti 1–5.', 'Brakes bouncing. 0 = no damping. Usually 1–5.'),
        numInput(j.springDamping, (v) => { j.springDamping = v ?? M.SPRING_DEFAULT.d; }, { step: 0.5, min: 0, placeholder: String(M.SPRING_DEFAULT.d) })));
    }
    if (type !== 'free' && type !== 'spring') {
      el.append(prop(tr('Nopeus (rad/s)', 'Speed (rad/s)'), type === 'wheel' ? tr('Pyörän suurin pyörimisnopeus.', 'The wheel’s top spin speed.') : tr('Kuinka nopeasti nivel ehtii kääntyä. Isompi = nopeampi mutta riuhtovampi.', 'How fast the joint can turn. Bigger = faster but jerkier.'),
        numInput(j.speed, (v) => { j.speed = v ?? undefined; }, { step: 1, min: 0.1 })));
      if (is2d) {
        el.append(prop(tr('Vääntö', 'Torque'), tr('Moottorin voima. Raskaat osat tarvitsevat isomman väännön. Tavallisesti 3–40.', 'The motor’s strength. Heavy parts need more torque. Usually 3–40.'),
          numInput(j.torque, (v) => { j.torque = v ?? undefined; }, { step: 1, min: 0.1, placeholder: '10' })));
      } else if (type === 'wheel') {
        el.append(prop(tr('Voima', 'Strength'), tr('Pyörän moottorin voima. Jos pyörät luistavat tai robotti ei jaksa liikkua, kasvata (esim. 20–60).', 'The wheel motor’s strength. If wheels slip or the robot can’t move, increase it (e.g. 20–60).'),
          numInput(j.strength, (v) => { j.strength = v ?? undefined; }, { step: 5, min: 0.1, placeholder: '10' })));
      } else {
        el.append(prop(tr('Jäykkyys', 'Stiffness'), tr('Servon voima kohti tavoitekulmaa. Oletus 200.', 'The servo’s pull toward the target angle. Default 200.'), numInput(j.stiffness, (v) => { j.stiffness = v ?? undefined; }, { step: 10, min: 1, placeholder: '200' }), true));
        el.append(prop(tr('Vaimennus', 'Damping'), tr('Jarruttaa heilumista. Oletus 8.', 'Brakes swinging. Default 8.'), numInput(j.damping, (v) => { j.damping = v ?? undefined; }, { step: 1, min: 0, placeholder: '8' }), true));
      }
    }
    el.append(prop(tr('Sijainti (m)', 'Position (m)'), tr('Nivelen kääntöpiste. Vedä se osien väliin.', 'The joint’s pivot. Drag it between the parts.'),
      vecInput(j.pos, (v) => { j.pos = is2d ? [v[0], v[1], 0] : v; }, is2d ? XY() : {})));
  }

  function renderRobotProps(el) {
    const is2d = S.dim === '2d';
    const m = S.model;
    el.append(title(tr('Robotti', 'Robot')));
    const name = document.createElement('input');
    name.type = 'text';
    name.value = m.name || '';
    name.onchange = () => change(() => { m.name = name.value; }, true);
    el.append(prop(tr('Nimi', 'Name'), null, name));
    const desc = document.createElement('textarea');
    desc.rows = 2;
    desc.value = m.description || '';
    desc.onchange = () => change(() => { m.description = desc.value; }, true);
    el.append(prop(tr('Kuvaus', 'Description'), tr('Näkyy simulaatiossa robotin alla.', 'Shown under the robot in the simulation.'), desc));
    if (m.bodies.length) {
      el.append(prop(tr('Päärunko', 'Main body'), tr('Osa, jonka liikettä tehtävät mittaavat (sijainti, nopeus, kaatuminen).', 'The part whose motion the tasks measure (position, speed, falling).'),
        selectInput(m.bodies.map((b) => [b.id, b.id]), m.root, (v) => { m.root = v; })));
    }
    el.append(checkInput(tr('Kaatuu, jos päärunko koskee maahan', 'Fallen if the main body touches the ground'), m.fall.rootContact, (v) => { m.fall.rootContact = v || undefined; },
      tr('Kävelevillä roboteilla hyvä: rungon osuminen maahan lopettaa yrityksen. Pyörillä ajaville yleensä pois.', 'Good for walking robots: the body hitting the ground ends the attempt. Usually off for wheeled robots.')));
    el.append(prop(tr('Kaatumisraja (kallistus)', 'Fall limit (tilt)'), tr('Kaatunut, jos pystyasento laskee alle tämän: 1 = pysty, 0 = kyljellään, −1 = ylösalaisin. Tyhjä = ei rajaa.', 'Fallen if uprightness drops below this: 1 = upright, 0 = on its side, −1 = upside down. Empty = no limit.'),
      numInput(m.fall.minUpright, (v) => { m.fall.minUpright = v ?? undefined; }, { step: 0.1, min: -1, max: 1, placeholder: tr('ei rajaa', 'no limit') }), true));
    el.append(prop(is2d ? tr('Etäisyyssäteet (lidar)', 'Distance rays (lidar)') : tr('Maaston korkeusnäytteet', 'Terrain height samples'), is2d
      ? tr('Montako etäisyyssädettä robotti saa maastoon. 0 = ei yhtään, 5 = hyvä oletus.', 'How many distance rays the robot gets to the terrain. 0 = none, 5 = a good default.')
      : tr('Montako maaston korkeusnäytettä robotti saa edestään. Auttaa esteillä ja portailla. 0–7.', 'How many terrain height samples the robot gets ahead of it. Helps with obstacles and stairs. 0–7.'),
    numInput(is2d ? m.sensors.lidar : m.sensors.scan, (v) => { m.sensors[is2d ? 'lidar' : 'scan'] = Math.max(0, Math.round(v || 0)); }, { step: 1, min: 0, max: 12 })));
    const tgt = document.createElement('div');
    tgt.className = 'pro';
    tgt.append(checkInput(tr('Oma kohdealue', 'Custom target area'), !!m.target, (v) => {
      m.target = v ? (is2d ? { x: [-2, 2], y: [0.5, 2.5] } : { x: [-1.5, 1.5], y: [0.5, 2], z: [-1.5, 1.5] }) : undefined;
    }, tr('"Mene kohteeseen" -tehtävän kohteet arvotaan tälle alueelle (esim. ilmaan robottikädelle). Muuten kohteet ovat maassa.', '"Reach the target" targets are placed in this area (e.g. in the air for a robot arm). Otherwise targets are on the ground.')));
    if (m.target) {
      for (const k of is2d ? ['x', 'y'] : ['x', 'y', 'z']) {
        tgt.append(prop(tr(`Kohdealue ${k} (min, max)`, `Target area ${k} (min, max)`), null, vecInput(m.target[k], (v) => { m.target[k] = v; }, { names: ['min', 'max'], step: 0.1 })));
      }
    }
    el.append(tgt);
    // Massa ja painopiste: auttavat arvioimaan vakautta ja moottorien kuormaa
    if (m.bodies.length) {
      const mp = M.massProps(m, S.dim);
      const stats = document.createElement('div');
      stats.innerHTML = resultTiles([
        { label: tr('Massa', 'Mass'), value: fmt(mp.mass, 2), unit: 'kg', sub: is2d ? tr('2D: tiheys × pinta-ala', '2D: density × area') : tr('tiheys × tilavuus', 'density × volume') },
        { label: tr('Painopisteen korkeus', 'Centre of mass height'), value: mp.com ? fmt(mp.com[1], 2) : '–', unit: 'm', sub: tr('matala = vakaampi', 'low = steadier') },
      ]);
      el.append(prop(tr('Massa ja painopiste', 'Mass and centre of mass'), tr('Lasketaan osien muodoista ja tiheyksistä. Painopisteen voi näyttää näkymässä (C).', 'Computed from the parts’ shapes and densities. You can show the centre of mass in the view (C).'), stats));
      // Koko robotin skaalaus: osat, nivelet ja roottorit samassa suhteessa, robotti pysyy maan pinnalla
      const sc = document.createElement('div');
      sc.className = 'rsb-scale-all';
      sc.innerHTML = `<input type="number" min="10" max="500" step="10" value="100" aria-label="${tr('Skaalaus prosentteina', 'Scale in percent')}"><span>%</span>
        <button class="btn">${tr('Skaalaa', 'Scale')}</button>`;
      sc.querySelector('button').onclick = () => {
        const f = (+sc.querySelector('input').value || 100) / 100;
        if (!(f > 0.05) || f === 1) return;
        const box = new THREE.Box3();
        for (const b of m.bodies) box.union(M.bodyBox(b));
        const c = box.getCenter(new THREE.Vector3());
        change(() => M.scaleBodies(m, m.bodies.map((b) => b.id), f, [c.x, box.min.y, S.dim === '2d' ? 0 : c.z], S.dim), true);
        toast(tr(`Robotti skaalattu ${Math.round(f * 100)} %:iin. Massa muuttuu koon mukana; tarkista moottorien voimat.`, `Robot scaled to ${Math.round(f * 100)} %. The mass changes with size; check the motor strengths.`));
      };
      el.append(prop(tr('Skaalaa koko robotti', 'Scale the whole robot'), tr('Muuttaa kaikkien osien koon samassa suhteessa. 50 % = puolet pienempi, 200 % = kaksi kertaa isompi. Valitulle osalle tai osille voit käyttää myös skaalauskahvaa (S).', 'Resizes every part in the same proportion. 50 % = half the size, 200 % = twice as big. For selected parts you can also use the scale handle (S).'), sc));
    }
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = tr('Valitse osa tai nivel näkymästä tai rakennelistasta muokataksesi sitä. Hiiren oikea nappi avaa pikavalikon.', 'Select a part or a joint in the view or the structure list to edit it. The right mouse button opens a quick menu.');
    el.append(p);
  }

  // ---------- Tarkistus ja JSON ----------
  function renderCheck() {
    const items = M.validate(S.model, S.dim);
    const el = q('tab-check');
    const level = { error: 'err', warn: 'warn', info: 'info', ok: 'ok' };
    el.innerHTML = alertsHtml(items.map((it) => ({ level: level[it.level], text: it.text })));
    el.querySelectorAll('.alert').forEach((a, i) => { if (items[i].id) { a.classList.add('clickable'); a.onclick = () => select('body', items[i].id); } });
    const errors = items.filter((x) => x.level === 'error').length;
    const warns = items.filter((x) => x.level === 'warn').length;
    q('checkBadge').textContent = errors ? `⛔${errors}` : warns ? `⚠${warns}` : '✓';
    S.errors = errors;
    S.checkLevel = errors ? 'err' : warns ? 'warn' : 'ok';
  }

  function renderJson() {
    if (S.level !== 'pro' || S.tab !== 'json') return;
    if (document.activeElement === q('jsonText')) return;
    q('jsonText').value = JSON.stringify(exportModel(), null, 2);
    q('jsonError').textContent = '';
  }

  // Tuo mallin (sim-muoto). Väärän ulottuvuuden malli muunnetaan tämän rakentajan muotoon.
  function loadRaw(raw, srcDim) {
    if (raw && raw.builtin3d) raw = MODELS3D[raw.builtin3d];
    const is2dSrc = srcDim ? srcDim === '2d' : !(raw.bodies && raw.bodies.some((b) => Array.isArray(b.pos)));
    let model = is2dSrc ? M.from2D(raw) : M.from3D(raw);
    if (is2dSrc && S.dim === '3d') model = M.convertTo3D(model);
    if (!is2dSrc && S.dim === '2d') model = M.convertTo2D(model);
    change(() => { S.model = model; S.sel = { bodies: [], joint: null }; });
    focusRobot();
  }

  function focusRobot() {
    const box = new THREE.Box3();
    for (const b of S.model.bodies) box.union(M.bodyBox(b));
    view.focusOn(box);
  }

  // ---------- Leikepöytä, siirto ja kierto ----------
  function copySel(cut) {
    if (!S.sel.bodies.length) return null;
    clipboard = M.copyParts(S.model, S.sel.bodies, S.dim);
    pasteCount = 0;
    const n = S.sel.bodies.length;
    if (cut) deleteSelection();
    toast((cut ? tr("Leikattu ", "Cut ") : tr("Kopioitu ", "Copied ")) + partsN(n));
    return JSON.stringify(clipboard);
  }

  // Leikepöydän teksti: rakentajan kopio, robottimalli (2D tai 3D) tai simulaation aivot-tiedosto
  function clipFromText(text) {
    try {
      const d = JSON.parse(text);
      if (d.format === M.CLIP_FORMAT) return d;
      const raw = d.model && d.format ? d.model : d;
      if (!Array.isArray(raw.bodies)) return null;
      const is2d = !raw.bodies.some((b) => Array.isArray(b.pos));
      const m = is2d ? M.from2D(raw) : M.from3D(raw);
      return { format: M.CLIP_FORMAT, dim: is2d ? '2d' : '3d', bodies: m.bodies, joints: m.joints };
    } catch { return null; }
  }

  function pasteClip(clip) {
    if (!clip?.bodies?.length) { toast(tr('Leikepöydällä ei ole osia. Kopioi ensin osia (Ctrl+C).', 'There are no parts on the clipboard. Copy some parts first (Ctrl+C).')); return; }
    pasteCount++;
    const off = [M.round(0.3 * pasteCount), 0, 0];
    change(() => { const made = M.pasteParts(S.model, clip, S.dim, off); S.sel = { bodies: made.map((b) => b.id), joint: null }; }, true);
    toast(tr("Liitetty ", "Pasted ") + partsN(clip.bodies.length));
  }

  async function pasteFromButton() {
    let clip = null;
    try { clip = clipFromText(await navigator.clipboard.readText()); } catch { /* ei lupaa lukea leikepöytää */ }
    pasteClip(clip || clipboard);
  }

  // Selain laukaisee Ctrl+C/X/V:stä yleensä copy/cut/paste-tapahtuman, jolloin järjestelmän leikepöytä on käytössä.
  // Jos tapahtumaa ei tule (osa selaimista, kun mitään tekstiä ei ole valittuna), näppäinkäsittelijä hoitaa sen itse.
  let clipHandled = false;
  const builderActive = (e) => !dead && currentRoute() === key && !isTyping(e.target) && !document.querySelector('dialog[open]');
  function onCopy(e) {
    if (!builderActive(e) || !S.sel.bodies.length) return;
    clipHandled = true;
    e.clipboardData.setData('text/plain', copySel(e.type === 'cut'));
    e.preventDefault();
  }
  function onPaste(e) {
    if (!builderActive(e)) return;
    const clip = clipFromText(e.clipboardData?.getData('text/plain') || '') || clipboard;
    if (!clip) return;
    clipHandled = true;
    e.preventDefault();
    pasteClip(clip);
  }
  function clipKey(k) {
    clipHandled = false;
    setTimeout(() => {
      if (clipHandled || dead) return;
      if (k === 'v') pasteClip(clipboard);
      else { const t = copySel(k === 'x'); if (t) navigator.clipboard?.writeText(t).catch(() => {}); }
    }, 30);
  }

  // Nuolet, R ja G käsittelevät valitut osat kiinnitettyine osineen (lapset), kuten vetäminenkin
  const withKids = (ids) => [...ids, ...M.descendants(S.model, ids)];
  function nudge(d) {
    if (S.sel.joint != null) {
      change(() => { const j = S.model.joints[S.sel.joint]; j.pos = j.pos.map((v, i) => M.round(v + d[i])); }, true);
    } else if (S.sel.bodies.length) change(() => M.moveBodies(S.model, withKids(S.sel.bodies), d), true);
  }
  const rotateSel = (dir) => S.sel.bodies.length && change(() => M.rotateBodies(S.model, withKids(S.sel.bodies), S.dim === '2d' ? 2 : 1, 90 * dir, S.sel.bodies), true);
  const toGround = () => S.model.bodies.length && change(() => M.dropToGround(S.model, S.sel.bodies.length ? withKids(S.sel.bodies) : []), true);

  // ---------- Hiiren oikean napin valikko ----------
  function showCtx(x, y) {
    const n = S.sel.bodies.length;
    const items = [];
    const add = (id, label, keys, disabled) => items.push(`<button role="menuitem" data-ctx="${id}" ${disabled ? 'disabled' : ''}><span>${label}</span><kbd>${keys}</kbd></button>`);
    if (n) {
      add('copy', tr('Kopioi', 'Copy'), 'Ctrl+C');
      add('cut', tr('Leikkaa', 'Cut'), 'Ctrl+X');
    }
    add('paste', tr('Liitä', 'Paste'), 'Ctrl+V', !clipboard);
    if (n) {
      add('dup', tr('Monista', 'Duplicate'), 'Ctrl+D');
      add('mirror', tr('Peilaa', 'Mirror'), 'M');
      add('rot', tr('Käännä 90°', 'Rotate 90°'), 'R');
      add('ground', tr('Laske maahan', 'Lower to ground'), 'G');
      if (n === 2) add('joint', tr('Yhdistä nivelellä', 'Join with a joint'), 'J');
      if (n === 1 && S.sel.bodies[0] !== S.model.root) add('root', tr('Päärungoksi', 'Make main body'), '');
      add('del', tr('Poista', 'Delete'), 'Del');
    } else if (S.sel.joint != null) {
      add('del', tr('Poista nivel', 'Delete joint'), 'Del');
    } else {
      add('all', tr('Valitse kaikki', 'Select all'), 'Ctrl+A', !S.model.bodies.length);
      add('ground', tr('Laske robotti maahan', 'Lower the robot to the ground'), 'G', !S.model.bodies.length);
      add('focus', tr('Kohdista kamera', 'Focus camera'), 'F');
    }
    const m = q('ctx');
    m.innerHTML = items.join('');
    m.hidden = false;
    const box = root.querySelector('.rsb-center').getBoundingClientRect();
    m.style.left = Math.min(x - box.left, box.width - m.offsetWidth - 6) + 'px';
    m.style.top = Math.min(y - box.top, box.height - m.offsetHeight - 6) + 'px';
    m.querySelector('button:not([disabled])')?.focus();
  }
  const hideCtx = () => { const m = q('ctx'); if (m) m.hidden = true; };
  function onCtx(e) {
    const a = e.target.closest('[data-ctx]')?.dataset.ctx;
    if (!a) return;
    hideCtx();
    ({
      copy: () => { const t = copySel(false); navigator.clipboard?.writeText(t).catch(() => {}); },
      cut: () => { const t = copySel(true); navigator.clipboard?.writeText(t).catch(() => {}); },
      paste: () => pasteClip(clipboard), dup: () => q('dupBtn').click(), mirror: () => q('mirrorBtn').click(),
      rot: () => rotateSel(1), ground: toGround, joint: () => q('jointBtn').click(), root: () => q('rootBtn').click(),
      del: deleteSelection, all: () => select('all'), focus: focusRobot
    })[a]?.();
  }

  // ---------- Fysiikkatesti ----------
  async function startTest() {
    if (S.errors) { S.tab = 'check'; refresh(true); return; }
    try {
      if (S.dim === '2d') await RS.loadPlanck(); else await initPhysics();
    } catch (e) { setHint(e.message); return; }
    if (dead) return;
    let test;
    try { test = new PhysicsTest(S.model, S.dim); }
    catch (e) { setHint(tr('Testi ei käynnistynyt: ', 'The test did not start: ') + e.message); return; }
    stopTest(true);
    S.test = test;
    test.x0 = test.rootX();
    S.runs = (S.runs || 0) + 1;
    view.showPhysics(true);
    view.buildPhysics(test.bodies);
    q('phys').hidden = false;
    q('testBtn').classList.add('primary');
    q('testBtn').textContent = '■ ' + tr('Lopeta testi', 'Stop test');
    buildSliders();
    setHint();
    const loop = () => {
      if (!S.test || dead) return;
      if (q('wiggle').checked) {
        S.test.actions = S.test.actions.map((_, i) => Math.sin(S.test.t * 3 + i * 1.3));
        syncSliders();
      }
      S.test.step();
      view.updatePhysics(S.test.poses());
      const th = S.test.robot.thrusters || [];
      if (th.length) view.spinRotors(th.reduce((a, t) => a + t.level, 0) / th.length);
      const fallen = S.test.fallen();
      q('physStatus').textContent = fallen ? tr('Kaatui', 'Fell over') : tr(`Pystyssä · runko ${fmt(S.test.rootHeight(), 2)} m`, `Upright · body ${fmt(S.test.rootHeight(), 2)} m`);
      q('physStatus').className = fallen ? 'bad' : 'ok';
      testRaf = requestAnimationFrame(loop);
    };
    loop();
  }

  function stopTest(silent) {
    cancelAnimationFrame(testRaf);
    if (S.test) S.test.free();
    S.test = null;
    if (!view) return;
    view.showPhysics(false);
    q('phys').hidden = true;
    q('testBtn').classList.remove('primary');
    q('testBtn').textContent = '▶ ' + tr('Testaa fysiikka', 'Test physics');
    if (!silent) refresh(true);
  }

  function buildSliders() {
    const el = q('sliders'), t = S.test;
    el.innerHTML = '';
    if (!t.motors.length) { el.innerHTML = `<p class="note">${tr('Robotissa ei ole moottoreita eikä roottoreita.', 'The robot has no motors or rotors.')}</p>`; return; }
    const slider = (label, kind, value, onInput, i) => {
      const d = document.createElement('div');
      d.className = 'rsb-slider';
      d.innerHTML = `<div class="lab"><span></span><span></span></div>`;
      d.querySelector('span').textContent = label;
      d.querySelectorAll('span')[1].textContent = kind;
      const r = document.createElement('input');
      r.type = 'range'; r.min = -1; r.max = 1; r.step = 0.01; r.value = value;
      if (i != null) r.dataset.i = i;
      r.oninput = () => onInput(+r.value);
      d.append(r);
      el.append(d);
    };
    // Roottorit: lentoavustin pitää robotin vaakatasossa, liukusäätimet antavat nousun ja suunnan
    if (t.motors.some((m) => m.kind === 'thrust')) {
      const lab = document.createElement('label');
      lab.className = 'mini-toggle rsb-assist';
      lab.title = tr('Pitää robotin vaakatasossa ja korkeudessaan. Pois päältä jokaista roottoria ohjataan erikseen, kuten neuroverkko tekee simulaatiossa.', 'Keeps the robot level and at its height. When off, each rotor is controlled separately, as the neural network does in the simulation.');
      lab.innerHTML = `<input type="checkbox" id="rb-assist" ${t.assist ? 'checked' : ''}> ${tr('Lentoavustin (pitää vaakatasossa)', 'Flight assist (keeps it level)')}`;
      lab.querySelector('input').onchange = (e) => {
        t.assist = e.target.checked; t.vInt = 0;
        t.motors.forEach((m, i) => { if (m.kind === 'thrust') t.actions[i] = 0; });
        buildSliders();
      };
      el.append(lab);
      if (t.assist) {
        slider(tr('Nousu ja lasku', 'Climb and descend'), tr('↑ nousee, 0 = leijuu', '↑ climbs, 0 = hovers'), t.cmd.climb, (v) => { t.cmd.climb = v; });
        slider(S.dim === '2d' ? tr('Eteen ja taakse', 'Forward and back') : tr('Eteen ja taakse (x)', 'Forward and back (x)'), tr('kallistaa', 'tilts'), t.cmd.pitch, (v) => { t.cmd.pitch = v; });
        if (S.dim === '3d') slider(tr('Sivuttain (z)', 'Sideways (z)'), tr('kallistaa', 'tilts'), t.cmd.roll, (v) => { t.cmd.roll = v; });
      }
    }
    t.motors.forEach((m, i) => {
      if (m.kind === 'thrust' && t.assist) return;
      slider(m.label, m.kind === 'angle' ? tr('kulma', 'angle') : m.kind === 'thrust' ? tr('työntö (0 = puoli tehoa)', 'thrust (0 = half power)') : tr('nopeus', 'speed'),
        t.actions[i], (v) => { q('wiggle').checked = false; t.actions[i] = v; }, i);
    });
  }
  const syncSliders = () => [...q('sliders').querySelectorAll('input[data-i]')].forEach((r) => { r.value = S.test.actions[+r.dataset.i]; });

  // ---------- Tapahtumat ----------
  function bindEvents() {
    for (const [k, t] of Object.entries(M.PART_TYPES)) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.dataset.type = k;
      b.textContent = t.label;
      b.title = {
        box: tr('Suorakulmainen kappale: runko, reisi, varsi…', 'A rectangular body: torso, thigh, arm…'),
        sphere: tr('Pyöreä kappale: pää, jalkaterä, tukipallo. 2D:ssä ympyrä (myös pyörä).', 'A round body: head, foot, ball caster. A circle in 2D (also a wheel).'),
        cylinder: tr('Sylinteri: pyörät (käännä 90° x-akselin ympäri), nivelet.', 'A cylinder: wheels (rotate 90° about x), joints.'),
        capsule: tr('Pyöreäpäinen tanko: raajat, jotka liukuvat esteiden yli sulavasti.', 'A rod with round ends: limbs that slide over obstacles smoothly.')
      }[k];
      b.onclick = () => change(() => {
        const sel = selectedBody();
        let pos = [0, 1, 0];
        if (sel) pos = [M.round(sel.pos[0] + 0.8), sel.pos[1], sel.pos[2]];
        else if (S.model.bodies.length) {
          const box = new THREE.Box3();
          for (const x of S.model.bodies) box.union(M.bodyBox(x));
          pos = [0, M.round(box.max.y + 0.4), 0];
        }
        const created = M.addPart(S.model, k, S.dim, pos);
        S.sel = { bodies: [created.id], joint: null };
      }, true);
      q('parts').append(b);
    }

    const withParent = (fn) => () => {
      const p = attachTarget();
      if (!p) return;
      change(() => { const made = fn(S.model, p, S.dim); S.sel = { bodies: made.map((x) => x.id), joint: null }; }, true);
    };
    q('addWheel').onclick = withParent(M.addWheel);
    q('addLeg').onclick = withParent(M.addLeg);
    q('addWheelPair').onclick = withParent(M.addWheelPair);
    q('addCaster').onclick = withParent(M.addCaster);
    q('addArm').onclick = withParent(M.addArm);
    q('addGripper').onclick = withParent(M.addGripper);
    q('addTail').onclick = withParent(M.addTail);
    q('addBumper').onclick = withParent(M.addBumper);
    q('addSpringLeg').onclick = withParent(M.addSpringLeg);
    // Anturit lisätään valittuun osaan muotoina, joten valinta säilyy
    const sensor = (kind) => () => { const p = attachTarget(); if (p) change(() => M.addSensor(S.model, p, kind, S.dim), true); };
    q('addLidar').onclick = sensor('lidar');
    q('addCamera').onclick = sensor('camera');
    q('addRotor').onclick = () => {
      const b = attachTarget();
      if (!b) return;
      change(() => { M.addRotor(S.model, b, S.dim); }, true);
      toast(tr('Roottori lisätty. Lisää useampi, jotta robotti pysyy tasapainossa (esim. 4 kulmiin).', 'Rotor added. Add more to keep the robot balanced (e.g. 4 at the corners).'));
    };
    q('jointBtn').onclick = () => {
      if (S.sel.bodies.length !== 2) return;
      const [a, b] = S.sel.bodies;
      change(() => {
        const B = S.model.bodies.find((x) => x.id === b);
        const wheel = S.dim === '3d' && B.shapes.length === 1 && B.shapes[0].type === 'cylinder';
        M.addJoint(S.model, a, b, wheel ? 'wheel' : 'servo', S.dim);
        S.sel = { bodies: [], joint: S.model.joints.length - 1 };
      }, true);
    };
    q('mergeBtn').onclick = () => {
      if (S.sel.bodies.length !== 2) return;
      const [a, b] = S.sel.bodies;
      change(() => { M.merge(S.model, a, b); S.sel = { bodies: [a], joint: null }; }, true);
    };
    q('mirrorBtn').onclick = () => {
      if (!S.sel.bodies.length) return;
      change(() => { const made = M.mirror(S.model, S.sel.bodies, S.dim === '2d' ? 0 : 2, S.dim); S.sel = { bodies: made.map((x) => x.id), joint: null }; }, true);
    };
    q('dupBtn').onclick = () => {
      if (!S.sel.bodies.length) return;
      change(() => { const made = M.duplicate(S.model, S.sel.bodies, [0.5, 0, 0]); S.sel = { bodies: made.map((x) => x.id), joint: null }; }, true);
    };
    q('rootBtn').onclick = () => { const b = selectedBody(); if (b) change(() => { S.model.root = b.id; }, true); };
    q('delBtn').onclick = deleteSelection;
    q('modeMove').onclick = () => setGizmoMode('translate');
    q('modeRotate').onclick = () => setGizmoMode('rotate');
    q('modeScale').onclick = () => setGizmoMode('scale');
    q('boxSel').onclick = () => toggleBoxSel();
    q('snap').onchange = () => view.setSnap(q('snap').checked, 0.05, 15);
    q('focusBtn').onclick = focusRobot;
    for (const btn of root.querySelectorAll('#rb-level button')) btn.onclick = () => {
      S.level = btn.dataset.level;
      if (S.level !== 'pro' && S.tab === 'json') S.tab = 'props';
      persist(false);
      refresh(true);
    };
    for (const t of root.querySelectorAll('.rsb-tabs button')) t.onclick = () => { S.tab = t.dataset.tab; refresh(true); };
    q('jsonApply').onclick = () => {
      try { loadRaw(JSON.parse(q('jsonText').value), S.dim); q('jsonError').textContent = ''; }
      catch (e) { q('jsonError').textContent = e.message; }
    };
    q('jsonCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(q('jsonText').value); toast(tr('Kopioitu', 'Copied')); } catch { q('jsonText').select(); }
    };

    // Pohjat kokoontaitettavissa osioissa: tyhjä, hahmot, perusmallit, omat robotit ja toisen ulottuvuuden robotit muunnettuina
    const tplRoot = q('template');
    const libOf = (d) => 'robot' + d;
    function saveOwn() {
      if (!S.model.bodies.length) { toast(tr('Robotissa ei ole vielä osia.', 'The robot has no parts yet.')); return; }
      const name = askName(tr('Robotin nimi omissa roboteissa:', 'Name of the robot in my robots:'), S.model.name || tr('Oma robotti', 'My robot'));
      if (!name) return;
      change(() => { S.model.name = name; });
      if (Library.add(libOf(S.dim), name, exportModel())) { toast(tr(`"${name}" tallennettu omiin robotteihin.`, `"${name}" saved to my robots.`)); drawTemplates(); }
    }
    function drawTemplates() {
      const mine = MODELS_BY_DIM[S.dim], others = MODELS_BY_DIM[other];
      const own = [
        ...Library.list(libOf(S.dim)).map((r) => ({ value: 'lib:' + S.dim + ':' + r.id, label: r.name, sub: tr('tallennettu ', 'saved ') + new Date(r.saved).toLocaleDateString(LANG) })),
        ...Library.list(libOf(other)).map((r) => ({ value: 'lib:' + other + ':' + r.id, label: r.name, sub: tr(`${other.toUpperCase()}-robotti, muunnetaan`, `${other.toUpperCase()} robot, converted`) })),
      ];
      const conv = robotSections(others, { prefix: other + ':', own: null, title: tr(`${other.toUpperCase()} (muunnetaan)`, `${other.toUpperCase()} (converted)`) })
        .map((s) => ({ ...s, id: 'conv-' + s.id, open: false }));
      modelPicker(tplRoot, {
        value: '', placeholder: tr('Uusi / pohja…', 'New / template…'), storeKey: 'build' + S.dim,
        sections: [
          { id: 'new', title: tr('Aloita alusta', 'Start from scratch'), items: [{ value: 'empty', label: tr('Tyhjä robotti', 'Empty robot') }] },
          ...robotSections(mine, { prefix: S.dim + ':', own, ownAction: { label: tr('＋ Tallenna nykyinen robotti omiin', '＋ Save the current robot to my robots'), run: saveOwn } }),
          ...conv,
        ],
        onSelect: async (v) => {
          if (S.model.bodies.length && !(await RS.ask(tr('Korvataanko nykyinen robotti? Voit kumota tämän (Ctrl+Z).', 'Replace the current robot? You can undo this (Ctrl+Z).'), tr('Korvaa', 'Replace')))) return;
          const [kind, d, id] = v.split(':');
          if (kind === 'empty') change(() => { S.model = M.emptyModel(S.dim); S.sel = { bodies: [], joint: null }; });
          else if (kind === 'lib') { const r = Library.get(libOf(d), id); if (r) loadRaw(r.data, d); }
          else loadRaw(MODELS_BY_DIM[kind][d], kind);
        },
        onRemove: async (v) => {
          const [, d, id] = v.split(':'), r = Library.get(libOf(d), id);
          if (!r || !(await RS.ask(tr(`Poistetaanko "${r.name}" omista roboteista?`, `Remove "${r.name}" from my robots?`), tr('Poista', 'Remove')))) return;
          Library.remove(libOf(d), id); drawTemplates();
        },
        onRename: (v) => {
          const [, d, id] = v.split(':'), r = Library.get(libOf(d), id), n = r && askName(tr('Robotin uusi nimi:', 'New name for the robot:'), r.name);
          if (n) { Library.rename(libOf(d), id, n); drawTemplates(); }
        },
      });
    }
    const MODELS_BY_DIM = { '2d': RS.MODELS, '3d': MODELS3D };
    drawTemplates();

    root.querySelector('.page-head').addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'open') {
        const f = await new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = () => res(i.files[0] || null); i.click(); });
        if (!f) return;
        try {
          const data = JSON.parse(await RS.readFile(f));
          // Myös simulaatioiden "Vie aivot" -tiedostot sisältävät mallin
          loadRaw(data.model && data.format ? data.model : data, data.format === 'robosim-brain-v1' ? '2d' : data.format === 'robosim3d-brain-v1' ? '3d' : undefined);
        } catch (err) { setHint(tr('Tiedoston avaus epäonnistui: ', 'Opening the file failed: ') + err.message); }
      } else if (a === 'saveOwn') {
        saveOwn();
      } else if (a === 'save') {
        const name = (S.model.name || 'robotti').toLowerCase().replace(/[^a-z0-9åäö]+/g, '-');
        RS.download(`${name}-${S.dim}.json`, JSON.stringify(exportModel(), null, 2));
      } else if (a === 'send') {
        if (S.errors) { S.tab = 'check'; refresh(true); return; }
        persist(false);
        RSBridge.builderToSim(S.dim);
        location.hash = '#/nn' + S.dim;
      }
    });
    root.querySelector('.rsb-bar').addEventListener('click', async (e) => {
      if (e.target.closest('[data-a]')?.dataset.a !== 'convert' || !S.model.bodies.length) return;
      const otherHas = getToolState('build' + other, {}).model?.bodies?.length;
      if (otherHas && !(await RS.ask(tr(`${other.toUpperCase()}-rakentajassa on jo robotti. Korvataanko se tämän robotin ${other.toUpperCase()}-versiolla? Voit kumota tämän.`, `The ${other.toUpperCase()} builder already has a robot. Replace it with the ${other.toUpperCase()} version of this robot? You can undo this.`), tr('Korvaa', 'Replace')))) return;
      const conv = other === '2d' ? M.convertTo2D(S.model) : M.convertTo3D(S.model);
      const cur = getToolState('build' + other, {});
      saveToolState('build' + other, { ...cur, model: conv, export: null });
      toast(other === '2d' ? tr('2D-versio tehty. Tarkista nivelet: kaikki kääntyvät nyt samassa tasossa.', '2D version made. Check the joints: they all turn in the same plane now.')
        : tr('3D-versio tehty. Siirrä esim. jalat sivuille ja peilaa ne.', '3D version made. Move e.g. the legs sideways and mirror them.'));
      location.hash = '#/build' + other;
    });

    q('testBtn').onclick = () => (S.test ? stopTest() : startTest());
    q('physStop').onclick = () => stopTest();
    q('physRestart').onclick = startTest;
    q('physZero').onclick = () => { q('wiggle').checked = false; S.test.actions.fill(0); Object.assign(S.test.cmd, { climb: 0, pitch: 0, roll: 0 }); buildSliders(); };

    q('copyBtn').onclick = () => { const t = copySel(false); if (t) navigator.clipboard?.writeText(t).catch(() => {}); };
    q('pasteBtn').onclick = pasteFromButton;
    q('rotBtn').onclick = (e) => rotateSel(e.shiftKey ? -1 : 1);
    q('groundBtn').onclick = toGround;
    q('showJoints').onchange = (e) => view.setJointsVisible(e.target.checked);
    q('showCom').onchange = (e) => { S.showCom = e.target.checked; refresh(true); };
    for (const b of root.querySelectorAll('#rb-views button')) b.onclick = () => view.setView(b.dataset.view);
    root.querySelector('.rsb-bar').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'keys') openShortcuts();
      if (a === 'shot') {
        const link = document.createElement('a');
        link.href = view.screenshot();
        link.download = `${(S.model.name || 'robotti').toLowerCase().replace(/[^a-z0-9åäö]+/g, '-')}-${S.dim}.png`;
        link.click();
      }
    });

    // Hiiren oikea nappi: valikko (ei, jos nappia vedettiin kameran siirtämiseksi)
    let rDown = null;
    const cv = q('view');
    cv.addEventListener('pointerdown', (e) => { hideCtx(); if (e.button === 2) rDown = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (S.test || !rDown || Math.hypot(e.clientX - rDown.x, e.clientY - rDown.y) > 4) return;
      const hit = view.pickAt(e.clientX, e.clientY);
      if (hit?.kind === 'body' && !S.sel.bodies.includes(hit.id)) select('body', hit.id);
      else if (hit?.kind === 'joint') select('joint', hit.id);
      showCtx(e.clientX, e.clientY);
    });
    q('ctx').addEventListener('click', onCtx);
    q('ctx').addEventListener('keydown', (e) => {
      const items = [...q('ctx').querySelectorAll('button:not([disabled])')], i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
      else if (e.key === 'Escape') { e.stopPropagation(); hideCtx(); }
    });
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
  }

  const onDocDown = (e) => { if (!e.target.closest?.('#rb-ctx')) hideCtx(); };

  function setGizmoMode(mode) {
    S.gizmoMode = mode;
    if (selectedBody() || S.sel.bodies.length > 1) view.setGizmoMode(mode);
    updateButtons();
  }
  function toggleBoxSel() {
    // 2D:ssä veto tyhjästä kohdasta valitsee aina laatikolla, ja oikea nappi siirtää näkymää (kääntöä ei ole)
    if (S.dim === '2d') { setHint(tr('2D-näkymässä valintalaatikko on aina käytössä: vedä tyhjästä kohdasta laatikko osien ympärille.', 'In the 2D view box select is always on: drag a box around parts from empty space.')); return; }
    view.boxMode = !view.boxMode;
    q('boxSel').classList.toggle('on', view.boxMode);
    q('boxSel').setAttribute('aria-pressed', view.boxMode);
    setHint(view.boxMode ? tr('Valintalaatikko päällä: vedä tyhjästä kohdasta laatikko osien ympärille. Kameraa käännetään nyt hiiren oikealla napilla.', 'Box select on: drag a box around parts from empty space. Rotate the camera with the right mouse button now.') : undefined);
    view.orbit.mouseButtons.RIGHT = view.boxMode ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  }

  function deleteSelection() {
    if (S.sel.joint != null) {
      const i = S.sel.joint;
      change(() => { S.model.joints.splice(i, 1); S.sel.joint = null; });
    } else if (S.sel.bodies.length) {
      const ids = S.sel.bodies.slice();
      change(() => { M.removeBodies(S.model, ids); S.sel.bodies = []; });
    }
  }

  // Ctrl+Z / Ctrl+Y hoitaa sovellus (projektin kumoaminen), Ctrl+C/X/V leikepöytätapahtumat; muut täällä
  function onKey(e) {
    if (dead || currentRoute() !== key) return;
    if (isTyping(e.target) || document.querySelector('dialog[open]') || e.altKey) return;
    if (!$('#palette').hidden || e.target.closest?.('#ai-panel, #lesson, #rb-ctx')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.target?.type === 'range' && (k.startsWith('arrow') || k === 'home' || k === 'end' || k.startsWith('page'))) return; // liukusäädin itse
    // Fysiikkatestin aikana vain testin näppäimet (muokkaus kohdistuisi piilossa olevaan malliin)
    if (S.test && !['t', 'escape', 'f', 'h'].includes(k)) return;
    const step = e.shiftKey ? 0.01 : 0.05; // nuolet: 5 cm, Shift: 1 cm
    if (mod && k === 'd') { e.preventDefault(); q('dupBtn').click(); }
    else if (mod && k === 'a') { e.preventDefault(); select('all'); }
    else if (mod && (k === 'c' || k === 'x' || k === 'v') && !e.shiftKey) clipKey(k);
    else if (mod) return;
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelection(); }
    else if (k.startsWith('arrow') && (S.sel.bodies.length || S.sel.joint != null)) {
      e.preventDefault();
      nudge({ arrowleft: [-step, 0, 0], arrowright: [step, 0, 0], arrowup: [0, step, 0], arrowdown: [0, -step, 0] }[k]);
    } else if ((k === 'pageup' || k === 'pagedown') && S.dim === '3d' && (S.sel.bodies.length || S.sel.joint != null)) {
      e.preventDefault();
      nudge([0, 0, k === 'pageup' ? -step : step]);
    } else if (k === 'tab' && S.model.bodies.length && !S.test && (e.target === document.body || e.target?.tagName === 'CANVAS')) {
      // Tab / Shift+Tab: seuraava / edellinen osa, kun näppäimistö on näkymässä. Muualla Tab siirtää kohdistusta normaalisti.
      e.preventDefault();
      const ids = S.model.bodies.map((b) => b.id), i = ids.indexOf(S.sel.bodies[0]);
      select('body', ids[(i + (e.shiftKey ? -1 : 1) + ids.length) % ids.length]);
    } else if (/^[1-4]$/.test(k)) {
      const b = q('parts').querySelectorAll('button')[+k - 1];
      if (b && !b.hidden) b.click();
    }
    else if (k === 'w') setGizmoMode('translate');
    else if (k === 'e') setGizmoMode('rotate');
    else if (k === 's') setGizmoMode('scale');
    else if (k === 'b') toggleBoxSel();
    else if (k === 'r') rotateSel(e.shiftKey ? -1 : 1);
    else if (k === 'g') toGround();
    else if (k === 'j') q('jointBtn').click();
    else if (k === 'm') q('mirrorBtn').click();
    else if (k === 'f') focusRobot();
    else if (k === 't') q('testBtn').click();
    else if (k === 'h') { q('showJoints').checked = !q('showJoints').checked; view.setJointsVisible(q('showJoints').checked); }
    else if (k === 'c') { q('showCom').checked = !q('showCom').checked; S.showCom = q('showCom').checked; refresh(true); }
    else if (k === 'escape') { hideCtx(); if (S.test) stopTest(); else select(null); }
  }

  // ---------- Siirtokahvat ----------
  // Siirrettäessä osaan nivelillä kiinnitetyt osat (lapset) tulevat mukana kuin oikeassa kokoonpanossa.
  // Alt + veto siirtää vain valitun osan. Usean osan valinnalla kahva on valinnan keskellä.
  let dragBefore = null, drag = null;
  function onTransformStart() {
    dragBefore = snap();
    const o = view.gizmo.object, kind = o?.userData.kind;
    const ids = kind === 'body' ? [o.userData.id] : kind === 'group' ? o.userData.id.slice() : [];
    const follow = view.altDrag ? [] : M.descendants(S.model, ids);
    drag = { kind, ids, follow, all: [...ids, ...follow], pos: o ? o.position.clone() : null, q: o ? o.quaternion.clone() : null,
      // ryhmän skaalaus näytetään vedon aikana pelkkänä kuvana ja tehdään malliin lopuksi
      start: Object.fromEntries([...ids, ...follow].map((id) => [id, view.bodyObjects[id]?.position.clone()])) };
  }
  function onTransform(kind, id, obj) {
    const r = (v) => M.round(v), is2d = S.dim === '2d';
    if (kind === 'body') {
      if (S.gizmoMode === 'scale') return; // osan skaalaus tehdään malliin vedon lopuksi
      const b = S.model.bodies.find((x) => x.id === id);
      const np = [r(obj.position.x), r(obj.position.y), is2d ? 0 : r(obj.position.z)];
      const d = np.map((v, i) => v - b.pos[i]);
      const prevQ = M.quat(b.rot);
      // Nivelet, joissa osa on liikkuva osa, seuraavat mukana (esim. polvi säären mukana)
      for (const j of S.model.joints) if (j.b === id) j.pos = j.pos.map((v, k) => r(v + d[k]));
      b.pos = np;
      const e = new THREE.Euler().setFromQuaternion(obj.quaternion);
      b.rot = is2d ? [0, 0, r(THREE.MathUtils.radToDeg(e.z))] : [e.x, e.y, e.z].map((v) => r(THREE.MathUtils.radToDeg(v)));
      if (drag?.follow.length && d.some((v) => v)) M.moveBodies(S.model, drag.follow, d);
      const dq = M.quat(b.rot).multiply(prevQ.invert());
      if (Math.abs(dq.w) < 0.999999) {
        // Osan oma nivel (emoon) pysyy samassa kohdassa osaa: paikka kääntyy keskipisteen ympäri, 3D:ssä myös akseli
        const c = new THREE.Vector3(...b.pos);
        for (const j of S.model.joints) {
          if (j.b !== id) continue;
          j.pos = new THREE.Vector3(...j.pos).sub(c).applyQuaternion(dq).add(c).toArray().map((v) => r(v));
          if (!is2d) j.axis = new THREE.Vector3(...j.axis).applyQuaternion(dq).toArray().map((v) => M.round(v, 4));
        }
        if (drag?.follow.length) M.rotateBodiesQ(S.model, drag.follow, dq, b.pos, S.dim);
      }
      view.syncBodies(S.model);
    } else if (kind === 'joint') {
      const j = S.model.joints[id];
      j.pos = [r(obj.position.x), r(obj.position.y), is2d ? 0 : r(obj.position.z)];
      view.buildLinks(S.model);
    } else if (kind === 'group' && drag) {
      const c = obj.position.toArray().map((v, i) => (is2d && i === 2 ? 0 : v));
      if (S.gizmoMode === 'translate') {
        const d = obj.position.clone().sub(drag.pos).toArray().map((v, i) => (is2d && i === 2 ? 0 : v));
        M.moveBodies(S.model, drag.all, d);
        drag.pos = obj.position.clone();
        view.syncBodies(S.model);
      } else if (S.gizmoMode === 'rotate') {
        const dq = obj.quaternion.clone().multiply(drag.q.clone().invert());
        M.rotateBodiesQ(S.model, drag.all, dq, c, S.dim);
        drag.q = obj.quaternion.clone();
        view.syncBodies(S.model);
      } else {
        const f = groupScale(obj);
        for (const id2 of drag.all) {
          const g = view.bodyObjects[id2], p0 = drag.start[id2];
          if (!g || !p0) continue;
          g.scale.setScalar(f);
          g.position.copy(p0).sub(obj.position).multiplyScalar(f).add(obj.position);
        }
      }
    }
    renderProps();
  }
  // Ryhmä skaalataan aina tasaisesti (keskiarvo kahvan akseleista), jotta osat pysyvät oikeassa suhteessa
  const groupScale = (obj) => Math.max(0.05, S.dim === '2d' ? (obj.scale.x + obj.scale.y) / 2 : (obj.scale.x + obj.scale.y + obj.scale.z) / 3);
  function onTransformEnd() {
    const o = view.gizmo.object;
    if (o && drag && S.gizmoMode === 'scale') {
      if (o.userData.kind === 'body') {
        const b = S.model.bodies.find((x) => x.id === o.userData.id), k = o.scale.toArray();
        o.scale.set(1, 1, 1);
        if (b && k.some((v) => Math.abs(v - 1) > 1e-3)) M.scaleBody(S.model, b, k.map((v) => Math.max(0.05, v)), S.dim);
      } else if (o.userData.kind === 'group') {
        const f = groupScale(o);
        o.scale.set(1, 1, 1);
        if (Math.abs(f - 1) > 1e-3) M.scaleBodies(S.model, drag.all, f, o.position.toArray(), S.dim);
      }
    }
    const changed = dragBefore && dragBefore !== snap();
    dragBefore = null; drag = null;
    refresh();
    if (changed) persist();
  }

  // ---------- Käynnistys ----------
  // Valintalaatikko: laatikon sisällä olevat osat valitaan (Shift/Ctrl lisää aiempaan valintaan)
  const onBoxSelect = (ids, additive) => {
    S.sel = { bodies: additive ? [...new Set([...S.sel.bodies, ...ids])] : ids, joint: null };
    refresh(true);
    if (S.sel.bodies.length > 1) setHint(tr(`${S.sel.bodies.length} osaa valittu. Vedä kahvasta siirtääksesi, kääntääksesi tai skaalataksesi ne yhdessä.`, `${S.sel.bodies.length} parts selected. Drag the handle to move, rotate or scale them together.`));
  };
  view = new Viewport(q('view'), { onPick: (kind, id, additive) => select(kind, id, additive), onBoxSelect, onTransformStart, onTransform, onTransformEnd });
  // Automaattitestit (tests-app.html, ?memstore) pääsevät käsiksi rakentajan tilaan
  if (/[?&]memstore\b/.test(location.search)) window.__builder = { S, view, select, onBoxSelect, onTransformStart, onTransform, onTransformEnd, setGizmoMode };
  const ro = new ResizeObserver(() => view && view.resize());
  ro.observe(q('view'));
  view.resize();
  view.setSnap(true, 0.05, 15);
  view.setDim(S.dim);
  function cleanup() {
    dead = true;
    cancelAnimationFrame(raf);
    stopTest(true);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onDocDown);
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCopy);
    document.removeEventListener('paste', onPaste);
    ro.disconnect();
    view?.dispose();
    view = null;
  }
  // Rikkinäinen tallennettu malli voi kaatua ensimmäisessä piirrossa: kuuntelijat ja 3D-näkymä vapautetaan,
  // ja sovellus näyttää työkalun palautusnäkymän
  try {
    bindEvents();
    // Simulaation "Avaa rakentajassa" jättää robotin tähän kenttään
    if (saved.importRaw) {
      const raw = saved.importRaw;
      saveToolState(key, { ...saved, importRaw: undefined }, { undo: false });
      try { loadRaw(raw, raw.builtin3d ? '3d' : dim); toast(tr('Robotti tuotiin simulaatiosta rakentajaan.', 'The robot was brought from the simulation into the builder.')); }
      catch (e) { setHint(tr('Robotin tuonti epäonnistui: ', 'Importing the robot failed: ') + e.message); refresh(); }
    } else {
      refresh();
      if (S.model.bodies.length) focusRobot();
      // Toisesta rakentajasta tehty versio (Tee 2D/3D-versio) tallentuu ilman simulaation muotoa: lasketaan se nyt,
      // jotta "Kouluta tämä robotti" toimii heti ilman muokkausta
      if (saved.model && !saved.export && S.model.bodies.length) persist(false);
    }
  } catch (err) { cleanup(); throw err; }
  const frame = () => { if (dead) return; view.render(); raf = requestAnimationFrame(frame); };
  frame();
  if (dim === '3d') initPhysics();

  // Ensimmäisellä käyttökerralla lyhyt opastus (kurssin aikana kurssipaneeli opastaa)
  if (!window.Courses?.active()) setTimeout(() => {
    if (dead) return;
    coachTour('build' + dim, [
      { sel: '#rb-parts', text: tr('Aloita lisäämällä osa: laatikko käy rungoksi. Valmiin robotin saat pohjaksi yläreunan Uusi / pohja -valikosta.', 'Start by adding a part: a box makes a good body. A ready robot is available as a template from the New / template menu at the top.') },
      { sel: '#rb-addWheelPair', text: tr('Valitse runko ja lisää valmisosia: pyörät, jalat, käsivarsi, anturit, jousijalka tai kosketusanturi. Ne kiinnittyvät nivelillä valittuun osaan.', 'Select the body and add ready-made pieces: wheels, legs, an arm, sensors, a spring leg or a touch sensor. They attach to the selected part with joints.') },
      { sel: '#rb-testBtn', text: tr('Testaa fysiikka: robotti putoaa maahan ja voit ajaa sitä. Kun se toimii, paina Kouluta simulaatiossa, niin neuroverkko oppii ohjaamaan sitä.', 'Test the physics: the robot drops to the ground and you can drive it. When it works, press Train in simulation and a neural network learns to control it.') },
    ]);
  }, 800);

  return { unmount: cleanup };
}
