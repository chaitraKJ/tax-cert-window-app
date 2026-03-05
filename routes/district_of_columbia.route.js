import express from "express";

const route = express.Router();

import { search as district_of_columbia_search } from "../controllers/DC/district_of_columbia.controller.js";

route.post("/district-of-columbia", district_of_columbia_search);

export default route;