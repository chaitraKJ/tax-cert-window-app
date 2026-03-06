const express = require("express");

const common_iowatreasurer = require("../controllers/IA/common_iowatreasurer.controller.js");
const poweshiek_search = require("../controllers/IA/poweshiek.controller.js");
const polk_search = require("../controllers/IA/polk.controller.js");

const route = express.Router();

route.post("/adams",(req, res, next)=>{ req.countyid=2; req.countyauthority="500 9th St, Corning, IA 50841, Phone: 641-322-3210";  next(); },common_iowatreasurer.search);
route.post("/allamakee",(req, res, next)=>{ req.countyid=3; req.countyauthority="110 Allamakee Street, Waukon, IA 52172, Phone: 563-568-3793";  next(); },common_iowatreasurer.search);
route.post("/cherokee",(req, res, next)=>{ req.countyid=18; req.countyauthority="110 Allamakee Street, Waukon, IA 52172, Phone: 563-568-3793";  next(); }, common_iowatreasurer.search);
route.post("/sac",(req, res, next)=>{ req.countyid=81; req.countyauthority="100 NW State Street, Sac City IA 50583, Phone: 712-662-7411";  next(); }, common_iowatreasurer.search);
route.post("/hardin",(req, res, next)=>{ req.countyid=42; req.countyauthority="P.O. Box 391, 1215 Edgington Avenue, Eldora, IA 50627-0391, Phone: (641) 939-8230";  next(); }, common_iowatreasurer.search);
route.post("/mahaska",(req, res, next)=>{ req.countyid=62; req.countyauthority="106 South 1st Street adjacent town square, Phone: (641)673-5482";  next(); }, common_iowatreasurer.search);
route.post("/taylor",(req, res, next)=>{ req.countyid=87; req.countyauthority="405 Jefferson St Ste 2, Phone: 712-523-2080";  next(); }, common_iowatreasurer.search);
route.post("/butler",(req, res, next)=>{ req.countyid=12; req.countyauthority="PO Box 327, Allison IA 50602, Phone: (319) 346-6626";  next(); }, common_iowatreasurer.search);
route.post("/scott",(req, res, next)=>{ req.countyid=82; req.countyauthority="Scott County Administrative Center, 600 W 4th Street, Davenport, IA 52801, Phone: 563-326-8670";  next(); }, common_iowatreasurer.search);
route.post("/shelby",(req, res, next)=>{ req.countyid=83; req.countyauthority="612 Court Street, Room 202, PO Box 110, Harlan, IA 51537, Phone: (712) 755-5847";  next(); }, common_iowatreasurer.search);

route.post("/clayton",(req, res, next)=>{ req.countyid=22; req.countyauthority="8 E Prospect St, PO Box 186, New Hampton, IA  50659, Phone: 641-394-2107"; next(); }, common_iowatreasurer.search);
route.post("/davis",(req, res, next)=>{ req.countyid=26; req.countyauthority="100 Courthouse Square Suite 8, Bloomfield, IA 52537, Phone: 641-664-2155"; next(); }, common_iowatreasurer.search);
route.post("/kossuth",(req, res, next)=>{ req.countyid=55; req.countyauthority="114 W State St, Algona, IA 50511, Phone: 515-295-3404"; next(); }, common_iowatreasurer.search);
route.post("/muscatine",(req, res, next)=>{ req.countyid=70; req.countyauthority="414 E. 3rd St., Suite 102, Muscatine, IA 52761, Phone: (563) 263-6764"; next(); }, common_iowatreasurer.search);
route.post("/winnebago",(req, res, next)=>{ req.countyid=95; req.countyauthority="126 S. Clark Street, Forest City, IA 50436, Phone: (641) 585-2322"; next(); }, common_iowatreasurer.search);
route.post("/cedar",(req, res, next)=>{ req.countyid=16; req.countyauthority="400 Cedar St, Tipton, IA 52772, Phone: 563-886-2557"; next(); }, common_iowatreasurer.search);
route.post("/keokuk",(req, res, next)=>{ req.countyid=54; req.countyauthority="101 S. Main, Sigourney, IA 52591, Phone: (641) 622-2421"; next(); }, common_iowatreasurer.search);
route.post("/benton",(req, res, next)=>{ req.countyid=6; req.countyauthority="111 E 4th St Ste 3, Vinton, IA 52349, Phone: (319) 472-2439"; next(); }, common_iowatreasurer.search);
route.post("/black-hawk",(req, res, next)=>{ req.countyid=7; req.countyauthority="316 E 5th Street, Room 140, Waterloo, IA 50703, Phone: (319) 833-3013"; next(); }, common_iowatreasurer.search);
route.post("/bremer",(req, res, next)=>{ req.countyid=9; req.countyauthority="415 E. Bremer Ave, Waverly, IA 50677, Phone: (319) 352-0242"; next(); }, common_iowatreasurer.search);

