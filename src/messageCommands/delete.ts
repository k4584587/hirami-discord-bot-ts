import { Message } from 'discord.js';
import { MessageCommand } from '../commands/types/MessageCommand';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const deleteCommand: MessageCommand = {
	name: '!delete',
	async execute(message: Message) {
		try {
			const chatUser = await prisma.nbChatUsers.findUnique({
				where: { discordId: message.author.id },
			});

			if (chatUser) {
				await prisma.$transaction([
					prisma.nbChatMessages.updateMany({
						where: { userId: chatUser.id },
						data: { isDeleted: true },
					}),
					prisma.nbChatUsers.update({
						where: { id: chatUser.id },
						data: { lastConversationId: null },
					}),
				]);

				await message.reply('대화 세션이 초기화되었습니다.');
			} else {
				await message.reply('삭제할 대화 내용이 없습니다.');
			}
		} catch (error) {
			console.error('Error executing delete command:', error);
			await message.reply('명령어 실행 중 오류가 발생했습니다.');
		} finally {
			await prisma.$disconnect();
		}
	},
};
