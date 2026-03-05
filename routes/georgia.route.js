import express from "express";

import { search as troup_search } from "../controllers/GA/troup.controller.js";
import { search as glynn_search } from "../controllers/GA/glynn.controller.js";
import { search as pickens_search } from "../controllers/GA/pickens.controller.js";

const route = express.Router();

route.post("/troup", troup_search);
route.post("/glynn", glynn_search);
route.post("/pickens",pickens_search);

export default route;
