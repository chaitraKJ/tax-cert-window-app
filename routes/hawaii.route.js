const express = require("express");

const common_search = require("../controllers/HI/common_hawaii.controller.js");

const route = express.Router();

route.post("/kauai", common_search.search);
route.post("/maui",common_search.search);
route.post("/honolulu",common_search.search);
route.post("/hawaii",common_search.search);

module.exports = route;