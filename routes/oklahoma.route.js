import express from "express";

import { search as common_ok_search } from "../controllers/OK/common_ok.controller.js";
import { search as oklahoma_search } from "../controllers/OK/oklahoma.controller.js";
import { search as cleveland_search } from "../controllers/OK/cleveland.controller.js";

const route = express.Router();

route.post("/oklahoma", oklahoma_search);
route.post("/cleveland", cleveland_search);

route.post("/mcintosh", (req, res, next) => { req.county="McIntosh"; next(); }, common_ok_search);
route.post("/cotton", (req, res, next) => { req.county="Cotton"; next(); }, common_ok_search);
route.post("/dewey", (req, res, next) => { req.county="Dewey"; next(); }, common_ok_search);
route.post("/okfuskee", (req, res, next) => { req.county="Okfuskee"; next(); }, common_ok_search);
route.post("/washita", (req, res, next) => { req.county="Washita"; next(); }, common_ok_search);
route.post("/comanche", (req, res, next) => { req.county="Comanche"; next(); }, common_ok_search);
route.post("/garfield", (req, res, next) => { req.county="Garfield"; next(); }, common_ok_search);
route.post("/murray", (req, res, next) => { req.county="Murray"; next(); }, common_ok_search);
route.post("/woodward", (req, res, next) => { req.county="Woodward"; next(); }, common_ok_search);
route.post("/logan", (req, res, next) => { req.county="Logan"; next(); }, common_ok_search);

route.post("/mcclain", (req, res, next) => { req.county="McClain"; next(); }, common_ok_search);
route.post("/major", (req, res, next) => { req.county="Major"; next(); }, common_ok_search);
route.post("/pottawatomie", (req, res, next) => { req.county="Pottawatomie"; next(); }, common_ok_search);
route.post("/beaver", (req, res, next) => { req.county="beaver"; next(); }, common_ok_search);
route.post("/caddo", (req, res, next) => { req.county="Caddo"; next(); }, common_ok_search);
route.post("/haskell", (req, res, next) => { req.county="Haskell"; next(); }, common_ok_search);
route.post("/pawnee", (req, res, next) => { req.county="Pawnee"; next(); }, common_ok_search);
route.post("/kiowa", (req, res, next) => { req.county="Kiowa"; next(); }, common_ok_search);
route.post("/marshall", (req, res, next) => { req.county="Marshall"; next(); }, common_ok_search);
route.post("/johnston", (req, res, next) => { req.county="Johnston"; next(); }, common_ok_search);

route.post("/love", (req, res, next) => { req.county="Love"; next(); }, common_ok_search);
route.post("/pontotoc", (req, res, next) => { req.county="Pontotoc"; next(); }, common_ok_search);
route.post("/rogers", (req, res, next) => { req.county="Rogers"; next(); }, common_ok_search);
route.post("/custer", (req, res, next) => { req.county="custer"; next(); }, common_ok_search);
route.post("/muskogee", (req, res, next) => { req.county="muskogee"; next(); }, common_ok_search);
route.post("/ellis", (req, res, next) => { req.county="ellis"; next(); }, common_ok_search);
route.post("/mayes", (req, res, next) => { req.county="mayes"; next(); }, common_ok_search);
route.post("/creek", (req, res, next) => { req.county="Creek"; next(); }, common_ok_search);
route.post("/nowata", (req, res, next) => { req.county="nowata"; next(); }, common_ok_search);
route.post("/okmulgee", (req, res, next) => { req.county="okmulgee"; next(); }, common_ok_search);

route.post("/atoka", (req, res, next) => { req.county="Atoka"; next(); }, common_ok_search);
route.post("/lincoln", (req, res, next) => { req.county="lincoln"; next(); }, common_ok_search);
route.post("/payne", (req, res, next) => { req.county="Payne"; next(); }, common_ok_search);
route.post("/pittsburg", (req, res, next) => { req.county="Pittsburg"; next(); }, common_ok_search);
route.post("/coal", (req, res, next) => { req.county="Coal"; next(); }, common_ok_search);
route.post("/canadian", (req, res, next) => { req.county="canadian"; next(); }, common_ok_search);
route.post("/cherokee", (req, res, next) => { req.county="Cherokee"; next(); }, common_ok_search);
route.post("/harmon", (req, res, next) => { req.county="harmon"; next(); }, common_ok_search);
route.post("/stephens", (req, res, next) => { req.county="Stephens"; next(); }, common_ok_search);
route.post("/garvin", (req, res, next) => { req.county="Garvin"; next(); }, common_ok_search);

