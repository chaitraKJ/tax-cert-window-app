import express from "express";
const route = express.Router();

import { search as common1_search } from "../controllers/NE/common_nebraska.controller.js";
import { search as lancaster_search } from "../controllers/NE/lancaster.controller.js";
import { search as douglas_search } from "../controllers/NE/douglas.controller.js";
import { search as sarpy_search } from "../controllers/NE/sarpy.controller.js";

route.post("/nemaha", common1_search);
route.post("/boone", common1_search);
route.post("/cass", common1_search);
route.post("/lancaster", lancaster_search);
route.post("/douglas", douglas_search);
route.post("/sarpy", sarpy_search);

export default route;