route.post("/clay",(req, res, next)=>{ req.countyid=21; req.countyauthority="300 W 4th St, Spencer, IA 51301, Phone: 712-262-2179"; next(); }, common_iowatreasurer.search);
route.post("/cerro-gordo",(req, res, next)=>{ req.countyid=17; req.countyauthority="220 N Washington Ave, Mason City, IA 50401, Phone: (641) 421-3127"; next(); }, common_iowatreasurer.search);
route.post("/clarke",(req, res, next)=>{ req.countyid=20; req.countyauthority="P.O. Box 157, Osceola, IA 50213, Phone: (641) 342-3311"; next(); }, common_iowatreasurer.search);
route.post("/o-brien",(req, res, next)=>{ req.countyid=71; req.countyauthority="155 S Hayes Ave PO Box 310, Primghar IA 51245, Phone: (712) 957-3210"; next(); }, common_iowatreasurer.search);
route.post("/appanoose",(req, res, next)=>{ req.countyid=4; req.countyauthority="Courthouse, Second Floor, 201 N 12th St., Centerville, Iowa 52544"; next(); }, common_iowatreasurer.search);
route.post("/warren",(req, res, next)=>{ req.countyid=91; req.countyauthority="301 N Buxton, Ste 102, PO Box 217, Indianola, IA 50125, Phone: 515-690-9240"; next(); }, common_iowatreasurer.search);
route.post("/wayne",(req, res, next)=>{ req.countyid=93; req.countyauthority="100 N Lafayette St, PO Box 435. Corydon, IA 50060, Phone: (641) 872-2515"; next(); }, common_iowatreasurer.search);
route.post("/buena-vista",(req, res, next)=>{ req.countyid=11; req.countyauthority="215 E. 5th Street, P.O. Drawer 149, Storm Lake, IA 50588, phone: 712-749-2533"; next(); }, common_iowatreasurer.search);
route.post("/chickasaw",(req, res, next)=>{ req.countyid=19; req.countyauthority="8 E Prospect St, PO Box 186, New Hampton, IA  50659, Phone: 641-394-2107"; next(); }, common_iowatreasurer.search);
route.post("/fayette",(req, res, next)=>{ req.countyid=33; req.countyauthority="114 N Vine St, PO Box 273, West Union, IA  52175, Phone: 563-422-3787"; next(); }, common_iowatreasurer.search);

route.post("/hamilton",(req, res, next)=>{ req.countyid=40; req.countyauthority="Courthouse, first floor, 2300 Superior St. Ste.7, Webster City IA 50595, Phone: 515-832-9542"; next(); }, common_iowatreasurer.search);
route.post("/mitchell",(req, res, next)=>{ req.countyid=66; req.countyauthority="212 S 5th Street, Osage, Iowa. 50461, Phone: 641-832-3940"; next(); }, common_iowatreasurer.search);
route.post("/harrison",(req, res, next)=>{ req.countyid=43; req.countyauthority="111 N. 2nd Ave, Suite #7, Logan, IA 51546, Phone:(712) 644-2750"; next(); }, common_iowatreasurer.search);
route.post("/ida",(req, res, next)=>{ req.countyid=47; req.countyauthority="401 Moorehead St, Ida Grove, IA 51445, Phone: (712) 364-2625"; next(); }, common_iowatreasurer.search);
route.post("/hancock",(req, res, next)=>{ req.countyid=41; req.countyauthority="855 State Street, Garner, IA 50438-0070, Phone: (641) 923-3122"; next(); }, common_iowatreasurer.search);
route.post("/jones",(req, res, next)=>{ req.countyid=53; req.countyauthority="P.O. Box 79, Anamosa, Iowa 52205, Phone: (319) 462-3550"; next(); }, common_iowatreasurer.search);
route.post("/wapello",(req, res, next)=>{ req.countyid=90; req.countyauthority="101 W Fourth St, Ottumwa, IA 52501, Phone: 641-683-0040"; next(); }, common_iowatreasurer.search);
route.post("/delaware",(req, res, next)=>{ req.countyid=28; req.countyauthority="PO Box 27, Manchester, IA 52057, Phone: 563-927-2845"; next(); }, common_iowatreasurer.search);
route.post("/henry",(req, res, next)=>{ req.countyid=44; req.countyauthority="100 East Washington Street, Mount Pleasant, IA 52641, Phone: 3193850763"; next(); }, common_iowatreasurer.search);
route.post("/webster",(req, res, next)=>{ req.countyid=94; req.countyauthority="Webster County Courthouse - 1st Floor, 701 Central Avenue, Fort Dodge, IA 50501, Phone: 515-576-4611"; next(); }, common_iowatreasurer.search);

