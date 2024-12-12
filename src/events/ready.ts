// src/events/ready.ts
import { Client } from 'discord.js';
import { registerCommands } from '../commands';

export const ready = async (client: Client): Promise<void> => {
	console.log(`Logged in as ${client.user?.tag}!`);

	// 봇이 준비된 후 명령어 등록
	await registerCommands(client);
};
