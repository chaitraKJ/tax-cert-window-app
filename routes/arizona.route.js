const express = require("express");

const maricopa_search = require("../controllers/AZ/maricopa.controller.js");
const yuma_mohave_search = require("../controllers/AZ/yuma_mohave.controller.js");
const pima_search = require("../controllers/AZ/pima.controller.js");
const cochise_search = require("../controllers/AZ/cochise.controller.js");
const navajo_search = require("../controllers/AZ/navajo.controller.js");
const apache_search = require("../controllers/AZ/apache.controller.js");
const pinal_search = require("../controllers/AZ/pinal.controller.js");

const route = express.Router();

route.post("/maricopa", maricopa_search.search);
route.post("/yuma", (req, res, next)=>{ req.county="yuma"; next(); }, yuma_mohave_search.search);
route.post("/mohave", (req, res, next)=>{ req.county="mohave"; next(); }, yuma_mohave_search.search);

route.post("/pima", pima_search.search);
route.post("/cochise",cochise_search.search);
route.post("/navajo", navajo_search.search);
route.post("/apache", apache_search.search);
route.post("/pinal",pinal_search.search);

module.exports = route;