route.post("/worth",(req, res, next)=>{ req.countyid=98; req.countyauthority="822 Central Ave, P.O. Box 257, Northwood, IA 50459, Phone: 641-324-2942"; next(); }, common_iowatreasurer.search);
route.post("/wright",(req, res, next)=>{ req.countyid=99; req.countyauthority="115 N Main St, P.O. Box 226, Clarion, IA 50525, Phone: (515) 532-2691"; next(); }, common_iowatreasurer.search);
route.post("/ringgold",(req, res, next)=>{ req.countyid=80; req.countyauthority="109 W Madison St. #200, Mount Ayr, IA 50854 Phone: (641) 464-3230"; next(); }, common_iowatreasurer.search);
route.post("/clinton",(req, res, next)=>{ req.countyid=23; req.countyauthority="1900 N 3rd St-PO Box 2957, Clinton IA 52733-2957 Phone: (563) 244-0573"; next(); }, common_iowatreasurer.search);
route.post("/howard",(req, res, next)=>{ req.countyid=45; req.countyauthority="137 N Elm St, Cresco, IA  52136, Phone: 563-547-9211"; next(); }, common_iowatreasurer.search);
route.post("/monroe",(req, res, next)=>{ req.countyid=68; req.countyauthority="10 Benton Ave E, Albia, IA 52531 Phone: 641-932-5011"; next(); }, common_iowatreasurer.search);
route.post("/plymouth",(req, res, next)=>{ req.countyid=75; req.countyauthority="215 4th Ave SE, Le Mars Iowa 51031 Phone: (712)546-7056"; next(); }, common_iowatreasurer.search);
route.post("/tama",(req, res, next)=>{ req.countyid=86; req.countyauthority="104 W. State St., Toledo, IA 52342, Phone: 641-484-3141"; next(); }, common_iowatreasurer.search);
route.post("/louisa",(req, res, next)=>{ req.countyid=58; req.countyauthority="117 S Main PO Box 207, Wapello, IA 52653, Phone: 319-523-4451"; next(); }, common_iowatreasurer.search);
route.post("/madison",(req, res, next)=>{ req.countyid=61; req.countyauthority="201 W. Court Ave, P.O. Box 152, Winterset, IA 50273, Phone: 515-462-1542"; next(); }, common_iowatreasurer.search);


