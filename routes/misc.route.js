const express = require("express");

const { getCounty } = require("../controllers/misc.controller.js");

const route = express.Router();

route.get('/county', getCounty);

module.exports = route;