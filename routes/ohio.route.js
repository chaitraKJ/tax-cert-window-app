import express from "express";

import { search as scioto_search } from "../controllers/OH/scioto.controller.js";
import { search as similar_search } from "../controllers/OH/similar_ohio.controller.js";
import { search as common_search } from "../controllers/OH/common_ohio.controller.js";
import { search as commons_search } from "../controllers/OH/common_ohios.controller.js";
import { search as hocking_search } from "../controllers/OH/hocking.controller.js";
import { search as sandusky_search } from "../controllers/OH/sandusky.controller.js";
import { search as mahoning_search } from "../controllers/OH/mahoning.controller.js";
import { search as vinton_search } from "../controllers/OH/vinton.controller.js";
import { search as trumbull_search } from "../controllers/OH/trumbull.controller.js";
import { search as adams_knox_search } from "../controllers/OH/adams_knox.controller.js";
import { search as williams_search } from "../controllers/OH/williams.controller.js";
import { search as montgomery_search } from "../controllers/OH/montgomery.controller.js";
import { search as allen_highland_portage_search } from "../controllers/OH/allen_highland_portage.controller.js";
import { search as lawrence_search } from "../controllers/OH/lawrence.controller.js";
import { search as meigs_search } from "../controllers/OH/meigs.controller.js";
import { search as hancock_search } from "../controllers/OH/hancock.controller.js";
import { search as preble_search } from "../controllers/OH/preble.controller.js";
import { search as fairfield_search } from "../controllers/OH/fairfield.controller.js";
import { search as jackson_search } from "../controllers/OH/jackson.controller.js";
import { search as columbiana_search } from "../controllers/OH/columbiana.controller.js";
import { search as marion_search } from "../controllers/OH/marion.controller.js";
import { search as medina_search } from "../controllers/OH/medina.controller.js";
import { search as franklin_search } from "../controllers/OH/franklin.controller.js";
import { search as wood_search } from "../controllers/OH/wood.controller.js";
import { search as morrow_search } from "../controllers/OH/morrow.controller.js";
import { search as hamilton_search } from "../controllers/OH/hamilton.controller.js";
import { search as butler_search } from "../controllers/OH/butler.controller.js";
import { search as guernsey_wayne_madison_search } from "../controllers/OH/guernsey_wayne_madison.controller.js";
import { search as washington_ross_search } from "../controllers/OH/washington_ross.controller.js";
import { search as ashtabula_search } from "../controllers/OH/ashtabula.controller.js";
import { search as pike_henry_search } from "../controllers/OH/pike_henry.controller.js";
import { search as delaware_search } from "../controllers/OH/delaware.controller.js";
import { search as monroe_search } from "../controllers/OH/monroe.controller.js";
import { search as mercer_search } from "../controllers/OH/mercer.controller.js";
import { search as fulton_search } from "../controllers/OH/fulton.controller.js";
import { search as union_search } from "../controllers/OH/union.controller.js";
import { search as lucas_search } from "../controllers/OH/lucas.controller.js";
import { search as warren_search } from "../controllers/OH/warren.controller.js";
import { search as harrison_search } from "../controllers/OH/harrison.controller.js";
import { search as jefferson_search } from "../controllers/OH/jefferson.controller.js";
import { search as clermont_search } from "../controllers/OH/clermont.controller.js";
import { search as stark_search } from "../controllers/OH/stark.controller.js";
import { search as cuyahoga_search } from "../controllers/OH/cuyahoga.controller.js";
import { search as auglaize_search } from "../controllers/OH/auglaize.controller.js";
import { search as lake_search } from "../controllers/OH/lake.controller.js";
import { search as perry_search } from "../controllers/OH/perry.controller.js";
import { search as richland_search } from "../controllers/OH/richland.controller.js";
import { search as summit_search } from "../controllers/OH/summit.controller.js";

const route = express.Router();

route.post("/darke", common_search);
route.post("/paulding", common_search);
route.post("/miami", common_search);

route.post("/greene", similar_search);
route.post("/fayette", similar_search);
route.post("/erie", similar_search);
route.post("/brown", similar_search);
route.post("/clinton", similar_search);
route.post("/seneca", similar_search);
route.post("/logan", similar_search);
route.post("/tuscarawas", similar_search);
route.post("/belmont", similar_search);
route.post("/shelby", similar_search);
route.post("/morgan", similar_search);
route.post("/holmes", similar_search);
route.post("/huron", similar_search);
route.post("/coshocton", similar_search);
route.post("/muskingum", similar_search);
route.post("/champaign", similar_search);
route.post("/geauga", similar_search);
route.post("/carroll", similar_search);
route.post("/ottawa",similar_search);
route.post("/lorain",similar_search);

route.post("/pickaway",commons_search);
route.post("/gallia",commons_search);
route.post("/clark",commons_search);
route.post("/athens",commons_search);

route.post("/wayne",guernsey_wayne_madison_search);
route.post("/guernsey",guernsey_wayne_madison_search);
route.post("/madison",guernsey_wayne_madison_search);

route.post("/washington",washington_ross_search);
route.post("/ross", washington_ross_search);

route.post("/adams",adams_knox_search);
route.post("/knox",adams_knox_search)

route.post("/allen",allen_highland_portage_search);
route.post("/highland",allen_highland_portage_search);
route.post("/portage",allen_highland_portage_search);

route.post("/harrison", harrison_search);
route.post("/noble", harrison_search);
route.post("/hardin", harrison_search);
route.post("/crawford", harrison_search);
route.post("/wyandot", harrison_search);

route.post("/henry",pike_henry_search);
route.post("/pike",pike_henry_search);

route.post("/columbiana",columbiana_search);
route.post("/ashland", columbiana_search);

route.post("/scioto",scioto_search);
route.post("/hocking",hocking_search)
route.post("/sandusky",sandusky_search);
route.post("/mahoning",mahoning_search);
route.post("/vinton",vinton_search);
route.post("/trumbull",trumbull_search);
route.post("/williams",  williams_search); 
route.post("/montgomery",montgomery_search);
route.post("/lawrence",lawrence_search);
route.post("/meigs",meigs_search);
route.post("/hancock",hancock_search);
route.post("/preble",preble_search);
route.post("/fairfield",fairfield_search);
route.post("/jackson",jackson_search);
route.post("/marion",marion_search);
route.post("/medina",medina_search);
route.post("/franklin",franklin_search);
route.post("/wood",wood_search);
route.post("/morrow", morrow_search);
route.post("/hamilton",hamilton_search);
route.post("/butler", butler_search);
route.post("/ashtabula", ashtabula_search);
route.post("/delaware",delaware_search);
route.post("/monroe", monroe_search);
route.post("/mercer", mercer_search);
route.post("/fulton",fulton_search);
route.post("/union",union_search);
route.post("/lucas",lucas_search);
route.post("/warren",warren_search);
route.post("/jefferson",jefferson_search);
route.post("/clermont", clermont_search);
route.post("/stark", stark_search);
route.post("/cuyahoga",cuyahoga_search);
route.post("/auglaize",auglaize_search);
route.post("/lake",lake_search);
route.post("/perry",perry_search);
route.post("/richland",richland_search);
route.post("/summit", summit_search);

export default route;