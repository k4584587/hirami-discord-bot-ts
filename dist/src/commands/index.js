"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = exports.commands = void 0;
const discord_js_1 = require("discord.js");
const balance_1 = require("./balance");
const casino_1 = require("./casino");
const chatgpt_1 = require("./chatgpt");
exports.commands = [balance_1.balance, casino_1.casino, chatgpt_1.chat];
const registerCommands = async (client) => {
    console.log('슬래시 명령어 등록 중...');
    // 봇 토큰 확인
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        console.error('Discord token is not set in environment variables');
        return;
    }
    // Discord REST API 클라이언트 생성
    const rest = new discord_js_1.REST({ version: '10' }).setToken(token);
    // 클라이언트 ID 가져오기
    const clientId = client.user?.id ?? process.env.CLIENT_ID;
    if (!clientId) {
        console.error('Client ID is not available');
        return;
    }
    try {
        // 명령어 데이터 준비
        const commandsData = exports.commands.map(command => command.data.toJSON());
        // 전역 명령어로 등록
        await rest.put(discord_js_1.Routes.applicationCommands(clientId), { body: commandsData });
        console.log(`${exports.commands.length}개의 슬래시 명령어 등록 완료!`);
    }
    catch (error) {
        console.error('명령어 등록 중 에러:', error);
    }
};
exports.registerCommands = registerCommands;
