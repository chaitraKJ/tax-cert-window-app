import express from "express";

import {
	add_county_form,
	add_county,
	edit_county,
	delete_county,
	get_all_live_counties_display,
	get_all_live_counties
} from "../controllers/county.controller.js";

const route = express.Router();

route.get("/all", get_all_live_counties_display);
route.post("/all", get_all_live_counties);

route.get("/add", add_county_form);
route.post("/add", add_county);

route.post("/update/:id", edit_county);

route.post("/delete/:id", delete_county);

export default route;
