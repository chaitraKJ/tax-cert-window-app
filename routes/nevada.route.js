const express = require("express");

const douglas_search = require("../controllers/NV/douglas_lyon.controller.js");
const common_search = require("../controllers/NV/common_nevada.controller.js");
const washoe_search = require("../controllers/NV/washoe.controller.js");

const route = express.Router();

route.post("/douglas", douglas_search.search);
route.post("/lyon", douglas_search.search);
route.post("/carson-city",common_search.search);
route.post("/nye",common_search.search);
route.post("/churchill",common_search.search);
route.post("/washoe", washoe_search.search);

module.exports = route;