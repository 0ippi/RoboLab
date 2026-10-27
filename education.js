"use strict";

/* Opettajille (Education Mode): valmiit oppitunnit tulostettavine materiaaleineen ja luokan edistymisen
   kokoaminen oppilaiden vientitiedostoista. Ei palvelinta, ei oppilastilejä eikä nimiä: oppilas vie
   edistymisensä tiedostoksi nimimerkillä, ja opettaja tuo tiedostot omalle koneelleen. */
const Education = (() => {
  const CLASS_KEY = "robolab-class";
  const PROGRESS_FORMAT = "robolab-class-progress";
  const PROGRESS_VERSION = 1;
  const MAX_FILE = 2 * 1024 * 1024;

  /* ===== Valmiit oppitunnit ===== */
  const LESSONS = [
    {
      id: "A", course: "start", icon: "wrench", guide: "volt",
      title: tr("Ensimmäinen robotti", "My first robot"),
      level: tr("Aloittelijat, noin 10–13-vuotiaat. Ei vaadi ohjelmointia.", "Beginners, about age 10–13. No programming needed."),
      minutes: tr("45 min (laajennettuna 75 min)", "45 min (75 min extended)"),
      summary: tr("Oppilaat oppivat robotin kolme perusosaa, rakentavat simuloidun kaksipyöräisen robotin, laskevat sen nopeuden ja ajavat sen maaliin.",
        "Students learn a robot's three basic parts, build a simulated two-wheeled robot, work out its speed and drive it to a goal."),
      goals: [
        tr("Oppilas osaa nimetä robotin kolme perusosaa: anturit (aistit), ohjain (aivot) ja toimilaitteet (lihakset).", "Students can name a robot's three basic parts: sensors (senses), controller (brain) and actuators (muscles)."),
        tr("Oppilas rakentaa simuloidun robotin, joka liikkuu ja kääntyy.", "Students build a simulated robot that moves and turns."),
        tr("Oppilas selittää, miten pyörän koko ja moottorin kierrosnopeus vaikuttavat robotin nopeuteen.", "Students explain how wheel size and motor speed affect the robot's speed."),
      ],
      materials: [
        tr("Tietokone tai tabletti 1–2 oppilasta kohden, selain (Chrome, Edge, Firefox tai Safari).", "A computer or tablet per 1–2 students and a browser (Chrome, Edge, Firefox or Safari)."),
        tr("Oppilaan moniste (tulosta tältä sivulta).", "The student worksheet (print it from this page)."),
        tr("Heijastin tai iso näyttö opettajalle.", "A projector or large screen for the teacher."),
        tr("Vapaaehtoinen: lelurobotti, DC-moottori ja pyörä tai robotti-imuri näytteeksi.", "Optional: a toy robot, a DC motor with a wheel, or a robot vacuum to show."),
      ],
      prep: [
        tr("Avaa oppilaslinkki kerran jokaisella laitteella netin ollessa päällä. Sen jälkeen RoboLab toimii samassa selaimessa myös ilman nettiä.", "Open the student link once on each device while online. After that RoboLab also works offline in the same browser."),
        tr("Kokeile kurssin 'Aloita tästä' vaiheet 1–2 itse (noin 10 min).", "Try steps 1–2 of the 'Start here' course yourself (about 10 min)."),
        tr("Tulosta monisteet ja päätä parit.", "Print the worksheets and decide the pairs."),
      ],
      plan: [
        { t: "0–5", title: tr("Mikä on robotti?", "What is a robot?"),
          do: tr("Kysy luokalta: mikä tekee laitteesta robotin? Kirjaa ehdotukset taululle. Esittele silmukka aisti → päätä → toimi robotti-imurin avulla: törmäysanturi huomaa seinän, ohjain päättää kääntyä ja moottorit kääntävät.", "Ask the class: what makes a machine a robot? Write the ideas on the board. Introduce the loop sense → think → act with a robot vacuum: a bump sensor notices the wall, the controller decides to turn and the motors turn it.") },
        { t: "5–8", title: tr("Näytä", "Demonstrate"),
          do: tr("Avaa oppilaslinkki heijastimelle. Näytä, miten 2D-rakentajaan lisätään runko ja pyörä ja miten Tarkistus-välilehti kertoo, onko robotti valmis.", "Open the student link on the projector. Show how to add a body and a wheel in the 2D builder and how the Check tab tells whether the robot is ready.") },
        { t: "8–20", title: tr("Rakenna ja testaa", "Build and test"),
          do: tr("Oppilaat tekevät kurssin vaiheet 1–2 ja monisteen tehtävät 1–2. Kierrä luokassa. Yleisin ongelma: pyörä ei ole kiinni rungossa. Neuvo silloin katsomaan Tarkistus-välilehteä.", "Students do course steps 1–2 and worksheet tasks 1–2. Walk around the class. The most common problem is a wheel that is not attached to the body; point them to the Check tab.") },
        { t: "20–32", title: tr("Kuinka nopea robotti on?", "How fast is the robot?"),
          do: tr("Kurssin vaihe 3. Oppilaat ennustavat ensin ja täyttävät sitten nopeustaulukon (tehtävä 3) Moottori ja voimansiirto -työkalulla. Pysäytä luokka hetkeksi: miksi iso pyörä on nopeampi? Mitä se maksaa?", "Course step 3. Students predict first and then fill in the speed table (task 3) with the Motor & drivetrain tool. Pause the class: why is a big wheel faster? What does it cost?") },
        { t: "32–40", title: tr("Aja maaliin", "Drive to the goal"),
          do: tr("Kurssin vaihe 4: robotti ajaa kartalla maaliin. Oppilaat siirtävät maalia ja ajavat uudelleen. Kysy: missä robotti aistii, päättää ja toimii?", "Course step 4: the robot drives to a goal on a map. Students move the goal and drive again. Ask: where does the robot sense, think and act?") },
        { t: "40–45", title: tr("Kooste ja poistumislippu", "Wrap-up and exit ticket"),
          do: tr("Käy läpi tehtävä 4 yhdessä. Oppilaat vastaavat poistumislippuun (tehtävä 5). Halutessasi oppilaat vievät edistymisensä tiedostoksi Kurssit-sivulta.", "Go through task 4 together. Students answer the exit ticket (task 5). If you like, students export their progress as a file from the Courses page.") },
      ],
      tasks: [
        { q: tr("Yhdistä osa ja tehtävä. Keksi jokaisesta esimerkki robotti-imurista.", "Match each part to its job. Think of an example of each in a robot vacuum."),
          table: [[tr("Osa", "Part"), tr("Mitä se tekee ihmisessä?", "Like what in a person?"), tr("Esimerkki robotti-imurissa", "Example in a robot vacuum")],
            [tr("Anturi", "Sensor"), "", ""], [tr("Ohjain (mikrokontrolleri)", "Controller (microcontroller)"), "", ""], [tr("Moottori (toimilaite)", "Motor (actuator)"), "", ""]] },
        { q: tr("Rakenna robotti RoboLabissa (kurssi 'Aloita tästä', vaiheet 1–2). Rastita, kun olet tehnyt:", "Build a robot in RoboLab ('Start here' course, steps 1–2). Tick when done:"),
          checks: [tr("Runko ja kaksi pyörää", "A body and two wheels"), tr("Tarkistus-välilehdellä vihreä merkki", "A green mark on the Check tab"), tr("Robotti liikkuu fysiikkatestissä", "The robot moves in the physics test"), tr("Robotti kääntyy", "The robot turns")] },
        { q: tr("Nopeustaulukko. Moottori pyörii 200 kierrosta minuutissa. Kirjoita ensin ennuste, tarkista sitten Moottori ja voimansiirto -työkalusta kohta 'Huippunopeus (ei kuormaa)'.", "Speed table. The motor turns at 200 rpm. Write your prediction first, then check 'Top speed (no load)' in the Motor & drivetrain tool."),
          table: [[tr("Pyörän halkaisija", "Wheel diameter"), tr("Ennuste: hitaampi / sama / nopeampi", "Prediction: slower / same / faster"), tr("Huippunopeus (m/s)", "Top speed (m/s)")],
            ["40 mm", "", ""], ["65 mm", "", ""], ["100 mm", "", ""]] },
        { q: tr("Robotissa ei ole ohjauspyörää. Miten se kääntyy?", "The robot has no steering wheel. How does it turn?"), lines: 2 },
        { q: tr("Poistumislippu: missä järjestyksessä robotti toimii? Kirjoita sanat aisti, päätä ja toimi oikeaan järjestykseen ja anna esimerkki.", "Exit ticket: in which order does a robot work? Put the words sense, think and act in order and give an example."), lines: 3 },
      ],
      solutions: [
        tr("1. Anturi = aistit (esim. törmäysanturi, putoamisanturi, etäisyysanturi). Ohjain = aivot (päättää mitä tehdään). Moottori = lihakset (pyörät ja harjat).", "1. Sensor = senses (e.g. bump, cliff or distance sensor). Controller = brain (decides what to do). Motor = muscles (wheels and brushes)."),
        tr("3. Huippunopeus v = kierrosnopeus × π × halkaisija / 60: 40 mm → 0,42 m/s, 65 mm → 0,68 m/s, 100 mm → 1,05 m/s. Iso pyörä kulkee kierroksella pidemmän matkan, mutta sen vetovoima on pienempi (sama momentti pidemmällä vipuvarrella), joten raskas robotti voi jäädä paikalleen. Työkalun 'Ajonopeus' on pienempi kuin huippunopeus, koska siinä on mukana kuorma.", "3. Top speed v = rpm × π × diameter / 60: 40 mm → 0.42 m/s, 65 mm → 0.68 m/s, 100 mm → 1.05 m/s. A big wheel travels further per turn, but its pulling force is smaller (the same torque on a longer lever), so a heavy robot may not move. The tool's 'Driving speed' is lower than the top speed because it includes the load."),
        tr("4. Pyörät pyörivät eri nopeuksilla tai eri suuntiin (differentiaaliohjaus). Jos vasen pyörä pyörii nopeammin, robotti kääntyy oikealle.", "4. The wheels spin at different speeds or in opposite directions (differential drive). If the left wheel is faster, the robot turns right."),
        tr("5. Aisti → päätä → toimi, ja sama silmukka toistuu koko ajan. Esimerkki: etäisyysanturi näkee seinän → ohjain päättää kääntyä → moottorit kääntävät robottia.", "5. Sense → think → act, and the loop repeats all the time. Example: the distance sensor sees a wall → the controller decides to turn → the motors turn the robot."),
      ],
      rubric: [
        [tr("Perustaso", "Basic"), tr("Nimeää robotin osat ja saa simuloidun robotin liikkumaan.", "Names the robot's parts and gets the simulated robot moving.")],
        [tr("Hyvä", "Good"), tr("Täyttää nopeustaulukon oikein ja selittää, miksi isompi pyörä on nopeampi.", "Fills in the speed table correctly and explains why a bigger wheel is faster.")],
        [tr("Erinomainen", "Excellent"), tr("Selittää myös, miksi isompi pyörä heikentää vetovoimaa, ja keksii, miten robotti saadaan sekä nopeaksi että vahvaksi (esim. välityssuhde tai tehokkaampi moottori).", "Also explains why a bigger wheel lowers the pulling force, and suggests how to make the robot both fast and strong (e.g. a gear ratio or a stronger motor).")],
      ],
      extension: [
        tr("Saa robotin ajonopeus yli 1 m/s niin, että robotti jaksaa yhä liikkua (kurssin vaihe 3, tehtävä 2). Mitä vetovoimalle tapahtui?", "Get the driving speed above 1 m/s while the robot can still move (course step 3, task 2). What happened to the pulling force?"),
        tr("Rakenna 2D-rakentajassa kolmi- tai nelipyöräinen robotti ja vertaa sen kääntymistä kaksipyöräiseen.", "Build a three- or four-wheeled robot in the 2D builder and compare how it turns with the two-wheeled one."),
      ],
      offline: [
        tr("Ihmisrobotti: parit, toinen on robotti, joka tottelee vain komentoja 'askel eteen', 'käänny 90° vasemmalle' ja 'käänny 90° oikealle'. Toinen kirjoittaa paperille ohjelman, jolla robotti kulkee luokan läpi esteiden ohi. Anturi: kaveri taputtaa, kun robotti on 1 askeleen päässä esteestä.", "Human robot: in pairs, one is the robot that only obeys 'step forward', 'turn 90° left' and 'turn 90° right'. The other writes a program on paper that takes the robot across the room around obstacles. Sensor: a friend claps when the robot is one step from an obstacle."),
        tr("Pyörän matka: vieritä kolikkoa, pulloa tai rullaa yksi kierros paperin päällä ja mittaa matka. Vertaa laskettuun π × halkaisija.", "Wheel distance: roll a coin, bottle or roll one full turn on paper and measure the distance. Compare with π × diameter."),
      ],
      words: [
        [tr("Anturi", "Sensor"), tr("Laite, joka mittaa ympäristöä (etäisyys, valo, kosketus).", "A device that measures the surroundings (distance, light, touch).")],
        [tr("Toimilaite", "Actuator"), tr("Osa, joka liikuttaa robottia, esim. moottori.", "A part that moves the robot, e.g. a motor.")],
        [tr("Ohjain", "Controller"), tr("Robotin 'aivot', yleensä mikrokontrolleri, jossa on ohjelma.", "The robot's 'brain', usually a microcontroller running a program.")],
        ["rpm", tr("Kierrosta minuutissa.", "Revolutions per minute.")],
      ],
    },
    {
      id: "B", course: "nav", icon: "path", guide: "dusty",
      title: tr("Robotti väistää esteitä", "A robot avoids obstacles"),
      level: tr("Noin 12–15-vuotiaat. Oppitunti A tai vastaava perustaito on hyödyksi.", "About age 12–15. Lesson A or similar basics help."),
      minutes: tr("75 min (tai 2 × 45 min)", "75 min (or 2 × 45 min)"),
      summary: tr("Oppilaat tutkivat, miten robotti mittaa etäisyyksiä, tekee kartan, etsii reitin esteiden ohi ja ajaa sen.", "Students explore how a robot measures distances, builds a map, finds a path around obstacles and drives it."),
      goals: [
        tr("Oppilas selittää, miten etäisyysanturi (lidar, ultraääni tai ToF) mittaa etäisyyden ja mitä anturin kantama vaikuttaa.", "Students explain how a distance sensor (lidar, ultrasonic or ToF) measures distance and what the sensor's range affects."),
        tr("Oppilas kuvaa, miten robotti esittää ympäristön ruudukkokarttana.", "Students describe how a robot represents its surroundings as a grid map."),
        tr("Oppilas vertaa reitinhakualgoritmeja (A*, Dijkstra, RRT) reitin pituuden ja tutkittujen solujen perusteella.", "Students compare path-finding algorithms (A*, Dijkstra, RRT) by path length and cells explored."),
        tr("Oppilas testaa, miten robotti seuraa reittiä, ja tunnistaa katseluetäisyyden vaikutuksen.", "Students test how a robot follows a path and recognise the effect of the lookahead distance."),
      ],
      materials: [
        tr("Tietokone tai tabletti 1–2 oppilasta kohden.", "A computer or tablet per 1–2 students."),
        tr("Oppilaan moniste.", "The student worksheet."),
        tr("Vapaaehtoinen: ultraäänianturi (esim. HC-SR04) tai robotti-imuri näytteeksi.", "Optional: an ultrasonic sensor (e.g. HC-SR04) or a robot vacuum to show."),
      ],
      prep: [
        tr("Kokeile Varauskartta-työkalun 'Tutki automaattisesti' ja Reittisuunnittelun 'Vertaile kaikkia' (noin 10 min).", "Try 'Explore automatically' in the Occupancy grid tool and 'Compare all' in Path planning (about 10 min)."),
        tr("Avaa oppilaslinkki laitteilla kerran netin ollessa päällä.", "Open the student link on the devices once while online."),
      ],
      plan: [
        { t: "0–10", title: tr("Miten robotti näkee?", "How does a robot see?"),
          do: tr("Kysy: miten robotti-imuri tietää, missä seinä on? Selitä etäisyysanturi: anturi lähettää äänen tai valon ja mittaa, kauanko kaiku kestää (etäisyys = nopeus × aika / 2). Lidar tekee saman monessa suunnassa.", "Ask: how does a robot vacuum know where the wall is? Explain the distance sensor: it sends sound or light and measures how long the echo takes (distance = speed × time / 2). A lidar does the same in many directions.") },
        { t: "10–25", title: tr("Kartoitus", "Mapping"),
          do: tr("Varauskartta-työkalu: oppilaat käynnistävät 'Tutki automaattisesti' ja täyttävät monisteen tehtävän 2 kahdella kantamalla. Pura yhdessä: miksi lyhyt kantama hidastaa?", "Occupancy grid tool: students start 'Explore automatically' and fill in worksheet task 2 with two ranges. Discuss: why does a short range slow it down?") },
        { t: "25–45", title: tr("Reitinhaku", "Path planning"),
          do: tr("Kurssin 'Mobiilirobotin navigointi' vaiheet 1–2: piirrä seinä, siirrä maali, katso A*:n haku ja paina 'Vertaile kaikkia'. Oppilaat täyttävät algoritmitaulukon (tehtävä 3).", "Steps 1–2 of the 'Mobile robot navigation' course: draw a wall, move the goal, watch the A* search and press 'Compare all'. Students fill in the algorithm table (task 3).") },
        { t: "45–60", title: tr("Robotti ajaa reitin", "The robot drives the path"),
          do: tr("Kurssin vaihe 3: robotti ajaa maaliin. Oppilaat vertaavat katseluetäisyyksiä 0,1 ja 0,6 (tehtävä 4).", "Course step 3: the robot drives to the goal. Students compare lookahead distances 0.1 and 0.6 (task 4).") },
        { t: "60–70", title: tr("Haaste nopeille", "Challenge for fast finishers"),
          do: tr("Lisätehtävät: labyrintti ja odometrian virhe (kurssin vaihe 4). Muut viimeistelevät tehtävät 1–4.", "Extension tasks: a maze and odometry error (course step 4). Others finish tasks 1–4.") },
        { t: "70–75", title: tr("Kooste", "Wrap-up"),
          do: tr("Kysy: missä tässä tunnissa oli aisti, päätä ja toimi? (lidar → kartta ja reitinhaku → moottorit)", "Ask: where were sense, think and act in this lesson? (lidar → map and path planning → motors)") },
      ],
      tasks: [
        { q: tr("Ultraäänianturi lähettää äänipulssin. Kaiku palaa 0,01 sekunnissa. Äänen nopeus on 343 m/s. Kuinka kaukana este on? Näytä laskusi.", "An ultrasonic sensor sends a sound pulse. The echo returns in 0.01 s. The speed of sound is 343 m/s. How far away is the obstacle? Show your working."), lines: 3 },
        { q: tr("Kartoitus Varauskartta-työkalulla. Paina 'Tutki automaattisesti' ja katso, kauanko kartan valmistuminen kestää. Muuta sitten lidarin kantamaksi alle 1 m ja toista.", "Mapping with the Occupancy grid tool. Press 'Explore automatically' and watch how long the map takes. Then set the lidar range below 1 m and repeat."),
          table: [[tr("Kantama", "Range"), tr("Nopea vai hidas?", "Fast or slow?"), tr("Havainto", "Observation")], [tr("Oletus (2,5 m)", "Default (2.5 m)"), "", ""], [tr("Alle 1 m", "Below 1 m"), "", ""]] },
        { q: tr("Reittisuunnittelu: piirrä kartalle seinä ja paina 'Vertaile kaikkia'. Kirjaa tulokset.", "Path planning: draw a wall on the map and press 'Compare all'. Record the results."),
          table: [[tr("Algoritmi", "Algorithm"), tr("Reitin pituus", "Path length"), tr("Tutkitut solut", "Cells explored")], ["A*", "", ""], ["Dijkstra", "", ""], ["RRT", "", ""]] },
        { q: tr("Miksi A* tutkii vähemmän soluja kuin Dijkstra, vaikka reitti on yhtä pitkä?", "Why does A* explore fewer cells than Dijkstra even though the path is just as long?"), lines: 2 },
        { q: tr("Mobiilirobotti 2D: aja maaliin katseluetäisyyksillä 0,1 ja 0,6. Miten robotin ajo mutkissa eroaa?", "Mobile robot 2D: drive to the goal with lookahead distances 0.1 and 0.6. How does the driving in corners differ?"), lines: 3 },
      ],
      solutions: [
        tr("1. Ääni kulkee esteelle ja takaisin, joten etäisyys = 343 m/s × 0,01 s / 2 ≈ 1,7 m.", "1. The sound travels to the obstacle and back, so distance = 343 m/s × 0.01 s / 2 ≈ 1.7 m."),
        tr("2. Lyhyellä kantamalla kartoitus on selvästi hitaampi: robotin on ajettava lähelle jokaista seinää nähdäkseen sen, ja kaukaiset alueet jäävät pitkään tuntemattomiksi.", "2. With a short range mapping is clearly slower: the robot has to drive close to every wall to see it, and distant areas stay unknown for a long time."),
        tr("3. A* ja Dijkstra löytävät yhtä lyhyen reitin; A* tutkii yleensä selvästi vähemmän soluja. RRT:n reitti on mutkikkaampi ja pidempi ja vaihtelee joka ajolla, koska se arpoo pisteitä. Tarkat luvut riippuvat oppilaan kartasta.", "3. A* and Dijkstra find an equally short path; A* usually explores far fewer cells. RRT's path is wigglier and longer and changes every run because it samples random points. The exact numbers depend on the student's map."),
        tr("4. A* käyttää arviota jäljellä olevasta matkasta maaliin (heuristiikka) ja laajentaa hakua ensin maalin suuntaan. Dijkstra laajenee tasaisesti joka suuntaan.", "4. A* uses an estimate of the remaining distance to the goal (a heuristic) and expands toward the goal first. Dijkstra spreads evenly in every direction."),
        tr("5. Lyhyt katseluetäisyys seuraa reittiä tarkasti mutta voi heilua ja kääntyä nykien. Pitkä katseluetäisyys ajaa pehmeästi mutta oikaisee mutkat ja voi ajaa liian läheltä nurkkia.", "5. A short lookahead follows the path closely but may weave and turn jerkily. A long lookahead drives smoothly but cuts corners and may pass too close to them."),
      ],
      rubric: [
        [tr("Perustaso", "Basic"), tr("Saa kartan ja reitin tehtyä ja kertoo, mitä etäisyysanturi mittaa.", "Gets a map and a path done and says what a distance sensor measures.")],
        [tr("Hyvä", "Good"), tr("Laskee etäisyyden kaiusta oikein ja vertaa algoritmeja taulukon avulla.", "Calculates the echo distance correctly and compares algorithms with the table.")],
        [tr("Erinomainen", "Excellent"), tr("Perustelee, miksi A* on tehokas ja milloin RRT on silti hyödyllinen (esim. robottikäden liikkeet monessa ulottuvuudessa), ja selittää katseluetäisyyden kompromissin.", "Explains why A* is efficient and when RRT is still useful (e.g. robot arm motion in many dimensions), and explains the lookahead trade-off.")],
      ],
      extension: [
        tr("Piirrä labyrintti, jossa reitti on mahdollisimman pitkä mutta löytyy yhä. Montako solua A* tutkii? Entä Dijkstra?", "Draw a maze where the path is as long as possible but still exists. How many cells does A* explore? And Dijkstra?"),
        tr("Kurssin vaihe 4: laita päälle 'Ohjain käyttää odometriaa' ja pyörien luisto. Miksi robotti eksyy, vaikka reitti on oikea?", "Course step 4: turn on 'Controller uses odometry' and wheel slip. Why does the robot get lost even though the path is right?"),
      ],
      offline: [
        tr("Paperiruudukko 10 × 10: oppilaat merkitsevät esteet ja numeroivat ruudut maalista alkaen (1, 2, 3…) aaltona kuten Dijkstra. Lyhin reitti löytyy seuraamalla laskevia numeroita lähdöstä maaliin.", "A 10 × 10 paper grid: students mark obstacles and number the cells starting from the goal (1, 2, 3…) as a wave, like Dijkstra. The shortest path is found by following decreasing numbers from start to goal."),
        tr("Ihmislidar: oppilas seisoo silmät kiinni, ja kaverit kertovat etäisyyden lähimpään esteeseen neljään suuntaan. Oppilas piirtää kartan pelkkien lukujen perusteella.", "Human lidar: a student stands with eyes closed while friends tell the distance to the nearest obstacle in four directions. The student draws a map from the numbers alone."),
      ],
      words: [
        ["Lidar", tr("Laseretäisyysanturi, joka mittaa monessa suunnassa.", "A laser distance sensor that measures in many directions.")],
        [tr("Varauskartta", "Occupancy grid"), tr("Kartta, jossa jokainen ruutu on vapaa, este tai tuntematon.", "A map where each cell is free, an obstacle or unknown.")],
        [tr("Heuristiikka", "Heuristic"), tr("Arvio jäljellä olevasta matkasta, jolla A* suuntaa hakua.", "An estimate of the remaining distance that A* uses to steer the search.")],
        [tr("Odometria", "Odometry"), tr("Sijainnin arvio pyörien kierroksista.", "Estimating position from wheel turns.")],
      ],
    },
    {
      id: "C", course: "pid", icon: "pid", guide: "wobbly",
      title: tr("PID-säätö käytännössä", "PID control in practice"),
      level: tr("Noin 14–18-vuotiaat (9. luokka, lukio, ammatillinen). Kuvaajien lukeminen on hyödyksi.", "About age 14–18 (upper secondary, vocational). Reading graphs helps."),
      minutes: tr("75 min (ydinosa 45 min: P, I ja D)", "75 min (core 45 min: P, I and D)"),
      summary: tr("Oppilaat oppivat takaisinkytkennän käsitteet ja virittävät PID-säätimen vaatimuksiin muuttamalla arvoja ja vertaamalla askelvasteita.", "Students learn the ideas of feedback and tune a PID controller to requirements by changing values and comparing step responses."),
      goals: [
        tr("Oppilas selittää takaisinkytkennän käsitteet: asetusarvo, mittaus, virhe ja ohjaus.", "Students explain the ideas of feedback: setpoint, measurement, error and control output."),
        tr("Oppilas kuvaa P-, I- ja D-termien vaikutuksen askelvasteeseen.", "Students describe the effect of the P, I and D terms on the step response."),
        tr("Oppilas lukee askelvasteesta ylityksen, asettumisajan ja pysyvän virheen.", "Students read overshoot, settling time and steady-state error from a step response."),
        tr("Oppilas virittää säätimen annettuihin vaatimuksiin ja perustelee valintansa.", "Students tune a controller to given requirements and justify their choices."),
      ],
      materials: [
        tr("Tietokone 1–2 oppilasta kohden (tabletti käy, mutta kuvaajat ovat isommalla näytöllä selkeämpiä).", "A computer per 1–2 students (a tablet works, but the plots are clearer on a bigger screen)."),
        tr("Oppilaan moniste.", "The student worksheet."),
        tr("Vapaaehtoinen: viivain ja pallo tai kynä tasapainotukseen johdannossa.", "Optional: a ruler and a ball or pen for a balancing demo in the introduction."),
      ],
      prep: [
        tr("Käy itse läpi kurssin 'Säätötekniikka: PID-säädin' vaiheet 1–3 (noin 15 min).", "Go through steps 1–3 of the 'Control basics: the PID controller' course yourself (about 15 min)."),
        tr("Huom: PID-työkalun lukuarvot ovat simulaatiosta. Monisteen vastausavaimen luvut on laskettu työkalun oletusjärjestelmällä (moottori: K = 1, τ = 0,5 s; massa: m = 1 kg, b = 0,5 N·s/m).", "Note: the PID tool's numbers come from a simulation. The answer key numbers were computed with the tool's default systems (motor: K = 1, τ = 0.5 s; mass: m = 1 kg, b = 0.5 N·s/m)."),
      ],
      plan: [
        { t: "0–10", title: tr("Takaisinkytkentä arjessa", "Feedback in everyday life"),
          do: tr("Esimerkki suihkusta: haluttu lämpötila on asetusarvo, iho on anturi, ero on virhe ja hanan kääntö on ohjaus. Piirrä silmukka taululle. Kysy: mitä tapahtuu, jos käännät hanaa liian rajusti?", "Shower example: the wanted temperature is the setpoint, your skin is the sensor, the difference is the error and turning the tap is the control output. Draw the loop on the board. Ask: what happens if you turn the tap too hard?") },
        { t: "10–25", title: tr("P-termi", "The P term"),
          do: tr("Kurssin vaihe 1. Oppilaat täyttävät taulukon rivit 1–3 (tehtävä 2). Pura: miksi pelkkä P jättää virheen?", "Course step 1. Students fill in table rows 1–3 (task 2). Discuss: why does P alone leave an error?") },
        { t: "25–40", title: tr("I-termi", "The I term"),
          do: tr("Kurssin vaihe 2. Taulukon rivit 4–5. Huomio: I poistaa pysyvän virheen, mutta liian suuri Ki aiheuttaa ylitystä.", "Course step 2. Table rows 4–5. Point out: I removes the steady-state error, but too much Ki causes overshoot.") },
        { t: "40–55", title: tr("D-termi ja massa", "The D term and a mass"),
          do: tr("Kurssin vaihe 3: vaihda järjestelmäksi massa. Taulukon rivit 6–8. D toimii iskunvaimentimena.", "Course step 3: switch the system to the mass. Table rows 6–8. D works like a shock absorber.") },
        { t: "55–68", title: tr("Viritystehtävä", "Tuning challenge"),
          do: tr("Tehtävä 3: oppilaat virittävät massan asennon vaatimuksiin. Nopeat jatkavat kurssin vaiheisiin 4–5 (epästabiilius ja häiriöt).", "Task 3: students tune the mass position to the requirements. Fast finishers continue to course steps 4–5 (instability and disturbances).") },
        { t: "68–75", title: tr("Kooste", "Wrap-up"),
          do: tr("Vertaa parien ratkaisuja: kenen asettumisaika oli lyhin? Missä oikeissa laitteissa on PID? (drooni, 3D-tulostin, vakionopeudensäädin, uunin termostaatti)", "Compare the pairs' solutions: whose settling time was shortest? Which real devices use PID? (drones, 3D printers, cruise control, oven thermostats)") },
      ],
      tasks: [
        { q: tr("Merkitse suihkuesimerkkiin: asetusarvo, mittaus, virhe ja ohjaus.", "Label the shower example: setpoint, measurement, error and control output."), lines: 3 },
        { q: tr("Askelvasteet PID-työkalulla. Rivit 1–5: järjestelmä 'DC-moottorin nopeus'. Rivit 6–8: 'Massan asento'. Kirjaa tunnusluvut työkalun tuloksista.", "Step responses with the PID tool. Rows 1–5: system 'DC motor speed'. Rows 6–8: 'Mass position'. Record the figures from the tool's results."),
          table: [["#", "Kp", "Ki", "Kd", tr("Ylitys %", "Overshoot %"), tr("Asettumisaika s", "Settling time s"), tr("Pysyvä virhe", "Steady-state error")],
            ["1", "1", "0", "0", "", "", ""], ["2", "5", "0", "0", "", "", ""], ["3", "10", "0", "0", "", "", ""],
            ["4", "2", "4", "0", "", "", ""], ["5", "2", "20", "0", "", "", ""],
            ["6", "20", "0", "0", "", "", ""], ["7", "20", "0", "3", "", "", ""], ["8", "20", "0", "8", "", "", ""]] },
        { q: tr("Viritystehtävä (massan asento): löydä Kp, Ki ja Kd, joilla ylitys on alle 10 %, asettumisaika alle 2 s ja pysyvä virhe alle 2 %. Kirjaa arvot ja tulokset.", "Tuning challenge (mass position): find Kp, Ki and Kd that give overshoot below 10 %, settling time below 2 s and steady-state error below 2 %. Record the values and results."), lines: 3 },
        { q: tr("Täydennä: P reagoi ______, I reagoi ______ ja D reagoi ______.", "Complete: P reacts to ______, I reacts to ______ and D reacts to ______."), lines: 2 },
      ],
      solutions: [
        tr("1. Asetusarvo = haluttu lämpötila, mittaus = iho tuntee lämpötilan, virhe = haluttu − tunnettu, ohjaus = hanan kääntäminen.", "1. Setpoint = wanted temperature, measurement = skin feels the temperature, error = wanted − felt, control output = turning the tap."),
        tr("2. Simulaation tulokset (asetusarvo 1; ylitys %, asettumisaika, pysyvä virhe): 1) 0 %, 0,98 s, 0,50 · 2) 0 %, 0,33 s, 0,17 · 3) 0 %, 0,18 s, 0,09 · 4) 0 %, 0,98 s, 0 · 5) noin 24 %, 1,2 s, 0 · 6) noin 84 %, ei asetu (heiluu pitkään) · 7) noin 26 %, 1,9 s, 0 · 8) 0 %, 1,2 s, 0. Huomaa rivit 1–3: suurempi Kp nopeuttaa ja pienentää virhettä, mutta pelkällä P:llä virhe on aina 1/(1 + Kp) — ohjaus on verrannollinen virheeseen, joten nolla virhe tarkoittaisi nollaohjausta. Asettumisaika mitataan loppuarvosta (2 %:n kaista), kuten oppikirjoissa.", "2. Simulation results (setpoint 1; overshoot %, settling time, steady-state error): 1) 0 %, 0.98 s, 0.50 · 2) 0 %, 0.33 s, 0.17 · 3) 0 %, 0.18 s, 0.09 · 4) 0 %, 0.98 s, 0 · 5) about 24 %, 1.2 s, 0 · 6) about 84 %, never settles (swings for a long time) · 7) about 26 %, 1.9 s, 0 · 8) 0 %, 1.2 s, 0. Look at rows 1–3: a bigger Kp is faster and leaves less error, but with P only the error is always 1/(1 + Kp) — the output is proportional to the error, so zero error would mean zero output. Settling time is measured from the final value (2 % band), as in textbooks."),
        tr("3. Esimerkiksi Kp = 20, Ki = 0, Kd = 8 (ylitys 0 %, asettuminen noin 1,2 s) tai Kp = 30, Ki = 0, Kd = 10 (noin 1,0 s). Muitakin ratkaisuja on: tarkista vaatimukset työkalun tuloksista.", "3. For example Kp = 20, Ki = 0, Kd = 8 (overshoot 0 %, settling about 1.2 s) or Kp = 30, Ki = 0, Kd = 10 (about 1.0 s). Other solutions exist: check the requirements in the tool's results."),
        tr("4. P reagoi nykyiseen virheeseen, I kertyneeseen (summattuun) virheeseen ja D virheen muutosnopeuteen.", "4. P reacts to the current error, I to the accumulated (summed) error and D to the rate of change of the error."),
      ],
      rubric: [
        [tr("Perustaso", "Basic"), tr("Täyttää taulukon ja nimeää asetusarvon, virheen ja ohjauksen.", "Fills in the table and names the setpoint, error and control output.")],
        [tr("Hyvä", "Good"), tr("Kuvaa jokaisen termin vaikutuksen omin sanoin ja löytää vaatimukset täyttävän virityksen.", "Describes each term's effect in their own words and finds a tuning that meets the requirements.")],
        [tr("Erinomainen", "Excellent"), tr("Perustelee virityksensä tunnuslukujen avulla ja selittää, miksi pelkkä P jättää pysyvän virheen ja miksi liian suuri Ki tekee säädöstä epävakaan.", "Justifies the tuning with the figures and explains why P alone leaves a steady-state error and why too much Ki makes the loop unstable.")],
      ],
      extension: [
        tr("Kurssin vaihe 4: tee säädöstä tahallaan epästabiili ja korjaa se. Mistä epästabiiliuden tunnistaa kuvaajasta?", "Course step 4: make the loop unstable on purpose and fix it. How do you recognise instability in the plot?"),
        tr("Kurssin vaihe 5: lisää kuormahäiriö. Mikä termi palauttaa vasteen asetusarvoon?", "Course step 5: add a load disturbance. Which term brings the response back to the setpoint?"),
      ],
      offline: [
        tr("Ihmis-PID: oppilas kävelee silmät kiinni kohti lattiaan teipattua viivaa. Ohjaaja saa sanoa vain askelen pituuden (P: iso matka → iso askel). Kokeilkaa, mitä tapahtuu, jos ohjaaja reagoi liian voimakkaasti (ylitys) tai liian varovasti (hidas).", "Human PID: a student walks with eyes closed toward a line taped on the floor. The guide may only say the step length (P: far away → big step). Try what happens if the guide reacts too strongly (overshoot) or too cautiously (slow)."),
        tr("Tasapainotus: pidä kynää pystyssä kämmenellä. Keskustelkaa: mitä aivosi mittaavat (kulma ja kulman muutosnopeus = P ja D)?", "Balancing: balance a pen upright on your palm. Discuss: what does your brain measure (the angle and how fast it changes = P and D)?"),
      ],
      words: [
        [tr("Asetusarvo", "Setpoint"), tr("Arvo, johon säädin yrittää päästä.", "The value the controller tries to reach.")],
        [tr("Virhe", "Error"), tr("Asetusarvo miinus mitattu arvo.", "Setpoint minus the measured value.")],
        [tr("Ylitys", "Overshoot"), tr("Kuinka paljon vaste menee asetusarvon yli, prosentteina.", "How far the response goes past the setpoint, in percent.")],
        [tr("Asettumisaika", "Settling time"), tr("Aika, jonka jälkeen vaste pysyy 2 %:n päässä asetusarvosta.", "The time after which the response stays within 2 % of the setpoint.")],
        [tr("Pysyvä virhe", "Steady-state error"), tr("Virhe, joka jää jäljelle, kun vaste on asettunut.", "The error left once the response has settled.")],
      ],
    },
  ];

  /* ===== Oppilaan edistymistiedosto ===== */
  function readClass() {
    try { const v = JSON.parse(localStorage.getItem(CLASS_KEY)); if (v && typeof v === "object") return { code: String(v.code || ""), alias: String(v.alias || "") }; } catch {}
    return { code: "", alias: "" };
  }
  function writeClass(v) { try { localStorage.setItem(CLASS_KEY, JSON.stringify(v)); } catch {} }

  // Vain kurssien eteneminen: ei projekteja, ei pohdintavastauksia, ei tilin tietoja
  function buildProgress(cls) {
    return {
      format: PROGRESS_FORMAT, version: PROGRESS_VERSION, app: window.ROBOLAB_RELEASES?.[0]?.version || "",
      exported: new Date().toISOString(),
      classCode: String(cls.code || "").trim().slice(0, 40),
      alias: String(cls.alias || "").trim().slice(0, 40),
      courses: Courses.summary(),
    };
  }

  // Tuodun tiedoston tarkistus: tuntemattomat kentät jätetään pois ja kaikki arvot rajataan
  function parseProgress(text) {
    let d;
    try { d = JSON.parse(text); } catch { throw new Error("json"); }
    if (!d || typeof d !== "object" || d.format !== PROGRESS_FORMAT || !Array.isArray(d.courses)) throw new Error("format");
    if (+d.version > PROGRESS_VERSION) throw new Error("version");
    const num = (v, max) => Math.max(0, Math.min(max, Math.round(+v) || 0));
    const known = new Set(Courses._courses.map((c) => c.id));
    const courses = {};
    for (const c of d.courses.slice(0, 50)) {
      if (!c || typeof c !== "object" || !known.has(c.id)) continue;
      const steps = num(c.steps, 50);
      courses[c.id] = { steps, done: Math.min(num(c.done, 50), steps), finished: c.finished === true, hints: num(c.hints, 999), skipped: num(c.skipped, 50) };
    }
    return {
      classCode: String(d.classCode || "").slice(0, 40), alias: String(d.alias || "").slice(0, 40) || "?",
      exported: Number.isFinite(Date.parse(d.exported)) ? new Date(d.exported) : null, courses,
    };
  }

  // Taulukkolaskentaan vietävä solu: kaava-alkuiset arvot muutetaan tekstiksi (CSV-injektio)
  const csvCell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function toCsv(rows) {
    const courses = Courses._courses;
    const head = [tr("Nimimerkki", "Alias"), tr("Luokkatunnus", "Class code"), tr("Viety", "Exported"), ...courses.map((c) => c.title), tr("Vihjeitä yhteensä", "Hints total")];
    const lines = rows.map((r) => [r.alias, r.classCode, r.exported ? r.exported.toISOString().slice(0, 16).replace("T", " ") : "",
      ...courses.map((c) => { const p = r.courses[c.id]; return !p ? "" : p.finished ? "100 %" : Math.round((p.done / (p.steps || 1)) * 100) + " %"; }),
      Object.values(r.courses).reduce((a, p) => a + p.hints, 0)]);
    return [head, ...lines].map((l) => l.map(csvCell).join(";")).join("\r\n");
  }

  /* ===== Tulostus ===== */
  function printHtml(title, body) {
    let area = document.getElementById("print-area");
    if (!area) { area = document.createElement("div"); area.id = "print-area"; document.body.appendChild(area); }
    area.innerHTML = `<div class="print-doc"><header><b>RoboLab</b><span>${esc(title)}</span></header>${body}
      <footer>${tr("Tulostettu RoboLabista", "Printed from RoboLab")} · ${esc(location.origin + location.pathname)}</footer></div>`;
    document.documentElement.classList.add("print-mode");
    const done = () => { document.documentElement.classList.remove("print-mode"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    // Osa selaimista ei lähetä afterprint-tapahtumaa
    setTimeout(done, 1500);
  }

  const studentLink = (L) => location.origin + location.pathname + "#/course/" + L.course;
  const list = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const tableHtml = (rows, blank) => `<table class="ws-table"><thead><tr>${rows[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}${blank && !c ? "&nbsp;" : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  function teacherDoc(L) {
    return `<h1>${tr("Oppitunti", "Lesson")} ${L.id}: ${esc(L.title)}</h1>
      <p class="doc-meta"><b>${tr("Taso", "Level")}:</b> ${esc(L.level)}<br><b>${tr("Kesto", "Duration")}:</b> ${esc(L.minutes)}<br>
        <b>${tr("Oppilaslinkki", "Student link")}:</b> ${esc(studentLink(L))}</p>
      <p>${esc(L.summary)}</p>
      <div class="doc-box"><b>${tr("Tunti lyhyesti", "The lesson in brief")}</b><ol>
        <li>${tr(`Ennen tuntia: luo luokkahuone, valitse sille kurssi ”${esc(Courses._courses.find((c) => c.id === L.course)?.title || "")}” ja tulosta monisteet.`, `Before the lesson: create a classroom, assign the course “${esc(Courses._courses.find((c) => c.id === L.course)?.title || "")}” and print the worksheets.`)}</li>
        <li>${tr("Tunnin alussa: näytä luokkakoodi isona. Oppilaat liittyvät Kurssit-sivulla koodilla ja nimimerkillä.", "At the start: show the class code large. Students join on the Courses page with the code and an alias.")}</li>
        <li>${tr("Tunnin aikana: seuraa tunnin kulkua alla ja luokkahuoneen taulukkoa. Auta oppilaita, joiden eteneminen on pysähtynyt.", "During the lesson: follow the plan below and the classroom table. Help students whose progress has stalled.")}</li>
        <li>${tr("Lopuksi: käy poistumislippu läpi. Arvioi kriteerien ja loppukokeen pisteiden avulla.", "At the end: go through the exit ticket. Assess with the criteria and the final quiz scores.")}</li>
      </ol></div>
      <h2>${tr("Oppimistavoitteet", "Learning goals")}</h2>${list(L.goals)}
      <h2>${tr("Tarvittavat välineet", "Materials")}</h2>${list(L.materials)}
      <h2>${tr("Valmistelu", "Preparation")}</h2>${list(L.prep)}
      <h2>${tr("Tunnin kulku", "Lesson plan")}</h2>
      <table class="ws-table plan"><thead><tr><th>${tr("Min", "Min")}</th><th>${tr("Vaihe", "Phase")}</th><th>${tr("Opettaja tekee", "Teacher does")}</th></tr></thead>
        <tbody>${L.plan.map((p) => `<tr><td>${esc(p.t)}</td><td><b>${esc(p.title)}</b></td><td>${esc(p.do)}</td></tr>`).join("")}</tbody></table>
      <h2>${tr("Arviointikriteerit", "Assessment criteria")}</h2>
      ${tableHtml([[tr("Taso", "Level"), tr("Oppilas…", "The student…")], ...L.rubric])}
      <h2>${tr("Lisätehtävät nopeille", "Extension for fast finishers")}</h2>${list(L.extension)}
      <h2>${tr("Ilman laitteita tai nettiä", "Without devices or internet")}</h2>${list(L.offline)}
      <p class="note">${tr("RoboLab toimii ilman nettiä, jos sivu on avattu kerran samalla laitteella ja selaimella netin ollessa päällä. Kaikki tehtävät tehdään simulaatiossa; oikeaa robottia ei tarvita.", "RoboLab works offline if the page has been opened once on the same device and browser while online. All tasks are done in simulation; no real robot is needed.")}</p>
      <h2>${tr("Käsitteet", "Key words")}</h2>${tableHtml([[tr("Käsite", "Term"), tr("Selitys", "Meaning")], ...L.words])}`;
  }

  function worksheetDoc(L) {
    return `<h1>${esc(L.title)} — ${tr("tehtävämoniste", "worksheet")}</h1>
      <p class="doc-meta">${tr("Nimi tai nimimerkki", "Name or alias")}: ____________________ &nbsp; ${tr("Pari", "Partner")}: ____________________</p>
      <p>${tr("Avaa RoboLab ja kurssi osoitteesta", "Open RoboLab and the course at")} <b>${esc(studentLink(L))}</b></p>
      ${L.tasks.map((t, i) => `<section class="ws-task"><h3>${i + 1}. ${esc(t.q)}</h3>
        ${t.table ? tableHtml(t.table, true) : ""}
        ${t.checks ? `<ul class="ws-checks">${t.checks.map((c) => `<li>☐ ${esc(c)}</li>`).join("")}</ul>` : ""}
        ${t.lines ? `<div class="ws-lines">${"<div></div>".repeat(t.lines)}</div>` : ""}</section>`).join("")}
      <h2>${tr("Sanasto", "Key words")}</h2>${tableHtml([[tr("Käsite", "Term"), tr("Selitys", "Meaning")], ...L.words])}`;
  }

  function solutionsDoc(L) {
    return `<h1>${esc(L.title)} — ${tr("ratkaisut ja arviointi", "solutions and assessment")}</h1>
      ${L.solutions.map((s) => `<p>${esc(s)}</p>`).join("")}
      <h2>${tr("Arviointikriteerit", "Assessment criteria")}</h2>
      ${tableHtml([[tr("Taso", "Level"), tr("Oppilas…", "The student…")], ...L.rubric])}`;
  }

  /* ===== Opettajan näkymä ===== */
  let roster = []; // tuodut oppilastiedostot: vain muistissa, ei tallenneta

  function render(el, tool) {
    pageEl = el;
    const courses = Courses._courses, exams = Courses.exams || {};
    el.innerHTML = `
      ${toolHead(tool)}
      <div class="card edu-intro">
        <div class="edu-intro-row">${Robots.svg("volt", "happy", { size: 64 })}
          <div><h2>${tr("Näin otat RoboLabin käyttöön luokassa", "How to use RoboLab in your class")}</h2>
          <p>${tr("Oppilaat tarvitsevat vain selaimen ja luokkakoodin: ei tilejä, sähköposteja eikä asennuksia. Sinä näet luokkahuoneesta, kuka on aloittanut, kuka on valmis ja miten loppukokeet menivät.",
            "Students only need a browser and the class code: no accounts, emails or installs. In the classroom you see who has started, who has finished and how the final quizzes went.")}</p></div></div>
        <ol class="edu-guide">
          <li><b>${tr("Luo luokkahuone", "Create a classroom")}</b>
            <span>${tr("Kirjaudu pilvitilille (Teacher-taso) ja luo luokka alla. Saat 8-merkkisen luokkakoodin.", "Sign in to your cloud account (Teacher plan) and create a class below. You get an 8-character class code.")}</span>
            <button class="link-btn" data-edu="jump" data-to="edu-sec-classes">${tr("Luokkahuoneet ↓", "Classrooms ↓")}</button></li>
          <li><b>${tr("Valitse kurssit", "Pick the courses")}</b>
            <span>${tr("Avaa luokkahuone ja valitse kurssit, jotka luokan pitää suorittaa, sekä halutessasi palautuspäivä. Kurssien kesto ja tavoitteet ovat alla.", "Open the classroom and choose the courses the class must complete, plus a due date if you like. Course durations and goals are listed below.")}</span>
            <button class="link-btn" data-edu="jump" data-to="edu-sec-courses">${tr("Kurssit ↓", "Courses ↓")}</button></li>
          <li><b>${tr("Jaa koodi oppilaille", "Share the code with students")}</b>
            <span>${tr("Näytä koodi isona heijastimella. Oppilaat avaavat RoboLabin, menevät Kurssit-sivulle ja kirjoittavat koodin ja nimimerkin (ei koko nimeä).", "Show the code large on the projector. Students open RoboLab, go to the Courses page and type the code and an alias (not their full name).")}</span></li>
          <li><b>${tr("Seuraa edistymistä", "Follow progress")}</b>
            <span>${tr("Luokkahuone päivittyy itsestään. ✓ tarkoittaa suoritettua kurssia, ja luku sen vieressä on loppukokeen pisteet. Oppilaiden kurssit avautuvat Education-tasolla.", "The classroom updates by itself. ✓ means a completed course, and the number beside it is the final quiz score. Students' courses unlock at the Education level.")}</span></li>
          <li><b>${tr("Valmis tuntisuunnitelma (valinnainen)", "A ready lesson plan (optional)")}</b>
            <span>${tr("Oppitunneissa A–C on tunnin kulku minuutteineen, tulostettava moniste, ratkaisut ja arviointikriteerit.", "Lessons A–C include a minute-by-minute plan, a printable worksheet, solutions and assessment criteria.")}</span>
            <button class="link-btn" data-edu="jump" data-to="edu-sec-lessons">${tr("Oppitunnit ↓", "Lessons ↓")}</button></li>
        </ol>
        <details class="edu-faq"><summary>${tr("Usein kysyttyä", "Frequently asked questions")}</summary>
          <dl>
            <dt>${tr("Mitä oppilaista tallennetaan?", "What is stored about students?")}</dt>
            <dd>${tr("Nimimerkki, satunnainen laitetunnus ja kurssien eteneminen (vaiheet, vihjeiden määrä ja loppukokeen pisteet). Ei nimiä, sähköposteja, vastauksia eikä projekteja. Tiedot ovat EU:ssa ja poistuvat, kun poistat oppilaan tai luokan.", "An alias, a random device ID and course progress (steps, number of hints and final quiz score). No names, emails, answers or projects. The data is stored in the EU and is deleted when you remove the student or the class.")}</dd>
            <dt>${tr("Oppilaan edistyminen ei näy.", "A student's progress doesn't show.")}</dt>
            <dd>${tr("Eteneminen lähtee muutaman sekunnin viiveellä, kun oppilaan laite on netissä. Ilman nettiä se lähtee, kun yhteys palaa. Paina luokkahuoneessa Päivitä.", "Progress is sent a few seconds after a change while the student's device is online. Offline, it is sent when the connection returns. Press Refresh in the classroom.")}</dd>
            <dt>${tr("Oppilas vaihtaa laitetta.", "A student switches devices.")}</dt>
            <dd>${tr("Jokainen laite on oma paikkansa, ja eteneminen on tallennettu laitteelle. Oppilas voi liittyä uudella laitteella samalla nimimerkillä. Poista vanha laite listasta, jos paikat loppuvat.", "Each device takes its own seat, and progress is stored on the device. The student can join on the new device with the same alias. Remove the old device from the list if you run out of seats.")}</dd>
            <dt>${tr("Paikat loppuivat.", "Out of seats.")}</dt>
            <dd>${tr("Poista vanhoja oppilaita tai luokkia, tai osta lisää oppilaspaikkoja Tasot-sivulta.", "Remove old students or classes, or buy more student seats on the Plans page.")}</dd>
            <dt>${tr("Entä jos koulun koneet eivät saa yhteyttä pilveen?", "What if the school's computers can't reach the cloud?")}</dt>
            <dd>${tr("Oppilaat voivat palauttaa edistymisensä tiedostona Kurssit-sivun lopusta, ja sinä tuot tiedostot tämän sivun lopussa.", "Students can hand in their progress as a file at the end of the Courses page, and you import the files at the end of this page.")}</dd>
          </dl></details>
      </div>

      <h2 class="section-title" id="edu-sec-classes">${tr("Luokkahuoneet", "Classrooms")}</h2>
      <div class="card" id="edu-classes">${classesIntroHtml()}</div>

      <h2 class="section-title" id="edu-sec-courses">${tr("Kurssit opetuksessa", "Courses for teaching")}</h2>
      <div class="card edu-table-wrap">
        <p class="note">${tr("Jokainen kurssi on itsenäinen oppitunti. Oppilas etenee robottioppaan kanssa vaihe kerrallaan; tehtävät tarkistetaan automaattisesti, ja lopussa on kolmen kysymyksen loppukoe. Kurssin suorittaa, kun vaiheet ja loppukoe on tehty.",
          "Every course is a stand-alone lesson. Students go step by step with a robot guide; tasks are checked automatically, and there is a three-question final quiz at the end. A course is completed when the steps and the final quiz are done.")}</p>
        <table class="ws-table edu-courses"><thead><tr><th>#</th><th>${tr("Kurssi ja tavoitteet", "Course and goals")}</th><th>${tr("Taso", "Level")}</th><th>${tr("Kesto", "Time")}</th><th>${tr("Vaiheet", "Steps")}</th><th></th></tr></thead>
          <tbody>${courses.map((c, i) => `<tr><td>${i + 1}</td><td><b>${esc(c.title)}</b><br><small>${esc(c.desc)}</small>
              <ul class="edu-outcomes">${c.outcomes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></td>
            <td>${esc(c.level)}${window.Plans ? `<br>${Plans.badge(Plans.tierForCourse(c.id))}` : ""}</td><td>~${c.minutes} min</td><td>${c.steps.length}${exams[c.id] ? ` + ${tr("koe", "quiz")}` : ""}</td>
            <td><button class="btn small" data-edu="copy" data-c="${c.id}">${tr("Kopioi linkki", "Copy link")}</button></td></tr>`).join("")}</tbody></table>
      </div>

      <h2 class="section-title" id="edu-sec-lessons">${tr("Valmiit oppitunnit", "Ready-made lessons")}</h2>
      <div class="edu-lessons">${LESSONS.map((L) => `
        <article class="card edu-lesson">
          <div class="edu-lesson-top">${Robots.svg(L.guide, "idle", { size: 56 })}
            <div><small>${tr("Oppitunti", "Lesson")} ${L.id}</small><h3>${esc(L.title)}</h3><small>${esc(L.minutes)}</small></div></div>
          <p>${esc(L.summary)}</p>
          <p class="note">${esc(L.level)}</p>
          <div class="row-actions">
            <button class="btn primary" data-edu="open" data-id="${L.id}">${tr("Avaa oppitunti", "Open lesson")}</button>
          </div>
        </article>`).join("")}</div>
      <div id="edu-detail"></div>

      <h2 class="section-title" id="edu-sec-progress">${tr("Edistyminen tiedostoista (ilman pilveä)", "Progress from files (without the cloud)")}</h2>
      <div class="card">
        <p>${tr("Jos luokkahuone ei ole käytössä, oppilas valitsee Kurssit-sivun lopusta 'Palauta edistyminen opettajalle', kirjoittaa luokkatunnuksen ja nimimerkin ja tallentaa tiedoston. Kerää tiedostot esimerkiksi oppimisalustan palautuskansioon ja tuo ne tähän.",
          "If you don't use a classroom, the student picks 'Hand in progress to the teacher' at the end of the Courses page, types the class code and an alias, and saves the file. Collect the files, e.g. in your learning platform's hand-in folder, and import them here.")}</p>
        <div class="alert info"><b>i</b><span>${tr("Tietosuoja: tiedostossa on vain kurssien eteneminen ja vihjeiden määrä — ei nimiä, projekteja, vastauksia eikä tilin tietoja. Tuodut tiedot pysyvät vain tässä selainikkunassa eivätkä tallennu mihinkään; ne katoavat, kun suljet sivun.",
          "Privacy: the file only contains course progress and the number of hints — no names, projects, answers or account details. Imported data stays only in this browser window and is not saved anywhere; it disappears when you close the page.")}</span></div>
        <div class="row-actions">
          <label class="btn primary">${tr("Tuo oppilaiden tiedostot…", "Import student files…")}<input type="file" id="edu-import" accept=".json,application/json" multiple hidden></label>
          <button class="btn" data-edu="csv" ${roster.length ? "" : "disabled"}>${tr("Vie CSV-taulukoksi", "Export as CSV")}</button>
          <button class="btn" data-edu="clear" ${roster.length ? "" : "disabled"}>${tr("Tyhjennä", "Clear")}</button>
        </div>
        <div id="edu-roster">${rosterHtml()}</div>
      </div>
      <p class="note" style="margin-top:var(--pad)">${tr("Haluatko pilotoida RoboLabia luokassasi tai kertoa, mitä tarvitsisit? ", "Want to pilot RoboLab in your class or tell us what you need? ")}
        <a href="https://github.com/0ippi/RoboLab/blob/main/docs/koulut-ja-tuotteistus.md" target="_blank" rel="noopener">${tr("Pilottiohjelma ja kysely", "Pilot programme and survey")}</a> ·
        <a href="https://github.com/0ippi/RoboLab/issues" target="_blank" rel="noopener">${tr("Ota yhteyttä / anna palautetta", "Contact / give feedback")}</a></p>`;
    el.onclick = onClick;
    el.onchange = onChange;
    el.querySelector("#edu-import").onchange = (e) => importFiles([...e.target.files], el);
    if (room) openRoom(room.code); else loadClasses(el);
  }

  /* ===== Luokkahuoneet (Supabase: create_class, my_classes, delete_class, class_overview, set_class_courses, remove_student) =====
     Oppilas liittyy Kurssit- tai Tasot-sivulla luokkakoodilla ja nimimerkillä; eteneminen tulee tänne automaattisesti. */
  let pageEl = null, room = null, roomTimer = 0;
  function classesIntroHtml() {
    if (!window.Cloud?.configured) return `<p class="note">${tr("Luokkahuoneet vaativat pilvipalvelun, jota ei ole otettu käyttöön tässä RoboLabissa.", "Classrooms need the cloud service, which is not set up in this RoboLab.")}</p>`;
    if (!Accounts.current()?.cloud) return `<p>${tr("Luokkahuoneessa oppilaat liittyvät luokkakoodilla ja nimimerkillä ilman tilejä, ja sinä näet heidän etenemisensä. Kirjaudu ensin pilvitilille, jolla on Teacher-taso.", "In a classroom students join with the class code and an alias without accounts, and you see their progress. First sign in with a cloud account on the Teacher plan.")}</p>
      <div class="row-actions"><button class="btn primary" data-edu="cloud-login">☁ ${tr("Kirjaudu pilvitilille", "Sign in to your cloud account")}</button></div>`;
    return `<p class="note">${tr("Ladataan luokkia…", "Loading classes…")}</p>`;
  }

  const dateFmt = (d) => new Date(d).toLocaleDateString(tr("fi-FI", "en-GB"));
  function ago(t) {
    const s = (Date.now() - Date.parse(t)) / 1000;
    if (!(s >= 0)) return "–";
    if (s < 90) return tr("juuri nyt", "just now");
    if (s < 3600) return tr(`${Math.round(s / 60)} min sitten`, `${Math.round(s / 60)} min ago`);
    if (s < 86400) return tr(`${Math.round(s / 3600)} h sitten`, `${Math.round(s / 3600)} h ago`);
    return dateFmt(t);
  }

  async function loadClasses(el) {
    clearInterval(roomTimer);
    room = null;
    const box = el.querySelector("#edu-classes");
    if (!box || !window.Cloud?.configured || !Accounts.current()?.cloud) return;
    const src = Plans.current().sources.find((s) => s.from === "account" && s.plan === "teacher" || s.from === "test");
    let classes = [];
    try { classes = (await Cloud.rpc("my_classes")) || []; }
    catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}</p>`; return; }
    const allowed = Plans.PRICES.teacher.included + (src?.seats || 0);
    const active = classes.filter((c) => Date.parse(c.valid_until) > Date.now());
    const used = active.reduce((a, c) => a + c.seats, 0);
    box.innerHTML = `
      ${src ? "" : `<div class="alert info"><b>i</b><span>${tr("Luokkahuoneiden luonti vaatii Teacher-tason. ", "Creating classrooms needs the Teacher plan. ")}<a href="#/plans">${tr("Katso tasot", "See plans")}</a></span></div>`}
      ${classes.length ? `<div class="room-list">${classes.map((c) => `
        <div class="room-card">
          <div><b>${esc(c.name || tr("Nimetön luokka", "Unnamed class"))}</b>
            <small>${tr("Koodi", "Code")} <b class="class-code">${esc(c.code)}</b> · ${tr(`${c.used} / ${c.seats} oppilasta`, `${c.used} / ${c.seats} students`)} · ${tr("voimassa", "valid until")} ${dateFmt(c.valid_until)}</small></div>
          <div class="row-actions">
            <button class="btn primary small" data-edu="open-room" data-c="${esc(c.code)}">${tr("Avaa luokkahuone", "Open classroom")} →</button>
            <button class="link-btn" data-edu="del-class" data-c="${esc(c.code)}">${tr("Poista", "Delete")}</button>
          </div></div>`).join("")}</div>`
        : `<p class="note">${tr("Ei vielä luokkia. Luo ensimmäinen alla.", "No classes yet. Create the first one below.")}</p>`}
      ${src ? `<h3 class="card-title" style="margin-top:var(--pad)">${tr("Uusi luokkahuone", "New classroom")}</h3>
        <form class="class-fields" id="edu-newclass">
        <label>${tr("Luokan nimi", "Class name")}<input id="edu-cname" maxlength="60" placeholder="${tr("esim. 7B robotiikka", "e.g. 7B robotics")}"></label>
        <label>${tr("Oppilaita", "Students")}<input id="edu-cseats" type="number" min="1" max="${Math.max(1, allowed - used)}" value="${Math.max(1, Math.min(25, allowed - used))}"></label>
        <button class="btn primary" ${allowed - used < 1 ? "disabled" : ""}>${tr("Luo luokkahuone", "Create classroom")}</button></form>
        <p class="note">${tr(`Oppilaspaikkoja käytössä ${used} / ${allowed}. Yksi paikka = yksi oppilaan laite.`, `Student seats in use ${used} / ${allowed}. One seat = one student device.`)}
        ${allowed - used < 1 ? tr(" Kaikki paikat ovat käytössä: osta lisää oppilaspaikkoja Tasot-sivulta tai poista vanha luokka.", " All seats are in use: buy more student seats on the Plans page or delete an old class.") : ""}</p>` : ""}`;
    const form = box.querySelector("#edu-newclass");
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      form.querySelector("button").disabled = true;
      try {
        const r = await Cloud.rpc("create_class", { p_name: form.querySelector("#edu-cname").value.trim(), p_seats: Math.round(+form.querySelector("#edu-cseats").value) });
        toast(tr(`Luokkahuone luotu. Luokkakoodi: ${r.code}`, `Classroom created. Class code: ${r.code}`));
        openRoom(r.code);
        return;
      } catch (err) {
        const m = String(err.raw || err.message);
        toast(/not-teacher/.test(m) ? tr("Luokkahuoneet vaativat Teacher-tason.", "Classrooms need the Teacher plan.") : /no-seats/.test(m) ? tr("Oppilaspaikat eivät riitä.", "Not enough student seats.") : err.message);
      }
      loadClasses(el);
    };
  }

  // Luokkahuone: annetut kurssit ja oppilaiden eteneminen. Päivittyy 20 sekunnin välein, kun näkymä on auki.
  async function openRoom(code, { quiet = false } = {}) {
    const box = pageEl?.querySelector("#edu-classes");
    if (!box) return;
    if (!quiet) box.innerHTML = `<p class="note">${tr("Ladataan luokkahuonetta…", "Loading the classroom…")}</p>`;
    let d;
    try { d = await Cloud.rpc("class_overview", { p_code: code }); }
    catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}</p><button class="btn" data-edu="room-back">← ${tr("Kaikki luokat", "All classes")}</button>`; return; }
    if (!pageEl?.isConnected || currentRoute() !== "teach") return;
    const editing = box.querySelector(".room-assign[open]") ? true : false;
    room = { code, data: d };
    if (quiet && editing) { box.querySelector("#room-table").innerHTML = roomTableHtml(d); return; } // ei häiritä kesken valintojen
    box.innerHTML = roomHtml(d);
    clearInterval(roomTimer);
    roomTimer = setInterval(() => {
      if (!pageEl?.isConnected || currentRoute() !== "teach" || !room) { clearInterval(roomTimer); return; }
      if (!document.hidden) openRoom(room.code, { quiet: true });
    }, 20000);
  }

  // Sarakkeet: annetut kurssit, tai jos niitä ei ole, kurssit, joita joku oppilas on aloittanut
  function roomCourses(d) {
    const all = Courses._courses;
    const assigned = (d.courses || []).map((a) => ({ ...a, course: all.find((c) => c.id === a.id) })).filter((a) => a.course);
    if (assigned.length) return assigned;
    return all.filter((c) => d.students.some((s) => s.progress.some((p) => p.course === c.id))).map((c) => ({ id: c.id, due: null, course: c }));
  }

  function roomTableHtml(d) {
    const cols = roomCourses(d), today = new Date().toISOString().slice(0, 10);
    if (!d.students.length) return `<div class="room-empty">${Robots.svg("zippy", "happy", { size: 56 })}<p>${tr("Ei vielä oppilaita. Näytä luokkakoodi oppilaille: he kirjoittavat sen ja nimimerkin RoboLabin Kurssit-sivulla.", "No students yet. Show the class code to your students: they type it and an alias on RoboLab's Courses page.")}</p></div>`;
    const cell = (s, a) => {
      const p = s.progress.find((x) => x.course === a.id);
      const late = a.due && a.due < today && !p?.finished;
      if (!p) return `<td class="${late ? "late" : "none"}">–</td>`;
      if (p.finished) return `<td class="done" title="${tr("Suoritettu", "Completed")} ${ago(p.updated)}">✓${p.score != null ? ` <small>${p.score}/${p.score_max ?? "?"}</small>` : ""}</td>`;
      const pct = Math.round((p.done / (p.steps || 1)) * 100);
      return `<td class="${late ? "late" : "part"}" title="${p.done}/${p.steps} ${tr("vaihetta", "steps")}, ${p.hints} ${tr("vihjettä", "hints")}"><div class="mini-bar"><span style="width:${pct}%"></span></div><small>${p.done}/${p.steps}</small></td>`;
    };
    return `<div class="edu-table-wrap"><table class="ws-table room-table">
      <thead><tr><th>${tr("Oppilas", "Student")}</th>${cols.map((a) => `<th title="${esc(a.course.title)}">${esc(a.course.title.split(":")[0])}${a.due ? `<br><small>${tr("pal.", "due")} ${new Date(a.due + "T12:00").toLocaleDateString(tr("fi-FI", "en-GB"), { day: "numeric", month: "numeric" })}</small>` : ""}</th>`).join("")}<th>${tr("Viimeksi", "Last seen")}</th><th></th></tr></thead>
      <tbody>${d.students.map((s) => `<tr><td><b>${esc(s.alias || "?")}</b></td>${cols.map((a) => cell(s, a)).join("")}<td><small>${ago(s.seen)}</small></td>
        <td><button class="link-btn" data-edu="room-remove" data-dev="${esc(s.device)}" data-alias="${esc(s.alias || "")}" aria-label="${tr("Poista oppilas", "Remove student")}">✕</button></td></tr>`).join("")}</tbody>
      <tfoot><tr><td>${tr("Suorittaneita", "Completed")}</td>${cols.map((a) => `<td>${d.students.filter((s) => s.progress.some((p) => p.course === a.id && p.finished)).length} / ${d.students.length}</td>`).join("")}<td colspan="2"></td></tr></tfoot>
    </table></div>
    <p class="note small">${tr("✓ = kurssi suoritettu ja loppukokeen pisteet. Palkki = tehdyt vaiheet. Punainen = palautuspäivä mennyt eikä kurssia ole suoritettu.", "✓ = course completed with the final quiz score. Bar = steps done. Red = the due date has passed and the course isn't completed.")}</p>`;
  }

  function roomHtml(d) {
    const assigned = new Map((d.courses || []).map((a) => [a.id, a.due]));
    return `<div class="room">
      <div class="room-head">
        <button class="btn small" data-edu="room-back">← ${tr("Kaikki luokat", "All classes")}</button>
        <div><h3>${esc(d.name || tr("Nimetön luokka", "Unnamed class"))}</h3>
          <small>${tr(`${d.students.length} / ${d.seats} oppilasta`, `${d.students.length} / ${d.seats} students`)} · ${tr("voimassa", "valid until")} ${dateFmt(d.valid_until)}</small></div>
        <div class="room-code"><span>${tr("Luokkakoodi", "Class code")}</span><b class="class-code">${esc(d.code)}</b>
          <div class="row-actions"><button class="btn small" data-edu="copy-code" data-c="${esc(d.code)}">${tr("Kopioi", "Copy")}</button>
            <button class="btn small primary" data-edu="show-code">⛶ ${tr("Näytä isona", "Show large")}</button></div></div>
      </div>
      <details class="room-assign" ${assigned.size ? "" : "open"}>
        <summary><b>${tr("Luokan kurssit", "Class courses")}</b> · ${assigned.size ? tr(`${assigned.size} valittu`, `${assigned.size} selected`) : tr("valitse kurssit, jotka luokan pitää suorittaa", "choose the courses the class must complete")}</summary>
        <p class="note">${tr("Valitut kurssit näkyvät oppilaille Kurssit-sivun alussa järjestyksessä. Palautuspäivä on vapaaehtoinen.", "The selected courses show to students at the top of the Courses page in order. The due date is optional.")}</p>
        <div class="assign-list">${Courses._courses.map((c) => `<label class="assign-row">
          <input type="checkbox" data-assign="${c.id}" ${assigned.has(c.id) ? "checked" : ""}>
          <span><b>${esc(c.title)}</b><small>${esc(c.level)} · ~${c.minutes} min</small></span>
          <input type="date" data-due="${c.id}" value="${esc(assigned.get(c.id) || "")}" aria-label="${tr("Palautuspäivä", "Due date")}"></label>`).join("")}</div>
        <div class="row-actions"><button class="btn primary" data-edu="room-save">${tr("Tallenna kurssit", "Save courses")}</button></div>
      </details>
      <div class="room-bar"><h4>${tr("Oppilaiden eteneminen", "Student progress")}</h4>
        <div class="row-actions"><button class="btn small" data-edu="room-refresh">↻ ${tr("Päivitä", "Refresh")}</button>
          <button class="btn small" data-edu="room-csv" ${d.students.length ? "" : "disabled"}>${tr("Vie CSV", "Export CSV")}</button></div></div>
      <div id="room-table">${roomTableHtml(d)}</div>
    </div>`;
  }

  // Luokkakoodi isona heijastimelle, ohjeineen
  function showCode(d) {
    const ov = document.createElement("div");
    ov.className = "code-overlay";
    ov.setAttribute("role", "dialog");
    ov.innerHTML = `<div class="code-box">
      <p>${tr("1. Avaa", "1. Open")} <b>${esc(location.origin + location.pathname)}</b></p>
      <p>${tr("2. Mene Kurssit-sivulle ja kirjoita luokkakoodi ja nimimerkki", "2. Go to the Courses page and type the class code and an alias")}</p>
      <div class="big-code">${esc(d.code.slice(0, 4))} ${esc(d.code.slice(4))}</div>
      <p class="note">${esc(d.name || "")}</p>
      <button class="btn primary" data-close>${tr("Sulje", "Close")}</button></div>`;
    document.body.append(ov);
    const close = () => ov.remove();
    ov.onclick = (e) => { if (e.target === ov || e.target.closest("[data-close]")) close(); };
    ov.querySelector("[data-close]").focus();
    document.addEventListener("keydown", function esc1(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc1); } });
  }

  function roomCsv(d) {
    const cols = roomCourses(d);
    const head = [tr("Nimimerkki", "Alias"), tr("Viimeksi", "Last seen"), ...cols.map((a) => a.course.title), ...cols.map((a) => `${a.course.title} – ${tr("loppukoe", "final quiz")}`)];
    const rows = d.students.map((s) => {
      const ps = cols.map((a) => s.progress.find((p) => p.course === a.id));
      return [s.alias, s.seen ? new Date(s.seen).toISOString().slice(0, 16).replace("T", " ") : "",
        ...ps.map((p) => (!p ? "" : p.finished ? "100 %" : Math.round((p.done / (p.steps || 1)) * 100) + " %")),
        ...ps.map((p) => (p?.score != null ? `${p.score}/${p.score_max ?? ""}` : ""))];
    });
    return [head, ...rows].map((l) => l.map(csvCell).join(";")).join("\r\n");
  }

  function onChange(e) {
    // Palautuspäivän valinta merkitsee kurssin valituksi
    const due = e.target.closest("[data-due]");
    if (due && due.value) { const cb = pageEl.querySelector(`[data-assign="${due.dataset.due}"]`); if (cb) cb.checked = true; }
  }

  function rosterHtml() {
    if (!roster.length) return `<p class="note">${tr("Ei vielä tuotuja tiedostoja.", "No files imported yet.")}</p>`;
    const courses = Courses._courses.filter((c) => roster.some((r) => r.courses[c.id]));
    const cell = (p) => !p ? "–" : p.finished ? "✓" : `${p.done}/${p.steps}`;
    return `<div class="edu-table-wrap"><table class="ws-table edu-roster"><thead><tr><th>${tr("Nimimerkki", "Alias")}</th><th>${tr("Luokka", "Class")}</th>
      ${courses.map((c) => `<th title="${esc(c.title)}">${esc(c.title.split(":")[0])}</th>`).join("")}<th>${tr("Vihjeet", "Hints")}</th></tr></thead>
      <tbody>${roster.map((r) => `<tr><td><b>${esc(r.alias)}</b></td><td>${esc(r.classCode)}</td>
        ${courses.map((c) => `<td>${cell(r.courses[c.id])}</td>`).join("")}
        <td>${Object.values(r.courses).reduce((a, p) => a + p.hints, 0)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">${tr("✓ = kurssi suoritettu, 3/5 = tehtyjä vaiheita. Paljon vihjeitä voi kertoa, että vaihe oli vaikea.", "✓ = course completed, 3/5 = steps done. Many hints can mean a step was hard.")}</p>`;
  }

  async function importFiles(files, el) {
    let ok = 0, bad = 0;
    for (const f of files) {
      try {
        if (f.size > MAX_FILE) throw new Error("size");
        const r = parseProgress(await f.text());
        // Sama oppilas uudelleen: uusin tiedosto korvaa vanhan
        const i = roster.findIndex((x) => x.alias === r.alias && x.classCode === r.classCode);
        if (i >= 0) roster[i] = r; else roster.push(r);
        ok++;
      } catch { bad++; }
    }
    roster.sort((a, b) => a.alias.localeCompare(b.alias, undefined, { numeric: true }));
    render(el, TOOLS.find((t) => t.id === "teach"));
    toast(tr(`Tuotu ${ok} tiedostoa`, `Imported ${ok} files`) + (bad ? tr(` · ${bad} ei ollut RoboLabin edistymistiedosto`, ` · ${bad} were not RoboLab progress files`) : ""));
  }

  function onClick(e) {
    const b = e.target.closest("[data-edu]");
    if (!b) return;
    const L = LESSONS.find((x) => x.id === b.dataset.id);
    const act = b.dataset.edu;
    if (act === "jump") { document.getElementById(b.dataset.to)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (act === "open" && L) { showDetail(L); return; }
    if (act === "start" && L) { Courses.start(L.course); return; }
    if (act === "print-teacher" && L) { printHtml(L.title, teacherDoc(L)); return; }
    if (act === "print-sheet" && L) { printHtml(L.title, worksheetDoc(L)); return; }
    if (act === "print-sol" && L) { printHtml(L.title, solutionsDoc(L)); return; }
    if (act === "copy") { copyLink(location.origin + location.pathname + "#/course/" + (L ? L.course : b.dataset.c)); return; }
    if (act === "cloud-login") { AccountsUI.showLogin("cloud"); return; }
    if (act === "copy-code") { copyLink(b.dataset.c); return; }
    if (act === "open-room") { openRoom(b.dataset.c); return; }
    if (act === "room-back") { loadClasses(pageEl); return; }
    if (act === "room-refresh" && room) { openRoom(room.code); return; }
    if (act === "show-code" && room) { showCode(room.data); return; }
    if (act === "room-csv" && room) { downloadFile(`robolab-${(room.data.name || room.code).replace(/[^\w\-åäöÅÄÖ]+/g, "_").slice(0, 30)}.csv`, "﻿" + roomCsv(room.data), "text/csv"); return; }
    if (act === "room-save" && room) {
      const courses = [...pageEl.querySelectorAll("[data-assign]:checked")].map((cb) => ({ id: cb.dataset.assign, due: pageEl.querySelector(`[data-due="${cb.dataset.assign}"]`)?.value || null }));
      b.disabled = true;
      Cloud.rpc("set_class_courses", { p_code: room.code, p_courses: courses })
        .then(() => { toast(tr(`Luokan kurssit tallennettu (${courses.length}). Oppilaat näkevät ne seuraavalla tarkistuksella.`, `Class courses saved (${courses.length}). Students see them at their next check.`)); openRoom(room.code); },
          (err) => { toast(err.message); b.disabled = false; });
      return;
    }
    if (act === "room-remove" && room) {
      if (!confirm(tr(`Poistetaanko oppilas "${b.dataset.alias}" luokasta? Hänen etenemisensä poistuu tästä näkymästä ja paikka vapautuu.`, `Remove student "${b.dataset.alias}" from the class? Their progress is removed from this view and the seat is freed.`))) return;
      Cloud.rpc("remove_student", { p_code: room.code, p_device: b.dataset.dev }).then(() => openRoom(room.code), (err) => toast(err.message));
      return;
    }
    if (act === "del-class") {
      if (!confirm(tr(`Poistetaanko luokkakoodi ${b.dataset.c}? Oppilaiden Education-taso päättyy, kun heidän laitteensa seuraavan kerran tarkistaa koodin.`, `Delete class code ${b.dataset.c}? Students lose the Education plan the next time their device checks the code.`))) return;
      Cloud.rpc("delete_class", { p_code: b.dataset.c }).then(() => loadClasses(e.currentTarget || document.querySelector("#content")), (err) => toast(err.message)).finally(() => loadClasses(document.querySelector("#content")));
      return;
    }
    if (act === "csv") { downloadFile("robolab-luokka.csv", "﻿" + toCsv(roster), "text/csv"); return; }
    if (act === "clear") { roster = []; render(e.currentTarget, TOOLS.find((t) => t.id === "teach")); return; }
  }

  function copyLink(url) {
    const fallback = () => prompt(tr("Kopioi linkki:", "Copy the link:"), url);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast(tr("Linkki kopioitu", "Link copied")), fallback);
    else fallback();
  }

  function showDetail(L) {
    const box = document.getElementById("edu-detail");
    if (!box) return;
    box.innerHTML = `<section class="card edu-detail" aria-labelledby="edu-d-title">
      <div class="edu-detail-head"><h2 id="edu-d-title">${tr("Oppitunti", "Lesson")} ${L.id}: ${esc(L.title)}</h2>
        <div class="row-actions">
          <button class="btn primary" data-edu="start" data-id="${L.id}">▶ ${tr("Kokeile oppilaan tehtävää", "Try the student task")}</button>
          <button class="btn" data-edu="copy" data-id="${L.id}">${tr("Kopioi oppilaslinkki", "Copy student link")}</button>
          <button class="btn" data-edu="print-teacher" data-id="${L.id}">🖨 ${tr("Opettajan ohje", "Teacher guide")}</button>
          <button class="btn" data-edu="print-sheet" data-id="${L.id}">🖨 ${tr("Oppilaan moniste", "Student worksheet")}</button>
          <button class="btn" data-edu="print-sol" data-id="${L.id}">🖨 ${tr("Ratkaisut", "Solutions")}</button>
        </div></div>
      <div class="edu-doc">${teacherDoc(L)}
        <h2>${tr("Oppilaan tehtävät", "Student tasks")}</h2><ol>${L.tasks.map((t) => `<li>${esc(t.q)}</li>`).join("")}</ol>
        <details><summary>${tr("Näytä ratkaisut", "Show solutions")}</summary>${solutionsDoc(L)}</details>
      </div></section>`;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ===== Oppilaan puoli: palautus Kurssit-sivulla ===== */
  function studentCardHtml() {
    if (window.Plans?.classInfo?.()) return ""; // luokkahuoneessa eteneminen menee opettajalle automaattisesti
    const c = readClass();
    return `<section class="card class-card" aria-labelledby="cls-title">
      <h2 id="cls-title">${tr("Palauta edistyminen opettajalle", "Hand in progress to the teacher")}</h2>
      <p class="note">${tr("Jos opettaja pyysi, kirjoita luokkatunnus ja nimimerkki (ei koko nimeä) ja lataa tiedosto. Tiedostossa on vain kurssien eteneminen.", "If your teacher asked, type the class code and an alias (not your full name) and download the file. The file only contains your course progress.")}</p>
      <div class="class-fields">
        <label>${tr("Luokkatunnus", "Class code")}<input id="cls-code" maxlength="40" value="${esc(c.code)}" placeholder="${tr("esim. 7B-robo", "e.g. 7B-robo")}"></label>
        <label>${tr("Nimimerkki", "Alias")}<input id="cls-alias" maxlength="40" value="${esc(c.alias)}" placeholder="${tr("esim. oppilas 12", "e.g. student 12")}"></label>
        <button class="btn primary" id="cls-export">${tr("Lataa edistymistiedosto", "Download progress file")}</button>
      </div></section>`;
  }
  function bindStudentCard(root) {
    const btn = root.querySelector("#cls-export");
    if (!btn) return;
    btn.onclick = () => {
      const cls = { code: root.querySelector("#cls-code").value.trim(), alias: root.querySelector("#cls-alias").value.trim() };
      if (!cls.alias) { toast(tr("Kirjoita nimimerkki, jotta opettaja tunnistaa tiedoston.", "Type an alias so the teacher can tell the files apart.")); return; }
      writeClass(cls);
      const safe = (s) => s.replace(/[^\w\-åäöÅÄÖ]+/g, "_").slice(0, 30);
      downloadFile(`robolab-${safe(cls.code || "luokka")}-${safe(cls.alias)}.json`, JSON.stringify(buildProgress(cls), null, 2));
    };
  }

  TOOL_IMPL.teach = { render, unmount() { clearInterval(roomTimer); } };

  return { LESSONS, parseProgress, buildProgress, toCsv, csvCell, studentCardHtml, bindStudentCard, teacherDoc, worksheetDoc, solutionsDoc };
})();
window.Education = Education;
