import express from "express";

import { search as jefferson_search } from "../controllers/MO/jefferson.controller.js";
import { search as st_louis_city_search } from "../controllers/MO/st.louis_city.controller.js";
import { search as platte_search } from "../controllers/MO/platte.controller.js";
import { search as st_louis_search } from "../controllers/MO/st.louis.controller.js";
import { search as clay_search } from "../controllers/MO/clay.controller.js";

const route = express.Router();

route.post("/jefferson", jefferson_search);
route.post("/st-louis-city", st_louis_city_search);
route.post("/platte", platte_search);
route.post("/st-louis", st_louis_search);
route.post("/clay", clay_search);

export default route;