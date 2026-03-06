const express = require("express");

const district_of_columbia_search = require("../controllers/DC/district_of_columbia.controller.js");

const route = express.Router();

route.post("/district-of-columbia", district_of_columbia_search.search);

module.exports = route;