import express from "express";

import { search as common_search } from "../controllers/HI/common_hawaii.controller.js";

const route = express.Router();

route.post("/kauai", common_search);
route.post("/maui",common_search);
route.post("/honolulu",common_search);
route.post("/hawaii",common_search);

export default route;