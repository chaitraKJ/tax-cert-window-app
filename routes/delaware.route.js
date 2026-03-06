const express = require("express");

const kent_search = require('../controllers/DE/kent.controller.js');
const sussex_search = require('../controllers/DE/sussex.controller.js');

const route = express.Router();

route.post("/kent", kent_search.search);
route.post("/sussex", sussex_search.search);

module.exports = route;