import express from "express";

import { search as common_search } from "../controllers/OR/commonOR.controller.js";
import { search as deschutes_search } from "../controllers/OR/deschutes.controller.js";
import { search as lake_search } from "../controllers/OR/lake.controller.js";
import { search as lane_search } from "../controllers/OR/lane.controller.js";
import { search as multnomah_search } from "../controllers/OR/multnomah.controller.js";
import { search as clatsop_search } from "../controllers/OR/clatsop.controller.js";
import { search as clackamas_search } from "../controllers/OR/clackamas.controller.js";
import { search as washington_search } from "../controllers/OR/washington.controller.js";
import { search as benton_search } from "../controllers/OR/benton.controller.js";
import { search as klamath_search } from "../controllers/OR/klamath.controller.js";

const route = express.Router();

route.post("/jackson", common_search);
route.post("/jefferson", common_search);
route.post("/linn", common_search);

route.post("/deschutes", deschutes_search);
route.post("/lake", lake_search);
route.post("/lane", lane_search);
route.post("/multnomah", multnomah_search);
route.post("/clatsop", clatsop_search);
route.post("/clackamas", clackamas_search);
route.post("/washington", washington_search);
route.post("/benton", benton_search);
route.post("/klamath", klamath_search);

export default route;