const express = require("express");

const troup_search = require("../controllers/GA/troup.controller.js");
const glynn_search = require("../controllers/GA/glynn.controller.js");
const pickens_search = require("../controllers/GA/pickens.controller.js");

const route = express.Router();

route.post("/troup", troup_search.search);
route.post("/glynn", glynn_search.search);
route.post("/pickens",pickens_search.search);

module.exports = route;
