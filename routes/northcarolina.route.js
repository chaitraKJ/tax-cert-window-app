const express = require("express");

const buncombe_search = require("../controllers/NC/buncombe.controller.js");
const guilford_search = require("../controllers/NC/common_northcarolina.controller.js");
const wake_search = require("../controllers/NC/wake.controller.js");
const durham_search = require("../controllers/NC/durham.controller.js");
const new_hanover_search = require("../controllers/NC/new_hanover.controller.js");
const cleveland_search = require("../controllers/NC/cleveland.controller.js");
const swain_search = require("../controllers/NC/swain.controller.js");
const catawba_search = require("../controllers/NC/catawba.controller.js");
const caldwell_search = require("../controllers/NC/caldwell.controller.js");
const warren_yancey_search = require("../controllers/NC/warren_yancey.controller.js");
const brunswick_search = require("../controllers/NC/brunswick.controller.js");
const transylvania_search = require("../controllers/NC/transylvania.controller.js");
const gaston_search = require("../controllers/NC/gaston.controller.js");
const rockingham_search = require("../controllers/NC/rockingham.controller.js");

const route = express.Router();

route.post("/warren", warren_yancey_search.search);
route.post("/yancey", warren_yancey_search.search);

route.post("/cumberland", guilford_search.search);
route.post("/forsyth", guilford_search.search);
route.post("/mecklenburg", guilford_search.search);
route.post("/guilford", guilford_search.search);
route.post("/orange", guilford_search.search);

route.post("/buncombe", buncombe_search.search);
route.post("/wake", wake_search.search);
route.post("/durham", durham_search.search);
route.post("/new-hanover", new_hanover_search.search);
route.post("/cleveland", cleveland_search.search);
route.post("/swain", swain_search.search);
route.post("/catawba", catawba_search.search);
route.post("/caldwell", caldwell_search.search);
route.post("/brunswick", brunswick_search.search);
route.post("/transylvania", transylvania_search.search);
route.post("/gaston", gaston_search.search);
route.post("/rockingham", rockingham_search.search);

module.exports = route;