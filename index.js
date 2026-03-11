const express = require("express");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const ejs = require("ejs");
const path = require("node:path");
const cors = require("cors");

// const getBrowserInstance = require("./utils/chromium/browserLaunch.js");

dotenv.config();

const apps = express();

apps.engine('.html', ejs.__express);
// apps.use(express.static('public'));
apps.use(express.static(path.join(__dirname, 'public')));
apps.set('views', path.join(__dirname, 'views'));
apps.set('view engine', 'html');

const misc_router = require("./routes/misc.route.js");

const alabama_router = require("./routes/alabama.route.js");
const arizona_router = require("./routes/arizona.route.js");
const california_router = require("./routes/california.route.js");
const colorado_router = require("./routes/colorado.route.js");
const delaware_router = require("./routes/delaware.route.js");
const district_of_columbia_router = require("./routes/district_of_columbia.route.js");
const florida_router = require("./routes/florida.route.js");
const georgia_route = require("./routes/georgia.route.js");
const hawaii_route = require("./routes/hawaii.route.js");
const iowa_router = require("./routes/iowa.route.js");
const missouri_router = require("./routes/missouri.route.js");
const nebraska_route = require("./routes/nebraska.route.js");
const nevada_route = require("./routes/nevada.route.js");
const northcarolina_router = require("./routes/northcarolina.route.js");
const newMexico_route = require("./routes/new_mexico.route.js");
const ohio_router = require("./routes/ohio.route.js");
const oklahoma_router = require("./routes/oklahoma.route.js");
const oregon_router = require("./routes/oregon.route.js");
const southcarolina_router = require("./routes/southcarolina.route.js");
const utah_route = require("./routes/utah.route.js");
const washington_router = require("./routes/washington.route.js");

apps.use(cors());

apps.use(cookieParser());
apps.use(express.json());
apps.use(express.urlencoded({ extended: true,}));

apps.use("/tax/*", (req, res, next) => { console.log("Requested Path:" +req['originalUrl'] +", Type:"+ req['body']['fetch_type'] +", Account:"+ req['body']['account']); next(); });

apps.get("/", (req, res) => { res.render('order_search') });
apps.get("/tax", (req, res) => { res.render('order_search') });
apps.use("/tax/AL", alabama_router);
apps.use("/tax/FL", florida_router);
apps.use("/tax/AZ", arizona_router);
apps.use("/tax/CA", california_router);
apps.use("/tax/CO", colorado_router);
apps.use("/tax/DE", delaware_router);
apps.use("/tax/DC", district_of_columbia_router);
apps.use("/tax/GA", georgia_route );
apps.use("/tax/HI", hawaii_route);
apps.use("/tax/IA", iowa_router);
apps.use("/tax/MO", missouri_router);
apps.use("/tax/NE", nebraska_route);
apps.use("/tax/NC", northcarolina_router);
apps.use("/tax/NM", newMexico_route );
apps.use("/tax/NV", nevada_route);
apps.use("/tax/OK", oklahoma_router);
apps.use("/tax/OH", ohio_router);
apps.use("/tax/OR", oregon_router);
apps.use("/tax/SC", southcarolina_router);
apps.use("/tax/UT", utah_route);
apps.use("/tax/WA", washington_router);

apps.use("/tax/:state/:county", (req, res) => { res.json({ error: true, message: "Service Unavailable for this county" }) });
apps.use("/misc", misc_router);
apps.get("*", (req, res) => { res.render('page_not_found'); });

const PORT = process.env.PORT | 3000;
apps.listen(PORT, async () => {
    try{
        // await getBrowserInstance();
        console.log("Browser launched");
        console.log("Server is listening on PORT: "+PORT);
    }
    catch(error){
        console.log(error)
    }       
});