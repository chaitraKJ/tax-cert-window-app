const express = require("express");

const common1_search = require("../controllers/NE/common_nebraska.controller.js");
const lancaster_search = require("../controllers/NE/lancaster.controller.js");
const douglas_search = require("../controllers/NE/douglas.controller.js");
const sarpy_search = require("../controllers/NE/sarpy.controller.js");

const route = express.Router();

route.post("/nemaha", common1_search.search);
route.post("/boone", common1_search.search);
route.post("/cass", common1_search.search);
route.post("/lancaster", lancaster_search.search);
route.post("/douglas", douglas_search.search);
route.post("/sarpy", sarpy_search.search);

module.exports = route;