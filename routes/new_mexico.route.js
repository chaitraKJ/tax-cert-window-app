const express = require("express");

const bernalillo_search = require('../controllers/NM/bernalillo.controller.js');

const route = express.Router(); 

route.post("/bernalillo", bernalillo_search.search);

module.exports = route;