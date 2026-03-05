import express from "express";

import { search as baldwin_search } from "../controllers/AL/baldwin.controller.js";
import { search as fayette_search } from "../controllers/AL/fayette.controller.js";
import { search as tuscaloosa_search } from "../controllers/AL/tuscaloosa.controller.js";
import { search as common_search } from "../controllers/AL/commonAL.controller.js";

const route = express.Router();

route.post("/baldwin", (req, res, next) => { req.county="alabama"; next(); },  baldwin_search);
route.post("/jackson", (req, res, next) => { req.county="jackson"; next(); },  baldwin_search);
route.post("/madison", (req, res, next) => { req.county="madison"; next(); },  baldwin_search);
route.post("/fayette", fayette_search);
route.post("/tuscaloosa", tuscaloosa_search);
route.post("/mobile", common_search);
route.post("/shelby", common_search);
route.post("/jefferson", common_search);

export default route;