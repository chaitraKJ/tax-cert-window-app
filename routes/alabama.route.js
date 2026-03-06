const express = require("express");

const baldwin_search = require("../controllers/AL/baldwin.controller.js");
const fayette_search = require("../controllers/AL/fayette.controller.js");
const tuscaloosa_search = require("../controllers/AL/tuscaloosa.controller.js");
const common_search = require("../controllers/AL/commonAL.controller.js");

const route = express.Router();

route.post("/baldwin", (req, res, next) => { req.county="alabama"; next(); },  baldwin_search.search);
route.post("/jackson", (req, res, next) => { req.county="jackson"; next(); },  baldwin_search.search);
route.post("/madison", (req, res, next) => { req.county="madison"; next(); },  baldwin_search.search);
route.post("/fayette", fayette_search.search);
route.post("/tuscaloosa", tuscaloosa_search.search);
route.post("/mobile", common_search.search);
route.post("/shelby", common_search.search);
route.post("/jefferson", common_search.search);

module.exports = route;