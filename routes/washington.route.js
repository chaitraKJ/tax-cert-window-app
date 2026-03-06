const express = require("express");

const common1_search  = require("../controllers/WA/commonWA1.controller.js");
const common2_search  = require("../controllers/WA/commonWA2.controller.js");
const snohomish_search  = require("../controllers/WA/snohomish.controller.js");
const pierce_search  = require("../controllers/WA/pierce.controller.js");
const king_search = require("../controllers/WA/king.controller.js");
const spokane_search  = require("../controllers/WA/spokane.controller.js");
const thurston_search  = require("../controllers/WA/thurston.controller.js");
const cowlitz_search  = require("../controllers/WA/cowlitz.controller.js");
const skagit_search  = require("../controllers/WA/skagit.controller.js");
const lewis_search  = require("../controllers/WA/lewis.controller.js");
const klickitat_search  = require("../controllers/WA/klickitat.controller.js");
const kitsap_search  = require("../controllers/WA/kitsap.controller.js");
const yakima_search  = require("../controllers/WA/yakima.controller.js");

const route = express.Router(); 

route.post("/adams", common1_search.search);
route.post("/douglas", common1_search.search);
route.post("/lincoln", common1_search.search);
route.post("/ferry", common1_search.search);
route.post("/skamania", common1_search.search);
route.post("/grays-harbor", common1_search.search);
route.post("/mason", common1_search.search);
route.post("/pacific", common1_search.search);
route.post("/whitman", common1_search.search);
route.post("/okanogan", common1_search.search);
route.post("/franklin", common1_search.search);
route.post("/kittitas", common1_search.search);

route.post("/walla-walla", common2_search.search);
route.post("/san-juan", common2_search.search);
route.post("/stevens", common2_search.search);
route.post("/whatcom", common2_search.search);
route.post("/island", common2_search.search);
route.post('/benton', common2_search.search);
route.post('/clallam', common2_search.search);
route.post("/jefferson", common2_search.search);
route.post('/pend-oreille', common2_search.search);
route.post('/wahkiakum', common2_search.search);
route.post('/chelan', common2_search.search);
route.post('/columbia', common2_search.search);
route.post("/grant", common2_search.search);

route.post("/snohomish", snohomish_search.search);
route.post("/pierce", pierce_search.search);
route.post('/king', king_search.search);
route.post('/spokane', spokane_search.search);
route.post("/thurston", thurston_search.search);
route.post("/cowlitz", cowlitz_search.search);
route.post("/skagit", skagit_search.search);
route.post("/lewis", lewis_search.search);
route.post("/klickitat", klickitat_search.search);
route.post("/kitsap", kitsap_search.search);
route.post("/yakima", yakima_search.search);

module.exports = route;