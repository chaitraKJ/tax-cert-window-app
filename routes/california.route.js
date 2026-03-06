const express = require("express");

const los_angeles_search = require("../controllers/CA/los_angeles.controller.js");
const san_diego_search = require("../controllers/CA/san_diego.controller.js");
const contra_costa_search = require("../controllers/CA/contra_costa.controller.js");
const common123_search = require("../controllers/CA/common123.controller.js");

const santaClara_search = require("../controllers/CA/santaClara.controller.js");
const common2_search = require("../controllers/CA/commonCA2.controller.js");
const riverside_search = require("../controllers/CA/riverside.controller.js");
const santaCruz_search = require("../controllers/CA/santaCruz.controller.js");
const sanLuisObispo_search = require("../controllers/CA/sanLuisObispo.controller.js");
const alameda_search = require("../controllers/CA/alameda.controller.js");
const common1_search = require("../controllers/CA/commonCA1.controller.js");
const common_search = require("../controllers/CA/common.controller.js");
const ventura_search = require("../controllers/CA/ventura.controller.js");
const fresno_search = require("../controllers/CA/fresno.controller.js");
const san_bernardino_search = require("../controllers/CA/san_bernardino.controller.js");
// const kern_search = require("../controllers/CA/kern.controller.js)";
// const orange_search = require("../controllers/CA/orange.controller.js)";

const route = express.Router()

route.post("/los-angeles", los_angeles_search.search);
route.post("/san-diego", san_diego_search.search);
route.post("/contra-costa", contra_costa_search.search);

route.post("/monterey", common123_search.search);
route.post("/trinity", common123_search.search);
route.post("/yolo", common123_search.search);
route.post("/butte", common123_search.search);
route.post("/imperial", common123_search.search);
route.post("/tuolumne", common123_search.search);
route.post("/amador", common123_search.search);
route.post("/kings", common123_search.search);
route.post("/mono", common123_search.search);
route.post("/san-benito", common123_search.search);
route.post("/placer", common123_search.search);
route.post("/lake", common123_search.search);
route.post("/tulare", common123_search.search);
route.post("/del-norte", common123_search.search);
route.post("/stanislaus", common123_search.search);
route.post("/napa", common123_search.search);
route.post("/nevada", common123_search.search);
route.post("/shasta", common123_search.search);
route.post("/sonoma", common123_search.search);
route.post("/modoc", common123_search.search);
route.post("/siskiyou", common123_search.search);
route.post("/calaveras", common123_search.search);
route.post("/madera", common123_search.search);
route.post("/merced", common123_search.search);
route.post("/plumas", common123_search.search);
route.post("/el-dorado", common123_search.search);
route.post("/humboldt", common123_search.search);
route.post("/tehama", common123_search.search);
route.post("/san-joaquin", common123_search.search);
route.post("/colusa", common123_search.search);
route.post("/yuba", common123_search.search);
route.post("/mariposa", common123_search.search);

route.post("/solano", common2_search.search);
route.post("/mendocino", common2_search.search);
route.post("/inyo", common2_search.search);
route.post("/sutter", common2_search.search);

route.post("/alpine", common1_search.search);
route.post("/lassen", common1_search.search);
route.post("/sierra", common1_search.search);

route.post("/san-mateo", common_search.search);
route.post("/san-francisco", common_search.search);
route.post("/sacramento", common_search.search);

route.post("/santa-clara", santaClara_search.search);
route.post("/riverside", riverside_search.search);
route.post("/santa-cruz", santaCruz_search.search);
route.post("/san-luis-obispo", sanLuisObispo_search.search);
route.post("/alameda", alameda_search.search);
route.post("/ventura", ventura_search.search);
route.post("/fresno", fresno_search.search);
route.post("/san-bernardino", san_bernardino_search.search);
// route.post("/kern", kern_search.search);
// route.post("/orange", orange_search.search);

module.exports = route;