route.post("/jackson", (req, res, next) => { req.county="jackson"; next(); }, common_ok_search);
route.post("/jefferson", (req, res, next) => { req.county="Jefferson"; next(); }, common_ok_search);
route.post("/le-flore", (req, res, next) => { req.county="leflore"; next(); }, common_ok_search);
route.post("/alfalfa", (req, res, next) => { req.county="Alfalfa"; next(); }, common_ok_search);
route.post("/grant", (req, res, next) => { req.county="Grant"; next(); }, common_ok_search);
route.post("/osage", (req, res, next) => { req.county="Osage"; next(); }, common_ok_search);
route.post("/bryan", (req, res, next) => { req.county="Bryan"; next(); }, common_ok_search);
route.post("/roger-mills", (req, res, next) => { req.county="RogerMills"; next(); }, common_ok_search);
route.post("/sequoyah", (req, res, next) => { req.county="Sequoyah"; next(); }, common_ok_search);
route.post("/craig", (req, res, next) => { req.county="Craig"; next(); }, common_ok_search);

route.post("/grady", (req, res, next) => { req.county="Grady"; next(); }, common_ok_search);
route.post("/pushmataha", (req, res, next) => { req.county="Pushmataha"; next(); }, common_ok_search);
route.post("/wagoner", (req, res, next) => { req.county="Wagoner"; next(); }, common_ok_search);
route.post("/delaware", (req, res, next) => { req.county="Delaware"; next(); }, common_ok_search);
route.post("/ottawa", (req, res, next) => { req.county="Ottawa"; next(); }, common_ok_search);
route.post("/seminole", (req, res, next) => { req.county="Seminole"; next(); }, common_ok_search);
route.post("/tulsa", (req, res, next) => { req.county="Tulsa"; next(); }, common_ok_search);
route.post("/adair", (req, res, next) => { req.county="Adair"; next(); }, common_ok_search);
route.post("/choctaw", (req, res, next) => { req.county="Choctaw"; next(); }, common_ok_search);
route.post("/greer", (req, res, next) => { req.county="Greer"; next(); }, common_ok_search);

route.post("/harper", (req, res, next) => { req.county="Harper"; next(); }, common_ok_search);
route.post("/noble", (req, res, next) => { req.county="Noble"; next(); }, common_ok_search);
route.post("/texas", (req, res, next) => { req.county="Texas"; next(); }, common_ok_search);
route.post("/blaine", (req, res, next) => { req.county="Blaine"; next(); }, common_ok_search);
route.post("/latimer", (req, res, next) => { req.county="Latimer"; next(); }, common_ok_search);
route.post("/cimarron", (req, res, next) => { req.county="Cimarron"; next(); }, common_ok_search);
route.post("/woods", (req, res, next) => { req.county="Woods"; next(); }, common_ok_search);
route.post("/beckham", (req, res, next) => { req.county="Beckham"; next(); }, common_ok_search);
route.post("/carter", (req, res, next) => { req.county="Carter"; next(); }, common_ok_search);
route.post("/kay", (req, res, next) => { req.county="Kay"; next(); }, common_ok_search);

route.post("/kingfisher", (req, res, next) => { req.county="Kingfisher"; next(); }, common_ok_search);
route.post("/mccurtain", (req, res, next) => { req.county="McCurtain"; next(); }, common_ok_search);
route.post("/tillman", (req, res, next) => { req.county="Tillman"; next(); }, common_ok_search);
route.post("/washington", (req, res, next) => { req.county="Washington"; next(); }, common_ok_search);

export default route;