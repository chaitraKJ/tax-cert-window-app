import express from "express";

import { search as jefferson_search } from "../controllers/CO/jefferson.controller.js";
import { search as common_host_search } from "../controllers/CO/common_host.controller.js";
import { search as common_host_new_search } from "../controllers/CO/common_host_new.controller.js";

import { search as denver_search } from "../controllers/CO/denver.controller.js";
import { search as larimer_search } from "../controllers/CO/larimer.controller.js";
import { search as moffat_search } from "../controllers/CO/moffat.controller.js";
import { search as lincoln_search } from "../controllers/CO/lincoln.controller.js";
import { search as chaffee_search } from "../controllers/CO/chaffee.controller.js";
import { search as arapahoe_search } from "../controllers/CO/arapahoe.controller.js";
import { search as summit_search } from "../controllers/CO/summit.controller.js";
import { search as pueblo_search } from "../controllers/CO/pueblo.controller.js";
import { search as logan_search } from "../controllers/CO/logan.controller.js";
import { search as gunnison_search } from "../controllers/CO/gunnison.controller.js";
import { search as elpaso_search } from "../controllers/CO/elpaso.controller.js";

const route = express.Router();

route.post("/jefferson", jefferson_search);
route.post("/boulder", (req, res, next)=>{ req.county="boulder"; next(); }, common_host_search);
route.post("/adams", (req, res, next)=>{ req.county="adams"; next(); }, common_host_search);
route.post("/douglas", (req, res, next)=>{ req.county="douglas"; next(); }, common_host_search);
route.post("/lake", (req, res, next)=>{ req.county="lake"; next(); }, common_host_search);
route.post("/grand", (req, res, next)=>{ req.county="grand"; next(); }, common_host_search);
route.post("/broomfield", (req, res, next)=>{ req.county="broomfield"; next(); }, common_host_search);
route.post("/conejos", (req, res, next)=>{ req.county="conejos"; next(); }, common_host_search);
route.post("/weld", (req, res, next)=>{ req.county="weld"; next(); }, common_host_search);
route.post("/ouray", (req, res, next)=>{ req.county="ouray"; next(); }, common_host_search);
route.post("/routt", (req, res, next)=>{ req.county="routt"; next(); }, common_host_search);
route.post("/las-animas", (req, res, next)=>{ req.county="las-animas"; next(); }, common_host_search);
route.post("/fremont", (req, res, next)=>{ req.county="fremont"; next(); }, common_host_search);
route.post("/elbert", (req, res, next)=>{ req.county="elbert"; next(); }, common_host_search);
route.post("/phillips", (req, res, next)=>{ req.county="phillips"; next(); }, common_host_search);
route.post("/mineral", (req, res, next)=>{ req.county="mineral"; next(); }, common_host_search);
route.post("/gilpin", (req, res, next)=>{ req.county="gilpin"; next(); }, common_host_search);
route.post("/pitkin", (req, res, next)=>{ req.county="pitkin"; next(); }, common_host_search);
route.post("/jackson", (req, res, next)=>{ req.county="jackson"; next(); }, common_host_search);
route.post("/morgan", (req, res, next)=>{ req.county="morgan"; next(); }, common_host_search);
route.post("/costilla", (req, res, next)=>{ req.county="costilla"; next(); }, common_host_search);
route.post("/otero", (req, res, next)=>{ req.county="otero"; next(); }, common_host_search);
route.post("/crowley", (req, res, next)=>{ req.county="crowley"; next(); }, common_host_search);
route.post("/san-miguel",(req, res, next)=>{ req.county="san-miguel"; next(); }, common_host_search);
route.post("/mesa",(req, res, next)=>{ req.county="mesa"; next(); }, common_host_search);
route.post("/garfield",(req, res, next)=>{ req.county="garfield"; next(); }, common_host_search);
route.post("/clear-creek",(req, res, next)=>{ req.county="clear-creek"; next(); }, common_host_search);
route.post("/montrose",(req, res, next)=>{ req.county="montrose"; next(); }, common_host_search);
route.post("/bent",(req, res, next)=>{ req.county="bent"; next(); }, common_host_search);
route.post("/montezuma",(req, res, next)=>{ req.county="montezuma"; next(); }, common_host_search);
route.post("/park",(req, res, next)=>{ req.county="park"; next(); }, common_host_search);
route.post("/teller",(req, res, next)=>{ req.county="teller"; next(); }, common_host_search);

route.post("/delta",(req, res, next)=>{ req.county="delta"; next(); }, common_host_new_search);
route.post("/la-plata", (req, res, next)=>{ req.county="la-plata"; next(); }, common_host_new_search);

route.post("/chaffee", chaffee_search);
route.post("/Cheyenne", chaffee_search);
route.post("/custer", chaffee_search);
route.post("/sedgwick", chaffee_search);
route.post("/Yuma", chaffee_search);
route.post("/washington", chaffee_search);

route.post("/gunnison", gunnison_search);
route.post("/eagle", gunnison_search);

route.post("/denver" , denver_search);
route.post("/larimer", larimer_search);
route.post("/moffat", moffat_search);
route.post("/lincoln", lincoln_search);
route.post("/arapahoe", arapahoe_search);
route.post("/summit", summit_search);
route.post("/pueblo", pueblo_search);
route.post("/logan", logan_search);
route.post("/el-paso", elpaso_search);

export default route;