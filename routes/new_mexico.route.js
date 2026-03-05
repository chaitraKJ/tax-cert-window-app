import express from "express";

import {search as bernalillo_search} from '../controllers/NM/bernalillo.controller.js'

const route = express.Router(); 

route.post("/bernalillo", bernalillo_search);

export default route;