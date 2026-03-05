import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import ejs from "ejs";
import path from "node:path";
import cors from "cors";

import getBrowserInstance from "./utils/chromium/browserLaunch.js";

dotenv.config();

const app = express();

app.engine('.html', ejs.__express);
app.use(express.static('public'));
app.set('view engine', 'html');

import misc_router from "./routes/misc.route.js";

import alabama_router from "./routes/alabama.route.js";
import arizona_router from "./routes/arizona.route.js";
import california_router from "./routes/california.route.js";
import colorado_router from "./routes/colorado.route.js";
import delaware_router from "./routes/delaware.route.js";
import district_of_columbia_router from "./routes/district_of_columbia.route.js";
import florida_router from "./routes/florida.route.js";
import georgia_route from "./routes/georgia.route.js"
import hawaii_route from "./routes/hawaii.route.js";
import iowa_router from "./routes/iowa.route.js";
import missouri_router from "./routes/missouri.route.js";
import nebraska_route from "./routes/nebraska.route.js";
import nevada_route from "./routes/nevada.route.js";
import northcarolina_router from "./routes/northcarolina.route.js";
import newMexico_route from "./routes/new_mexico.route.js"
import ohio_router from "./routes/ohio.route.js";
import oklahoma_router from "./routes/oklahoma.route.js";
import oregon_router from "./routes/oregon.route.js";
import southcarolina_router from "./routes/southcarolina.route.js";
import utah_route from "./routes/utah.route.js";
import washington_router from "./routes/washington.route.js";

app.use(cors());

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true,}));

app.use("/tax/*", (req, res, next) => { console.log("Requested Path:" +req['originalUrl'] +", Type:"+ req['body']['fetch_type'] +", Account:"+ req['body']['account']); next(); });

app.get("/", (req, res) => { res.render('order_search') });
app.get("/tax", (req, res) => { res.render('order_search') });
app.use("/tax/AL", alabama_router);
app.use("/tax/FL", florida_router);
app.use("/tax/AZ", arizona_router);
app.use("/tax/CA", california_router);
app.use("/tax/CO", colorado_router);
app.use("/tax/DE", delaware_router);
app.use("/tax/DC", district_of_columbia_router);
app.use("/tax/GA", georgia_route );
app.use("/tax/HI", hawaii_route);
app.use("/tax/IA", iowa_router);
app.use("/tax/MO", missouri_router);
app.use("/tax/NE", nebraska_route);
app.use("/tax/NC", northcarolina_router);
app.use("/tax/NM", newMexico_route );
app.use("/tax/NV", nevada_route);
app.use("/tax/OK", oklahoma_router);
app.use("/tax/OH", ohio_router);
app.use("/tax/OR", oregon_router);
app.use("/tax/SC", southcarolina_router);
app.use("/tax/UT", utah_route);
app.use("/tax/WA", washington_router);

app.use("/tax/:state/:county", (req, res) => { res.json({ error: true, message: "Service Unavailable for this county" }) });
app.use("/misc", misc_router);
app.get("*", (req, res) => { res.render('page_not_found'); });

const PORT = process.env.PORT | 3000;
app.listen(PORT, async () => {
    try{
        await getBrowserInstance();
        console.log("Browser launched");
        console.log("Server is listening on PORT: "+PORT);
    }
    catch(error){
        console.log(error)
    }       
});