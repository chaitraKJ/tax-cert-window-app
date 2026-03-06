const express = require("express");

const jefferson_search = require("../controllers/CO/jefferson.controller.js");
const common_host_search = require("../controllers/CO/common_host.controller.js");
const common_host_new_search = require("../controllers/CO/common_host_new.controller.js");

const denver_search = require("../controllers/CO/denver.controller.js");
const larimer_search = require("../controllers/CO/larimer.controller.js");
const moffat_search = require("../controllers/CO/moffat.controller.js");
const lincoln_search = require("../controllers/CO/lincoln.controller.js");
const chaffee_search = require("../controllers/CO/chaffee.controller.js");
const arapahoe_search = require("../controllers/CO/arapahoe.controller.js");
const summit_search = require("../controllers/CO/summit.controller.js");
const pueblo_search = require("../controllers/CO/pueblo.controller.js");
const logan_search = require("../controllers/CO/logan.controller.js");
const gunnison_search = require("../controllers/CO/gunnison.controller.js");
const elpaso_search = require("../controllers/CO/elpaso.controller.js");

const route = express.Router();

route.post("/jefferson", jefferson_search.search);
route.post("/boulder", (req, res, next)=>{ req.county="boulder"; next(); }, common_host_search.search);
route.post("/adams", (req, res, next)=>{ req.county="adams"; next(); }, common_host_search.search);
route.post("/douglas", (req, res, next)=>{ req.county="douglas"; next(); }, common_host_search.search);
route.post("/lake", (req, res, next)=>{ req.county="lake"; next(); }, common_host_search.search);
route.post("/grand", (req, res, next)=>{ req.county="grand"; next(); }, common_host_search.search);
route.post("/broomfield", (req, res, next)=>{ req.county="broomfield"; next(); }, common_host_search.search);
route.post("/conejos", (req, res, next)=>{ req.county="conejos"; next(); }, common_host_search.search);
route.post("/weld", (req, res, next)=>{ req.county="weld"; next(); }, common_host_search.search);
route.post("/ouray", (req, res, next)=>{ req.county="ouray"; next(); }, common_host_search.search);
route.post("/routt", (req, res, next)=>{ req.county="routt"; next(); }, common_host_search.search);
route.post("/las-animas", (req, res, next)=>{ req.county="las-animas"; next(); }, common_host_search.search);
route.post("/fremont", (req, res, next)=>{ req.county="fremont"; next(); }, common_host_search.search);
route.post("/elbert", (req, res, next)=>{ req.county="elbert"; next(); }, common_host_search.search);
route.post("/phillips", (req, res, next)=>{ req.county="phillips"; next(); }, common_host_search.search);
route.post("/mineral", (req, res, next)=>{ req.county="mineral"; next(); }, common_host_search.search);
route.post("/gilpin", (req, res, next)=>{ req.county="gilpin"; next(); }, common_host_search.search);
route.post("/pitkin", (req, res, next)=>{ req.county="pitkin"; next(); }, common_host_search.search);
route.post("/jackson", (req, res, next)=>{ req.county="jackson"; next(); }, common_host_search.search);
route.post("/morgan", (req, res, next)=>{ req.county="morgan"; next(); }, common_host_search.search);
route.post("/costilla", (req, res, next)=>{ req.county="costilla"; next(); }, common_host_search.search);
route.post("/otero", (req, res, next)=>{ req.county="otero"; next(); }, common_host_search.search);
route.post("/crowley", (req, res, next)=>{ req.county="crowley"; next(); }, common_host_search.search);
route.post("/san-miguel",(req, res, next)=>{ req.county="san-miguel"; next(); }, common_host_search.search);
route.post("/mesa",(req, res, next)=>{ req.county="mesa"; next(); }, common_host_search.search);
route.post("/garfield",(req, res, next)=>{ req.county="garfield"; next(); }, common_host_search.search);
route.post("/clear-creek",(req, res, next)=>{ req.county="clear-creek"; next(); }, common_host_search.search);
route.post("/montrose",(req, res, next)=>{ req.county="montrose"; next(); }, common_host_search.search);
route.post("/bent",(req, res, next)=>{ req.county="bent"; next(); }, common_host_search.search);
route.post("/montezuma",(req, res, next)=>{ req.county="montezuma"; next(); }, common_host_search.search);
route.post("/park",(req, res, next)=>{ req.county="park"; next(); }, common_host_search.search);
route.post("/teller",(req, res, next)=>{ req.county="teller"; next(); }, common_host_search.search);

route.post("/delta",(req, res, next)=>{ req.county="delta"; next(); }, common_host_new_search.search);
route.post("/la-plata", (req, res, next)=>{ req.county="la-plata"; next(); }, common_host_new_search.search);

route.post("/chaffee", chaffee_search.search);
route.post("/Cheyenne", chaffee_search.search);
route.post("/custer", chaffee_search.search);
route.post("/sedgwick", chaffee_search.search);
route.post("/Yuma", chaffee_search.search);
route.post("/washington", chaffee_search.search);

route.post("/gunnison", gunnison_search.search);
route.post("/eagle", gunnison_search.search);

route.post("/denver" , denver_search.search);
route.post("/larimer", larimer_search.search);
route.post("/moffat", moffat_search.search);
route.post("/lincoln", lincoln_search.search);
route.post("/arapahoe", arapahoe_search.search);
route.post("/summit", summit_search.search);
route.post("/pueblo", pueblo_search.search);
route.post("/logan", logan_search.search);
route.post("/el-paso", elpaso_search.search);

module.exports = route;