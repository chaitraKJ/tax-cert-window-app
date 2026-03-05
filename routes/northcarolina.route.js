import express from "express";

import { search as buncombe_search } from "../controllers/NC/buncombe.controller.js";
import { search as guilford_search } from "../controllers/NC/common_northcarolina.controller.js";
import { search as wake_search } from "../controllers/NC/wake.controller.js";
import { search as durham_search } from "../controllers/NC/durham.controller.js";
import { search as new_hanover_search } from "../controllers/NC/new_hanover.controller.js";
import { search as cleveland_search } from "../controllers/NC/cleveland.controller.js";
import { search as swain_search } from "../controllers/NC/swain.controller.js";
import { search as catawba_search } from "../controllers/NC/catawba.controller.js";
import { search as caldwell_search } from "../controllers/NC/caldwell.controller.js";
import { search as warren_yancey_search } from "../controllers/NC/warren_yancey.controller.js";
import { search as brunswick_search } from "../controllers/NC/brunswick.controller.js";
import { search as transylvania_search } from "../controllers/NC/transylvania.controller.js";
import { search as gaston_search } from "../controllers/NC/gaston.controller.js";
import { search as rockingham_search } from "../controllers/NC/rockingham.controller.js";

const route = express.Router();

route.post("/warren", warren_yancey_search );
route.post("/yancey", warren_yancey_search );

route.post("/cumberland", guilford_search);
route.post("/forsyth", guilford_search);
route.post("/mecklenburg", guilford_search);
route.post("/guilford", guilford_search);
route.post("/orange", guilford_search);

route.post("/buncombe", buncombe_search);
route.post("/wake", wake_search);
route.post("/durham", durham_search);
route.post("/new-hanover", new_hanover_search);
route.post("/cleveland", cleveland_search);
route.post("/swain", swain_search);
route.post("/catawba", catawba_search);
route.post("/caldwell", caldwell_search);
route.post("/brunswick", brunswick_search);
route.post("/transylvania", transylvania_search);
route.post("/gaston", gaston_search);
route.post("/rockingham", rockingham_search);

export default route;