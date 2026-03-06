const express = require("express");

const utah_search = require("../controllers/UT/utah.controller.js");
const weber_search = require('../controllers/UT/weber.controller.js');
const davis_search = require('../controllers/UT/davis.controller.js');
const summit_search = require('../controllers/UT/summit.controller.js');

const route = express.Router();

route.post("/utah", utah_search.search);
route.post("/weber", weber_search.search);
route.post("/davis", davis_search.search);
route.post("/summit", summit_search.search);

module.exports = route;