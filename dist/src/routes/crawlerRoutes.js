"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crawlerController_1 = require("../controllers/crawlerController");
const router = (0, express_1.Router)();
router.post('/crawl', crawlerController_1.getContent);
exports.default = router;