route.post("/boone",(req, res, next)=>{ req.countyid=8; req.countyauthority="201 State St, Boone, IA  50036, Phone: 515-433-0510"; next(); }, common_iowatreasurer.search);
route.post("/calhoun",(req, res, next)=>{ req.countyid=13; req.countyauthority="416 Fourth Street, Suite 2, Calhoun County Courthouse, Rockwell City, Iowa 50579 Phone: (712)297-7111"; next(); }, common_iowatreasurer.search);
route.post("/cass",(req, res, next)=>{ req.countyid=15; req.countyauthority="Main Floor, 5 W 7th Street, Atlantic, IA  50022, Phone:  712-243-5503"; next(); }, common_iowatreasurer.search);
route.post("/lyon",(req, res, next)=>{ req.countyid=60; req.countyauthority="206 S. 2nd Ave, Ste 107, Rock Rapids, IA 51246, Phone: (712)472-8500"; next(); }, common_iowatreasurer.search);
route.post("/marion",(req, res, next)=>{ req.countyid=63; req.countyauthority="214 E Main St, Knoxville IA  50138"; next(); }, common_iowatreasurer.search);
route.post("/marshall",(req, res, next)=>{ req.countyid=64; req.countyauthority="1 East Main Street, Marshalltown, Iowa 50158, Phone: 641.844.2730"; next(); }, common_iowatreasurer.search);
route.post("/story",(req, res, next)=>{ req.countyid=85; req.countyauthority="1st Floor - Story County Administration Building, 900 6th Street, Nevada, Iowa 50201, Phone: 515-382-7330"; next(); }, common_iowatreasurer.search);
route.post("/audubon",(req, res, next)=>{ req.countyid=5; req.countyauthority="318 Leroy St. #5, Audubon, IA 50025-1255, Phone: 712.563-2293"; next(); }, common_iowatreasurer.search);
route.post("/dubuque",(req, res, next)=>{ req.countyid=31; req.countyauthority="720 Central Ave, Dubuque IA 52001, Phone: 563-589-4450"; next(); }, common_iowatreasurer.search);
route.post("/humboldt",(req, res, next)=>{ req.countyid=46; req.countyauthority="203 Main St, PO Box 100, Dakota City, IA 50529, Phone: 515-332-1681"; next(); }, common_iowatreasurer.search);

route.post("/carroll",(req, res, next)=>{ req.countyid=14; req.countyauthority="114 E. 6th St., P.O.Box 68, Carroll, IA 51401, Phone: (712) 792-1200"; next(); }, common_iowatreasurer.search);
route.post("/crawford",(req, res, next)=>{ req.countyid=24; req.countyauthority="1202 Broadway, Ste. 7, Denison, IA 51442, Phone: (712) 263-2648"; next(); }, common_iowatreasurer.search);
route.post("/des-moines",(req, res, next)=>{ req.countyid=29; req.countyauthority="PO Box 248, Burlington, IA 52601, Phone: (319) 753-8252"; next(); }, common_iowatreasurer.search);
route.post("/pocahontas",(req, res, next)=>{ req.countyid=76; req.countyauthority="99 Court Square Ste 8, Pocahontas, IA 50574, Phone: (712) 335-4334"; next(); }, common_iowatreasurer.search);
route.post("/sioux",(req, res, next)=>{ req.countyid=84; req.countyauthority="211 Central Ave SE PO Box 77, Orange City, IA 51041-0077, Phone: (712) 737-3505"; next(); }, common_iowatreasurer.search);
route.post("/van-buren",(req, res, next)=>{ req.countyid=89; req.countyauthority="404 Dodge St, PO Box 473, Keosauqua, IA  52565, Phone: (319) 293-3110"; next(); }, common_iowatreasurer.search);
route.post("/grundy",(req, res, next)=>{ req.countyid=38; req.countyauthority="706 G Ave, Grundy Center, IA 50638, Phone: (319)824-3108"; next(); }, common_iowatreasurer.search);
route.post("/guthrie",(req, res, next)=>{ req.countyid=39; req.countyauthority="200 N 5th St, Guthrie Center IA 50115, Phone: (641)747-3414"; next(); }, common_iowatreasurer.search);
route.post("/jasper",(req, res, next)=>{ req.countyid=50; req.countyauthority="315 W 3rd St N Suite 500, PO Box 1387, Newton, Iowa 50208, Phone: 641-792-7731"; next(); }, common_iowatreasurer.search);
route.post("/jefferson",(req, res, next)=>{ req.countyid=51; req.countyauthority="PO Box 308, Fairfield, IA 52556, Phone: (641) 472-2349"; next(); }, common_iowatreasurer.search);

