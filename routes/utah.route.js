import express from "express";

const route = express.Router();

import { search as utah_search } from "../controllers/UT/utah.controller.js";
import { search as weber_search } from '../controllers/UT/weber.controller.js';
import { search as davis_search } from '../controllers/UT/davis.controller.js';
import { search as summit_search } from '../controllers/UT/summit.controller.js';

route.post("/utah", utah_search);
route.post("/weber", weber_search);
route.post("/davis", davis_search);
route.post("/summit", summit_search);

export default route;