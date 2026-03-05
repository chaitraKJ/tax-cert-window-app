import express from "express";

import { search as douglas_search } from "../controllers/NV/douglas_lyon.controller.js";
import { search as common_search } from "../controllers/NV/common_nevada.controller.js";
import { search as washoe_search } from "../controllers/NV/washoe.controller.js";

const route = express.Router();

route.post("/douglas", douglas_search);
route.post("/lyon", douglas_search);
route.post("/carson-city",common_search);
route.post("/nye",common_search);
route.post("/churchill",common_search);
route.post("/washoe", washoe_search);

export default route;