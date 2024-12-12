import express, { Express, Request, Response } from 'express';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { registerEvents } from './events';
import { interactionCreate } from './events/interactionCreate';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

import apiRoutes from "./routes/apiRoutes";

dotenv.config();

// Swagger 설정
const swaggerOptions = {
  definition: {
	openapi: '3.0.0',
	info: {
	  title: 'Hirami Discord Bot API',
	  version: '1.0.0',
	  description: 'API documentation for Hirami Discord Bot',
	},
	servers: [
	  {
		url: process.env.SWAGGER_SERVER_URL || `http://localhost:${process.env.PORT || 3000}`,
		description: 'Development server',
	  },
	],
  },
  apis: ['./src/routes/*.ts'], // API 라우트 파일 경로
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Express 설정
const app: Express = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Swagger UI 설정
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api', apiRoutes);

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello, TypeScript Express!');
});

// Discord 봇 설정
const client = new Client({
  intents: [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.MessageContent,
	GatewayIntentBits.GuildMembers,
	GatewayIntentBits.GuildIntegrations,
  ]
});

// 명령어 처리를 위한 interactionCreate 이벤트 등록
client.on(Events.InteractionCreate, interactionCreate);

async function startBot() {
  try {
	// 이벤트 등록
	registerEvents(client);

	// Discord 봇 로그인
	await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
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
  } catch (error) {
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