route.post("/lee",(req, res, next)=>{ req.countyid=56; req.countyauthority="2231 180TH AVE, DONNELLSON IA 52625"; next(); }, common_iowatreasurer.search);
route.post("/lucas",(req, res, next)=>{ req.countyid=59; req.countyauthority="916 Braden Ave., Chariton, IA 50049, Phone: (641) 774-5213"; next(); }, common_iowatreasurer.search);
route.post("/winneshiek",(req, res, next)=>{ req.countyid=96; req.countyauthority="201 W. Main St., Decorah, Iowa 52101, Phone: 563-382-3753"; next(); }, common_iowatreasurer.search);
route.post("/dallas",(req, res, next)=>{ req.countyid=25; req.countyauthority="800 Court Street, Suite 111, Adel, IA 50003 Phone: (515) 993-5808"; next(); }, common_iowatreasurer.search);
route.post("/page",(req, res, next)=>{ req.countyid=73; req.countyauthority="112 E. Main, PO Box 224, Clarinda, IA 51632, Phone: 712.542.5322"; next(); }, common_iowatreasurer.search);
route.post("/washington",(req, res, next)=>{ req.countyid=92; req.countyauthority="PO Box 889, 222 W Main St, Washington IA 52353 Phone: (319) 653-7721"; next(); }, common_iowatreasurer.search);
route.post("/emmet",(req, res, next)=>{ req.countyid=32; req.countyauthority="609 1st Ave N Ste 8, PO Box 55, Estherville, IA 51334, Phone: 712-362-3824"; next(); }, common_iowatreasurer.search);
route.post("/franklin",(req, res, next)=>{ req.countyid=35; req.countyauthority="12 1st Ave NW, P.O. Box 178, Hampton, IA 50441, Phone: 641-456-5678"; next(); }, common_iowatreasurer.search);
route.post("/monona",(req, res, next)=>{ req.countyid=67; req.countyauthority="610 Iowa Ave, P.O. Box 415, Onawa, IA 51040, Phone: (712) 433-2347"; next(); }, common_iowatreasurer.search);
route.post("/woodbury",(req, res, next)=>{ req.countyid=97; req.countyauthority="822 Douglas St. Suite 102, Sioux City, IA 51101 Phone: (712) 279-6495"; next(); }, common_iowatreasurer.search);

route.post("/osceola",(req, res, next)=>{ req.countyid=72; req.countyauthority="300 7th St, P.O. Box 166, Sibley, IA 51249, Phone: (712) 754-2117"; next(); }, common_iowatreasurer.search);
route.post("/palo-alto",(req, res, next)=>{ req.countyid=74; req.countyauthority="1010 Broadway, PO Box 77, Emmetsburg, IA 50536, Phone: 712-852-3844"; next(); }, common_iowatreasurer.search);
route.post("/pottawattamie",(req, res, next)=>{ req.countyid=78; req.countyauthority="227 South 6th Street, Council Bluffs, Iowa 51501, Phone: 712-328-5627"; next(); }, common_iowatreasurer.search);
route.post("/union",(req, res, next)=>{ req.countyid=88; req.countyauthority="300 N Pine Street, Suite #1, Creston IA 50801 Phone: (641) 782-1710"; next(); }, common_iowatreasurer.search);
route.post("/jackson",(req, res, next)=>{ req.countyid=49; req.countyauthority="201 W. Platt St., Maquoketa, IA 52060 Phone: 563-652-5649"; next(); }, common_iowatreasurer.search);
route.post("/adair",(req, res, next)=>{ req.countyid=1; req.countyauthority="400 Public Square Ste. 2, Greenfield, IA 50849 Phone: (641) 743-2312"; next(); }, common_iowatreasurer.search);
route.post("/decatur",(req, res, next)=>{ req.countyid=27; req.countyauthority="207 N Main St, Leon, IA 50144 Phone: (641) 446-4321"; next(); }, common_iowatreasurer.search);
route.post("/fremont",(req, res, next)=>{ req.countyid=36; req.countyauthority="506 Filmore Street, PO Box 299, Sidney, Iowa 51652-0299, Phone: 712-374-2122"; next(); }, common_iowatreasurer.search);
route.post("/greene",(req, res, next)=>{ req.countyid=37; req.countyauthority="114 N Chestnut St, Jefferson IA 50129, Phone: (515) 386-5675"; next(); }, common_iowatreasurer.search);
route.post("/mills",(req, res, next)=>{ req.countyid=65; req.countyauthority="418 Sharp Street, Glenwood, IA 51534, Phone: 712-527-4419"; next(); }, common_iowatreasurer.search);

route.post("/poweshiek", poweshiek_search.search);
route.post("/polk", polk_search.search);

module.exports = route;