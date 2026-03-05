import express from "express";

import { search as common1_search } from "../controllers/WA/commonWA1.controller.js";
import { search as common2_search } from "../controllers/WA/commonWA2.controller.js";
import { search as snohomish_search } from "../controllers/WA/snohomish.controller.js";
import { search as pierce_search } from "../controllers/WA/pierce.controller.js";
import { search as king_search} from "../controllers/WA/king.controller.js";
import { search as spokane_search } from "../controllers/WA/spokane.controller.js";
import { search as thurston_search } from "../controllers/WA/thurston.controller.js";
import { search as cowlitz_search } from "../controllers/WA/cowlitz.controller.js";
import { search as skagit_search } from "../controllers/WA/skagit.controller.js";
import { search as lewis_search } from "../controllers/WA/lewis.controller.js";
import { search as klickitat_search } from "../controllers/WA/klickitat.controller.js";
import { search as kitsap_search } from "../controllers/WA/kitsap.controller.js";
import { search as yakima_search } from "../controllers/WA/yakima.controller.js";

const route = express.Router(); 

route.post("/adams", common1_search);
route.post("/douglas", common1_search);
route.post("/lincoln", common1_search);
route.post("/ferry", common1_search);
route.post("/skamania", common1_search);
route.post("/grays-harbor", common1_search);
route.post("/mason", common1_search);
route.post("/pacific", common1_search);
route.post("/whitman", common1_search);
route.post("/okanogan", common1_search);
route.post("/franklin", common1_search);
route.post("/kittitas", common1_search);

route.post("/walla-walla", common2_search);
route.post("/san-juan", common2_search);
route.post("/stevens", common2_search);
route.post("/whatcom", common2_search);
route.post("/island", common2_search);
route.post('/benton', common2_search);
route.post('/clallam', common2_search);
route.post("/jefferson", common2_search);
route.post('/pend-oreille', common2_search);
route.post('/wahkiakum', common2_search);
route.post('/chelan', common2_search);
route.post('/columbia', common2_search);
route.post("/grant", common2_search);

route.post("/snohomish", snohomish_search);
route.post("/pierce", pierce_search);
route.post('/king', king_search);
route.post('/spokane', spokane_search);
route.post("/thurston", thurston_search);
route.post("/cowlitz", cowlitz_search);
route.post("/skagit", skagit_search);
route.post("/lewis", lewis_search);
route.post("/klickitat", klickitat_search);
route.post("/kitsap", kitsap_search);
route.post("/yakima", yakima_search);

export default route;