import express from "express";

import { search as common_county_search } from "../controllers/FL/common_county.controller.js";
import { search as palmbeach_search } from "../controllers/FL/palmbeach.controller.js";
import { search as sarasota_search } from "../controllers/FL/sarasota.controller.js";

import { search as leon_search } from "../controllers/FL/leon.controller.js";
import { search as similar_search } from "../controllers/FL/similar.controller.js";
import { search as common_search } from "../controllers/FL/commonFL.controller.js";
import { search as levy_search } from "../controllers/FL/levy.controller.js";
import { search as marion_search } from "../controllers/FL/marion.controller.js";
import { search as polk_search } from "../controllers/FL/polk.controller.js";
import { search as manatee_search } from "../controllers/FL/manatee.controller.js";
import { search as gadsden_search } from "../controllers/FL/gadsden.controller.js"
import { search as putnam_search } from "../controllers/FL/putnam.controller.js";

const route = express.Router();

route.post("/orange", (req, res, next) => {  req.url="fl-orange"; req.county="orange"; next(); }, common_county_search);
route.post("/hillsborough", (req, res, next) => {  req.url="hillsborough"; req.county="hillsborough"; next(); }, common_county_search);
route.post("/flagler", (req, res, next) => {  req.url="fl-flagler"; req.county="flagler"; next(); }, common_county_search);
route.post("/pinellas", (req, res, next) => {  req.url="pinellas"; req.county="pinellas"; next(); }, common_county_search);
route.post("/hernando", (req, res, next) => {  req.url="fl-hernando"; req.county="hernando"; next(); }, common_county_search);
route.post("/lee", (req, res, next) => {  req.url="fl-lee"; req.county="lee"; next(); }, common_county_search);
route.post("/brevard", (req, res, next) => {  req.url="brevard"; req.county="brevard"; next(); }, common_county_search);
route.post("/indian-river", (req, res, next) => {  req.url="indianriver"; req.county="indianriver"; next(); }, common_county_search);
route.post("/citrus", (req, res, next) => {  req.url="citrus"; req.county="citrus"; next(); }, common_county_search);
route.post("/seminole", (req, res, next) => {  req.url="fl-seminole"; req.county="seminole"; next(); }, common_county_search);
route.post("/charlotte", (req, res, next) => {  req.url="charlotte"; req.county="charlotte"; next(); }, common_county_search);
route.post("/collier", (req, res, next) => {  req.url="fl-collier"; req.county="collier"; next(); }, common_county_search);
route.post("/bay", (req, res, next) => {  req.url="fl-bay"; req.county="bay"; next(); }, common_county_search);
route.post("/pasco", (req, res, next) => {  req.url="fl-pasco"; req.county="pasco"; next(); }, common_county_search);
route.post("/st-lucie", (req, res, next) => {  req.url="stlucie"; req.county="stlucie"; next(); }, common_county_search);
route.post("/sumter", (req, res, next) => {  req.url="sumter"; req.county="sumter"; next(); }, common_county_search);
route.post("/clay", (req, res, next) => {  req.url="fl-clay"; req.county="clay"; next(); }, common_county_search);
route.post("/miami-dade", (req, res, next) => {  req.url="fl-miamidade"; req.county="miamidade"; next(); }, common_county_search);
route.post("/osceola", (req, res, next) => {  req.url="osceola"; req.county="osceola"; next(); }, common_county_search);
route.post("/santa-rosa", (req, res, next) => {  req.url="fl-santarosa"; req.county="santarosa"; next(); }, common_county_search);
route.post("/walton",  (req, res, next) => {  req.url="fl-walton"; req.county="walton"; next(); }, common_county_search);
route.post("/duval", (req, res, next) => {  req.url="fl-duval"; req.county="duval"; next(); }, common_county_search);
route.post("/volusia", (req, res, next) => {  req.url="vctaxcollector"; req.county="volusia"; next(); }, common_county_search);
route.post("/monroe", (req, res, next) => {  req.url="fl-monroe"; req.county="monroe"; next(); }, common_county_search);
route.post("/martin", (req, res, next) => {  req.url="fl-martin"; req.county="martin"; next(); }, common_county_search);
route.post("/nassau", (req, res, next) => {  req.url="fl-nassau"; req.county="nassau"; next(); }, common_county_search);
route.post("/okaloosa", (req, res, next) => {  req.url="okaloosa"; req.county="okaloosa"; next(); }, common_county_search);
route.post("/lake", (req, res, next) => {  req.url="lake"; req.county="lake"; next(); }, common_county_search);
route.post("/alachua", (req, res, next) => {  req.url="alachua"; req.county="alachua"; next(); }, common_county_search);
route.post("/broward", (req, res, next) => {  req.url="broward"; req.county="broward"; next(); }, common_county_search);
route.post("/escambia", (req, res, next) => {  req.url="fl-escambia"; req.county="escambia"; next(); }, common_county_search);

route.post("/palm-beach", palmbeach_search);
route.post("/sarasota", sarasota_search);

route.post("/holmes", similar_search);
route.post("/jefferson", similar_search);
route.post("/washington", similar_search);
route.post("/baker", similar_search);
route.post("/bradford", similar_search);
route.post("/gulf", similar_search);
route.post("/liberty", similar_search);
route.post("/madison", similar_search);
route.post("/glades", similar_search);
route.post("/jackson", similar_search);
route.post("/hardee", similar_search);
route.post("/desoto", similar_search);
route.post("/okeechobee", similar_search);
route.post("/wakulla", similar_search);
route.post("/franklin", similar_search);
route.post("/hamilton", similar_search);
route.post("/calhoun", similar_search);
route.post("/union", similar_search);

route.post("/lafayette", common_search);
route.post("/dixie", common_search);
route.post("/st-johns", common_search);
route.post("/gilchrist", common_search);
route.post("/suwannee", common_search);
route.post("/taylor", common_search);
route.post("/highlands", common_search);
route.post("/hendry", common_search);
route.post("/columbia", common_search);

route.post("/leon", leon_search);
route.post("/levy", levy_search);
route.post("/marion", marion_search);
route.post("/polk", polk_search);
route.post("/manatee", manatee_search);
route.post("/gadsden", gadsden_search);
route.post("/putnam", putnam_search);

export default route;