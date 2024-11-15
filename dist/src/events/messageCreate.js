"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageCreate = void 0;
const messageCommands_1 = require("../messageCommands");
const chatgpt_1 = require("../messageCommands/chatgpt");
const messageCreate = async (message) => {
    if (message.author.bot)
        return;
    try {
        // 메시지 명령어 처리
        const wasCommand = await (0, messageCommands_1.handleMessageCommands)(message);
        if (wasCommand)
            return;
        // matches 함수를 사용하여 확인
        if (chatgpt_1.chatgptCommand.matches?.(message.content)) {
            await chatgpt_1.chatgptCommand.execute(message);
        }
    }
    catch (error) {
        console.error('메시지 처리 중 에러:', error);
    }
};
exports.messageCreate = messageCreate;
