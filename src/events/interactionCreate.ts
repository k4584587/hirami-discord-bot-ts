// src/events/interactionCreate.ts
import { Interaction } from 'discord.js';
import { commands } from '../commands';

export const interactionCreate = async (interaction: Interaction): Promise<void> => {
	// 슬래시 커맨드가 아닌 경우 무시
	if (!interaction.isChatInputCommand()) return;

	console.log(`Received command: ${interaction.commandName} | Command Call : ${interaction.user.displayName}`); // 디버깅용

	const command = commands.find(cmd => cmd.data.name === interaction.commandName);

	if (!command) {
		console.error(`Command not found: ${interaction.commandName}`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(`Error executing command ${interaction.commandName}:`, error);
		const errorMessage = {
			content: '명령어 실행 중 오류가 발생했습니다!',
			ephemeral: true
		};

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp(errorMessage);
		} else {
			await interaction.reply(errorMessage);
		}
	}
};