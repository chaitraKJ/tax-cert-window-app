import express from "express";

import { search as los_angeles_search } from "../controllers/CA/los_angeles.controller.js";
import { search as san_diego_search } from "../controllers/CA/san_diego.controller.js";
import { search as contra_costa_search } from "../controllers/CA/contra_costa.controller.js";
import { search as common123_search } from "../controllers/CA/common123.controller.js";

import { search as santaClara_search } from "../controllers/CA/santaClara.controller.js";
import { search as common2_search } from  "../controllers/CA/commonCA2.controller.js";
import { search as riverside_search } from "../controllers/CA/riverside.controller.js";
import { search as santaCruz_search } from "../controllers/CA/santaCruz.controller.js";
import { search as sanLuisObispo_search } from "../controllers/CA/sanLuisObispo.controller.js";
import { search as alameda_search } from "../controllers/CA/alameda.controller.js";
import { search as common1_search } from "../controllers/CA/commonCA1.controller.js";
import { search as common_search } from "../controllers/CA/common.controller.js";
import { search as ventura_search } from "../controllers/CA/ventura.controller.js";
import { search as fresno_search } from "../controllers/CA/fresno.controller.js";
import { search as san_bernardino_search } from "../controllers/CA/san_bernardino.controller.js";
import { search as kern_search } from "../controllers/CA/kern.controller.js";
import { search as orange_search } from "../controllers/CA/orange.controller.js";

const route = express.Router()

route.post("/los-angeles", los_angeles_search);
route.post("/san-diego", san_diego_search);
route.post("/contra-costa", contra_costa_search);

route.post("/monterey", common123_search);
route.post("/trinity", common123_search);
route.post("/yolo", common123_search);
route.post("/butte", common123_search);
route.post("/imperial", common123_search);
route.post("/tuolumne", common123_search);
route.post("/amador", common123_search);
route.post("/kings", common123_search);
route.post("/mono", common123_search);
route.post("/san-benito", common123_search);
route.post("/placer", common123_search);
route.post("/lake", common123_search);
route.post("/tulare", common123_search);
route.post("/del-norte", common123_search);
route.post("/stanislaus", common123_search);
route.post("/napa", common123_search);
route.post("/nevada", common123_search);
route.post("/shasta", common123_search);
route.post("/sonoma", common123_search);
route.post("/modoc", common123_search);
route.post("/siskiyou", common123_search);
route.post("/calaveras", common123_search);
route.post("/madera", common123_search);
route.post("/merced", common123_search);
route.post("/plumas", common123_search);
route.post("/el-dorado", common123_search);
route.post("/humboldt", common123_search);
route.post("/tehama", common123_search);
route.post("/san-joaquin", common123_search);
route.post("/colusa", common123_search);
route.post("/yuba", common123_search);
route.post("/mariposa", common123_search);

route.post("/solano", common2_search);
route.post("/mendocino", common2_search);
route.post("/inyo", common2_search);
route.post("/sutter", common2_search);

route.post("/alpine", common1_search);
route.post("/lassen", common1_search);
route.post("/sierra", common1_search);

route.post("/san-mateo", common_search);
route.post("/san-francisco", common_search);
route.post("/sacramento", common_search);

route.post("/santa-clara", santaClara_search);
route.post("/riverside", riverside_search);
route.post("/santa-cruz", santaCruz_search);
route.post("/san-luis-obispo", sanLuisObispo_search);
route.post("/alameda", alameda_search);
route.post("/ventura", ventura_search);
route.post("/fresno", fresno_search);
route.post("/san-bernardino", san_bernardino_search);
route.post("/kern", kern_search);
route.post("/orange", orange_search);

export default route;