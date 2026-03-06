const express = require("express");

const scioto_search  = require("../controllers/OH/scioto.controller.js");
const similar_search  = require("../controllers/OH/similar_ohio.controller.js");
const common_search  = require("../controllers/OH/common_ohio.controller.js");
const commons_search  = require("../controllers/OH/common_ohios.controller.js");
const hocking_search  = require("../controllers/OH/hocking.controller.js");
const sandusky_search  = require("../controllers/OH/sandusky.controller.js");
const mahoning_search  = require("../controllers/OH/mahoning.controller.js");
const vinton_search  = require("../controllers/OH/vinton.controller.js");
const trumbull_search  = require("../controllers/OH/trumbull.controller.js");
const adams_knox_search  = require("../controllers/OH/adams_knox.controller.js");
const williams_search  = require("../controllers/OH/williams.controller.js");
const montgomery_search  = require("../controllers/OH/montgomery.controller.js");
const allen_highland_portage_search  = require("../controllers/OH/allen_highland_portage.controller.js");
const lawrence_search  = require("../controllers/OH/lawrence.controller.js");
const meigs_search  = require("../controllers/OH/meigs.controller.js");
const hancock_search  = require("../controllers/OH/hancock.controller.js");
const preble_search  = require("../controllers/OH/preble.controller.js");
const fairfield_search  = require("../controllers/OH/fairfield.controller.js");
const jackson_search  = require("../controllers/OH/jackson.controller.js");
const columbiana_search  = require("../controllers/OH/columbiana.controller.js");
const marion_search  = require("../controllers/OH/marion.controller.js");
const medina_search  = require("../controllers/OH/medina.controller.js");
const franklin_search  = require("../controllers/OH/franklin.controller.js");
const wood_search  = require("../controllers/OH/wood.controller.js");
const morrow_search  = require("../controllers/OH/morrow.controller.js");
const hamilton_search  = require("../controllers/OH/hamilton.controller.js");
const butler_search  = require("../controllers/OH/butler.controller.js");
const guernsey_wayne_madison_search  = require("../controllers/OH/guernsey_wayne_madison.controller.js");
const washington_ross_search  = require("../controllers/OH/washington_ross.controller.js");
const ashtabula_search  = require("../controllers/OH/ashtabula.controller.js");
const pike_henry_search  = require("../controllers/OH/pike_henry.controller.js");
const delaware_search  = require("../controllers/OH/delaware.controller.js");
const monroe_search  = require("../controllers/OH/monroe.controller.js");
const mercer_search  = require("../controllers/OH/mercer.controller.js");
const fulton_search  = require("../controllers/OH/fulton.controller.js");
const union_search  = require("../controllers/OH/union.controller.js");
const lucas_search  = require("../controllers/OH/lucas.controller.js");
const warren_search  = require("../controllers/OH/warren.controller.js");
const harrison_search  = require("../controllers/OH/harrison.controller.js");
const jefferson_search  = require("../controllers/OH/jefferson.controller.js");
const clermont_search  = require("../controllers/OH/clermont.controller.js");
const stark_search  = require("../controllers/OH/stark.controller.js");
const cuyahoga_search  = require("../controllers/OH/cuyahoga.controller.js");
const auglaize_search  = require("../controllers/OH/auglaize.controller.js");
const lake_search  = require("../controllers/OH/lake.controller.js");
const perry_search  = require("../controllers/OH/perry.controller.js");
const richland_search  = require("../controllers/OH/richland.controller.js");
const summit_search  = require("../controllers/OH/summit.controller.js");

const route = express.Router();

route.post("/darke", common_search.search);
route.post("/paulding", common_search.search);
route.post("/miami", common_search.search);

route.post("/greene", similar_search.search);
route.post("/fayette", similar_search.search);
route.post("/erie", similar_search.search);
route.post("/brown", similar_search.search);
route.post("/clinton", similar_search.search);
route.post("/seneca", similar_search.search);
route.post("/logan", similar_search.search);
route.post("/tuscarawas", similar_search.search);
route.post("/belmont", similar_search.search);
route.post("/shelby", similar_search.search);
route.post("/morgan", similar_search.search);
route.post("/holmes", similar_search.search);
route.post("/huron", similar_search.search);
route.post("/coshocton", similar_search.search);
route.post("/muskingum", similar_search.search);
route.post("/champaign", similar_search.search);
route.post("/geauga", similar_search.search);
route.post("/carroll", similar_search.search);
route.post("/ottawa",similar_search.search);
route.post("/lorain",similar_search.search);

route.post("/pickaway",commons_search.search);
route.post("/gallia",commons_search.search);
route.post("/clark",commons_search.search);
route.post("/athens",commons_search.search);

route.post("/wayne",guernsey_wayne_madison_search.search);
route.post("/guernsey",guernsey_wayne_madison_search.search);
route.post("/madison",guernsey_wayne_madison_search.search);

route.post("/washington",washington_ross_search.search);
route.post("/ross", washington_ross_search.search);

route.post("/adams",adams_knox_search.search);
route.post("/knox",adams_knox_search.search);

route.post("/allen",allen_highland_portage_search.search);
route.post("/highland",allen_highland_portage_search.search);
route.post("/portage",allen_highland_portage_search.search);

route.post("/harrison", harrison_search.search);
route.post("/noble", harrison_search.search);
route.post("/hardin", harrison_search.search);
route.post("/crawford", harrison_search.search);
route.post("/wyandot", harrison_search.search);

route.post("/henry",pike_henry_search.search);
route.post("/pike",pike_henry_search.search);

route.post("/columbiana",columbiana_search.search);
route.post("/ashland", columbiana_search.search);

route.post("/scioto",scioto_search.search);
route.post("/hocking",hocking_search.search);
route.post("/sandusky",sandusky_search.search);
route.post("/mahoning",mahoning_search.search);
route.post("/vinton",vinton_search.search);
route.post("/trumbull",trumbull_search.search);
route.post("/williams",  williams_search.search); 
route.post("/montgomery",montgomery_search.search);
route.post("/lawrence",lawrence_search.search);
route.post("/meigs",meigs_search.search);
route.post("/hancock",hancock_search.search);
route.post("/preble",preble_search.search);
route.post("/fairfield",fairfield_search.search);
route.post("/jackson",jackson_search.search);
route.post("/marion",marion_search.search);
route.post("/medina",medina_search.search);
route.post("/franklin",franklin_search.search);
route.post("/wood",wood_search.search);
route.post("/morrow", morrow_search.search);
route.post("/hamilton",hamilton_search.search);
route.post("/butler", butler_search.search);
route.post("/ashtabula", ashtabula_search.search);
route.post("/delaware",delaware_search.search);
route.post("/monroe", monroe_search.search);
route.post("/mercer", mercer_search.search);
route.post("/fulton",fulton_search.search);
route.post("/union",union_search.search);
route.post("/lucas",lucas_search.search);
route.post("/warren",warren_search.search);
route.post("/jefferson",jefferson_search.search);
route.post("/clermont", clermont_search.search);
route.post("/stark", stark_search.search);
route.post("/cuyahoga",cuyahoga_search.search);
route.post("/auglaize",auglaize_search.search);
route.post("/lake",lake_search.search);
route.post("/perry",perry_search.search);
route.post("/richland",richland_search.search);
route.post("/summit", summit_search.search);

module.exports = route;