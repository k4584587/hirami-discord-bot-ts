"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const discord_js_1 = require("discord.js");
const events_1 = require("./events");
const interactionCreate_1 = require("./events/interactionCreate");
const dotenv_1 = __importDefault(require("dotenv"));
const crawlerRoutes_1 = __importDefault(require("./routes/crawlerRoutes"));
dotenv_1.default.config();
// Express 설정
const app = (0, express_1.default)();
const port = 3000;
app.use(express_1.default.json());
app.use('/api', crawlerRoutes_1.default);
app.get('/', (_req, res) => {
    res.send('Hello, TypeScript Express!');
});
// Discord 봇 설정
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildIntegrations,
    ]
});
// 명령어 처리를 위한 interactionCreate 이벤트 등록
client.on(discord_js_1.Events.InteractionCreate, interactionCreate_1.interactionCreate);
async function startBot() {
    try {
        // 이벤트 등록
        (0, events_1.registerEvents)(client);
        // Discord 봇 로그인
        await client.login(process.env.DISCORD_TOKEN);
    }
    catch (error) {
        console.error('Error starting Discord bot:', error);
    }
}
// Express 서버와 Discord 봇 함께 시작
async function startServer() {
    try {
        // Express 서버 시작
        app.listen(port, () => {
            console.log(`Server is running at http://localhost:${port}`);
        });
        // Discord 봇 시작
        await startBot();
    }
    catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}
// 에러 처리
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});
// 서버 시작
startServer();
