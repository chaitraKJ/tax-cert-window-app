const express = require("express");

const common_search = require("../controllers/OR/commonOR.controller.js");
const deschutes_search = require("../controllers/OR/deschutes.controller.js");
const lake_search = require("../controllers/OR/lake.controller.js");
const lane_search = require("../controllers/OR/lane.controller.js");
const multnomah_search = require("../controllers/OR/multnomah.controller.js");
const clatsop_search = require("../controllers/OR/clatsop.controller.js");
const clackamas_search = require("../controllers/OR/clackamas.controller.js");
const washington_search = require("../controllers/OR/washington.controller.js");
const benton_search = require("../controllers/OR/benton.controller.js");
const klamath_search = require("../controllers/OR/klamath.controller.js");

const route = express.Router();

route.post("/jackson", common_search.search);
route.post("/jefferson", common_search.search);
route.post("/linn", common_search.search);

route.post("/deschutes", deschutes_search.search);
route.post("/lake", lake_search.search);
route.post("/lane", lane_search.search);
route.post("/multnomah", multnomah_search.search);
route.post("/clatsop", clatsop_search.search);
route.post("/clackamas", clackamas_search.search);
route.post("/washington", washington_search.search);
route.post("/benton", benton_search.search);
route.post("/klamath", klamath_search.search);

module.exports = route;