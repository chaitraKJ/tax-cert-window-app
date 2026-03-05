import express from "express";

const route = express.Router();

import {search as kent_search} from '../controllers/DE/kent.controller.js';
import {search as sussex_search} from '../controllers/DE/sussex.controller.js';

route.post("/kent", kent_search);
route.post("/sussex", sussex_search);

export default route;