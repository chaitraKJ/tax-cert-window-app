const express = require("express");

const common_county_search = require("../controllers/FL/common_county.controller.js");
const palmbeach_search = require("../controllers/FL/palmbeach.controller.js");
const sarasota_search = require("../controllers/FL/sarasota.controller.js");

const leon_search = require("../controllers/FL/leon.controller.js");
const similar_search = require("../controllers/FL/similar.controller.js");
const common_search = require("../controllers/FL/commonFL.controller.js");
const levy_search = require("../controllers/FL/levy.controller.js");
const marion_search = require("../controllers/FL/marion.controller.js");
const polk_search = require("../controllers/FL/polk.controller.js");
const manatee_search = require("../controllers/FL/manatee.controller.js");
const gadsden_search = require("../controllers/FL/gadsden.controller.js");
const putnam_search = require("../controllers/FL/putnam.controller.js");

const route = express.Router();

route.post("/orange", (req, res, next) => {  req.url="fl-orange"; req.county="orange"; next(); }, common_county_search.search);
route.post("/hillsborough", (req, res, next) => {  req.url="hillsborough"; req.county="hillsborough"; next(); }, common_county_search.search);
route.post("/flagler", (req, res, next) => {  req.url="fl-flagler"; req.county="flagler"; next(); }, common_county_search.search);
route.post("/pinellas", (req, res, next) => {  req.url="pinellas"; req.county="pinellas"; next(); }, common_county_search.search);
route.post("/hernando", (req, res, next) => {  req.url="fl-hernando"; req.county="hernando"; next(); }, common_county_search.search);
route.post("/lee", (req, res, next) => {  req.url="fl-lee"; req.county="lee"; next(); }, common_county_search.search);
route.post("/brevard", (req, res, next) => {  req.url="brevard"; req.county="brevard"; next(); }, common_county_search.search);
route.post("/indian-river", (req, res, next) => {  req.url="indianriver"; req.county="indianriver"; next(); }, common_county_search.search);
route.post("/citrus", (req, res, next) => {  req.url="citrus"; req.county="citrus"; next(); }, common_county_search.search);
route.post("/seminole", (req, res, next) => {  req.url="fl-seminole"; req.county="seminole"; next(); }, common_county_search.search);
route.post("/charlotte", (req, res, next) => {  req.url="charlotte"; req.county="charlotte"; next(); }, common_county_search.search);
route.post("/collier", (req, res, next) => {  req.url="fl-collier"; req.county="collier"; next(); }, common_county_search.search);
route.post("/bay", (req, res, next) => {  req.url="fl-bay"; req.county="bay"; next(); }, common_county_search.search);
route.post("/pasco", (req, res, next) => {  req.url="fl-pasco"; req.county="pasco"; next(); }, common_county_search.search);
route.post("/st-lucie", (req, res, next) => {  req.url="stlucie"; req.county="stlucie"; next(); }, common_county_search.search);
route.post("/sumter", (req, res, next) => {  req.url="sumter"; req.county="sumter"; next(); }, common_county_search.search);
route.post("/clay", (req, res, next) => {  req.url="fl-clay"; req.county="clay"; next(); }, common_county_search.search);
route.post("/miami-dade", (req, res, next) => {  req.url="fl-miamidade"; req.county="miamidade"; next(); }, common_county_search.search);
route.post("/osceola", (req, res, next) => {  req.url="osceola"; req.county="osceola"; next(); }, common_county_search.search);
route.post("/santa-rosa", (req, res, next) => {  req.url="fl-santarosa"; req.county="santarosa"; next(); }, common_county_search.search);
route.post("/walton",  (req, res, next) => {  req.url="fl-walton"; req.county="walton"; next(); }, common_county_search.search);
route.post("/duval", (req, res, next) => {  req.url="fl-duval"; req.county="duval"; next(); }, common_county_search.search);
route.post("/volusia", (req, res, next) => {  req.url="vctaxcollector"; req.county="volusia"; next(); }, common_county_search.search);
route.post("/monroe", (req, res, next) => {  req.url="fl-monroe"; req.county="monroe"; next(); }, common_county_search.search);
route.post("/martin", (req, res, next) => {  req.url="fl-martin"; req.county="martin"; next(); }, common_county_search.search);
route.post("/nassau", (req, res, next) => {  req.url="fl-nassau"; req.county="nassau"; next(); }, common_county_search.search);
route.post("/okaloosa", (req, res, next) => {  req.url="okaloosa"; req.county="okaloosa"; next(); }, common_county_search.search);
route.post("/lake", (req, res, next) => {  req.url="lake"; req.county="lake"; next(); }, common_county_search.search);
route.post("/alachua", (req, res, next) => {  req.url="alachua"; req.county="alachua"; next(); }, common_county_search.search);
route.post("/broward", (req, res, next) => {  req.url="broward"; req.county="broward"; next(); }, common_county_search.search);
route.post("/escambia", (req, res, next) => {  req.url="fl-escambia"; req.county="escambia"; next(); }, common_county_search.search);

route.post("/palm-beach", palmbeach_search.search);
route.post("/sarasota", sarasota_search.search);

route.post("/holmes", similar_search.search);
route.post("/jefferson", similar_search.search);
route.post("/washington", similar_search.search);
route.post("/baker", similar_search.search);
route.post("/bradford", similar_search.search);
route.post("/gulf", similar_search.search);
route.post("/liberty", similar_search.search);
route.post("/madison", similar_search.search);
route.post("/glades", similar_search.search);
route.post("/jackson", similar_search.search);
route.post("/hardee", similar_search.search);
route.post("/desoto", similar_search.search);
route.post("/okeechobee", similar_search.search);
route.post("/wakulla", similar_search.search);
route.post("/franklin", similar_search.search);
route.post("/hamilton", similar_search.search);
route.post("/calhoun", similar_search.search);
route.post("/union", similar_search.search);

route.post("/lafayette", common_search.search);
route.post("/dixie", common_search.search);
route.post("/st-johns", common_search.search);
route.post("/gilchrist", common_search.search);
route.post("/suwannee", common_search.search);
route.post("/taylor", common_search.search);
route.post("/highlands", common_search.search);
route.post("/hendry", common_search.search);
route.post("/columbia", common_search.search);

route.post("/leon", leon_search.search);
route.post("/levy", levy_search.search);
route.post("/marion", marion_search.search);
route.post("/polk", polk_search.search);
route.post("/manatee", manatee_search.search);
route.post("/gadsden", gadsden_search.search);
route.post("/putnam", putnam_search.search);

module.exports = route;