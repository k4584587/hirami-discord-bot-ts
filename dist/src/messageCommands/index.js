"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessageCommands = exports.messageCommands = void 0;
const delete_1 = require("./delete");
const chatgpt_1 = require("./chatgpt");
exports.messageCommands = [
    delete_1.deleteCommand,
    chatgpt_1.chatgptCommand
];
const handleMessageCommands = async (message) => {
    const command = exports.messageCommands.find(cmd => message.content === cmd.name);
    if (command) {
        await command.execute(message);
        return true;
    }
    return false;
};
exports.handleMessageCommands = handleMessageCommands;
