const express = require("express");

const jefferson_search = require("../controllers/MO/jefferson.controller.js");
const st_louis_city_search = require("../controllers/MO/st.louis_city.controller.js");
const platte_search = require("../controllers/MO/platte.controller.js");
const st_louis_search = require("../controllers/MO/st.louis.controller.js");
const clay_search = require("../controllers/MO/clay.controller.js");

const route = express.Router();

route.post("/jefferson", jefferson_search.search);
route.post("/st-louis-city", st_louis_city_search.search);
route.post("/platte", platte_search.search);
route.post("/st-louis", st_louis_search.search);
route.post("/clay", clay_search.search);

module.exports = route;