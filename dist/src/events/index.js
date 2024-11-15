"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEvents = void 0;
const ready_1 = require("./ready");
const messageCreate_1 = require("./messageCreate");
const registerEvents = (client) => {
    client.on('ready', ready_1.ready);
    client.on('messageCreate', messageCreate_1.messageCreate);
};
exports.registerEvents = registerEvents;
