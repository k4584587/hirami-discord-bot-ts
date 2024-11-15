"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ready = void 0;
const commands_1 = require("../commands");
const ready = async (client) => {
    console.log(`Logged in as ${client.user?.tag}!`);
    // 봇이 준비된 후 명령어 등록
    await (0, commands_1.registerCommands)(client);
};
exports.ready = ready;
