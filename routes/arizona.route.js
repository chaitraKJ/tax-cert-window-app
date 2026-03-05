import express from "express";
const route = express.Router();

import { search as maricopa_search } from "../controllers/AZ/maricopa.controller.js";
import { search as yuma_mohave_search } from "../controllers/AZ/yuma_mohave.controller.js";
import { search as pima_search } from "../controllers/AZ/pima.controller.js";
import { search as cochise_search } from "../controllers/AZ/cochise.controller.js"
import { search as navajo_search } from "../controllers/AZ/navajo.controller.js";
import { search as apache_search } from "../controllers/AZ/apache.controller.js"
import { search as pinal_search } from "../controllers/AZ/pinal.controller.js";

route.post("/maricopa", maricopa_search);
route.post("/yuma", (req, res, next)=>{ req.county="yuma"; next(); }, yuma_mohave_search);
route.post("/mohave", (req, res, next)=>{ req.county="mohave"; next(); }, yuma_mohave_search);

route.post("/pima", pima_search);
route.post("/cochise",cochise_search);
route.post("/navajo", navajo_search);
route.post("/apache", apache_search);
route.post("/pinal",pinal_search);

export default route;